import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChalkboardTeacher,
  faPlus,
  faSave,
  faSearch,
  faTimes,
  faTrash,
  faUserCheck,
  faUserSlash,
  faUsers,
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

function nombreCargoEs(cargo, esperado) {
  return normalizar(obtenerNombreCargo(cargo)) === normalizar(esperado);
}

function normalizarAsignacionesIniciales(item) {
  const desdeBackend = Array.isArray(item?.docentes_asignados) ? item.docentes_asignados : [];

  if (desdeBackend.length > 0) {
    return desdeBackend
      .map((asignacion) => ({
        id_docente: Number(asignacion.id_docente || 0),
        docente: String(asignacion.docente || '').trim(),
        id_cargo: Number(asignacion.id_cargo || 0),
        cargo: String(asignacion.cargo || asignacion.cargo_docente || '').trim(),
      }))
      .filter((asignacion) => asignacion.id_docente > 0 && asignacion.id_cargo > 0);
  }

  const idDocente = Number(item?.id_docente || 0);
  const idCargo = Number(item?.id_cargo || 0);

  if (idDocente > 0 && idCargo > 0) {
    return [{
      id_docente: idDocente,
      docente: String(item?.docente || '').trim(),
      id_cargo: idCargo,
      cargo: String(item?.cargo_docente || item?.cargo || '').trim(),
    }];
  }

  return [];
}

function textoAsignacion(asignacion) {
  const docente = String(asignacion?.docente || '').trim() || `Docente #${asignacion?.id_docente || ''}`.trim();
  const cargo = String(asignacion?.cargo || '').trim();
  return cargo ? `${docente} · ${cargo}` : docente;
}

function obtenerDocenteLlamado(asignaciones) {
  if (!Array.isArray(asignaciones) || asignaciones.length === 0) return null;

  const suplente = asignaciones.find((asignacion) => Number(asignacion.id_cargo) === 2 || normalizar(asignacion.cargo) === 'suplente');
  if (suplente) return suplente;

  const titular = asignaciones.find((asignacion) => Number(asignacion.id_cargo) === 1 || normalizar(asignacion.cargo) === 'titular');
  if (titular) return titular;

  return asignaciones[0] || null;
}

