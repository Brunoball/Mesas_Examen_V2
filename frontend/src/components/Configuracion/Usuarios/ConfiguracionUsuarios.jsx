// src/components/Configuracion/Usuarios/ConfiguracionUsuarios.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faCheck,
  faCheckCircle,
  faCircleInfo,
  faEdit,
  faEnvelope,
  faEye,
  faEyeSlash,
  faLock,
  faPlus,
  faRotateRight,
  faSave,
  faSearch,
  faShieldHalved,
  faToggleOn,
  faTrash,
  faUser,
  faUserPen,
  faUserPlus,
  faUsers,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { useConfiguracionUsuarios } from './hooks/useConfiguracionUsuarios';
import ModalEliminarGlobal from '../../Global/Modales/ModalEliminarGlobal';
import '../../Global/Global_css/roots.css';
import '../../Global/Global_css/Global_Section.css';
import '../../Global/Global_css/Global_Modals.css';
import './ConfiguracionUsuarios.css';

function EstadoPill({ activo }) {
  return (
    <span className={`cfgUsersPill ${Number(activo) === 1 ? 'is-active' : 'is-inactive'}`}>
      <i aria-hidden="true" />
      {Number(activo) === 1 ? 'Activo' : 'Baja'}
    </span>
  );
}

function RolPill({ rol }) {
  const esAdmin = String(rol) === 'admin';
  return (
    <span className={`cfgUsersRol ${esAdmin ? 'is-admin' : 'is-view'}`}>
      <FontAwesomeIcon icon={esAdmin ? faShieldHalved : faEye} />
      {esAdmin ? 'Administrador' : 'Vista'}
    </span>
  );
}

function iniciales(usuario = '') {
  const limpio = String(usuario || '').trim();
  if (!limpio) return 'US';
  return limpio
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('') || 'US';
}

function numero(valor) {
  return Number(valor || 0).toLocaleString('es-AR');
}

function detalleUsuario(usuario = {}) {
  return [
    { label: 'Usuario', value: usuario?.usuario || '—' },
    { label: 'Email', value: usuario?.email_recuperacion || 'Sin email' },
    { label: 'Rol', value: String(usuario?.rol) === 'admin' ? 'Administrador' : 'Vista' },
    { label: 'Estado', value: Number(usuario?.activo) === 1 ? 'Activo' : 'Baja' },
  ];
}

function getPasswordStrength(pass) {
  const value = String(pass || '');
  if (!value) return null;

  let score = 0;
  if (value.length >= 8) score += 1;
  if (/[A-ZÁÉÍÓÚÑ]/.test(value)) score += 1;
  if (/[0-9]/.test(value)) score += 1;
  if (/[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9]/.test(value)) score += 1;

  if (score <= 1) return { label: 'Débil', width: '25%', className: 'is-weak' };
  if (score === 2) return { label: 'Regular', width: '50%', className: 'is-regular' };
  if (score === 3) return { label: 'Buena', width: '75%', className: 'is-good' };
  return { label: 'Fuerte', width: '100%', className: 'is-strong' };
}

function AnimatedStatNumber({ value = 0, loading = false }) {
  const target = Number(value || 0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (loading) {
      setDisplay(0);
      return undefined;
    }

    const safeTarget = Number.isFinite(target) ? target : 0;
    const duration = 560;
    const start = window.performance?.now?.() || Date.now();
    let frame = 0;

    const tick = (now) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);

      setDisplay(Math.round(safeTarget * eased));

      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
      }
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [target, loading]);

  return <b>{numero(display)}</b>;
}

function StatsSkeleton() {
  return (
    <>
      <span className="cfgUsersSkeleton cfgUsersSkeleton--number" />
      <span className="cfgUsersSkeleton cfgUsersSkeleton--small" />
    </>
  );
}

