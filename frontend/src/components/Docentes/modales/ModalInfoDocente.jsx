import React from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBookOpen,
  faCalendarDays,
  faChalkboardTeacher,
  faTimes,
  faUserTie,
} from '@fortawesome/free-solid-svg-icons';
import '../../Global/Global_css/Global_InfoDocente.css';

function formatearFecha(fecha) {
  if (!fecha) return '';

  const [y, m, d] = String(fecha).split('-');

  if (!y || !m || !d) return fecha;

  return `${d}/${m}/${y}`;
}

export default function ModalInfoDocente({ item, onCerrar }) {
  const catedras = Array.isArray(item?.catedras) ? item.catedras : [];

  const disponibilidades = Array.isArray(item?.disponibilidades)
    ? item.disponibilidades
    : [];

  return createPortal(
    <div
      className="docentes-modal-overlay docentes-info-modal-overlay"
      role="presentation"
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div
        className="docentes-modal docentes-modal-xl docentes-modal--info"
        role="dialog"
        aria-modal="true"
        aria-labelledby="docentes-info-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="docentes-info-modal-header">
          <div className="docentes-info-modal-headIcon" aria-hidden="true">
            <FontAwesomeIcon icon={faUserTie} />
          </div>

          <div className="docentes-info-modal-headText">
            <h2 id="docentes-info-title">Información del docente</h2>
            <p>Datos, cátedras asignadas y disponibilidad cargada.</p>
          </div>

          <button
            type="button"
            className="docentes-info-modal-close"
            onClick={onCerrar}
            aria-label="Cerrar modal"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="docentes-info-content">
          <div className="docentes-info-head">
            <div className="docentes-info-icon">
              <FontAwesomeIcon icon={faUserTie} />
            </div>

            <div>
              <h3>{item?.docente || 'Docente'}</h3>

              <p>
                {item?.cargo || 'Sin cargo'} ·{' '}
                {Number(item?.activo) === 1 ? 'Activo' : 'Dado de baja'}
              </p>

              {item?.observacion && <small>{item.observacion}</small>}
            </div>
          </div>

          <div className="docentes-info-grid">
            <div className="docentes-info-card">
              <span>Registros internos</span>
              <strong>
                {item?.cantidad_registros || item?.ids_docentes?.length || 1}
              </strong>
            </div>

            <div className="docentes-info-card">
              <span>Cátedras asignadas</span>
              <strong>{catedras.length}</strong>
            </div>

            <div className="docentes-info-card">
              <span>Días disponibles</span>
              <strong>{disponibilidades.length}</strong>
            </div>
          </div>

          <section className="docentes-info-section">
            <h3>
              <FontAwesomeIcon icon={faChalkboardTeacher} />
              Materias, cursos y divisiones
            </h3>

            <div className="docentes-info-table-wrap">
              <table className="docentes-info-table">
                <thead>
                  <tr>
                    <th>Curso</th>
                    <th>División</th>
                    <th>Materia</th>
                  </tr>
                </thead>

                <tbody>
                  {catedras.length === 0 && (
                    <tr>
                      <td colSpan="3" className="docentes-empty">
                        No tiene cátedras asignadas.
                      </td>
                    </tr>
                  )}

                  {catedras.map((cat) => (
                    <tr key={cat.id_catedra}>
                      <td>
                        <span className="docentes-badge">
                          {cat.nombre_curso}
                        </span>
                      </td>

                      <td>
                        <span className="docentes-badge docentes-badge-soft">
                          {cat.nombre_division}
                        </span>
                      </td>

                      <td>
                        <FontAwesomeIcon icon={faBookOpen} />
                        {cat.materia}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="docentes-info-section">
            <h3>
              <FontAwesomeIcon icon={faCalendarDays} />
              Días y turnos que asiste
            </h3>

            <div className="docentes-bloques-lista">
              {disponibilidades.length === 0 && (
                <div className="docentes-empty-small">
                  Sin disponibilidad cargada.
                </div>
              )}

              {disponibilidades.map((bloque, index) => (
                <div
                  className="docentes-bloque-chip"
                  key={`${bloque.id_dia_semana}-${bloque.id_turno}-${
                    bloque.fecha || 'semanal'
                  }-${index}`}
                >
                  <strong>{bloque.dia_semana || 'DÍA'}</strong>
                  <span>{bloque.turno || 'TURNO'}</span>

                  {bloque.fecha && (
                    <small>{formatearFecha(bloque.fecha)}</small>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="docentes-modal-actions">
          <button
            type="button"
            className="docentes-btn docentes-btn-primary"
            onClick={onCerrar}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}