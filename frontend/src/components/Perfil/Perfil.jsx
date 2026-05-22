// src/components/Perfil/Perfil.jsx
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBuildingColumns,
  faCalendarDays,
  faCheckCircle,
  faCrown,
  faEnvelope,
  faIdBadge,
  faShieldHalved,
  faUserCircle,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import BASE_URL from '../../config/config';
import { usePerfil } from './hooks/usePerfil';
import '../Global/Global_css/Global_Modals.css';
import './Perfil.css';

const normalizarTexto = (value, fallback = '-') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const capitalizar = (value) => {
  const text = normalizarTexto(value, '').toLowerCase();
  if (!text) return '-';
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const formatearFecha = (value) => {
  if (!value) return '-';

  try {
    const normalizada = String(value).replace(' ', 'T');
    const fecha = new Date(normalizada);
    if (Number.isNaN(fecha.getTime())) return String(value);

    return new Intl.DateTimeFormat('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(fecha);
  } catch {
    return String(value);
  }
};

const obtenerOrigenDesdeUrl = (url) => {
  const value = String(url || '').trim();
  if (!value) return '';

  try {
    return new URL(value, window.location.origin).origin.replace(/\/+$/, '');
  } catch {
    return '';
  }
};

const resolverPublicBaseUrl = () => {
  const publicEnvUrl = String(
    process.env.REACT_APP_PUBLIC_BASE_URL || process.env.REACT_APP_APP_URL || ''
  ).trim();

  if (publicEnvUrl) return publicEnvUrl.replace(/\/+$/, '');

  const configOrigin = obtenerOrigenDesdeUrl(BASE_URL);
  if (configOrigin) return configOrigin;

  return String(window.location.origin || '').replace(/\/+$/, '');
};

const normalizarLogoUrl = (url) => {
  const value = String(url || '').trim();

  if (
    !value ||
    value.toLowerCase() === 'null' ||
    value.toLowerCase() === 'undefined' ||
    value === '-'
  ) {
    return '';
  }

  if (/^(https?:)?\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:')) {
    return value;
  }

  const clean = value.replace(/\\/g, '/');
  const publicBase = resolverPublicBaseUrl();

  return clean.startsWith('/') ? `${publicBase}${clean}` : `${publicBase}/${clean}`;
};

const obtenerLogoPerfil = (perfil, logoInicialUrl = '') => {
  const candidatos = [
    logoInicialUrl,
    perfil?.tenant?.logo_icono_url,
    perfil?.tenant?.logo_url,
    perfil?.logo_icono_url,
    perfil?.logo_url,
  ];

  return normalizarLogoUrl(candidatos.find((item) => String(item || '').trim() !== ''));
};

const obtenerNombreUsuario = (perfil) =>
  normalizarTexto(
    perfil?.usuario || perfil?.Nombre_Completo || perfil?.nombre || perfil?.nombre_usuario,
    'Usuario'
  );

const obtenerNombreTenant = (perfil) =>
  normalizarTexto(perfil?.tenant?.nombre || perfil?.tenant_nombre || perfil?.institucion, 'Institución');

const obtenerPlanNombre = (perfil) =>
  normalizarTexto(
    perfil?.plan?.nombre || perfil?.plan_nombre || perfil?.tenant?.plan?.nombre,
    'Plan no informado'
  );

const InfoItem = ({ icon, label, value }) => (
  <div className="perfil-infoItem">
    <div className="perfil-infoItem__icon" aria-hidden="true">
      <FontAwesomeIcon icon={icon} />
    </div>
    <div className="perfil-infoItem__content">
      <span>{label}</span>
      <strong>{normalizarTexto(value)}</strong>
    </div>
  </div>
);

const ModalPerfil = memo(function ModalPerfil({
  open,
  onClose,
  usuarioInicial = null,
  logoInicialUrl = '',
}) {
  const closeBtnRef = useRef(null);
  const [logoError, setLogoError] = useState(false);
  const { perfil, cargando, error } = usePerfil(open, usuarioInicial);

  const logoUrl = useMemo(() => obtenerLogoPerfil(perfil, logoInicialUrl), [perfil, logoInicialUrl]);
  const nombreUsuario = useMemo(() => obtenerNombreUsuario(perfil), [perfil]);
  const nombreTenant = useMemo(() => obtenerNombreTenant(perfil), [perfil]);
  const nombrePlan = useMemo(() => obtenerPlanNombre(perfil), [perfil]);
  const rol = useMemo(() => capitalizar(perfil?.rol), [perfil]);

  const email = perfil?.email_recuperacion || perfil?.email || '-';
  const fechaCreacion = perfil?.fecha_creacion || perfil?.created_at || perfil?.creado_en || null;
  const tenantActivo = String(perfil?.tenant?.activo ?? perfil?.tenant_activo ?? '1') !== '0';

  useEffect(() => {
    if (!open) return undefined;

    const overflowXAnterior = document.body.style.overflowX;
    document.body.style.overflowX = 'hidden';
    closeBtnRef.current?.focus();

    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      onClose?.();
    };

    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.body.style.overflowX = overflowXAnterior;
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, onClose]);

  useEffect(() => {
    setLogoError(false);
  }, [logoUrl, open]);

  if (!open) return null;

  return createPortal(
    <div
      className="gm-modalOverlay perfil-modalOverlay"
      role="presentation"
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <section
        className="gm-modal gm-modal--perfil perfil-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="perfil-title"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gm-modal__header perfil-modal__header">
          <div className="gm-modal__headIcon perfil-modal__headIcon" aria-hidden="true">
            <FontAwesomeIcon icon={faUserCircle} />
          </div>

          <div className="gm-modal__headText">
            <h2 id="perfil-title">Perfil de usuario</h2>
            <p>Información principal de la sesión, institución y plan activo.</p>
          </div>

          <button
            type="button"
            className="gm-modal__close perfil-modal__close"
            onClick={onClose}
            aria-label="Cerrar perfil"
            title="Cerrar"
            ref={closeBtnRef}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="gm-modal__content perfil-modal__content">
          <section className="perfil-heroCard" aria-label="Resumen del perfil">
            <div className={`perfil-avatar ${logoUrl && !logoError ? 'has-logo' : ''}`}>
              {logoUrl && !logoError ? (
                <img src={logoUrl} alt={`Logo de ${nombreTenant}`} onError={() => setLogoError(true)} />
              ) : (
                <FontAwesomeIcon icon={faUserCircle} />
              )}
            </div>

            <div className="perfil-heroCard__text">
              <h3>{nombreUsuario}</h3>
              <p>{nombreTenant}</p>
            </div>

              <span className="perfil-kicker">Sesión actual</span>

          </section>

          <div className="perfil-bodyLayout">
            <div className="perfil-sideColumn">
              <section className="gm-panel perfil-planPanel" aria-label="Tipo de plan">
                <div className="gm-panel__head gm-panel__head--split">
                  <div>
                    <span className="gm-panel__eyebrow">Plan contratado</span>
                    <h3>
                      <FontAwesomeIcon icon={faCrown} />
                      Tipo de plan
                    </h3>
                  </div>
                  {cargando && <span className="gm-panel__tag">Actualizando</span>}
                </div>

                <div className="gm-panel__body perfil-planPanel__body">
                  <div className="perfil-planCard">
                    <div className="perfil-planCard__icon" aria-hidden="true">
                      <FontAwesomeIcon icon={faCrown} />
                    </div>
                    <div>
                      <span>Plan actual</span>
                      <strong>{nombrePlan}</strong>
                    </div>
                  </div>
                </div>
              </section>

              {error && (
                <div className="gm-alert gm-alert--info perfil-status" role="status">
                  Se muestran datos guardados localmente. {error}
                </div>
              )}
            </div>

            <div className="perfil-mainColumn">
              <section className="gm-panel perfil-dataPanel" aria-label="Datos del usuario">
                <div className="gm-panel__head gm-panel__head--split">
                  <div>
                    <span className="gm-panel__eyebrow">Datos principales</span>
                    <h3>
                      <FontAwesomeIcon icon={faIdBadge} />
                      Información del perfil
                    </h3>
                  </div>
                  <span className="gm-panel__tag">{rol}</span>
                </div>

                <div className="gm-panel__body perfil-dataPanel__body">
                  <div className="perfil-grid">
                    <InfoItem icon={faIdBadge} label="Usuario" value={nombreUsuario} />
                    <InfoItem icon={faEnvelope} label="Email de recuperación" value={email} />
                    <InfoItem icon={faShieldHalved} label="Rol" value={rol} />
                    <InfoItem icon={faBuildingColumns} label="Institución" value={nombreTenant} />
                    <InfoItem icon={faCalendarDays} label="Alta del usuario" value={formatearFecha(fechaCreacion)} />
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>

        <div className="gm-modal__actions perfil-modal__actions">
          <span className="perfil-footerBadge">
            <FontAwesomeIcon icon={faCheckCircle} />
            Sesión activa
          </span>

          <button type="button" className="gm-btn gm-btn--primary perfil-doneBtn" onClick={onClose}>
            Listo
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
});

export default ModalPerfil;
