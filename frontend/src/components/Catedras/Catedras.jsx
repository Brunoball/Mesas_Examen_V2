import React, { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faBoxOpen,
  faFilter,
  faRotateRight,
  faSearch,
  faTimes,
  faUserPen,
} from '@fortawesome/free-solid-svg-icons';
import { useCatedras } from "./hooks/useCatedras.js";
import ModalAsignarDocente from "./modales/ModalAsignarDocente.jsx";
import ModalExportarGlobal from '../Global/Modales/ModalExportarGlobal.jsx';
import BotonExportarHistorialGlobal from '../Global/Botones/BotonExportarHistorialGlobal.jsx';
import Toast from '../Global/Toast.jsx';
import '../Global/Global_css/roots.css';
import '../Global/Global_css/Global_Section.css';
import '../Global/Global_css/Global_DivTable.css';
import './Catedras.css';
import '../Global/Global_css/Global_CatedrasResponsive.css';
import Principal, { MesasShellContext } from '../Principal/Principal';

const CATEDRAS_GRID_COLS = '0.75fr 0.75fr 1.6fr 1.35fr 1fr 0.72fr';
const SKELETON_ROWS = 8;

const CATEDRAS_COLUMNS = [
  { key: 'curso', label: 'Curso', align: 'center' },
  { key: 'division', label: 'División', align: 'center' },
  { key: 'materia', label: 'Materia', strong: true },
  { key: 'docente', label: 'Docente' },
  { key: 'cargo', label: 'Cargo' },
  { key: 'acciones', label: 'Acciones', align: 'center', actions: true },
];

const SKELETON_WIDTHS = ['54%', '48%', '76%', '68%', '58%', '40%'];

