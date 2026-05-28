import React, { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleInfo, faTimes } from '@fortawesome/free-solid-svg-icons';
import '../Global_css/Global_Modals.css';

const MODAL_STACK_SELECTOR = "[data-mesa-modal-root='true'], .gdel-overlay, [data-global-info-modal-root='true']";

const esModalSuperior = (node) => {
  if (typeof document === 'undefined' || !node) return true;
  const modales = Array.from(document.querySelectorAll(MODAL_STACK_SELECTOR));
  return modales[modales.length - 1] === node;
};

const textoSeguro = (valor, fallback = 'Sin contenido disponible.') => {
  const salida = String(valor ?? '').trim();
  return salida || fallback;
};

export default function ModalContenidoGlobal({
  open,
  title = 'Detalle',
  subtitle = '',
  content = '',
  closeLabel = 'Cerrar',
  icon = faCircleInfo,
  onClose,
}) {
  const overlayRef = useRef(null);
  const closeRef = useRef(null);

  const cerrar = useCallback(() => {
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    const timer = setTimeout(() => closeRef.current?.focus(), 0);

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (!esModalSuperior(overlayRef.current)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      cerrar();
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open, cerrar]);

  if (!open) return null;

  const portalTarget = typeof document !== 'undefined' ? document.body : null;
  if (!portalTarget) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="ginfo-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ginfo-title"
      data-global-info-modal-root="true"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="ginfo-modal">
        <header className="ginfo-header">
          <span className="ginfo-header__icon" aria-hidden="true">
            <FontAwesomeIcon icon={icon} />
          </span>

          <div className="ginfo-header__text">
            <h3 id="ginfo-title">{title}</h3>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>

          <button
            ref={closeRef}
            type="button"
            className="ginfo-close"
            onClick={cerrar}
            aria-label="Cerrar"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </header>

        <div className="ginfo-body">
          <div className="ginfo-content">{textoSeguro(content)}</div>
        </div>

        <footer className="ginfo-footer">
          <button type="button" className="ginfo-btn" onClick={cerrar}>
            {closeLabel}
          </button>
        </footer>
      </div>
    </div>,
    portalTarget
  );
}
