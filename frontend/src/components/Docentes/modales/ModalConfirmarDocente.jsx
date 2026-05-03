import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExclamationTriangle, faTimes } from '@fortawesome/free-solid-svg-icons';

export default function ModalConfirmarDocente({ tipo, item, onConfirmar, onCerrar }) {
  const [motivo, setMotivo] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');

  const esBaja = tipo === 'baja';
  const esAlta = tipo === 'alta';
  const esEliminar = tipo === 'eliminar';

  const titulo = esBaja ? 'Dar de baja docente' : esAlta ? 'Dar de alta docente' : 'Eliminar docente';
  const texto = esBaja
    ? 'El docente dejará de figurar como activo, pero se conservará en la sección de dados de baja.'
    : esAlta
      ? 'El docente volverá a figurar como activo.'
      : 'Se eliminará definitivamente. Si tenía cátedras asignadas, quedarán sin docente.';

  async function handleConfirmar() {
    setProcesando(true);
    setError('');
    const res = await onConfirmar(motivo.trim());
    setProcesando(false);

    if (res.ok) {
      onCerrar();
    } else {
      setError(res.mensaje || 'No se pudo completar la operación.');
    }
  }

  return (
    <div className="docentes-modal-overlay" role="dialog" aria-modal="true">
      <div className="docentes-modal docentes-modal-sm">
        <div className="docentes-modal-header">
          <div>
            <h2><FontAwesomeIcon icon={faExclamationTriangle} /> {titulo}</h2>
            <p>{texto}</p>
          </div>
          <button type="button" className="docentes-modal-close" onClick={onCerrar}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        {error && <div className="docentes-alerta docentes-alerta-error">{error}</div>}

        <div className="docentes-confirm-box">
          <strong>{item?.docente}</strong>
          <span>{item?.cargo || 'Sin cargo'}</span>
        </div>

        {esBaja && (
          <label className="docentes-label">
            Motivo u observación de baja
            <textarea
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: licencia, jubilación, pase, etc."
            />
          </label>
        )}

        <div className="docentes-modal-actions">
          <button type="button" className="docentes-btn docentes-btn-light" onClick={onCerrar} disabled={procesando}>
            Cancelar
          </button>
          <button
            type="button"
            className={`docentes-btn ${esEliminar ? 'docentes-btn-danger' : 'docentes-btn-primary'}`}
            onClick={handleConfirmar}
            disabled={procesando}
          >
            {procesando ? 'Procesando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}