const CATEDRAS_EXPORT_COLUMNS = [
  { label: 'Curso', value: (item) => safeText(item.nombre_curso) },
  { label: 'División', value: (item) => safeText(item.nombre_division) },
  { label: 'Materia', value: (item) => safeText(item.materia) },
  { label: 'Docente', value: (item) => safeText(item.docente) },
  { label: 'Cargo', value: (item) => safeText(item.cargo_docente || item.cargo) },
];

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
      key={`catedra-skel-${index}`}
      className="mov-gridTable mov-gridTable--row mov-row--skeleton global-divTable__row catedras-gridRow"
      style={{ gridTemplateColumns: CATEDRAS_GRID_COLS }}
      role="row"
      aria-hidden="true"
    >
      {CATEDRAS_COLUMNS.map((column, columnIndex) => (
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
            </div>
          ) : (
            <span
              className="mov-skeletonBar"
              style={{ width: SKELETON_WIDTHS[(index + columnIndex) % SKELETON_WIDTHS.length] }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default function Catedras() {
  const navigate = useNavigate();
  const dentroDeShell = useContext(MesasShellContext);
  const {
    catedras,
    catalogos,
    loading,
    error,
    cerrarError,
    mensaje,
    mostrarMensaje,
    cerrarMensaje,
    busqueda,
    setBusqueda,
    filtros,
    actualizarFiltro,
    paginacion,
    reload,
    obtenerTodasParaExportar,
    asignarDocente,
  } = useCatedras();

  const [modalAsignar, setModalAsignar] = useState({ abierto: false, item: null });
  const [modalExportar, setModalExportar] = useState(false);

  function abrirModalAsignar(item) {
    setModalAsignar({ abierto: true, item });
  }

  function cerrarModalAsignar() {
    setModalAsignar({ abierto: false, item: null });
  }

  async function handleAsignarDocente(idCatedra, idDocente, idCargo) {
    cerrarModalAsignar();
    return asignarDocente(idCatedra, idDocente, idCargo);
  }

  const listaCatedras = Array.isArray(catedras) ? catedras : [];
  const totalVisible = listaCatedras.length;
  const totalReferencia = Number(paginacion.totalRegistros || totalVisible);
  const hayFiltrosActivos = Boolean(
    busqueda.trim() ||
    filtros.id_curso ||
    filtros.id_division ||
    filtros.sin_docente
  );

  const contenido = (
    <div className="catedras-page mov-page">
      <section className="catedras-card mov-card mov-card--table">
        <div className="mov-card__head catedras-card__head">
          <div className="mov-card__headLeft catedras-card__headLeft">
            <div className="title-mov catedras-titleBox">
              <div className="mov-card__title catedras-section-title">
                Mesas · Cátedras
              </div>
              <div className="mov-card__hint">
                Mostrando <b>{totalVisible}</b> de <b>{totalReferencia}</b> cátedras
              </div>
            </div>

            <div className="mov-headFilters catedras-headFilters">
              <div className="catedras-filterTabs catedras-selectFilter">
                <span className="catedras-filterTabs__label">
                  <FontAwesomeIcon icon={faFilter} /> Curso
                </span>
                <select
                  className="catedras-filterSelect"
                  value={filtros.id_curso}
                  onChange={(e) => actualizarFiltro('id_curso', e.target.value)}
                >
                  <option value="">Todos</option>
                  {catalogos.cursos.map((curso) => (
                    <option key={curso.id_curso} value={curso.id_curso}>{curso.nombre_curso}</option>
                  ))}
                </select>
              </div>

              <div className="catedras-filterTabs catedras-selectFilter">
                <span className="catedras-filterTabs__label">División</span>
                <select
                  className="catedras-filterSelect"
                  value={filtros.id_division}
                  onChange={(e) => actualizarFiltro('id_division', e.target.value)}
                >
                  <option value="">Todas</option>
                  {catalogos.divisiones.map((division) => (
                    <option key={division.id_division} value={division.id_division}>{division.nombre_division}</option>
                  ))}
                </select>
              </div>


              <div className="cc-filter catedras-searchFilter">
                <div className={`cc-floatingField cc-floatingField--search ${busqueda.trim() ? 'is-active' : ''}`}>
                  <div className="cc-searchInput">
                    <div className="cc-searchInput__fieldWrap">
                      <input
                        className="cc-input cc-input--floating catedras-searchInput"
                        type="text"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        placeholder="Búsqueda"
                      />
                      <span className="catedras-filterTabs__label">
                        <FontAwesomeIcon icon={faSearch} /> Búsqueda
                      </span>
                      {busqueda.trim() !== '' && (
                        <button
                          type="button"
                          className="cc-clearSearch cc-clearSearch--inside catedras-clearSearch"
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

          <div className="mov-card__actions catedras-actionsHead">
            <BotonExportarHistorialGlobal
              className="mov-btn mov-btn--secondary"
              label="Exportar"
              icon="excel"
              disabled={loading || totalVisible === 0}
              onClick={() => setModalExportar(true)}
            />
          </div>
        </div>

        <div className="catedras-divTable global-divTable" role="table" aria-label="Listado de cátedras">
          <div
            className="mov-gridTable mov-gridTable--head global-divTable__head catedras-gridHead"
            style={{ gridTemplateColumns: CATEDRAS_GRID_COLS }}
            role="row"
          >
            {CATEDRAS_COLUMNS.map((column) => (
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

          <div className="catedras-table-wrap mov-tableWrap global-divTable__wrap" role="rowgroup">
            <div className={`mov-gridBody mov-gridBody--relative global-divTable__body catedras-gridBody ${loading ? 'mov-softLoading' : ''}`}>
              {loading ? (
                <div className="mov-skeletonWrap" aria-busy="true" aria-label="Cargando cátedras">
                  {Array.from({ length: SKELETON_ROWS }).map((_, index) => renderSkeletonRow(index))}
                </div>
              ) : (
                <>
                  {listaCatedras.map((item) => (
                    <div
                      key={item.id_catedra}
                      className="mov-gridTable mov-gridTable--row global-divTable__row catedras-gridRow"
                      style={{ gridTemplateColumns: CATEDRAS_GRID_COLS }}
                      role="row"
                    >
                      <div className="mov-gridCell is-center" role="cell" data-label="Curso">
                        <span className="mov-chip catedras-badge" title={safeText(item.nombre_curso)}>
                          {safeText(item.nombre_curso)}
                        </span>
                      </div>

                      <div className="mov-gridCell is-center" role="cell" data-label="División">
                        <span className="mov-chip mov-chip--neutral catedras-badge catedras-badge-soft" title={safeText(item.nombre_division)}>
                          {safeText(item.nombre_division)}
                        </span>
                      </div>

                      <div className="mov-gridCell is-strong" role="cell" data-label="Materia" title={safeText(item.materia)}>
                        <span className="mov-ellipsissss catedras-materia">{safeText(item.materia)}</span>
                      </div>

                      <div className="mov-gridCell" role="cell" data-label="Docente" title={safeText(item.docente)}>
                        {item.docente ? (
                          <span className="mov-ellipsissss catedras-docente">{safeText(item.docente)}</span>
                        ) : (
                          <span className="mov-chip mov-chip--danger catedras-sin-docente">Sin docente</span>
                        )}
                      </div>

                      <div className="mov-gridCell" role="cell" data-label="Cargo" title={safeText(item.cargo_docente)}>
                        <span className="mov-ellipsissss">{safeText(item.cargo_docente)}</span>
                      </div>

                      <div className="mov-gridCell mov-gridCell--actions is-center" role="cell" data-label="Acciones">
                        <div className="mov-actionsInline">
                          <button
                            type="button"
                            className="mov-iconBtn catedras-icon-btn"
                            onClick={() => abrirModalAsignar(item)}
                            title="Asignar docente"
                          >
                            <FontAwesomeIcon icon={faUserPen} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {listaCatedras.length === 0 && (
                    <div className="cc-emptyState catedras-emptyState">
                      <FontAwesomeIcon icon={faBoxOpen} className="cc-emptyIcon" />
                      <div className="cc-emptyText">No se encontraron cátedras.</div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="catedras-footer">
          <span>
            Registros únicos cargados: <strong>{paginacion.totalRegistros}</strong>
          </span>

          {hayFiltrosActivos && (
            <span>
              Coincidencias encontradas: <strong>{paginacion.totalRegistros}</strong>
            </span>
          )}

          <div className="catedras-pagination">
            <button
              type="button"
              className="mov-btn mov-btn--ghost catedras-pageBtn"
              disabled={paginacion.pagina <= 1 || loading}
              onClick={() => paginacion.setPagina((p) => Math.max(1, p - 1))}
            >
              Anterior
            </button>

            <span>Página {paginacion.pagina} / {paginacion.totalPaginas}</span>

            <button
              type="button"
              className="mov-btn mov-btn--ghost catedras-pageBtn"
              disabled={paginacion.pagina >= paginacion.totalPaginas || loading}
              onClick={() => paginacion.setPagina((p) => p + 1)}
            >
              Siguiente
            </button>
          </div>
        </div>
      </section>

      <ModalExportarGlobal
        abierto={modalExportar}
        title="Exportar cátedras"
        subtitle="Elegí si querés exportar solo la página actual o todos los registros filtrados."
        tituloArchivo="Mesas · Cátedras"
        nombreArchivo="catedras"
        columnas={CATEDRAS_EXPORT_COLUMNS}
        registrosActuales={listaCatedras}
        obtenerRegistrosTodos={obtenerTodasParaExportar}
        cantidadActual={totalVisible}
        totalTodos={paginacion.totalRegistros}
        totalLabelSingular="cátedra disponible"
        totalLabelPlural="cátedras disponibles"
        subtituloArchivoActual={`Página actual: ${paginacion.pagina} de ${paginacion.totalPaginas} · Registros visibles: ${totalVisible}`}
        subtituloArchivoTodos={`Todos los registros filtrados · Total: ${paginacion.totalRegistros}`}
        alcanceActualLabel="Exportar solo actual"
        alcanceActualDescription="Descarga únicamente las cátedras visibles en esta página."
        alcanceTodosLabel="Exportar todos los registros"
        alcanceTodosDescription="Descarga todas las cátedras que coinciden con los filtros actuales."
        onClose={() => setModalExportar(false)}
        onSuccess={(texto) => mostrarMensaje('success', texto)}
        onError={(texto) => mostrarMensaje('error', texto)}
      />

      {modalAsignar.abierto && (
        <ModalAsignarDocente
          item={modalAsignar.item}
          docentes={catalogos.docentes}
          cargos={catalogos.cargos}
          onGuardar={handleAsignarDocente}
          onCerrar={cerrarModalAsignar}
        />
      )}

      {mensaje && (
        <Toast
          tipo={mensaje.tipo}
          mensaje={mensaje.texto}
          duracion={mensaje.tipo === 'cargando' ? 600000 : (mensaje.tipo === 'error' ? 4200 : 2800)}
          onClose={cerrarMensaje}
        />
      )}

      {error && (
        <Toast
          tipo="error"
          mensaje={error}
          duracion={4200}
          onClose={cerrarError}
        />
      )}
    </div>
  );

  return dentroDeShell ? contenido : <Principal>{contenido}</Principal>;
}
