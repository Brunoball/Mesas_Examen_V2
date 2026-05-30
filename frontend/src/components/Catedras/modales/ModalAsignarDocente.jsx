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
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function valorObjeto(objeto, claves = []) {
  if (!objeto || typeof objeto !== 'object') return '';

  for (const clave of claves) {
    const valor = objeto[clave];
    if (valor !== null && valor !== undefined && String(valor).trim() !== '') {
      return String(valor).trim();
    }
  }

  return '';
}

function valorDocente(docente, claves = []) {
  return valorObjeto(docente, claves);
}

function obtenerIdDocente(docente) {
  return valorDocente(docente, ['id_docente', 'idDocente', 'id', 'value']);
}

function obtenerNombreDocente(docente) {
  const nombreDirecto = valorDocente(docente, [
    'docente',
    'nombre_docente',
    'nombreDocente',
    'nombre_completo',
    'nombreCompleto',
    'text',
    'label',
  ]);

  if (nombreDirecto) return nombreDirecto;

  const apellido = valorDocente(docente, ['apellido', 'apellidos', 'apellido_docente', 'apellidos_docente']);
  const nombre = valorDocente(docente, ['nombre', 'nombres', 'nombre_persona', 'nombres_docente']);
  const compuesto = `${apellido} ${nombre}`.trim();

  return compuesto || 'Docente sin nombre';
}

function obtenerDocumentoDocente(docente) {
  return valorDocente(docente, ['dni', 'documento', 'cuil', 'cuit', 'legajo']);
}

function obtenerIdCargo(cargo) {
  return valorObjeto(cargo, ['id_cargo', 'idCargo', 'id', 'value']);
}

function obtenerNombreCargo(cargo) {
  return valorObjeto(cargo, ['cargo', 'nombre_cargo', 'nombreCargo', 'text', 'label']) || 'Cargo sin nombre';
}

function docenteEstaActivo(docente) {
  const clavesEstado = ['activo', 'activa', 'estado', 'estado_docente', 'estadoDocente', 'habilitado'];
  const claveExistente = clavesEstado.find((clave) => Object.prototype.hasOwnProperty.call(docente || {}, clave));

  if (!claveExistente) return true;

  const valor = docente[claveExistente];

  if (typeof valor === 'boolean') return valor;
  if (typeof valor === 'number') return valor === 1;

  const estado = normalizar(valor);
  if (!estado) return true;

  return ![
    '0',
    'false',
    'no',
    'inactivo',
    'inactiva',
    'baja',
    'dado de baja',
    'dada de baja',
    'deshabilitado',
    'deshabilitada',
    'eliminado',
    'eliminada',
  ].includes(estado);
}

function textoBusquedaDocente(docente) {
  return normalizar([
    obtenerNombreDocente(docente),
    obtenerDocumentoDocente(docente),
    valorDocente(docente, ['email', 'correo', 'telefono', 'teléfono']),
  ].filter(Boolean).join(' '));
}