function TablaSkeleton() {
  return Array.from({ length: 6 }).map((_, index) => (
    <tr className="cfgUsersSkeletonRow" key={`cfg-users-skeleton-${index}`}>
      <td>
        <div className="cfgUsersUserCell">
          <span className="cfgUsersSkeleton cfgUsersSkeleton--avatar" />
          <div className="cfgUsersSkeletonStack">
            <span className="cfgUsersSkeleton cfgUsersSkeleton--line is-strong" />
            <span className="cfgUsersSkeleton cfgUsersSkeleton--line is-short" />
          </div>
        </div>
      </td>
      <td><span className="cfgUsersSkeleton cfgUsersSkeleton--line" /></td>
      <td><span className="cfgUsersSkeleton cfgUsersSkeleton--pill" /></td>
      <td><span className="cfgUsersSkeleton cfgUsersSkeleton--pill" /></td>
      <td><span className="cfgUsersSkeleton cfgUsersSkeleton--line is-date" /></td>
      <td>
        <div className="cfgUsersActions">
          <span className="cfgUsersSkeleton cfgUsersSkeleton--action" />
          <span className="cfgUsersSkeleton cfgUsersSkeleton--action" />
          <span className="cfgUsersSkeleton cfgUsersSkeleton--action" />
        </div>
      </td>
    </tr>
  ));
}

