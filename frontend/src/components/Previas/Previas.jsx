import React, { useContext, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBoxOpen,
  faEdit,
  faPlus,
  faSearch,
  faTimes,
  faTrash,
  faUserCheck,
  faUserSlash,
} from '@fortawesome/free-solid-svg-icons';
import { usePrevias } from './hooks/usePrevias.js';
import ModalPrevia from './modales/ModalPrevia.jsx';
import ModalEliminarGlobal from '../Global/Modales/ModalEliminarGlobal.jsx';
import '../Global/Global_css/roots.css';
import '../Global/Global_css/Global_Section.css';
import '../Global/Global_css/Global_DivTable.css';
import './Previas.css';
import Principal, { MesasShellContext } from '../Principal/Principal';

const PREVIAS_GRID_COLS = '1.35fr .75fr 1.25fr .85fr .8fr .85fr .9fr';
const SKELETON_ROWS = 8;

const PREVIAS_COLUMNS = [
  { key: 'alumno', label: 'Alumno', strong: true },
  { key: 'dni', label: 'DNI' },
  { key: 'materia', label: 'Materia' },
  { key: 'condicion', label: 'Condición', align: 'center' },
  { key: 'curso', label: 'Curso', align: 'center' },
  { key: 'inscripcion', label: 'Inscripción', align: 'center' },
  { key: 'acciones', label: 'Acciones', align: 'center', actions: true },
];

const SKELETON_WIDTHS = ['72%', '52%', '68%', '42%', '38%', '46%', '44%'];

function safeText(value) {
  const text = String(value ?? '').trim();
  return text || '—';
}

function alignClass(align) {
  if (align === 'right') return 'is-right';
  if (align === 'center') return 'is-center';
  return '';
}

