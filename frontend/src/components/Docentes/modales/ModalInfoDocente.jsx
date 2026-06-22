import React, { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBookOpen,
  faCalendarDays,
  faChalkboardTeacher,
  faEnvelope,
  faIdCard,
  faTimes,
  faUserTie,
} from '@fortawesome/free-solid-svg-icons';
import '../../Global/Global_css/Global_InfoDocente.css';
import '../Docentes.css';

function formatearFecha(fecha) {
  if (!fecha) return '';

  const [y, m, d] = String(fecha).split('-');

  if (!y || !m || !d) return fecha;

  return `${d}/${m}/${y}`;
}

function textoSeguro(valor, fallback = '—') {
  const texto = String(valor ?? '').trim();
  return texto || fallback;
}

function obtenerCargoCatedra(cat) {
  return textoSeguro(cat?.cargo_docente || cat?.cargo || cat?.nombre_cargo, 'Sin cargo');
}

export default function ModalInfoDocente({ item, onCerrar }) {
  const closeRef = useRef(null);
  const catedras = Array.isArray(item?.catedras) ? item.catedras : [];

  const cargosResumen = useMemo(() => {
    const mapa = new Map();

    catedras.forEach((cat) => {
      const cargo = obtenerCargoCatedra(cat);
      const materia = textoSeguro(cat?.materia, 'Materia sin nombre');

      if (!mapa.has(cargo)) {
        mapa.set(cargo, { cargo, total: 0, materias: [] });
      }

      const itemCargo = mapa.get(cargo);
      itemCargo.total += 1;

      if (!itemCargo.materias.includes(materia)) {
        itemCargo.materias.push(materia);
      }
    });

    return Array.from(mapa.values());
  }, [catedras]);

  const disponibilidades = Array.isArray(item?.indisponibilidades)
    ? item.indisponibilidades
    : (Array.isArray(item?.disponibilidades) ? item.disponibilidades : []);

  const estaActivo = Number(item?.activo) === 1;
  const idDocente = item?.id_docente || item?.ids_docentes_texto || '—';
  const dniDocente = textoSeguro(item?.dni, '');
  const emailDocente = textoSeguro(item?.email || item?.gmail, '');

  const detalleDocente = useMemo(() => {
    const cargos = cargosResumen.length > 0
      ? cargosResumen.map((cargo) => cargo.cargo).join(', ')
      : (item?.cargo || 'Sin cargo');

    return `Cargos registrados: ${cargos}`;
  }, [cargosResumen, item?.cargo]);

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
            <h2 id="docentes-info-title" className="docentes-modal-titleWithName">
              <span>Información del docente</span>
              <span className="docentes-modal-nameChip" title={item?.docente || 'Docente'}>
                {item?.docente || 'Docente'}
              </span>
            </h2>
            <p>Datos únicos del docente, cargos por cátedra e indisponibilidades cargadas.</p>
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

              {(dniDocente || emailDocente) && (
                <div className="docentes-info-contacto">
                  {dniDocente && (
                    <span className="docentes-info-contactoChip">
                      <FontAwesomeIcon icon={faIdCard} /> DNI {dniDocente}
                    </span>
                  )}

                  {emailDocente && (
                    <span className="docentes-info-contactoChip">
                      <FontAwesomeIcon icon={faEnvelope} /> {emailDocente}
                    </span>
                  )}
                </div>
              )}

              {item?.observacion && <small>{item.observacion}</small>}
            </div>
          </div>

          {cargosResumen.length > 0 && (
            <div className="docentes-info-cargosResumen" aria-label="Resumen de cargos por materia">
              {cargosResumen.map((cargo) => (
                <div className="docentes-info-cargoResumenCard" key={cargo.cargo}>
                  <strong>{cargo.cargo}</strong>
                  <span>{cargo.total} {cargo.total === 1 ? 'materia' : 'materias'}</span>
                  <small>{cargo.materias.slice(0, 3).join(' · ')}</small>
                </div>
              ))}
            </div>
          )}

          <div className="docentes-info-grid">
            <div className="docentes-info-card docentes-info-card--blue">
              <div className="docentes-info-card__icon" aria-hidden="true">
                <FontAwesomeIcon icon={faUserTie} />
              </div>

              <div className="docentes-info-card__body">
                <span>ID docente</span>
                <strong>{idDocente}</strong>
                <small>Ficha única del docente</small>
              </div>
            </div>

            <div className="docentes-info-card docentes-info-card--purple">
              <div className="docentes-info-card__icon" aria-hidden="true">
                <FontAwesomeIcon icon={faChalkboardTeacher} />
              </div>

              <div className="docentes-info-card__body">
                <span>Cátedras asignadas</span>
                <strong>{catedras.length}</strong>
                <small>Materias vinculadas</small>
              </div>
            </div>

            <div className="docentes-info-card docentes-info-card--green">
              <div className="docentes-info-card__icon" aria-hidden="true">
                <FontAwesomeIcon icon={faCalendarDays} />
              </div>

              <div className="docentes-info-card__body">
                <span>Indisponibilidades</span>
                <strong>{disponibilidades.length}</strong>
                <small>Cuándo NO puede asistir</small>
              </div>
            </div>
          </div>

          <section className="docentes-info-section">
            <h3>
              <FontAwesomeIcon icon={faChalkboardTeacher} />
              Materias, cursos y divisiones
            </h3>

            <div className="docentes-info-catedras-wrap">
              <div className="docentes-info-divtable" role="list" aria-label="Materias, cursos y divisiones del docente">
                <div className="docentes-info-divtable-head docentes-info-divtable-head--cargos" aria-hidden="true">
                  <div>Curso</div>
                  <div>División</div>
                  <div>Cargo</div>
                  <div>Materia</div>
                </div>

                <div className="docentes-info-divtable-body">
                  {catedras.length === 0 && (
                    <div className="docentes-empty docentes-info-divtable-empty">
                      No tiene cátedras asignadas.
                    </div>
                  )}

                  {catedras.map((cat) => (
                    <div className="docentes-info-divtable-row docentes-info-divtable-row--cargos" role="listitem" key={cat.id_catedra}>
                      <div className="docentes-info-divtable-cell">
                        <span className="docentes-badge">
                          {cat.nombre_curso}
                        </span>
                      </div>

                      <div className="docentes-info-divtable-cell">
                        <span className="docentes-badge docentes-badge-soft">
                          {cat.nombre_division}
                        </span>
                      </div>

                      <div className="docentes-info-divtable-cell">
                        <span className="docentes-info-cargoChip" title={`Cargo en ${textoSeguro(cat.materia, 'la materia')}`}>
                          {obtenerCargoCatedra(cat)}
                        </span>
                      </div>

                      <div className="docentes-info-divtable-cell docentes-info-divtable-cell--materia">
                        <span className="docentes-info-materia">
                          <FontAwesomeIcon icon={faBookOpen} />
                          {cat.materia}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="docentes-info-section">
            <h3>
              <FontAwesomeIcon icon={faCalendarDays} />
              Indisponibilidad: días y turnos que NO asiste
            </h3>

            <div className="docentes-bloques-lista">
              {disponibilidades.length === 0 && (
                <div className="docentes-empty-small">
                  Sin indisponibilidad cargada. Puede asistir en cualquier fecha y turno habilitado.
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