function UsuarioModal({ open, form, guardando, onClose, onChange, onSave }) {
  const [showPass, setShowPass] = useState(false);
  const [showRepeat, setShowRepeat] = useState(false);

  useEffect(() => {
    if (!open) {
      setShowPass(false);
      setShowRepeat(false);
    }
  }, [open]);

  if (!open) return null;

  const esEdicion = Number(form.id_usuario || 0) > 0;
  const strength = getPasswordStrength(form.contrasena);

  const submit = (event) => {
    event.preventDefault();
    if (!guardando) onSave?.();
  };

  return createPortal(
    <div className="cfgUsersModalOverlay" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className="cfgUsersModal cfgUsersModal--balto" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cfgUsersModalHead">
          <div className="cfgUsersModalIcon" aria-hidden="true">
            <FontAwesomeIcon icon={esEdicion ? faUserPen : faUserPlus} />
          </div>
          <div className="cfgUsersModalHeadText">
            <h3>{esEdicion ? 'Editar usuario' : 'Crear usuario'}</h3>
            <p>
              {esEdicion
                ? 'Actualizá los datos, el rol, el estado o la contraseña del usuario.'
                : 'Cargá un nuevo acceso para Mesas con rol y contraseña inicial.'}
            </p>
          </div>
          <button type="button" className="cfgUsersModalClose" onClick={onClose} disabled={guardando} title="Cerrar">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <form className="cfgUsersModalForm" onSubmit={submit}>
          <div className="cfgUsersModalBody">
            <section className="cfgUsersModalSection">
              <div className="cfgUsersModalSectionHead">
                <i aria-hidden="true" />
                <span>Datos del usuario</span>
              </div>

              <div className="cfgUsersModalSectionBody cfgUsersModalGrid">
                <label className="cfgUsersMuField cfgUsersMuField--wide">
                  <FontAwesomeIcon icon={faUser} className="cfgUsersMuFieldIcon" />
                  <input
                    type="text"
                    value={form.usuario}
                    onChange={(e) => onChange('usuario', e.target.value)}
                    placeholder=" "
                    maxLength={100}
                    autoFocus
                    disabled={guardando}
                  />
                  <span>Usuario</span>
                </label>

                <label className="cfgUsersMuField cfgUsersMuField--wide">
                  <FontAwesomeIcon icon={faEnvelope} className="cfgUsersMuFieldIcon" />
                  <input
                    type="email"
                    value={form.email_recuperacion}
                    onChange={(e) => onChange('email_recuperacion', e.target.value)}
                    placeholder=" "
                    maxLength={190}
                    disabled={guardando}
                  />
                  <span>Email de recuperación</span>
                </label>

                <label className="cfgUsersMuField">
                  <FontAwesomeIcon icon={faShieldHalved} className="cfgUsersMuFieldIcon" />
                  <select value={form.rol} onChange={(e) => onChange('rol', e.target.value)} disabled={guardando}>
                    <option value="admin">Administrador</option>
                    <option value="vista">Vista</option>
                  </select>
                  <span>Rol</span>
                </label>

                <label className="cfgUsersMuField">
                  <FontAwesomeIcon icon={faToggleOn} className="cfgUsersMuFieldIcon" />
                  <select value={Number(form.activo)} onChange={(e) => onChange('activo', Number(e.target.value))} disabled={guardando}>
                    <option value={1}>Activo</option>
                    <option value={0}>Baja</option>
                  </select>
                  <span>Estado</span>
                </label>
              </div>
            </section>

            <section className="cfgUsersModalSection">
              <div className="cfgUsersModalSectionHead cfgUsersModalSectionHead--muted">
                <i aria-hidden="true" />
                <span>{esEdicion ? 'Contraseña opcional' : 'Contraseña obligatoria'}</span>
              </div>

              <div className="cfgUsersPasswordHint">
                <FontAwesomeIcon icon={faCircleInfo} />
                <p>
                  {esEdicion
                    ? 'Dejá ambos campos vacíos si no necesitás cambiar la contraseña.'
                    : 'Para crear el usuario, la contraseña debe tener al menos 6 caracteres.'}
                </p>
              </div>

              <div className="cfgUsersModalSectionBody cfgUsersModalGrid">
                <label className="cfgUsersMuField cfgUsersMuField--password">
                  <FontAwesomeIcon icon={faLock} className="cfgUsersMuFieldIcon" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={form.contrasena}
                    onChange={(e) => onChange('contrasena', e.target.value)}
                    placeholder=" "
                    disabled={guardando}
                    autoComplete="new-password"
                  />
                  <span>{esEdicion ? 'Nueva contraseña' : 'Contraseña'}</span>
                  <button type="button" className="cfgUsersPasswordToggle" onClick={() => setShowPass((prev) => !prev)} tabIndex={-1}>
                    <FontAwesomeIcon icon={showPass ? faEyeSlash : faEye} />
                  </button>
                </label>

                <label className="cfgUsersMuField cfgUsersMuField--password">
                  <FontAwesomeIcon icon={faLock} className="cfgUsersMuFieldIcon" />
                  <input
                    type={showRepeat ? 'text' : 'password'}
                    value={form.repetir_contrasena}
                    onChange={(e) => onChange('repetir_contrasena', e.target.value)}
                    placeholder=" "
                    disabled={guardando}
                    autoComplete="new-password"
                  />
                  <span>Repetir contraseña</span>
                  <button type="button" className="cfgUsersPasswordToggle" onClick={() => setShowRepeat((prev) => !prev)} tabIndex={-1}>
                    <FontAwesomeIcon icon={showRepeat ? faEyeSlash : faEye} />
                  </button>
                </label>
              </div>

              {strength && (
                <div className={`cfgUsersStrength ${strength.className}`}>
                  <div className="cfgUsersStrength__bar">
                    <span style={{ width: strength.width }} />
                  </div>
                  <strong>Seguridad: {strength.label}</strong>
                </div>
              )}
            </section>
          </div>

          <div className="cfgUsersModalActions">
            <button type="button" className="mov-btn mov-btn--ghost" onClick={onClose} disabled={guardando}>
              Cancelar
            </button>
            <button type="submit" className="mov-btn mov-btn--primary" disabled={guardando}>
              <FontAwesomeIcon icon={faSave} />
              {guardando ? 'Guardando...' : 'Guardar usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

export default function ConfiguracionUsuarios({ onVolver = null }) {
  const navigate = useNavigate();
  const volver = typeof onVolver === 'function' ? onVolver : () => navigate('/configuracion');
  const [usuarioAEliminar, setUsuarioAEliminar] = useState(null);
  const [usuarioACambiarEstado, setUsuarioACambiarEstado] = useState(null);

  const {
    usuarios,
    resumen,
    loading,
    guardando,
    error,
    mensaje,
    setMensaje,
    busqueda,
    setBusqueda,
    vista,
    cambiarVista,
    modalAbierto,
    form,
    abrirCrear,
    abrirEditar,
    cerrarModal,
    actualizarCampo,
    guardar,
    cambiarEstado,
    eliminar,
    reload,
  } = useConfiguracionUsuarios();

  const statsCards = useMemo(
    () => [
      {
        key: 'total',
        label: 'Total',
        value: resumen.total,
        hint: 'Usuarios registrados',
        icon: faUsers,
        tone: 'blue',
      },
      {
        key: 'activos',
        label: 'Activos',
        value: resumen.activos,
        hint: 'Pueden ingresar',
        icon: faCheckCircle,
        tone: 'green',
      },
      {
        key: 'bajas',
        label: 'Bajas',
        value: resumen.bajas,
        hint: 'Sin acceso activo',
        icon: faEyeSlash,
        tone: 'red',
      },
      {
        key: 'admins',
        label: 'Admins',
        value: resumen.admins,
        hint: 'Permiso completo',
        icon: faShieldHalved,
        tone: 'purple',
      },
    ],
    [resumen]
  );

  const detallesEliminar = useMemo(() => detalleUsuario(usuarioAEliminar), [usuarioAEliminar]);
  const detallesCambioEstado = useMemo(() => detalleUsuario(usuarioACambiarEstado), [usuarioACambiarEstado]);
  const cambioEstadoActivo = Number(usuarioACambiarEstado?.activo) === 1;

  async function confirmarCambioEstado() {
    if (!usuarioACambiarEstado) return { ok: false };
    const nuevoEstado = cambioEstadoActivo ? 0 : 1;
    return cambiarEstado(usuarioACambiarEstado, nuevoEstado);
  }

  async function confirmarEliminar() {
    if (!usuarioAEliminar) return { ok: false };
    return eliminar(usuarioAEliminar);
  }

  return (
    <div className="cfgUsersPage mov-page">
      {mensaje && (
        <div className={`mov-alert cfgUsersToast cfgUsersToast--${mensaje.tipo}`} role="status" aria-live="polite">
          <FontAwesomeIcon icon={mensaje.tipo === 'success' ? faCheck : faCircleInfo} />
          <span>{mensaje.texto}</span>
          <button type="button" onClick={() => setMensaje(null)} aria-label="Cerrar mensaje">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
      )}

      <section className="cfgUsersRoot mov-card mov-card--table">
        <div className="mov-card__head cfgUsersHead">
          <div className="mov-card__headLeft cfgUsersHeadLeft">
            <div className="title-mov cfgUsersTitleBox">
              <div className="mov-card__title cfgUsersTitle">
                <FontAwesomeIcon icon={faUsers} />
                Configuración de usuarios
              </div>
              <div className="mov-card__hint">
                Administrá los usuarios del sistema: altas, bajas, edición, roles y contraseña.
              </div>
            </div>

            <div className="mov-headFilters cfgUsersFilters">
              <div className="cc-filter cfgUsersSearch">
                <div className={`cc-floatingField cc-floatingField--search ${busqueda.trim() ? 'is-active' : ''}`}>
                  <div className="cc-searchInput">
                    <div className="cc-searchInput__fieldWrap">
                      <input
                        className="cc-input cc-input--floating cfgUsersSearchInput"
                        type="text"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        placeholder="Usuario, email o rol"
                      />
                      <span className="cfgUsersSearchLabel">
                        <FontAwesomeIcon icon={faSearch} /> Búsqueda
                      </span>
                      {busqueda.trim() !== '' && (
                        <button
                          type="button"
                          className="cc-clearSearch cc-clearSearch--inside cfgUsersClearSearch"
                          title="Limpiar búsqueda"
                          onClick={() => setBusqueda('')}
                        >
                          <FontAwesomeIcon icon={faXmark} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mov-card__actions cfgUsersHeadActions">
            <button type="button" className="mov-btn mov-btn--ghost" onClick={volver} disabled={guardando || loading}>
              <FontAwesomeIcon icon={faArrowLeft} />
              Volver
            </button>

            <button type="button" className="mov-btn mov-btn--primary" onClick={abrirCrear} disabled={guardando || loading}>
              <FontAwesomeIcon icon={faPlus} />
              Nuevo usuario
            </button>
          </div>
        </div>

        <div className={`cfgUsersStats ${loading ? 'is-loading' : ''}`} aria-busy={loading ? 'true' : 'false'}>
          {statsCards.map((stat) => (
            <article key={stat.key} className={`cfgUsersStat cfgUsersStat--${stat.tone}`}>
              <div className="cfgUsersStat__icon" aria-hidden="true">
                <FontAwesomeIcon icon={stat.icon} />
              </div>

              <div className="cfgUsersStat__body">
                <span>{stat.label}</span>
                {loading ? (
                  <StatsSkeleton />
                ) : (
                  <>
                    <AnimatedStatNumber value={stat.value} loading={loading} />
                    <small>{stat.hint}</small>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>

        <div className="mov-tabsBar cfgUsersTabsBar">
          <div className="mov-tabs">
            <button type="button" className={`mov-tab ${vista === 'activos' ? 'is-active' : ''}`} onClick={() => cambiarVista('activos')}>
              Activos
            </button>
            <button type="button" className={`mov-tab ${vista === 'bajas' ? 'is-active' : ''}`} onClick={() => cambiarVista('bajas')}>
              Dados de baja
            </button>
            <button type="button" className={`mov-tab ${vista === 'todos' ? 'is-active' : ''}`} onClick={() => cambiarVista('todos')}>
              Todos
            </button>
          </div>
          <span className="cfgUsersCount">Mostrando {usuarios.length} usuario{usuarios.length === 1 ? '' : 's'}</span>
        </div>

        {error && <div className="mov-alert cfgUsersInlineError">{error}</div>}

        <div className="cfgUsersTableWrap">
          <table className="cfgUsersTable">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Creación</th>
                <th className="cfgUsersActionsTh">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TablaSkeleton />
              ) : usuarios.length === 0 ? (
                <tr>
                  <td colSpan="6" className="cfgUsersEmpty">No hay usuarios para mostrar.</td>
                </tr>
              ) : (
                usuarios.map((usuario) => (
                  <tr key={usuario.id_usuario} className={usuario.es_usuario_actual ? 'cfgUsersCurrentRow' : ''}>
                    <td>
                      <div className="cfgUsersUserCell">
                        <span className="cfgUsersAvatar">{iniciales(usuario.usuario)}</span>
                        <div>
                          <strong>{usuario.usuario}</strong>
                          {usuario.es_usuario_actual ? <em>Sesión actual</em> : null}
                        </div>
                      </div>
                    </td>
                    <td>{usuario.email_recuperacion || <span className="cfgUsersMuted">Sin email</span>}</td>
                    <td><RolPill rol={usuario.rol} /></td>
                    <td><EstadoPill activo={usuario.activo} /></td>
                    <td>{usuario.fecha_creacion || '-'}</td>
                    <td>
                      <div className="cfgUsersActions">
                        <button type="button" className="cfgUsersActionBtn" onClick={() => abrirEditar(usuario)} title="Editar usuario">
                          <FontAwesomeIcon icon={faEdit} />
                        </button>

                        {Number(usuario.activo) === 1 ? (
                          <button type="button" className="cfgUsersActionBtn is-warning" onClick={() => setUsuarioACambiarEstado(usuario)} title="Dar de baja">
                            <FontAwesomeIcon icon={faEyeSlash} />
                          </button>
                        ) : (
                          <button type="button" className="cfgUsersActionBtn is-success" onClick={() => setUsuarioACambiarEstado(usuario)} title="Dar de alta">
                            <FontAwesomeIcon icon={faCheck} />
                          </button>
                        )}

                        <button type="button" className="cfgUsersActionBtn is-danger" onClick={() => setUsuarioAEliminar(usuario)} title="Eliminar usuario">
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <UsuarioModal
        open={modalAbierto}
        form={form}
        guardando={guardando}
        onClose={cerrarModal}
        onChange={actualizarCampo}
        onSave={guardar}
      />

      <ModalEliminarGlobal
        open={!!usuarioACambiarEstado}
        operacion={cambioEstadoActivo ? 'baja' : 'alta'}
        row={usuarioACambiarEstado}
        loading={guardando}
        onClose={() => setUsuarioACambiarEstado(null)}
        onConfirm={confirmarCambioEstado}
        title={cambioEstadoActivo ? 'Dar de baja usuario' : 'Dar de alta usuario'}
        message={cambioEstadoActivo ? `¿Seguro que querés dar de baja el usuario "${usuarioACambiarEstado?.usuario || ''}"?` : `¿Seguro que querés activar el usuario "${usuarioACambiarEstado?.usuario || ''}"?`}
        warning={cambioEstadoActivo ? 'El usuario no podrá ingresar mientras esté dado de baja.' : 'El usuario volverá a tener acceso al sistema.'}
        confirmLabel={cambioEstadoActivo ? 'Dar de baja' : 'Dar de alta'}
        loadingMessage={cambioEstadoActivo ? 'Dando de baja usuario…' : 'Activando usuario…'}
        successMessage={cambioEstadoActivo ? 'Usuario dado de baja correctamente.' : 'Usuario dado de alta correctamente.'}
        errorMessage="No se pudo cambiar el estado del usuario."
        details={detallesCambioEstado}
      />

      <ModalEliminarGlobal
        open={!!usuarioAEliminar}
        operacion="eliminar"
        row={usuarioAEliminar}
        loading={guardando}
        onClose={() => setUsuarioAEliminar(null)}
        onConfirm={confirmarEliminar}
        title="Eliminar usuario"
        message={`¿Seguro que querés eliminar el usuario "${usuarioAEliminar?.usuario || ''}"?`}
        warning="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        loadingMessage="Eliminando usuario…"
        successMessage="Usuario eliminado correctamente."
        errorMessage="No se pudo eliminar el usuario."
        details={detallesEliminar}
      />
    </div>
  );
}
