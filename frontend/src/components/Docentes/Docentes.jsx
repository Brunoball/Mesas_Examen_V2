import React, { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faBoxOpen,
  faInfoCircle,
  faEdit,
  faPlus,
  faSearch,
  faTimes,
  faTrash,
  faUserCheck,
  faUserSlash,
} from '@fortawesome/free-solid-svg-icons';
import { useDocentes } from './hooks/useDocentes.js';
import ModalDocente from './modales/ModalDocente.jsx';
import ModalInfoDocente from './modales/ModalInfoDocente.jsx';
import ModalEliminarGlobal from '../Global/Modales/ModalEliminarGlobal.jsx';
import ModalExportarGlobal from '../Global/Modales/ModalExportarGlobal.jsx';
import BotonExportarHistorialGlobal from '../Global/Botones/BotonExportarHistorialGlobal.jsx';
import Toast from '../Global/Toast';
import '../Global/Global_css/roots.css';
import '../Global/Global_css/Global_Section.css';
import '../Global/Global_css/Global_DivTable.css';
import './Docentes.css';
import '../Global/Global_css/Global_DocentesResponsive.css';
import Principal, { MesasShellContext } from '../Principal/Principal';

const DOCENTES_GRID_COLS = '1.5fr 1fr 0.7fr 0.7fr 1fr 1fr ';

const SKELETON_ROWS = 8;

const DOCENTES_COLUMNS = [
  { key: 'docente', label: 'Docente', strong: true },
  { key: 'cargo', label: 'Cargo' },
  { key: 'catedras', label: 'Cátedras', align: 'center' },
  { key: 'disponibilidad', label: 'Disponibilidad', align: 'center' },
  { key: 'observacion', label: 'Observación' },
  { key: 'acciones', label: 'Acciones', align: 'center', actions: true },
];

const SKELETON_WIDTHS = ['72%', '54%', '38%', '46%', '64%', '44%'];

