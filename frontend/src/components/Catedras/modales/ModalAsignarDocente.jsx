import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChalkboardTeacher,
  faSave,
  faSearch,
  faTimes,
  faUserCheck,
  faUserSlash,
} from '@fortawesome/free-solid-svg-icons';
import '../../Global/Global_css/Global_Modals.css';
import './ModalCatedras.css';

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export default function ModalAsignarDocente({ item, docentes = [], onGuardar, onCerrar }) {
  const [idDocente, setIdDocente] = useState(item?.id_docente ? String(item.id_docente) : '');
  const [busqueda, setBusqueda] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      onCerrar?.();
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [onCerrar]);

  const listaDocentes = useMemo(() => (Array.isArray(docentes) ? docentes : []), [docentes]);

  const docentesFiltrados = useMemo(() => {
    const q = normalizar(busqueda);
    if (!q) return listaDocentes;

    return listaDocentes.filter((docente) => (
      normalizar(docente.docente).includes(q) ||
      normalizar(docente.cargo).includes(q)
    ));
  }, [listaDocentes, busqueda]);

  const docenteSeleccionado = useMemo(() => {
    if (!idDocente) return null;
    return listaDocentes.find((docente) => String(docente.id_docente) === String(idDocente)) || null;
  }, [listaDocentes, idDocente]);

  async function handleSubmit(e) {
    e.preventDefault();
    setGuardando(true);
    setError('');

    const res = await onGuardar(item.id_catedra, idDocente ? Number(idDocente) : 0);

    if (!res.ok) {
      setError(res.mensaje || 'No se pudo asignar el docente.');
      setGuardando(false);
      return;
    }

    setGuardando(false);
  }

  const docenteActual = item?.docente || 'Sin docente asignado';
  const cantidadFiltrada = Array.isArray(docentesFiltrados) ? docentesFiltrados.length : 0;
  const cursoDivision = `${item?.nombre_curso || 'Curso'} ${item?.nombre_division || ''}`.trim();

  return createPortal(
    <div
      className="gm-modalOverlay catedras-modalOverlay"
      role="presentation"
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <form
        className="gm-modal gm-modal--catedras catedras-docente-modal"
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="catedras-docente-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gm-modal__header catedras-modal-header">
          <div className="gm-modal__headIcon catedras-modal-icon" aria-hidden="true">
            <FontAwesomeIcon icon={faChalkboardTeacher} />
          </div>

          <div className="gm-modal__headText catedras-modal-headText">
            <h2 id="catedras-docente-modal-title">Asignar docente</h2>
            <p>{cursoDivision} — {item?.materia || 'Materia sin nombre'}</p>
          </div>

          <button
            type="button"
            className="gm-modal__close modal-close"
            onClick={onCerrar}
            aria-label="Cerrar modal"
            disabled={guardando}
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="gm-modal__content catedras-modal-content">
          {error && (
            <div className="gm-alert gm-alert--error gm-alert--banner catedras-modal-alert">
              {error}
            </div>
          )}

          <div className="catedras-modal-summary" aria-label="Resumen de la cátedra">
            <div className="catedras-modal-summaryItem">
              <span>Cátedra</span>
              <strong title={item?.materia || ''}>{item?.materia || '—'}</strong>
            </div>

            <div className={`catedras-modal-summaryItem ${item?.docente ? 'is-active' : 'is-empty'}`}>
              <span>Docente actual</span>
              <strong title={docenteActual}>{docenteActual}</strong>
            </div>
          </div>

          <section className="gm-panel catedras-modal-panel">
            <div className="gm-panel__head gm-panel__head--split">
              <div>
                <span className="gm-panel__eyebrow">Asignación</span>
                <h3>
                  <FontAwesomeIcon icon={faUserCheck} />
                  Seleccionar docente
                </h3>
              </div>
              <span className="gm-panel__tag">{cantidadFiltrada} disponible{cantidadFiltrada === 1 ? '' : 's'}</span>
            </div>

            <div className="gm-panel__body catedras-modal-panelBody">
              <label className={`gm-field catedras-modal-searchField ${busqueda.trim() ? 'is-filled' : ''}`}>
                <FontAwesomeIcon icon={faSearch} className="catedras-modal-searchIcon" />
                <input
                  className="gm-input catedras-modal-searchInput"
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder=" "
                  autoFocus
                />
                <span className="gm-label">Buscar docente activo</span>
                {busqueda.trim() !== '' && (
                  <button
                    type="button"
                    className="catedras-modal-clearSearch"
                    onClick={() => setBusqueda('')}
                    aria-label="Limpiar búsqueda"
                  >
                    <FontAwesomeIcon icon={faTimes} />
                  </button>
                )}
              </label>

              <label className="gm-field catedras-modal-selectField">
                <select
                  className="gm-input catedras-modal-select"
                  value={idDocente}
                  onChange={(e) => setIdDocente(e.target.value)}
                  disabled={guardando}
                >
                  <option value="">Sin docente asignado</option>
                  {docentesFiltrados.map((docente) => (
                    <option key={docente.id_docente} value={docente.id_docente}>
                      {docente.docente}{docente.cargo ? ` — ${docente.cargo}` : ''}
                    </option>
                  ))}
                </select>
                <span className="gm-label">Docente</span>
              </label>

              <div className={`catedras-modal-selection ${docenteSeleccionado ? 'has-docente' : 'is-empty'}`}>
                <div className="catedras-modal-selectionIcon" aria-hidden="true">
                  <FontAwesomeIcon icon={docenteSeleccionado ? faUserCheck : faUserSlash} />
                </div>
                <div>
                  <span>{docenteSeleccionado ? 'Nuevo docente seleccionado' : 'Asignación vacía'}</span>
                  <strong>
                    {docenteSeleccionado
                      ? `${docenteSeleccionado.docente}${docenteSeleccionado.cargo ? ` · ${docenteSeleccionado.cargo}` : ''}`
                      : 'La cátedra quedará sin docente asignado.'}
                  </strong>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="gm-modal__actions modal-actions catedras-modal-actions">
          <button
            type="button"
            className="gm-btn gm-btn--ghost catedras-modal-removeBtn"
            onClick={() => setIdDocente('')}
            disabled={guardando || !idDocente}
          >
            <FontAwesomeIcon icon={faUserSlash} />
            Quitar docente
          </button>

          <div className="catedras-modal-actionsRight">
            <button type="button" className="gm-btn gm-btn--ghost" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </button>
            <button type="submit" className="gm-btn gm-btn--primary" disabled={guardando}>
              <FontAwesomeIcon icon={faSave} />
              {guardando ? 'Guardando...' : 'Guardar asignación'}
            </button>
          </div>
        </div>
      </form>
    </div>,
    document.body
  );
}