export default function ModalAsignarDocente({ item, docentes = [], cargos = [], onGuardar, onCerrar }) {
  const [idDocente, setIdDocente] = useState(item?.id_docente ? String(item.id_docente) : '');
  const [idCargo, setIdCargo] = useState(item?.id_cargo ? String(item.id_cargo) : '');
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
  const listaCargos = useMemo(() => (Array.isArray(cargos) ? cargos : []), [cargos]);

  const docentesActivos = useMemo(() => (
    listaDocentes.filter((docente) => docenteEstaActivo(docente))
  ), [listaDocentes]);

  const cargosActivos = useMemo(() => (
    listaCargos.filter((cargo) => docenteEstaActivo(cargo))
  ), [listaCargos]);

  const docentesFiltrados = useMemo(() => {
    const q = normalizar(busqueda);
    if (!q) return docentesActivos;

    return docentesActivos.filter((docente) => textoBusquedaDocente(docente).includes(q));
  }, [docentesActivos, busqueda]);

  useEffect(() => {
    const q = normalizar(busqueda);
    if (!q) return;

    const primerDocente = docentesFiltrados[0];
    const primerId = primerDocente ? String(obtenerIdDocente(primerDocente)) : '';

    setIdDocente((actual) => (actual === primerId ? actual : primerId));
  }, [busqueda, docentesFiltrados]);

  useEffect(() => {
    if (!idDocente) return;
    if (idCargo) return;

    const primerCargo = cargosActivos[0];
    const primerIdCargo = primerCargo ? String(obtenerIdCargo(primerCargo)) : '';
    if (primerIdCargo) setIdCargo(primerIdCargo);
  }, [idDocente, idCargo, cargosActivos]);

  const docenteSeleccionado = useMemo(() => {
    if (!idDocente) return null;
    return listaDocentes.find((docente) => String(obtenerIdDocente(docente)) === String(idDocente)) || null;
  }, [listaDocentes, idDocente]);

  const cargoSeleccionado = useMemo(() => {
    if (!idCargo) return null;
    return listaCargos.find((cargo) => String(obtenerIdCargo(cargo)) === String(idCargo)) || null;
  }, [listaCargos, idCargo]);

  const docentesParaSelect = useMemo(() => {
    if (!docenteSeleccionado) return docentesFiltrados;

    const seleccionadoEstaEnFiltro = docentesFiltrados.some(
      (docente) => String(obtenerIdDocente(docente)) === String(idDocente)
    );

    return seleccionadoEstaEnFiltro ? docentesFiltrados : [docenteSeleccionado, ...docentesFiltrados];
  }, [docenteSeleccionado, docentesFiltrados, idDocente]);

  function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const idDocenteNumero = idDocente ? Number(idDocente) : 0;
    const idCargoNumero = idCargo ? Number(idCargo) : 0;

    if (idDocenteNumero > 0 && idCargoNumero <= 0) {
      setError('Seleccioná el cargo que tiene este docente en la cátedra.');
      return;
    }

    setGuardando(true);
    onGuardar(item.id_catedra, idDocenteNumero, idDocenteNumero > 0 ? idCargoNumero : 0);
  }

  function quitarDocente() {
    setIdDocente('');
    setIdCargo('');
    setError('');
  }

  const docenteActual = item?.docente || 'Sin docente asignado';
  const cargoActual = item?.cargo_docente || item?.cargo || 'Sin cargo asignado';
  const cantidadFiltrada = Array.isArray(docentesFiltrados) ? docentesFiltrados.length : 0;
  const cursoDivision = `${item?.nombre_curso || 'Curso'} ${item?.nombre_division || ''}`.trim();
  const textoSeleccion = docenteSeleccionado
    ? `${obtenerNombreDocente(docenteSeleccionado)}${cargoSeleccionado ? ` · ${obtenerNombreCargo(cargoSeleccionado)}` : ''}`
    : 'La cátedra quedará sin docente asignado.';

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
            <h2 id="catedras-docente-modal-title">Asignar docente y cargo</h2>
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

            <div className="catedras-modal-summaryItem">
              <span>Cargo actual</span>
              <strong title={cargoActual}>{cargoActual}</strong>
            </div>
          </div>

          <section className="gm-panel catedras-modal-panel">
            <div className="gm-panel__head gm-panel__head--split">
              <div>
                <span className="gm-panel__eyebrow">Asignación</span>
                <h3>
                  <FontAwesomeIcon icon={faUserCheck} />
                  Seleccionar docente y cargo
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
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.preventDefault();
                  }}
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
                  {docentesParaSelect.length === 0 && busqueda.trim() !== '' ? (
                    <option value="" disabled>No se encontraron docentes activos</option>
                  ) : null}
                  {docentesParaSelect.map((docente) => {
                    const docenteId = obtenerIdDocente(docente);
                    const nombreDocente = obtenerNombreDocente(docente);

                    return (
                      <option key={docenteId || nombreDocente} value={docenteId}>
                        {nombreDocente}
                      </option>
                    );
                  })}
                </select>
                <span className="gm-label">Docente</span>
              </label>

              <label className="gm-field catedras-modal-selectField">
                <select
                  className="gm-input catedras-modal-select"
                  value={idCargo}
                  onChange={(e) => setIdCargo(e.target.value)}
                  disabled={guardando || !idDocente}
                >
                  <option value="">Seleccionar cargo</option>
                  {cargosActivos.map((cargo) => {
                    const cargoId = obtenerIdCargo(cargo);
                    const nombreCargo = obtenerNombreCargo(cargo);

                    return (
                      <option key={cargoId || nombreCargo} value={cargoId}>
                        {nombreCargo}
                      </option>
                    );
                  })}
                </select>
                <span className="gm-label">Cargo en esta cátedra</span>
              </label>

              <div className={`catedras-modal-selection ${docenteSeleccionado ? 'has-docente' : 'is-empty'}`}>
                <div className="catedras-modal-selectionIcon" aria-hidden="true">
                  <FontAwesomeIcon icon={docenteSeleccionado ? faUserCheck : faUserSlash} />
                </div>
                <div>
                  <span>{docenteSeleccionado ? 'Nueva asignación seleccionada' : 'Asignación vacía'}</span>
                  <strong title={textoSeleccion}>{textoSeleccion}</strong>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="gm-modal__actions modal-actions catedras-modal-actions">
          <button
            type="button"
            className="gm-btn gm-btn--ghost catedras-modal-removeBtn"
            onClick={quitarDocente}
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