function renderSkeletonRow(index) {
  return (
    <div
      key={`previa-skel-${index}`}
      className="mov-gridTable mov-gridTable--row mov-row--skeleton global-divTable__row previas-gridRow"
      style={{ gridTemplateColumns: PREVIAS_GRID_COLS }}
      role="row"
      aria-hidden="true"
    >
      {PREVIAS_COLUMNS.map((column, columnIndex) => (
        <div
          key={column.key}
          className={[
            'mov-gridCell',
            alignClass(column.align),
            column.actions ? 'mov-gridCell--actions' : '',
          ].filter(Boolean).join(' ')}
          role="cell"
          data-label={column.label}
        >
          {column.actions ? (
            <div className="mov-skelActions">
              <span className="mov-skelIcon" />
              <span className="mov-skelIcon" />
              <span className="mov-skelIcon" />
            </div>
          ) : (
            <span className="mov-skeletonBar" style={{ width: SKELETON_WIDTHS[(index + columnIndex) % SKELETON_WIDTHS.length] }} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function Previas() {
  const dentroDeShell = useContext(MesasShellContext);

  const {
    previas,
    catalogos,
    loading,
    error,
    mensaje,
    busqueda,
    setBusqueda,
    vista,
    cambiarVista,
    conteo,
    paginacion,
    obtener,
    guardar,
    darBaja,
    darAlta,
    eliminar,
    obtenerMateriasPorCurso,
  } = usePrevias();

  const [modalPrevia, setModalPrevia] = useState({ abierto: false, modo: 'crear', item: null, cargando: false });
  const [modalConfirmar, setModalConfirmar] = useState({ abierto: false, tipo: '', item: null });

  function abrirCrear() {
    setModalPrevia({ abierto: true, modo: 'crear', item: null, cargando: false });
  }

  async function abrirEditar(item) {
    // No mostramos un modal intermedio de carga: se abre directamente cuando llega la previa completa.
    setModalPrevia({ abierto: false, modo: 'editar', item: null, cargando: true });
    const res = await obtener(item.id_previa);
    if (res.ok) {
      setModalPrevia({ abierto: true, modo: 'editar', item: res.data, cargando: false });
    } else {
      setModalPrevia({ abierto: false, modo: 'crear', item: null, cargando: false });
    }
  }

  function abrirConfirmar(tipo, item) {
    setModalConfirmar({ abierto: true, tipo, item });
  }

  async function confirmarOperacion(payload = {}) {
    const motivo = typeof payload === 'string' ? payload : (payload?.motivo || payload?.reason || '');

    if (modalConfirmar.tipo === 'baja') return darBaja(modalConfirmar.item, motivo);
    if (modalConfirmar.tipo === 'alta') return darAlta(modalConfirmar.item);
    if (modalConfirmar.tipo === 'eliminar') return eliminar(modalConfirmar.item);
    return { ok: false, mensaje: 'Operación inválida.' };
  }

  const totalVisible = Array.isArray(previas) ? previas.length : 0;
  const hayBusqueda = busqueda.trim() !== '';

  const modalGlobalConfig = {
    baja: {
      operacion: 'baja',
      title: 'Dar de baja previa',
      message: 'La previa pasará a dados de baja y vas a poder restaurarla cuando la necesites.',
      warning: '',
      confirmLabel: 'Dar de baja',
      loadingLabel: 'Procesando...',
      successMessage: 'Previa dada de baja correctamente.',
      errorMessage: 'No se pudo dar de baja la previa.',
      tone: 'warning',
      showReason: true,
      reasonLabel: 'Motivo de baja',
      reasonPlaceholder: 'Ej: registro cargado por error, alumno regularizó, etc.',
    },
    alta: {
      operacion: 'alta',
      title: 'Dar de alta previa',
      message: 'La previa volverá a mostrarse dentro del listado principal de previas activas.',
      warning: '',
      confirmLabel: 'Dar de alta',
      loadingLabel: 'Procesando...',
      successMessage: 'Previa dada de alta correctamente.',
      errorMessage: 'No se pudo dar de alta la previa.',
      tone: 'success',
      showReason: false,
    },
    eliminar: {
      operacion: 'eliminar',
      title: 'Eliminar previa',
      message: 'Esta acción elimina el registro de forma permanente.',
      warning: 'Si la previa está vinculada a una mesa, el backend puede bloquear la eliminación.',
      confirmLabel: 'Eliminar',
      loadingLabel: 'Eliminando...',
      successMessage: 'Previa eliminada correctamente.',
      errorMessage: 'No se pudo eliminar la previa.',
      tone: 'danger',
      showReason: false,
    },
  }[modalConfirmar.tipo] || {
    operacion: 'advertencia',
    title: 'Confirmar acción',
    message: 'Confirmá la operación seleccionada.',
    warning: '',
    confirmLabel: 'Confirmar',
    loadingLabel: 'Procesando...',
    successMessage: 'Operación realizada correctamente.',
    errorMessage: 'No se pudo completar la operación.',
    tone: 'primary',
    showReason: false,
  };

  const detallesModalGlobal = [
    { label: 'Alumno', value: safeText(modalConfirmar.item?.alumno) },
    { label: 'DNI', value: safeText(modalConfirmar.item?.dni) },
    { label: 'Materia', value: safeText(modalConfirmar.item?.materia) },
    { label: 'Curso', value: safeText(modalConfirmar.item?.curso_materia) },
  ];

  const contenido = (
    <div className="previas-page mov-page">
      {mensaje && (
        <div className={`mov-alert previas-alerta ${mensaje.tipo === 'success' ? 'previas-alerta-success' : 'previas-alerta-error'}`}>
          {mensaje.texto}
        </div>
      )}

      {error && <div className="mov-alert previas-alerta previas-alerta-error">{error}</div>}

      <section className="previas-card mov-card mov-card--table">
        <div className="mov-card__head previas-card__head">
          <div className="mov-card__headLeft previas-card__headLeft">
            <div className="title-mov previas-titleBox">
              <div className="mov-card__title previas-section-title">
                Mesas · Previas
              </div>
              <div className="mov-card__hint">
                Mostrando <b>{totalVisible}</b> previas
              </div>
            </div>

            <div className="mov-headFilters previas-headFilters">
              <div className="previas-filterTabs" aria-label="Filtrar previas por estado">
                <span className="previas-filterTabs__label">Estado</span>
                <div className="mov-tabs previas-tabsInline">
                  <button
                    type="button"
                    className={`mov-tab previas-tab ${vista === 'activas' ? 'is-active' : ''}`}
                    onClick={() => cambiarVista('activas')}
                  >
                    <FontAwesomeIcon icon={faUserCheck} /> Activas
                  </button>
                  <button
                    type="button"
                    className={`mov-tab previas-tab ${vista === 'bajas' ? 'is-active' : ''}`}
                    onClick={() => cambiarVista('bajas')}
                  >
                    <FontAwesomeIcon icon={faUserSlash} /> Dados de baja
                  </button>
                </div>
              </div>

              <div className="cc-filter previas-searchFilter">
                <div className={`cc-floatingField cc-floatingField--search ${hayBusqueda ? 'is-active' : ''}`}>
                  <div className="cc-searchInput">
                    <div className="cc-searchInput__fieldWrap">
                      <input
                        className="cc-input cc-input--floating previas-searchInput"
                        type="text"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        placeholder="Búsqueda"
                      />
                      <span className="previas-filterTabs__label">
                        <FontAwesomeIcon icon={faSearch} /> Búsqueda
                      </span>
                      {hayBusqueda && (
                        <button
                          type="button"
                          className="cc-clearSearch cc-clearSearch--inside previas-clearSearch"
                          title="Limpiar búsqueda"
                          onClick={() => setBusqueda('')}
                        >
                          <FontAwesomeIcon icon={faTimes} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mov-card__actions previas-actionsHead">
            <button type="button" className="mov-btn mov-btn--primary" onClick={abrirCrear}>
              <FontAwesomeIcon icon={faPlus} /> Agregar previa
            </button>
          </div>
        </div>

        <div className="previas-divTable global-divTable" role="table" aria-label="Listado de previas">
          <div
            className="mov-gridTable mov-gridTable--head global-divTable__head previas-gridHead"
            style={{ gridTemplateColumns: PREVIAS_GRID_COLS }}
            role="row"
          >
            {PREVIAS_COLUMNS.map((column) => (
              <div
                key={column.key}
                className={[
                  'mov-gridCell',
                  'mov-gridCell--head',
                  alignClass(column.align),
                ].filter(Boolean).join(' ')}
                role="columnheader"
              >
                {column.label}
              </div>
            ))}
          </div>

          <div className="previas-table-wrap mov-tableWrap global-divTable__wrap" role="rowgroup">
            <div className={`mov-gridBody mov-gridBody--relative global-divTable__body previas-gridBody ${loading ? 'mov-softLoading' : ''}`}>
              {loading ? (
                <div className="mov-skeletonWrap" aria-busy="true" aria-label="Cargando previas">
                  {Array.from({ length: SKELETON_ROWS }).map((_, index) => renderSkeletonRow(index))}
                </div>
              ) : (
                <>
                  {previas.map((item) => (
                    <div
                      key={item.id_previa}
                      className="mov-gridTable mov-gridTable--row global-divTable__row previas-gridRow"
                      style={{ gridTemplateColumns: PREVIAS_GRID_COLS }}
                      role="row"
                    >
                      <div className="mov-gridCell is-strong" role="cell" data-label="Alumno">
                        <div className="previas-name-cell" title={safeText(item.alumno)}>
                          <strong>{safeText(item.alumno)}</strong>
                          <small>Actual: {safeText(item.curso_cursando)}</small>
                        </div>
                      </div>

                      <div className="mov-gridCell" role="cell" data-label="DNI" title={safeText(item.dni)}>
                        <span className="mov-ellipsissss previas-dni-cell">{safeText(item.dni)}</span>
                      </div>

                      <div className="mov-gridCell" role="cell" data-label="Materia" title={safeText(item.materia)}>
                        <div className="previas-materia-cell">
                          <strong>{safeText(item.materia)}</strong>
                          <small>Año previa: {safeText(item.anio)}</small>
                        </div>
                      </div>

                      <div className="mov-gridCell is-center" role="cell" data-label="Condición">
                        <span className="mov-chip previas-badge">{safeText(item.condicion)}</span>
                      </div>

                      <div className="mov-gridCell is-center" role="cell" data-label="Curso">
                        <span className="mov-chip mov-chip--neutral previas-badge previas-badge-soft">
                          {safeText(item.curso_materia)}
                        </span>
                      </div>

                      <div className="mov-gridCell is-center" role="cell" data-label="Inscripción">
                        <span className={`mov-chip previas-pill ${Number(item.inscripcion) === 1 ? 'mov-chip--ok previas-pill-ok' : 'mov-chip--neutral previas-pill-muted'}`}>
                          {item.inscripcion_texto || (Number(item.inscripcion) === 1 ? 'Sí' : 'No')}
                        </span>
                      </div>

                      <div className="mov-gridCell mov-gridCell--actions is-center" role="cell" data-label="Acciones">
                        <div className="mov-actionsInline">
                          {vista === 'activas' && (
                            <button type="button" className="mov-iconBtn previas-icon-btn" onClick={() => abrirEditar(item)} title="Editar previa">
                              <FontAwesomeIcon icon={faEdit} />
                            </button>
                          )}

                          {vista === 'activas' ? (
                            <button type="button" className="mov-iconBtn previas-icon-btn previas-icon-warning" onClick={() => abrirConfirmar('baja', item)} title="Dar de baja">
                              <FontAwesomeIcon icon={faUserSlash} />
                            </button>
                          ) : (
                            <button type="button" className="mov-iconBtn previas-icon-btn previas-icon-success" onClick={() => abrirConfirmar('alta', item)} title="Dar de alta">
                              <FontAwesomeIcon icon={faUserCheck} />
                            </button>
                          )}

                          <button type="button" className="mov-iconBtn mov-iconBtn--danger previas-icon-btn previas-icon-danger" onClick={() => abrirConfirmar('eliminar', item)} title="Eliminar previa">
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {previas.length === 0 && (
                    <div className="cc-emptyState previas-emptyState">
                      <FontAwesomeIcon icon={faBoxOpen} className="cc-emptyIcon" />
                      <div className="cc-emptyText">
                        {vista === 'activas' ? 'No se encontraron previas activas.' : 'No hay previas dadas de baja.'}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="previas-footer">
          <span>
            Registros totales: <strong>{conteo.totalRegistros}</strong>
          </span>

          <span>
            Mostrando: <strong>{conteo.totalPagina}</strong>
          </span>

          {hayBusqueda && (
            <span>
              Coincidencias encontradas: <strong>{conteo.totalFiltrados}</strong>
            </span>
          )}

          {!hayBusqueda ? (
            <div className="previas-pagination">
              <button
                type="button"
                className="previas-page-btn"
                disabled={paginacion.pagina <= 1 || loading}
                onClick={() => paginacion.setPagina((p) => Math.max(1, p - 1))}
              >
                Anterior
              </button>

              <span className="previas-page-info">
                Página <strong>{paginacion.pagina}</strong> / <strong>{paginacion.totalPaginas}</strong>
              </span>

              <button
                type="button"
                className="previas-page-btn"
                disabled={paginacion.pagina >= paginacion.totalPaginas || loading}
                onClick={() => paginacion.setPagina((p) => p + 1)}
              >
                Siguiente
              </button>
            </div>
          ) : (
            <div className="previas-pagination previas-pagination--search">
              <span className="previas-page-info">Búsqueda global sin paginación</span>
            </div>
          )}

        </div>
      </section>

      {modalPrevia.abierto && !modalPrevia.cargando && (
        <ModalPrevia
          modo={modalPrevia.modo}
          item={modalPrevia.item}
          catalogos={catalogos}
          onObtenerMateriasPorCurso={obtenerMateriasPorCurso}
          onGuardar={guardar}
          onCerrar={() => setModalPrevia({ abierto: false, modo: 'crear', item: null, cargando: false })}
        />
      )}

      {modalConfirmar.abierto && (
        <ModalEliminarGlobal
          open={modalConfirmar.abierto}
          row={modalConfirmar.item}
          details={detallesModalGlobal}
          onClose={() => setModalConfirmar({ abierto: false, tipo: '', item: null })}
          onConfirm={confirmarOperacion}
          {...modalGlobalConfig}
        />
      )}
    </div>
  );

  return dentroDeShell ? contenido : <Principal>{contenido}</Principal>;
}
