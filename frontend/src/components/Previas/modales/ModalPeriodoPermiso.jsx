import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPrint, faSpinner, faTimes } from '@fortawesome/free-solid-svg-icons';

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
  if (!abierto) return null;

  return (
    <div className="previas-periodoOverlay" role="presentation">
      <div className="previas-periodoModal" role="dialog" aria-modal="true" aria-labelledby="previas-periodo-title">
        <button
          type="button"
          className="previas-periodoModal__close"
          onClick={onCerrar}
          disabled={cargando}
          aria-label="Cerrar"
        >
          <FontAwesomeIcon icon={faTimes} />
        </button>

        <div className="previas-periodoModal__icon">
          <FontAwesomeIcon icon={faPrint} />
        </div>

        <h3 id="previas-periodo-title">Turno del permiso de examen</h3>
        <p>
          Esta previa no tiene un período de mesa asignado. Indicá el mes y el año
          que deben figurar en el permiso antes de imprimir.
        </p>

        <div className="previas-periodoModal__alumno">
          <span>Alumno</span>
          <strong>{safeText(item?.alumno)}</strong>
        </div>

        <div className="previas-periodoModal__fields">
          <label>
            <span>Mes / turno</span>
            <select
              value={mes}
              onChange={(event) => onMesChange?.(event.target.value)}
              disabled={cargando}
            >
              <option value="">Seleccionar mes</option>
              {meses.map((nombreMes) => (
                <option key={nombreMes} value={nombreMes}>{nombreMes}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Año</span>
            <input
              type="number"
              min="2000"
              max="2100"
              value={anio}
              onChange={(event) => onAnioChange?.(event.target.value)}
              disabled={cargando}
            />
          </label>
        </div>

        <div className="previas-periodoModal__preview">
          En el permiso va a figurar: <strong>{periodoPreview}</strong>
        </div>

        <div className="previas-periodoModal__actions">
          <button
            type="button"
            className="mov-btn mov-btn--secondary"
            onClick={onCerrar}
            disabled={cargando}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="mov-btn mov-btn--primary"
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
        </div>
      </div>
    </div>
  );
}
