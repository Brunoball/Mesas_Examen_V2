// src/components/inicio/Inicio.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginApi } from './api/loginApi';
import './inicio.css';
import logoLerna from '../../imagenes/lerna_azul.png';
import Toast from '../Global/Toast';

const STORAGE_KEYS = {
  rememberFlag: 'rememberLogin',
  user: 'remember_nombre',
  pass: 'remember_contrasena', // base64
};

const AUTH_LAST_ACTIVITY_KEY = 'auth_last_activity';
const SESSION_EXPIRED_REASON_KEY = 'session_expired_reason';

function decodeJwtPayload(token) {
  try {
    const [, payloadB64] = token.split('.');
    if (!payloadB64) return null;
    const b64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function normalizeRol(value) {
  if (value == null) return 'vista';
  const v = String(value).trim().toLowerCase();
  if (
    v === '1' ||
    v === 'admin' ||
    v === 'administrator' ||
    v === 'administrador' ||
    v === 'superadmin'
  )
    return 'admin';
  return 'vista';
}

const Inicio = () => {
  const [nombre, setNombre] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [cargando, setCargando] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [modalRecuperarAbierto, setModalRecuperarAbierto] = useState(false);
  const [usuarioRecuperacion, setUsuarioRecuperacion] = useState('');
  const [cargandoRecuperacion, setCargandoRecuperacion] = useState(false);

  const [toast, setToast] = useState(null);
  const mostrarToast = (tipo, mensaje, duracion = 3000) =>
    setToast({ tipo, mensaje, duracion });

  const navigate = useNavigate();

  useEffect(() => {
    const sesionExpirada = localStorage.getItem(SESSION_EXPIRED_REASON_KEY) === '1';

    if (sesionExpirada) {
      localStorage.removeItem(SESSION_EXPIRED_REASON_KEY);
      mostrarToast('advertencia', 'Tu sesión expiró por inactividad. Volvé a iniciar sesión.', 4500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.rememberFlag) === '1';
    if (saved) {
      const savedUser = localStorage.getItem(STORAGE_KEYS.user) || '';
      const savedPassB64 = localStorage.getItem(STORAGE_KEYS.pass) || '';
      let savedPass = '';
      try {
        savedPass = savedPassB64 ? atob(savedPassB64) : '';
      } catch {
        savedPass = '';
      }
      setRemember(true);
      setNombre(savedUser);
      setContrasena(savedPass);
    }
  }, []);

  const persistRemember = (user, pass, flag) => {
    if (flag) {
      localStorage.setItem(STORAGE_KEYS.rememberFlag, '1');
      localStorage.setItem(STORAGE_KEYS.user, user ?? '');
      localStorage.setItem(STORAGE_KEYS.pass, btoa(pass ?? ''));
    } else {
      localStorage.removeItem(STORAGE_KEYS.rememberFlag);
      localStorage.removeItem(STORAGE_KEYS.user);
      localStorage.removeItem(STORAGE_KEYS.pass);
    }
  };

  useEffect(() => {
    if (remember) persistRemember(nombre, contrasena, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nombre, contrasena, remember]);

  const togglePasswordVisibility = () => setShowPassword((v) => !v);

  const abrirModalRecuperacion = () => {
    setUsuarioRecuperacion((nombre || '').trim());
    setModalRecuperarAbierto(true);
  };

  const cerrarModalRecuperacion = () => {
    if (cargandoRecuperacion) return;
    setModalRecuperarAbierto(false);
    setUsuarioRecuperacion('');
  };

  const manejarSolicitarRecuperacion = async (e) => {
    e.preventDefault();
    if (cargandoRecuperacion) return;

    const valor = (usuarioRecuperacion || '').trim();
    if (!valor) {
      mostrarToast('advertencia', 'Ingresá tu usuario o email de recuperación.');
      return;
    }

    try {
      setCargandoRecuperacion(true);
      const data = await loginApi.solicitarRecuperacion({ usuario: valor });

      if (!data?.exito) {
        mostrarToast('error', data?.mensaje || 'No se pudo enviar el correo de recuperación.');
        return;
      }

      mostrarToast(
        'exito',
        data?.email
          ? `Enviamos el enlace al email registrado: ${data.email}`
          : data?.mensaje || 'Enviamos el enlace al email registrado.',
        4500
      );
      setModalRecuperarAbierto(false);
      setUsuarioRecuperacion('');
    } catch (err) {
      mostrarToast(
        'error',
        err?.data?.mensaje || 'No se pudo enviar el correo de recuperación.'
      );
    } finally {
      setCargandoRecuperacion(false);
    }
  };

  const manejarEnvio = async (e) => {
    e.preventDefault();
    if (cargando) return;
    setCargando(true);

    if (!nombre || !contrasena) {
      mostrarToast('advertencia', 'Por favor complete todos los campos');
      setCargando(false);
      return;
    }

    try {
      const data = await loginApi.iniciarSesion({ nombre, contrasena });

      if (!data || !data.exito) {
        mostrarToast('error', data?.mensaje || 'Usuario o contraseña incorrectos');
        setCargando(false);
        return;
      }
      const token = data.token || data.session_key;
      const sessionKey = data.session_key || data.token;

      if (token) localStorage.setItem('token', token);
      if (sessionKey) localStorage.setItem('session_key', sessionKey);
      localStorage.setItem(AUTH_LAST_ACTIVITY_KEY, String(Date.now()));
      localStorage.removeItem(SESSION_EXPIRED_REASON_KEY);
      if (data.csrf_token) localStorage.setItem('csrf_token', data.csrf_token);
      if (data.tenant) localStorage.setItem('tenant', JSON.stringify(data.tenant));
      if (data.tenant?.idTenant) localStorage.setItem('idTenant', String(data.tenant.idTenant));

      const usuarioResp = data.usuario || {};
      let rol = (usuarioResp.rol ?? data.rol ?? '').toString();

      if ((!rol || rol === '') && token && token.split('.').length === 3) {
        const payload = decodeJwtPayload(token);
        const fromJwt = (payload?.rol || payload?.role || payload?.scope || '').toString();
        if (fromJwt) rol = fromJwt;
      }

      const usuarioFinal = {
        ...usuarioResp,
        idTenant: usuarioResp.idTenant || data.tenant?.idTenant || null,
        tenant: data.tenant || usuarioResp.tenant || null,
        rol: normalizeRol(rol),
      };
      localStorage.setItem('usuario', JSON.stringify(usuarioFinal));

      persistRemember(nombre, contrasena, remember);

      navigate('/panel');
    } catch (err) {
      mostrarToast(
        'error',
        err?.data?.mensaje || 'No se pudo iniciar sesión. Intente nuevamente.'
      );
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="ini_contenedor-principal">
      <main className="ini_login-shell" aria-label="Acceso al sistema Lerna">
        <section className="ini_brand-panel" aria-label="Identidad Lerna">
          <div className="ini_brand-glow" aria-hidden="true" />
          <div className="ini_brand-content">
            <span className="ini_brand-kicker">Sistema institucional</span>
            <img src={logoLerna} alt="Lerna Mesas de Examen" className="ini_brand-logo" />
            <div className="ini_brand-copy">
              <h2>Gestión de mesas de examen</h2>
              <p>Acceso seguro, ordenado y simple para administrar la información académica.</p>
            </div>
          </div>
        </section>

        <section className="ini_access-panel" aria-label="Formulario de acceso">
          <div className="ini_contenedor">
            <div className="ini_encabezado">
              <span className="ini_login-badge">Acceso privado</span>
              <h1 className="ini_titulo">Iniciar sesión</h1>
              <p className="ini_subtitulo">
                Ingresá tus credenciales para continuar al panel del sistema.
              </p>
            </div>

            <form
              onSubmit={manejarEnvio}
              className="ini_formulario"
              autoComplete="on"
              noValidate
            >
              <div className="ini_campo">
                <input
                  type="text"
                  placeholder="Usuario"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  required
                  className="ini_input"
                  autoComplete="username"
                  inputMode="text"
                />
              </div>

              <div className="ini_campo ini_campo-password">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="ini_input"
                  placeholder="Contraseña"
                  value={contrasena}
                  onChange={(e) => setContrasena(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="ini_toggle-password"
                  onClick={togglePasswordVisibility}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                  >
                    {showPassword ? (
                      <>
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      </>
                    ) : (
                      <>
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </>
                    )}
                  </svg>
                </button>
              </div>

              <div className="ini_check-row">
                <div className="ini_recordar-wrap">
                  <input
                    id="recordar"
                    type="checkbox"
                    className="ini_checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  <label htmlFor="recordar" className="ini_check-label">
                    Recordar cuenta
                  </label>
                </div>

                <button
                  type="button"
                  className="ini_link-recuperar"
                  onClick={abrirModalRecuperacion}
                >
                  Olvidé mi contraseña
                </button>
              </div>

              <div className="ini_footer">
                <button
                  type="submit"
                  className="ini_boton"
                  disabled={cargando}
                  aria-busy={cargando ? 'true' : 'false'}
                  aria-live="polite"
                >
                  {cargando ? 'Iniciando...' : 'Iniciar sesión'}
                </button>
              </div>
            </form>
          </div>
        </section>
      </main>

      {modalRecuperarAbierto && (
        <div
          className="ini_modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ini_recuperar_titulo"
        >
          <form className="ini_modal-card" onSubmit={manejarSolicitarRecuperacion}>
            <div className="ini_modal-header">
              <div className="ini_modal-icon" aria-hidden="true">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="10" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <div>
                <h2 id="ini_recuperar_titulo">Recuperar contraseña</h2>
                <p>Ingresá tu usuario o email de recuperación</p>
              </div>
              <button
                type="button"
                className="ini_modal-close"
                onClick={cerrarModalRecuperacion}
                disabled={cargandoRecuperacion}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            <div className="ini_modal-body">
              <label className="ini_modal-label" htmlFor="usuarioRecuperacion">
                Usuario o email
              </label>
              <input
                id="usuarioRecuperacion"
                type="text"
                className="ini_modal-input"
                value={usuarioRecuperacion}
                onChange={(e) => setUsuarioRecuperacion(e.target.value)}
                placeholder="Ej: admin o correo@gmail.com"
                autoComplete="username"
                autoFocus
              />
              <p className="ini_modal-help">
                Si el usuario tiene un email cargado en la base master, le enviaremos un enlace para crear una nueva contraseña.
              </p>
            </div>

            <div className="ini_modal-actions">
              <button
                type="button"
                className="ini_modal-btn ini_modal-btn-sec"
                onClick={cerrarModalRecuperacion}
                disabled={cargandoRecuperacion}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="ini_modal-btn ini_modal-btn-pri"
                disabled={cargandoRecuperacion}
              >
                {cargandoRecuperacion ? 'Enviando...' : 'Enviar enlace'}
              </button>
            </div>
          </form>
        </div>
      )}

      {toast && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default Inicio;
