// src/components/Configuracion/Usuarios/ConfiguracionUsuarios.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faCheck,
  faCircleInfo,
  faEdit,
  faEye,
  faEyeSlash,
  faPlus,
  faRotateRight,
  faSave,
  faSearch,
  faShieldHalved,
  faTrash,
  faUserGear,
  faUsers,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { useConfiguracionUsuarios } from './hooks/useConfiguracionUsuarios';
import '../../Global/Global_css/roots.css';
import '../../Global/Global_css/Global_Section.css';
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

function UsuarioModal({ open, form, guardando, onClose, onChange, onSave }) {
  if (!open) return null;

  const esEdicion = Number(form.id_usuario || 0) > 0;

  return (
    <div className="cfgUsersModalOverlay" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className="cfgUsersModal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cfgUsersModalHead">
          <div className="cfgUsersModalIcon" aria-hidden="true">
            <FontAwesomeIcon icon={faUserGear} />
          </div>
          <div>
            <h3>{esEdicion ? 'Editar usuario' : 'Crear usuario'}</h3>
            <p>{esEdicion ? 'Modificá los datos del usuario seleccionado.' : 'Agregá un usuario nuevo al sistema.'}</p>
          </div>
          <button type="button" className="cfgUsersIconBtn" onClick={onClose} disabled={guardando} title="Cerrar">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="cfgUsersModalBody">
          <label className="cfgUsersField">
            <span>Usuario</span>
            <input
              type="text"
              value={form.usuario}
              onChange={(e) => onChange('usuario', e.target.value)}
              placeholder="Ej: admin, secretaria, direccion"
              maxLength={100}
              autoFocus
            />
          </label>

          <label className="cfgUsersField">
            <span>Email de recuperación</span>
            <input
              type="email"
              value={form.email_recuperacion}
              onChange={(e) => onChange('email_recuperacion', e.target.value)}
              placeholder="Opcional"
              maxLength={190}
            />
          </label>

          <div className="cfgUsersModalGrid">
            <label className="cfgUsersField">
              <span>Rol</span>
              <select value={form.rol} onChange={(e) => onChange('rol', e.target.value)}>
                <option value="admin">Administrador</option>
                <option value="vista">Vista</option>
              </select>
            </label>

            <label className="cfgUsersField">
              <span>Estado</span>
              <select value={Number(form.activo)} onChange={(e) => onChange('activo', Number(e.target.value))}>
                <option value={1}>Activo</option>
                <option value={0}>Baja</option>
              </select>
            </label>
          </div>

          <div className="cfgUsersPasswordBox">
            <div className="cfgUsersPasswordTitle">
              <FontAwesomeIcon icon={faCircleInfo} />
              {esEdicion ? 'Contraseña opcional' : 'Contraseña obligatoria'}
            </div>
            <p>
              {esEdicion
                ? 'Dejá estos campos vacíos si no querés cambiar la contraseña.'
                : 'El usuario nuevo necesita una contraseña de al menos 6 caracteres.'}
            </p>

            <div className="cfgUsersModalGrid">
              <label className="cfgUsersField">
                <span>Contraseña</span>
                <input
                  type="password"
                  value={form.contrasena}
                  onChange={(e) => onChange('contrasena', e.target.value)}
                  placeholder={esEdicion ? 'Sin cambios' : 'Mínimo 6 caracteres'}
                />
              </label>

              <label className="cfgUsersField">
                <span>Repetir contraseña</span>
                <input
                  type="password"
                  value={form.repetir_contrasena}
                  onChange={(e) => onChange('repetir_contrasena', e.target.value)}
                  placeholder="Repetir"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="cfgUsersModalActions">
          <button type="button" className="mov-btn mov-btn--ghost" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          <button type="button" className="mov-btn mov-btn--primary" onClick={onSave} disabled={guardando}>
            <FontAwesomeIcon icon={faSave} />
            {guardando ? 'Guardando...' : 'Guardar usuario'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ConfiguracionUsuarios({ onVolver = null }) {
  const navigate = useNavigate();
  const volver = typeof onVolver === 'function' ? onVolver : () => navigate('/configuracion');

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

  function confirmarEliminar(usuario) {
    const nombre = usuario?.usuario || 'este usuario';
    const ok = window.confirm(`¿Eliminar definitivamente el usuario "${nombre}"? Esta acción no se puede deshacer.`);
    if (ok) eliminar(usuario);
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
                Administrá los usuarios del tenant actual desde la base master: altas, bajas, edición, roles y contraseña.
              </div>
            </div>

            <div className="mov-headFilters cfgUsersFilters">
              <div className="mov-search cfgUsersSearch">
                <label>Buscar</label>
                <div className="mov-searchInput">
                  <FontAwesomeIcon icon={faSearch} className="cfgUsersSearchIcon" />
                  <input
                    type="text"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Usuario, email o rol"
                  />
                  {busqueda && (
                    <button type="button" className="mov-clearSearch" onClick={() => setBusqueda('')}>
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mov-card__actions cfgUsersHeadActions">
            <button type="button" className="mov-btn mov-btn--ghost" onClick={volver} disabled={guardando || loading}>
              <FontAwesomeIcon icon={faArrowLeft} />
              Volver
            </button>
            <button type="button" className="mov-btn mov-btn--ghost" onClick={reload} disabled={guardando || loading}>
              <FontAwesomeIcon icon={faRotateRight} />
              Actualizar
            </button>
            <button type="button" className="mov-btn mov-btn--primary" onClick={abrirCrear} disabled={guardando || loading}>
              <FontAwesomeIcon icon={faPlus} />
              Nuevo usuario
            </button>
          </div>
        </div>

        <div className="cfgUsersStats">
          <div className="cfgUsersStat"><b>{resumen.total ?? 0}</b><span>Total</span></div>
          <div className="cfgUsersStat"><b>{resumen.activos ?? 0}</b><span>Activos</span></div>
          <div className="cfgUsersStat"><b>{resumen.bajas ?? 0}</b><span>Bajas</span></div>
          <div className="cfgUsersStat"><b>{resumen.admins ?? 0}</b><span>Admins</span></div>
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
                <tr>
                  <td colSpan="6" className="cfgUsersEmpty">Cargando usuarios...</td>
                </tr>
              ) : usuarios.length === 0 ? (
                <tr>
                  <td colSpan="6" className="cfgUsersEmpty">No hay usuarios para mostrar.</td>
                </tr>
              ) : (
                usuarios.map((usuario) => (
                  <tr key={usuario.id_usuario}>
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
                          <button type="button" className="cfgUsersActionBtn is-warning" onClick={() => cambiarEstado(usuario, 0)} title="Dar de baja">
                            <FontAwesomeIcon icon={faEyeSlash} />
                          </button>
                        ) : (
                          <button type="button" className="cfgUsersActionBtn is-success" onClick={() => cambiarEstado(usuario, 1)} title="Dar de alta">
                            <FontAwesomeIcon icon={faCheck} />
                          </button>
                        )}

                        <button type="button" className="cfgUsersActionBtn is-danger" onClick={() => confirmarEliminar(usuario)} title="Eliminar usuario">
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
    </div>
  );
}
