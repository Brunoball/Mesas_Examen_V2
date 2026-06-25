import React, { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPrint, faSpinner, faTimes } from '@fortawesome/free-solid-svg-icons';
import '../../Global/Global_css/Global_Modals.css';
import './ModalPeriodoPermiso.css';

function safeText(value, fallback = '—') {
  const texto = String(value ?? '').trim();
  return texto || fallback;
}

export default function ModalPeriodoPermiso({
  abierto,
  item,
  mes,
  anio,
  cargando = false,
  meses = [],
  periodoPreview = '—',
  onMesChange,
  onAnioChange,
  onCerrar,
  onConfirmar,
}) {
  const overlayRef = useRef(null);
  const closeRef = useRef(null);

  const cerrar = useCallback(() => {
    if (cargando) return;
    onCerrar?.();
  }, [cargando, onCerrar]);

  useEffect(() => {
    if (!abierto) return undefined;

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = setTimeout(() => closeRef.current?.focus(), 0);

    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      cerrar();
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [abierto, cerrar]);

  if (!abierto) return null;

  const portalTarget = typeof document !== 'undefined' ? document.body : null;
  if (!portalTarget) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="gm-modalOverlay previas-periodoPermisoOverlay"
      role="presentation"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <section
        className="gm-modal gm-modal--periodo-permiso"
        role="dialog"
        aria-modal="true"
        aria-labelledby="previas-periodo-title"
      >
        <header className="gm-modal__header">
          <span className="gm-modal__headIcon" aria-hidden="true">
            <FontAwesomeIcon icon={faPrint} />
          </span>

          <div className="gm-modal__headText">
            <h2 id="previas-periodo-title">Turno del permiso de examen</h2>
            <p>Completá el período que va a figurar en la impresión del permiso.</p>
          </div>

          <button
            ref={closeRef}
            type="button"
            className="gm-modal__close"
            onClick={cerrar}
            disabled={cargando}
            aria-label="Cerrar"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </header>

        <div className="gm-modal__content previas-periodoPermiso__content">
          <div className="gm-alert gm-alert--info gm-alert--banner previas-periodoPermiso__notice">
            <FontAwesomeIcon icon={faPrint} />
            <span>
              Esta previa no tiene un período de mesa asignado. Indicá el mes y el año antes de imprimir.
            </span>
          </div>

          <section className="gm-panel previas-periodoPermiso__panel">
            <div className="gm-panel__head">
              <div>
                <span className="gm-panel__eyebrow">Datos del permiso</span>
                <h3>Período de mesa</h3>
              </div>
              <span className="gm-panel__tag">Permiso</span>
            </div>

            <div className="gm-panel__body">
              <div className="previas-periodoPermiso__studentCard">
                <span>Alumno</span>
                <strong title={safeText(item?.alumno)}>{safeText(item?.alumno)}</strong>
              </div>

              <div className="previas-periodoPermiso__fields">
                <label className="gm-field">
                  <select
                    className="gm-input gm-select"
                    value={mes}
                    onChange={(event) => onMesChange?.(event.target.value)}
                    disabled={cargando}
                  >
                    <option value="">Seleccionar mes</option>
                    {meses.map((nombreMes) => (
                      <option key={nombreMes} value={nombreMes}>{nombreMes}</option>
                    ))}
                  </select>
                  <span className={`gm-label${mes ? ' is-up' : ''}`}>Mes / turno</span>
                </label>

                <label className="gm-field">
                  <input
                    className="gm-input"
                    type="number"
                    min="2000"
                    max="2100"
                    value={anio}
                    onChange={(event) => onAnioChange?.(event.target.value)}
                    placeholder=" "
                    disabled={cargando}
                  />
                  <span className={`gm-label${anio ? ' is-up' : ''}`}>Año</span>
                </label>
              </div>

              <div className="previas-periodoPermiso__preview">
                <span>En el permiso va a figurar</span>
                <strong>{periodoPreview}</strong>
              </div>
            </div>
          </section>
        </div>

        <footer className="gm-modal__actions">
          <button
            type="button"
            className="gm-btn gm-btn--ghost"
            onClick={cerrar}
            disabled={cargando}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="gm-btn gm-btn--primary"
            onClick={onConfirmar}
            disabled={cargando}
          >
            {cargando ? (
              <>
                <FontAwesomeIcon icon={faSpinner} spin /> Preparando...
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={faPrint} /> Imprimir permiso
              </>
            )}
          </button>
        </footer>
      </section>
    </div>,
    portalTarget
  );
}
