import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTriangleExclamation,
  faUserCheck,
  faUserSlash,
  faTrash,
  faTimes,
} from '@fortawesome/free-solid-svg-icons';
import '../../Global/Global_css/Global_Modals.css';
import './ModalPrevias.css';

export default function ModalConfirmarPrevia({ tipo, item, onConfirmar, onCerrar }) {
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const cancelRef = useRef(null);

  useEffect(() => {
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cancelRef.current?.focus();

    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      if (!guardando) onCerrar();
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [guardando, onCerrar]);

  const config = {
    baja: {
      titulo: 'Dar de baja previa',
      texto: 'La previa pasará a la sección de dados de baja. Podrás darla de alta nuevamente cuando lo necesites.',
      icono: faUserSlash,
      btn: 'Dar de baja',
      clase: 'previas-btn-warning',
      requiereMotivo: true,
    },
    alta: {
      titulo: 'Dar de alta previa',
      texto: 'La previa volverá a figurar en el listado principal de previas activas.',
      icono: faUserCheck,
      btn: 'Dar de alta',
      clase: 'previas-btn-success',
      requiereMotivo: false,
    },
    eliminar: {
      titulo: 'Eliminar previa',
      texto: 'Esta acción eliminará el registro de forma permanente. Si la previa está vinculada a una mesa, el backend lo bloqueará.',
      icono: faTrash,
      btn: 'Eliminar',
      clase: 'previas-btn-danger',
      requiereMotivo: false,
    },
  }[tipo] || {
    titulo: 'Confirmar operación',
    texto: 'Confirmá la operación seleccionada.',
    icono: faTriangleExclamation,
    btn: 'Confirmar',
    clase: 'previas-btn-primary',
    requiereMotivo: false,
  };

  async function confirmar() {
    setGuardando(true);
    setError('');

    const res = await onConfirmar(motivo);

    setGuardando(false);
    if (res?.ok) {
      onCerrar();
      return;
    }

    setError(res?.mensaje || 'No se pudo completar la operación.');
  }

  const modal = (
    <div
      className="gm-modalOverlay previas-modal-overlay previas-confirm-overlay"
      role="presentation"
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!guardando) onCerrar();
      }}
    >
      <div
        className="gm-modal previas-confirm previas-detail-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="previas-confirm-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button type="button" className="gm-modal__close previas-modal-close" onClick={onCerrar} aria-label="Cerrar" disabled={guardando}>
          <FontAwesomeIcon icon={faTimes} />
        </button>

        <div className="previas-confirm-icon">
          <FontAwesomeIcon icon={config.icono} />
        </div>

        <h3 id="previas-confirm-title">{config.titulo}</h3>
        <p>{config.texto}</p>

        {item && (
          <div className="previas-confirm-item previas-detail-summary">
            <strong>{item.alumno}</strong>
            <span>{item.dni} · {item.materia} · {item.curso_materia}</span>
          </div>
        )}

        {config.requiereMotivo && (
          <label className="previas-confirm-label">
            Motivo de baja <span>opcional</span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: registro cargado por error, alumno regularizó, etc."
              rows="3"
            />
          </label>
        )}

        {error && <div className="previas-alerta previas-alerta-error">{error}</div>}

        <div className="previas-confirm-actions">
          <button type="button" className="gm-btn gm-btn--ghost previas-btn previas-btn-light" onClick={onCerrar} ref={cancelRef} disabled={guardando}>
            Cancelar
          </button>
          <button type="button" className={`gm-btn previas-btn ${config.clase}`} onClick={confirmar} disabled={guardando}>
            {guardando ? 'Procesando...' : config.btn}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
