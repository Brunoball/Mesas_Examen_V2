// src/components/Login/RestablecerContrasena.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCircleExclamation,
  faEye,
  faEyeSlash,
  faKey,
  faLock,
  faRotate,
  faSpinner,
  faTimes,
} from '@fortawesome/free-solid-svg-icons';
import { loginApi } from './api/loginApi';
import Toast from '../Global/Toast';
import './restablecer.css';

const evaluarFortalezaContrasena = (valor = '') => {
  const password = String(valor);
  let puntos = 0;

  if (password.length >= 6) puntos += 1;
  if (password.length >= 10) puntos += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) puntos += 1;
  if (/\d/.test(password)) puntos += 1;
  if (/[^A-Za-z0-9]/.test(password)) puntos += 1;

  if (!password) {
    return {
      nivel: 'empty',
      texto: 'Ingresá una contraseña',
      detalle: 'Usá letras, números y símbolos para mejorarla.',
      porcentaje: 0,
    };
  }

  if (puntos <= 2) {
    return {
      nivel: 'weak',
      texto: 'Débil',
      detalle: 'Sumá mayúsculas, números o símbolos.',
      porcentaje: 32,
    };
  }

  if (puntos <= 4) {
    return {
      nivel: 'medium',
      texto: 'Buena',
      detalle: 'Está bien, pero puede ser más segura.',
      porcentaje: 66,
    };
  }

  return {
    nivel: 'strong',
    texto: 'Muy buena',
    detalle: 'Contraseña más sólida y difícil de adivinar.',
    porcentaje: 100,
  };
};

const RestablecerContrasena = () => {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => (searchParams.get('token') || '').trim(), [searchParams]);
  const navigate = useNavigate();

  const [validando, setValidando] = useState(true);
  const [tokenValido, setTokenValido] = useState(false);
  const [usuario, setUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [confirmarContrasena, setConfirmarContrasena] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensajeError, setMensajeError] = useState('');
  const [toast, setToast] = useState(null);

  const fortaleza = useMemo(() => evaluarFortalezaContrasena(contrasena), [contrasena]);

  const mostrarToast = (tipo, mensaje, duracion = 3200) =>
    setToast({ tipo, mensaje, duracion });

  useEffect(() => {
    let activo = true;

    const validar = async () => {
      if (!token) {
        setTokenValido(false);
        setMensajeError('El enlace no tiene token de recuperación.');
        setValidando(false);
        return;
      }

      try {
        setValidando(true);
        const data = await loginApi.validarTokenRecuperacion({ token });
        if (!activo) return;

        if (data?.exito) {
          setTokenValido(true);
          setUsuario(data?.usuario || '');
          setMensajeError('');
        } else {
          setTokenValido(false);
          setMensajeError(data?.mensaje || 'El enlace es inválido o está vencido.');
        }
      } catch (err) {
        if (!activo) return;
        setTokenValido(false);
        setMensajeError(err?.data?.mensaje || 'No se pudo validar el enlace de recuperación.');
      } finally {
        if (activo) setValidando(false);
      }
    };

    validar();

    return () => {
      activo = false;
    };
  }, [token]);

  const manejarSubmit = async (e) => {
    e.preventDefault();
    if (guardando || !tokenValido) return;

    if (contrasena.length < 6) {
      mostrarToast('advertencia', 'La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (contrasena !== confirmarContrasena) {
      mostrarToast('error', 'Las contraseñas no coinciden.');
      return;
    }

    try {
      setGuardando(true);
      const data = await loginApi.guardarNuevaContrasena({
        token,
        contrasena,
        confirmarContrasena,
      });

      if (!data?.exito) {
        mostrarToast('error', data?.mensaje || 'No se pudo guardar la nueva contraseña.');
        return;
      }

      localStorage.removeItem('token');
      localStorage.removeItem('session_key');
      localStorage.removeItem('csrf_token');
      localStorage.removeItem('usuario');

      mostrarToast('exito', data?.mensaje || 'Contraseña actualizada correctamente.', 1800);
      setTimeout(() => navigate('/', { replace: true }), 1800);
    } catch (err) {
      mostrarToast('error', err?.data?.mensaje || 'No se pudo guardar la nueva contraseña.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="rst_page">
      <form className="rst_modal" onSubmit={manejarSubmit}>
        <div className="rst_header">
          <div className="rst_icon" aria-hidden="true">
            <FontAwesomeIcon icon={faKey} />
          </div>

          <div className="rst_title_wrap">
            <span className="rst_badge">Restablecer acceso</span>
            <h1>Nueva contraseña</h1>
            <p>{usuario ? `Cuenta: ${usuario}` : 'Ingresá tu nueva contraseña'}</p>
          </div>

          <button
            type="button"
            className="rst_close"
            onClick={() => navigate('/', { replace: true })}
            aria-label="Volver al login"
            title="Volver al login"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="rst_body">
          {validando && (
            <div className="rst_state">
              <FontAwesomeIcon icon={faSpinner} spin aria-hidden="true" />
              <span>Validando enlace de recuperación...</span>
            </div>
          )}

          {!validando && !tokenValido && (
            <div className="rst_error_box">
              <FontAwesomeIcon icon={faCircleExclamation} aria-hidden="true" />
              <div>
                <strong>No se puede restablecer la contraseña</strong>
                <span>{mensajeError}</span>
              </div>
            </div>
          )}

          {!validando && tokenValido && (
            <>
              <label className="rst_label" htmlFor="nuevaContrasena">Nueva contraseña</label>
              <div className="rst_input_wrap">
                <FontAwesomeIcon icon={faLock} className="rst_input_icon" aria-hidden="true" />
                <input
                  id="nuevaContrasena"
                  type={showPassword ? 'text' : 'password'}
                  value={contrasena}
                  onChange={(e) => setContrasena(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
                  autoFocus
                />
                <button
                  type="button"
                  className="rst_eye"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} />
                </button>
              </div>

              <div className={`rst_strength rst_strength_${fortaleza.nivel}`}>
                <div className="rst_strength_head">
                  <span>Seguridad de la contraseña</span>
                  <strong>{fortaleza.texto}</strong>
                </div>
                <div className="rst_strength_track" aria-hidden="true">
                  <span style={{ width: `${fortaleza.porcentaje}%` }} />
                </div>
                <p>{fortaleza.detalle}</p>
              </div>

              <label className="rst_label" htmlFor="confirmarNuevaContrasena">Confirmar contraseña</label>
              <div className="rst_input_wrap">
                <FontAwesomeIcon icon={faRotate} className="rst_input_icon" aria-hidden="true" />
                <input
                  id="confirmarNuevaContrasena"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmarContrasena}
                  onChange={(e) => setConfirmarContrasena(e.target.value)}
                  placeholder="Repetí la contraseña"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="rst_eye"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  aria-label={showConfirmPassword ? 'Ocultar confirmación' : 'Mostrar confirmación'}
                  title={showConfirmPassword ? 'Ocultar confirmación' : 'Mostrar confirmación'}
                >
                  <FontAwesomeIcon icon={showConfirmPassword ? faEyeSlash : faEye} />
                </button>
              </div>
            </>
          )}
        </div>

        <div className="rst_actions">
          <button
            type="button"
            className="rst_btn rst_btn_sec"
            onClick={() => navigate('/', { replace: true })}
            disabled={guardando}
          >
            Cancelar
          </button>

          <button
            type="submit"
            className="rst_btn rst_btn_pri"
            disabled={!tokenValido || validando || guardando}
          >
            {guardando ? 'Guardando...' : 'Guardar contraseña'}
          </button>
        </div>
      </form>

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

export default RestablecerContrasena;