const DOCENTES_EXPORT_COLUMNS = [
  { label: 'Docente', value: (item) => safeText(item.docente) },
  { label: 'Cargo', value: (item) => safeText(item.cargo) },
  { label: 'Cátedras', value: (item) => item.total_catedras || 0 },
  { label: 'Disponibilidad', value: (item) => item.total_disponibilidades || 0 },
  { label: 'Observación', value: (item) => safeText(item.observacion) },
  { label: 'Registros unificados', value: (item) => item.cantidad_registros || 1 },
  { label: 'IDs docente', value: (item) => safeText(item.ids_docentes_texto || item.id_docente) },
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

function normalizarTipoToast(tipo) {
  if (tipo === 'ok' || tipo === 'success' || tipo === 'exito') return 'exito';
  if (tipo === 'warning' || tipo === 'advertencia') return 'advertencia';
  if (tipo === 'alerta') return 'alerta';
  if (tipo === 'cargando') return 'cargando';
  if (tipo === 'error') return 'error';
  return 'info';
}

function obtenerDuracionToast(tipo, duracion) {
  if (duracion !== undefined && duracion !== null) return duracion;
  const tipoToast = normalizarTipoToast(tipo);
  return ['error', 'advertencia', 'alerta'].includes(tipoToast) ? undefined : 3800;
}


function renderSkeletonRow(index) {
  return (
    <div
      key={`docente-skel-${index}`}
      className="mov-gridTable mov-gridTable--row mov-row--skeleton global-divTable__row docentes-gridRow"
      style={{ gridTemplateColumns: DOCENTES_GRID_COLS}}
      role="row"
      aria-hidden="true"
    >
      {DOCENTES_COLUMNS.map((column, columnIndex) => (
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

export default function Docentes() {
  const navigate = useNavigate();
  const dentroDeShell = useContext(MesasShellContext);
  const {
    docentes,
    docentesFiltrados,
    catalogos,
    loading,
    mensaje,
    mostrarMensaje,
    limpiarMensaje,
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
  } = useDocentes();

  const [modalDocente, setModalDocente] = useState({ abierto: false, modo: 'crear', item: null });
  const [modalInfo, setModalInfo] = useState({ abierto: false, item: null, cargando: false });
  const [modalConfirmar, setModalConfirmar] = useState({ abierto: false, tipo: '', item: null });
  const [modalExportar, setModalExportar] = useState(false);

  function abrirCrear() {
    setModalDocente({ abierto: true, modo: 'crear', item: null });
  }

  async function abrirEditar(item) {
    const res = await obtener(item.id_docente);
    if (res.ok) {
      setModalDocente({ abierto: true, modo: 'editar', item: res.data });
    }
  }

  async function abrirInfo(item) {
    setModalInfo({ abierto: true, item: null, cargando: true });
    const res = await obtener(item.id_docente);
    if (res.ok) {
      setModalInfo({ abierto: true, item: res.data, cargando: false });
    } else {
      setModalInfo({ abierto: false, item: null, cargando: false });
    }
  }

  function abrirConfirmar(tipo, item) {
    setModalConfirmar({ abierto: true, tipo, item });
  }

  async function confirmarOperacion({ motivo = '' } = {}) {
    if (modalConfirmar.tipo === 'baja') return darBaja(modalConfirmar.item, motivo, { silent: true });
    if (modalConfirmar.tipo === 'alta') return darAlta(modalConfirmar.item, { silent: true });
    if (modalConfirmar.tipo === 'eliminar') return eliminar(modalConfirmar.item, { silent: true });
    return { ok: false, mensaje: 'Operación inválida.' };
  }


  function obtenerConfigModalConfirmar() {
    const item = modalConfirmar.item || {};
    const cantidadRegistros = Number(item.cantidad_registros || 0);
    const idsTexto = safeText(item.ids_docentes_texto || item.id_docente);

    const details = [
      { label: 'Docente', value: item.docente },
      { label: 'Cargo', value: item.cargo || 'Sin cargo' },
      {
        label: cantidadRegistros > 1 ? 'Registros unificados' : 'ID docente',
        value: cantidadRegistros > 1 ? `${cantidadRegistros} registros (${idsTexto})` : idsTexto,
      },
    ];

    if (modalConfirmar.tipo === 'baja') {
      return {
        operacion: 'baja',
        title: 'Dar de baja docente',
        message: 'El docente dejará de figurar como activo, pero se conservará en la sección de dados de baja.',
        warning: 'Podés agregar un motivo u observación antes de confirmar.',
        confirmLabel: 'Dar de baja',
        loadingLabel: 'Procesando...',
        successMessage: 'Docente dado de baja correctamente.',
        errorMessage: 'No se pudo dar de baja el docente.',
        details,
        showReason: true,
        reasonLabel: 'Motivo u observación de baja',
        reasonPlaceholder: 'Ej: licencia, jubilación, pase, etc.',
      };
    }

    if (modalConfirmar.tipo === 'alta') {
      return {
        operacion: 'alta',
        title: 'Dar de alta docente',
        message: 'El docente volverá a figurar como activo en el listado principal.',
        warning: '',
        confirmLabel: 'Dar de alta',
        loadingLabel: 'Procesando...',
        successMessage: 'Docente dado de alta correctamente.',
        errorMessage: 'No se pudo dar de alta el docente.',
        details,
      };
    }

    return {
      operacion: 'eliminar',
      title: 'Eliminar docente',
      message: '¿Seguro que querés eliminar este docente definitivamente?',
      warning: 'Esta acción no se puede deshacer. Si tenía cátedras asignadas, quedarán sin docente.',
      confirmLabel: 'Eliminar',
      loadingLabel: 'Eliminando...',
      successMessage: 'Docente eliminado correctamente.',
      errorMessage: 'No se pudo eliminar el docente.',
      details,
    };
  }

  const totalVisible = Array.isArray(docentes) ? docentes.length : 0;
  const hayBusquedaActiva = busqueda.trim() !== '';
  const totalReferencia = hayBusquedaActiva ? conteo.totalFiltrados : conteo.totalRegistros;

  const contenido = (
    <div className="docentes-page mov-page">
      {mensaje && (
        <Toast
          key={mensaje.id || `${mensaje.tipo}-${mensaje.texto}`}
          tipo={normalizarTipoToast(mensaje.tipo)}
          mensaje={mensaje.texto}
          duracion={obtenerDuracionToast(mensaje.tipo, mensaje.duracion)}
          onClose={limpiarMensaje}
        />
      )}

      <section className="docentes-card mov-card mov-card--table">
        <div className="mov-card__head docentes-card__head">
          <div className="mov-card__headLeft docentes-card__headLeft">
            <div className="title-mov docentes-titleBox">
              <div className="mov-card__title docentes-section-title">
                Mesas · Docentes
              </div>
              <div className="mov-card__hint">
                Mostrando <b>{totalVisible}</b> de <b>{totalReferencia}</b> docentes
              </div>
            </div>

            <div className="mov-headFilters docentes-headFilters">
              <div className="docentes-filterTabs" aria-label="Filtrar docentes por estado">
                <span className="docentes-filterTabs__label">Estado</span>
                <div className="mov-tabs docentes-tabsInline">
                  <button
                    type="button"
                    className={`mov-tab docentes-tab ${vista === 'activos' ? 'is-active' : ''}`}
                    onClick={() => cambiarVista('activos')}
                  >
                    <FontAwesomeIcon icon={faUserCheck} /> Activos
                  </button>
                  <button
                    type="button"
                    className={`mov-tab docentes-tab ${vista === 'bajas' ? 'is-active' : ''}`}
                    onClick={() => cambiarVista('bajas')}
                  >
                    <FontAwesomeIcon icon={faUserSlash} /> Dados de baja
                  </button>
                </div>
              </div>

              <div className="cc-filter docentes-searchFilter">
                <div className={`cc-floatingField cc-floatingField--search ${busqueda.trim() ? 'is-active' : ''}`}>
                  <div className="cc-searchInput">
                    <div className="cc-searchInput__fieldWrap">
                      <input
                        className="cc-input cc-input--floating docentes-searchInput"
                        type="text"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        placeholder="Busqueda"
                      />
                      <span className="docentes-filterTabs__label">
                        <FontAwesomeIcon icon={faSearch} /> Búsqueda
                      </span>
                      {busqueda.trim() !== '' && (
                        <button
                          type="button"
                          className="cc-clearSearch cc-clearSearch--inside docentes-clearSearch"
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

          <div className="mov-card__actions docentes-actionsHead">
            <BotonExportarHistorialGlobal
              className="mov-btn mov-btn--secondary"
              label="Exportar"
              icon="excel"
              disabled={loading || totalVisible === 0}
              onClick={() => setModalExportar(true)}
            />

            <button type="button" className="mov-btn mov-btn--primary" onClick={abrirCrear}>
              <FontAwesomeIcon icon={faPlus} /> Agregar docente
            </button>
          </div>
        </div>

        <div className="docentes-divTable global-divTable" role="table" aria-label="Listado de docentes">
          <div
            className="mov-gridTable mov-gridTable--head global-divTable__head docentes-gridHead"
            style={{ gridTemplateColumns: DOCENTES_GRID_COLS}}
            role="row"
          >
            {DOCENTES_COLUMNS.map((column) => (
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

          <div className="docentes-table-wrap mov-tableWrap global-divTable__wrap" role="rowgroup">
            <div
              className={`mov-gridBody mov-gridBody--relative global-divTable__body docentes-gridBody ${loading ? 'mov-softLoading' : ''}`}

            >
              {loading ? (
                <div className="mov-skeletonWrap" aria-busy="true" aria-label="Cargando docentes">
                  {Array.from({ length: SKELETON_ROWS }).map((_, index) => renderSkeletonRow(index))}
                </div>
              ) : (
                <>
                  {docentes.map((item) => (
                    <div
                      key={`${item.id_docente}-${item.ids_docentes_texto}`}
                      className="mov-gridTable mov-gridTable--row global-divTable__row docentes-gridRow"
                      style={{ gridTemplateColumns: DOCENTES_GRID_COLS }}
                      role="row"
                    >
                      <div className="mov-gridCell is-strong" role="cell" data-label="Docente">
                        <div className="docentes-name-cell" title={safeText(item.docente)}>
                          <strong>{safeText(item.docente)}</strong>
                          {Number(item.cantidad_registros) > 1 && (
                            <small>{item.cantidad_registros} registros unificados</small>
                          )}
                        </div>
                      </div>

                      <div className="mov-gridCell" role="cell" data-label="Cargo" title={safeText(item.cargo)}>
                        <span className="mov-ellipsissss">{safeText(item.cargo)}</span>
                      </div>

                      <div className="mov-gridCell is-center" role="cell" data-label="Cátedras">
                        <span className="mov-chip docentes-badge">{item.total_catedras || 0}</span>
                      </div>

                      <div className="mov-gridCell is-center" role="cell" data-label="Disponibilidad">
                        <span className="mov-chip mov-chip--neutral docentes-badge docentes-badge-soft">
                          {item.total_disponibilidades || 0}
                        </span>
                      </div>

                      <div className="mov-gridCell" role="cell" data-label="Observación" title={safeText(item.observacion)}>
                        <span className="mov-ellipsissss docentes-observacion">{safeText(item.observacion)}</span>
                      </div>

                      <div className="mov-gridCell mov-gridCell--actions is-center" role="cell" data-label="Acciones">
                        <div className="mov-actionsInline">
                          <button type="button" className="mov-iconBtn docentes-icon-btn" onClick={() => abrirInfo(item)} title="Ver información">
                            <FontAwesomeIcon icon={faInfoCircle} />
                          </button>
                          <button type="button" className="mov-iconBtn docentes-icon-btn" onClick={() => abrirEditar(item)} title="Editar docente">
                            <FontAwesomeIcon icon={faEdit} />
                          </button>

                          {vista === 'activos' ? (
                            <button type="button" className="mov-iconBtn docentes-icon-btn docentes-icon-warning" onClick={() => abrirConfirmar('baja', item)} title="Dar de baja">
                              <FontAwesomeIcon icon={faUserSlash} />
                            </button>
                          ) : (
                            <button type="button" className="mov-iconBtn docentes-icon-btn docentes-icon-success" onClick={() => abrirConfirmar('alta', item)} title="Dar de alta">
                              <FontAwesomeIcon icon={faUserCheck} />
                            </button>
                          )}

                          <button type="button" className="mov-iconBtn mov-iconBtn--danger docentes-icon-btn docentes-icon-danger" onClick={() => abrirConfirmar('eliminar', item)} title="Eliminar">
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {docentes.length === 0 && (
                    <div className="cc-emptyState docentes-emptyState">
                      <FontAwesomeIcon icon={faBoxOpen} className="cc-emptyIcon" />
                      <div className="cc-emptyText">
                        {vista === 'activos' ? 'No se encontraron docentes activos.' : 'No hay docentes dados de baja.'}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="docentes-footer">
          <span>
            Registros únicos cargados: <strong>{conteo.totalRegistros}</strong>
          </span>

          {hayBusquedaActiva && (
            <span>
              Coincidencias encontradas: <strong>{conteo.totalFiltrados}</strong>
            </span>
          )}

          <div className="docentes-pagination">
            <button
              type="button"
              className="mov-btn mov-btn--ghost docentes-pageBtn"
              disabled={paginacion.pagina <= 1 || loading}
              onClick={() => paginacion.setPagina((p) => Math.max(1, p - 1))}
            >
              Anterior
            </button>

            <span>Página {paginacion.pagina} / {paginacion.totalPaginas}</span>

            <button
              type="button"
              className="mov-btn mov-btn--ghost docentes-pageBtn"
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
        title="Exportar docentes"
        subtitle="Elegí si querés exportar solo la página actual o todos los registros filtrados."
        tituloArchivo="Mesas · Docentes"
        nombreArchivo={`docentes_${vista}`}
        columnas={DOCENTES_EXPORT_COLUMNS}
        registrosActuales={docentes}
        registrosTodos={Array.isArray(docentesFiltrados) ? docentesFiltrados : docentes}
        cantidadActual={totalVisible}
        totalTodos={conteo.totalFiltrados}
        totalLabelSingular="docente disponible"
        totalLabelPlural="docentes disponibles"
        subtituloArchivoActual={`Vista: ${vista === 'bajas' ? 'docentes dados de baja' : 'docentes activos'} · Página actual: ${paginacion.pagina} de ${paginacion.totalPaginas} · Registros visibles: ${totalVisible}`}
        subtituloArchivoTodos={`Vista: ${vista === 'bajas' ? 'docentes dados de baja' : 'docentes activos'} · Todos los registros filtrados · Total: ${conteo.totalFiltrados}`}
        alcanceActualLabel="Exportar solo actual"
        alcanceActualDescription="Descarga únicamente los docentes visibles en esta página."
        alcanceTodosLabel="Exportar todos los registros"
        alcanceTodosDescription="Descarga todos los docentes que coinciden con la búsqueda y el estado actual."
        onClose={() => setModalExportar(false)}
        onSuccess={(texto) => mostrarMensaje('exito', texto)}
        onError={(texto) => mostrarMensaje('error', texto)}
      />

      {modalDocente.abierto && (
        <ModalDocente
          modo={modalDocente.modo}
          item={modalDocente.item}
          catalogos={catalogos}
          onGuardar={guardar}
          onToast={mostrarMensaje}
          onCerrar={() => setModalDocente({ abierto: false, modo: 'crear', item: null })}
        />
      )}



      {modalInfo.abierto && modalInfo.item && (
        <ModalInfoDocente
          item={modalInfo.item}
          onCerrar={() => setModalInfo({ abierto: false, item: null, cargando: false })}
        />
      )}

      {modalConfirmar.abierto && (
        <ModalEliminarGlobal
          open={modalConfirmar.abierto}
          row={modalConfirmar.item}
          onConfirm={confirmarOperacion}
          onClose={() => setModalConfirmar({ abierto: false, tipo: '', item: null })}
          onToast={mostrarMensaje}
          {...obtenerConfigModalConfirmar()}
        />
      )}
    </div>
  );

  return dentroDeShell ? contenido : <Principal>{contenido}</Principal>;
}
