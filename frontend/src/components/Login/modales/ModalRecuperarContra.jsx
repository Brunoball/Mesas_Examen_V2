import React, { useEffect, useRef, useState } from 'react';
import { loginApi } from '../api/loginApi';
import './ModalRecuperar.css';

function maskEmail(email) {
  if (!email || !email.includes('@')) return null;

  const [local, domain] = String(email).split('@');
  if (!local || !domain) return null;
  if (local.length <= 2) return `${local.charAt(0)}***@${domain}`;

  return `${local.slice(0, 2)}${'*'.repeat(Math.min(local.length - 2, 4))}@${domain}`;
}

const LockIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="11" width="18" height="10" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const SendIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m22 2-7 20-4-9-9-4Z" />
    <path d="M22 2 11 13" />
  </svg>
);

const ModalRecuperarContra = ({ onClose, usuarioPrefill = '' }) => {
  const [step, setStep] = useState('form');
  const [usuario, setUsuario] = useState(usuarioPrefill || '');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');

  const inputRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && !cargando) onClose();
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cargando, onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (cargando) return;

    setError('');

    const user = String(usuario || '').trim();

    if (!user) {
      setError('Ingresá tu usuario o email de recuperación.');
      return;
    }

    try {
      setCargando(true);
      const data = await loginApi.solicitarRecuperacion({ usuario: user });

      if (!data?.exito) {
        setError(data?.mensaje || 'No se pudo enviar el correo de recuperación.');
        return;
      }

      setMaskedEmail(maskEmail(data?.email) || data?.email || 'tu correo registrado');
      setStep('sent');
    } catch (err) {
      setError(err?.data?.mensaje || 'No se pudo enviar el correo de recuperación.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div
      className="modal-recuperar-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Recuperar contraseña"
    >
      <div className="modal-recuperar-card">
        <div className="modal-recuperar-header">
          <div className="modal-recuperar-icon-wrap">
            <LockIcon />
          </div>

          <div className="modal-recuperar-title-group">
            <h2 className="modal-recuperar-title">Recuperar contraseña</h2>
            <p className="modal-recuperar-subtitle">
              {step === 'form'
                ? 'Te enviaremos un enlace a tu correo registrado'
                : 'Revisá tu bandeja de entrada'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="modal-recuperar-close"
            aria-label="Cerrar"
            disabled={cargando}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="modal-recuperar-body">
          {step === 'form' ? (
            <form onSubmit={handleSubmit} noValidate>
              <label className="modal-recuperar-label" htmlFor="usuarioRecuperacion">
                Usuario o email
              </label>

              <input
                ref={inputRef}
                id="usuarioRecuperacion"
                type="text"
                value={usuario}
                onChange={(e) => {
                  setUsuario(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Ej: admin o correo@gmail.com"
                className={`modal-recuperar-input ${error ? 'modal-recuperar-input-error' : ''}`}
                autoComplete="username"
                disabled={cargando}
              />

              {error && <p className="modal-recuperar-error">{error}</p>}

              <p className="modal-recuperar-hint">
                Ingresá el usuario con el que accedés al sistema. Si tiene un email registrado, recibirás las instrucciones ahí.
              </p>

              <div className="modal-recuperar-actions">
                <button
                  type="button"
                  onClick={onClose}
                  className="modal-recuperar-btn-secondary"
                  disabled={cargando}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="modal-recuperar-btn-primary"
                  disabled={cargando || !usuario.trim()}
                >
                  {cargando ? (
                    <span className="modal-recuperar-spinner" aria-label="Enviando" />
                  ) : (
                    <>
                      <SendIcon />
                      Enviar instrucciones
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="modal-recuperar-sent-state">
              <div className="modal-recuperar-sent-icon">
                <SendIcon />
              </div>

              <p className="modal-recuperar-sent-title">¡Listo! Revisá tu correo</p>
              <p className="modal-recuperar-sent-desc">
                Enviamos las instrucciones para restablecer tu contraseña a:
              </p>
              <div className="modal-recuperar-email-badge">{maskedEmail}</div>
              <p className="modal-recuperar-sent-hint">
                Si no lo ves en unos minutos, revisá la carpeta de spam.
              </p>

              <button
                type="button"
                onClick={onClose}
                className="modal-recuperar-btn-primary modal-recuperar-full-btn"
              >
                Entendido
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModalRecuperarContra;
