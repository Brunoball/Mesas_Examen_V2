// src/components/Perfil/Perfil.jsx
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
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
  const { perfil, error } = usePerfil(open, usuarioInicial);

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

    closeBtnRef.current?.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    setLogoError(false);
  }, [logoUrl, open]);

  if (!open) return null;

  return (
    <div
      className="perfil-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="perfil-title"
    >
      <section className="perfil-modal">
        <button
          type="button"
          className="perfil-close"
          onClick={onClose}
          aria-label="Cerrar perfil"
          title="Cerrar"
          ref={closeBtnRef}
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>

        <div className="perfil-header">
          <div className={`perfil-avatar ${logoUrl && !logoError ? 'has-logo' : ''}`}>
            {logoUrl && !logoError ? (
              <img src={logoUrl} alt={`Logo de ${nombreTenant}`} onError={() => setLogoError(true)} />
            ) : (
              <FontAwesomeIcon icon={faUserCircle} />
            )}
          </div>

          <div className="perfil-header__text">
            <span className="perfil-kicker">Perfil de usuario</span>
            <h2 id="perfil-title">{nombreUsuario}</h2>
            <p>{nombreTenant}</p>
          </div>
        </div>

        <div className="perfil-planCard">
          <div className="perfil-planCard__icon" aria-hidden="true">
            <FontAwesomeIcon icon={faCrown} />
          </div>
          <div>
            <span>Tipo de plan</span>
            <strong>{nombrePlan}</strong>
          </div>
          <em>{tenantActivo ? 'Activo' : 'Inactivo'}</em>
        </div>


        {error && (
          <div className="perfil-status perfil-status--warning">
            Se muestran datos guardados localmente. {error}
          </div>
        )}

        <div className="perfil-grid">
          <InfoItem icon={faIdBadge} label="Usuario" value={nombreUsuario} />
          <InfoItem icon={faEnvelope} label="Email de recuperación" value={email} />
          <InfoItem icon={faShieldHalved} label="Rol" value={rol} />
          <InfoItem icon={faBuildingColumns} label="Institución" value={nombreTenant} />
          <InfoItem icon={faCalendarDays} label="Alta del usuario" value={formatearFecha(fechaCreacion)} />
        </div>

        <div className="perfil-footer">
          <span className="perfil-footer__badge">
            <FontAwesomeIcon icon={faCheckCircle} /> Sesión activa
          </span>
          <button type="button" className="perfil-footer__btn" onClick={onClose}>
            Listo
          </button>
        </div>
      </section>
    </div>
  );
});

export default ModalPerfil;
