import React, { useEffect, useMemo, useRef } from 'react';
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
  const closeRef = useRef(null);
  const catedras = Array.isArray(item?.catedras) ? item.catedras : [];

  const disponibilidades = Array.isArray(item?.disponibilidades)
    ? item.disponibilidades
    : [];

  const estaActivo = Number(item?.activo) === 1;
  const totalRegistros = item?.cantidad_registros || item?.ids_docentes?.length || 1;

  const detalleDocente = useMemo(() => {
    const cargo = item?.cargo || 'Sin cargo';
    return `${cargo}`;
  }, [item?.cargo]);

  useEffect(() => {
    const body = document.body;
    const overflowAnterior = body.style.overflow;
    body.style.overflow = 'hidden';

    const timer = setTimeout(() => {
      closeRef.current?.focus?.();
    }, 0);

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      onCerrar?.();
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown, true);
      body.style.overflow = overflowAnterior;
    };
  }, [onCerrar]);

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
            ref={closeRef}
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
              <div className="docentes-info-nameRow">
                <h3>{item?.docente || 'Docente'}</h3>
                <span className={`docentes-info-status ${estaActivo ? 'is-active' : 'is-inactive'}`}>
                  {estaActivo ? 'Activo' : 'Dado de baja'}
                </span>
              </div>

              <p>{detalleDocente}</p>

              {item?.observacion && <small>{item.observacion}</small>}
            </div>
          </div>

          <div className="docentes-info-grid">
            <div className="docentes-info-card">
              <span>Registros internos</span>
              <strong>{totalRegistros}</strong>
              <small>Unificados en la ficha</small>
            </div>

            <div className="docentes-info-card">
              <span>Cátedras asignadas</span>
              <strong>{catedras.length}</strong>
              <small>Materias vinculadas</small>
            </div>

            <div className="docentes-info-card">
              <span>Días disponibles</span>
              <strong>{disponibilidades.length}</strong>
              <small>Reglas cargadas</small>
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
                        <span className="docentes-info-materia">
                          <FontAwesomeIcon icon={faBookOpen} />
                          {cat.materia}
                        </span>
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
                  <span className="docentes-bloque-chip__main">
                    <strong>{bloque.dia_semana || 'DÍA'}</strong>
                    <span>{bloque.turno || 'TURNO'}</span>
                  </span>

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