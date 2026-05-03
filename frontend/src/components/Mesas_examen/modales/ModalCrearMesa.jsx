// src/components/Mesas_examen/modales/ModalCrearMesa.jsx
import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarDays,
  faCheck,
  faClock,
  faSpinner,
  faTimes,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";

const ModalCrearMesa = ({
  abierto,
  parametros,
  cargando = false,
  onClose,
  onConfirm,
}) => {
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [limpiarBorrador, setLimpiarBorrador] = useState(true);
  const [excluirFinesSemana, setExcluirFinesSemana] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (abierto && parametros) {
      setFechaInicio(parametros.fecha_inicio_sugerida || "");
      setFechaFin(parametros.fecha_fin_sugerida || "");
      setLimpiarBorrador(true);
      setExcluirFinesSemana(true);
      setError("");
    }
  }, [abierto, parametros]);

  if (!abierto) {
    return null;
  }

  const totalPrevias = parametros?.total_previas_para_armar || 0;
  const turnos = parametros?.turnos || [];

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!fechaInicio) {
      setError("Seleccioná una fecha de inicio.");
      return;
    }

    if (!fechaFin) {
      setError("Seleccioná una fecha de finalización.");
      return;
    }

    if (fechaFin < fechaInicio) {
      setError("La fecha de finalización no puede ser menor que la fecha de inicio.");
      return;
    }

    setError("");

    await onConfirm({
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      limpiar_borrador: limpiarBorrador,
      excluir_fines_semana: excluirFinesSemana,
    });
  };

  return (
    <div className="mesas-modal-overlay">
      <div className="mesas-modal">
        <div className="mesas-modal-header">
          <div>
            <h3>Crear mesas de examen</h3>
            <p>Primera fase: cruzar previas inscriptas con cátedras y docentes.</p>
          </div>

          <button
            type="button"
            className="mesas-modal-close"
            onClick={onClose}
            disabled={cargando}
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mesas-modal-body">
          <div className="mesas-modal-alert">
            <FontAwesomeIcon icon={faTriangleExclamation} />
            <span>
              Esta acción inserta/actualiza registros base en la tabla <strong>mesas</strong>.
              Todavía no genera el número final de mesa.
            </span>
          </div>

          <div className="mesas-modal-grid">
            <label className="mesas-field">
              <span>
                <FontAwesomeIcon icon={faCalendarDays} />
                Fecha de inicio
              </span>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                disabled={cargando}
              />
            </label>

            <label className="mesas-field">
              <span>
                <FontAwesomeIcon icon={faCalendarDays} />
                Fecha de finalización
              </span>
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                disabled={cargando}
              />
            </label>
          </div>

          <div className="mesas-modal-info">
            <div>
              <strong>{totalPrevias}</strong>
              <span>previas inscriptas para armar</span>
            </div>

            <div>
              <strong>{turnos.length}</strong>
              <span>turnos activos disponibles</span>
            </div>
          </div>

          {turnos.length > 0 && (
            <div className="mesas-turnos-preview">
              <span className="mesas-turnos-title">
                <FontAwesomeIcon icon={faClock} />
                Turnos que usará el armado:
              </span>

              <div className="mesas-turnos-list">
                {turnos.map((turno) => (
                  <span key={turno.id_turno} className="mesas-turno-pill">
                    {turno.turno}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mesas-modal-options">
            <label>
              <input
                type="checkbox"
                checked={limpiarBorrador}
                onChange={(e) => setLimpiarBorrador(e.target.checked)}
                disabled={cargando}
              />
              Eliminar borradores anteriores antes de armar
            </label>

            <label>
              <input
                type="checkbox"
                checked={excluirFinesSemana}
                onChange={(e) => setExcluirFinesSemana(e.target.checked)}
                disabled={cargando}
              />
              Excluir sábados y domingos
            </label>
          </div>

          {error && <div className="mesas-modal-error">{error}</div>}

          <div className="mesas-modal-actions">
            <button
              type="button"
              className="btn-modal-cancel"
              onClick={onClose}
              disabled={cargando}
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="btn-modal-confirm"
              disabled={cargando || totalPrevias === 0 || turnos.length === 0}
            >
              {cargando ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} spin />
                  Armando...
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faCheck} />
                  Crear mesas
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ModalCrearMesa;