export default function ModalAsignarDocente({ item, docentes = [], cargos = [], onGuardar, onCerrar }) {
  const [asignaciones, setAsignaciones] = useState(() => normalizarAsignacionesIniciales(item));
  const [idDocente, setIdDocente] = useState('');
  const [idCargo, setIdCargo] = useState('');
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
    if (idCargo || cargosActivos.length === 0) return;

    const cargoTitular = cargosActivos.find((cargo) => nombreCargoEs(cargo, 'TITULAR'));
    const primerCargo = cargoTitular || cargosActivos[0];
    const primerIdCargo = primerCargo ? String(obtenerIdCargo(primerCargo)) : '';

    if (primerIdCargo) setIdCargo(primerIdCargo);
  }, [idCargo, cargosActivos]);

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

  const docenteLlamado = useMemo(() => obtenerDocenteLlamado(asignaciones), [asignaciones]);

  function agregarAsignacion() {
    setError('');

    const idDocenteNumero = idDocente ? Number(idDocente) : 0;
    const idCargoNumero = idCargo ? Number(idCargo) : 0;

    if (idDocenteNumero <= 0) {
      setError('Seleccioná un docente para agregarlo a la cátedra.');
      return;
    }

    if (idCargoNumero <= 0) {
      setError('Seleccioná el cargo que tendrá ese docente en la cátedra.');
      return;
    }

    if (asignaciones.some((asignacion) => Number(asignacion.id_docente) === idDocenteNumero)) {
      setError('Ese docente ya está asignado en esta cátedra.');
      return;
    }

    if (asignaciones.some((asignacion) => Number(asignacion.id_cargo) === idCargoNumero)) {
      setError('Ese cargo ya está cargado en esta cátedra. Usá un cargo distinto.');
      return;
    }

    const nuevaAsignacion = {
      id_docente: idDocenteNumero,
      docente: docenteSeleccionado ? obtenerNombreDocente(docenteSeleccionado) : '',
      id_cargo: idCargoNumero,
      cargo: cargoSeleccionado ? obtenerNombreCargo(cargoSeleccionado) : '',
    };

    setAsignaciones((actual) => [...actual, nuevaAsignacion]);
    setIdDocente('');
    setBusqueda('');
  }

  function quitarAsignacion(idDocenteAsignacion) {
    setError('');
    setAsignaciones((actual) => actual.filter((asignacion) => Number(asignacion.id_docente) !== Number(idDocenteAsignacion)));
  }

  function quitarTodos() {
    setError('');
    setAsignaciones([]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setGuardando(true);

    const payload = asignaciones.map((asignacion) => ({
      id_docente: Number(asignacion.id_docente || 0),
      id_cargo: Number(asignacion.id_cargo || 0),
    }));

    try {
      const resultado = await onGuardar(item.id_catedra, payload);
      if (!resultado?.ok) {
        setError(resultado?.mensaje || 'No se pudieron guardar los docentes de la cátedra.');
        setGuardando(false);
      }
    } catch (eGuardar) {
      setError(eGuardar?.message || 'No se pudieron guardar los docentes de la cátedra.');
      setGuardando(false);
    }
  }

  const docenteActual = asignaciones.length > 0
    ? asignaciones.map((asignacion) => textoAsignacion(asignacion)).join(', ')
    : 'Sin docentes asignados';
  const cantidadFiltrada = Array.isArray(docentesFiltrados) ? docentesFiltrados.length : 0;
  const cursoDivision = `${item?.nombre_curso || 'Curso'} ${item?.nombre_division || ''}`.trim();
  const textoLlamado = docenteLlamado
    ? `${textoAsignacion(docenteLlamado)}${normalizar(docenteLlamado.cargo) === 'suplente' ? ' · se prioriza por suplencia' : ''}`
    : 'La cátedra quedará sin docente para llamar a mesa.';

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
            <h2 id="catedras-docente-modal-title">Asignar docentes y cargos</h2>
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

            <div className={`catedras-modal-summaryItem ${asignaciones.length > 0 ? 'is-active' : 'is-empty'}`}>
              <span>Docentes actuales</span>
              <strong title={docenteActual}>{docenteActual}</strong>
            </div>

            <div className={`catedras-modal-summaryItem ${docenteLlamado ? 'is-active' : 'is-empty'}`}>
              <span>Se llamará a mesa</span>
              <strong title={textoLlamado}>{textoLlamado}</strong>
            </div>
          </div>

          <section className="gm-panel catedras-modal-panel">
            <div className="gm-panel__head gm-panel__head--split">
              <div>
                <span className="gm-panel__eyebrow">Nueva asignación</span>
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

              <div className="catedras-modal-addGrid">
                <label className="gm-field catedras-modal-selectField">
                  <select
                    className="gm-input catedras-modal-select"
                    value={idDocente}
                    onChange={(e) => setIdDocente(e.target.value)}
                    disabled={guardando}
                  >
                    <option value="">Seleccionar docente</option>
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
                    disabled={guardando}
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

                <button
                  type="button"
                  className="gm-btn gm-btn--secondary catedras-modal-addBtn"
                  onClick={agregarAsignacion}
                  disabled={guardando}
                >
                  <FontAwesomeIcon icon={faPlus} />
                  Agregar
                </button>
              </div>
            </div>
          </section>

          <section className="gm-panel catedras-modal-panel ">


            <div className="gm-panel__body catedras-modal-panelBody">
              {asignaciones.length > 0 ? (
                <div className="catedras-modal-asignacionesList">
                  {asignaciones.map((asignacion) => {
                    const esLlamado = docenteLlamado && Number(docenteLlamado.id_docente) === Number(asignacion.id_docente);
                    return (
                      <div
                        key={`${asignacion.id_docente}-${asignacion.id_cargo}`}
                        className={`catedras-modal-asignacionItem ${esLlamado ? 'is-called' : ''}`}
                      >
                        <div className="catedras-modal-asignacionIcon" aria-hidden="true">
                          <FontAwesomeIcon icon={esLlamado ? faUserCheck : faUsers} />
                        </div>
                        <div className="catedras-modal-asignacionText">
                          <strong title={asignacion.docente}>{asignacion.docente || `Docente #${asignacion.id_docente}`}</strong>
                          <span>{asignacion.cargo || 'Cargo sin nombre'}{esLlamado ? ' · llamado a mesa' : ''}</span>
                        </div>
                        <button
                          type="button"
                          className="catedras-modal-asignacionRemove"
                          onClick={() => quitarAsignacion(asignacion.id_docente)}
                          title="Quitar asignación"
                          disabled={guardando}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="cc-emptyState catedras-modal-emptyState">
                  <FontAwesomeIcon icon={faUserSlash} className="cc-emptyIcon" />
                  <div className="cc-emptyText">Todavía no hay docentes asignados a esta cátedra.</div>
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="gm-modal__actions modal-actions catedras-modal-actions">
          <button
            type="button"
            className="gm-btn gm-btn--ghost catedras-modal-removeBtn"
            onClick={quitarTodos}
            disabled={guardando || asignaciones.length === 0}
          >
            <FontAwesomeIcon icon={faUserSlash} />
            Quitar todos
          </button>

          <div className="catedras-modal-actionsRight">
            <button type="button" className="gm-btn gm-btn--ghost" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </button>
            <button type="submit" className="gm-btn gm-btn--primary" disabled={guardando}>
              <FontAwesomeIcon icon={faSave} />
              {guardando ? 'Guardando...' : 'Guardar asignaciones'}
            </button>
          </div>
        </div>
      </form>
    </div>,
    document.body
  );
}
