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
import ModalConfirmarDocente from './modales/ModalConfirmarDocente.jsx';
import '../Global/Global_css/roots.css';
import '../Global/Global_css/Global_Section.css';
import '../Global/Global_css/Global_DivTable.css';
import './Docentes.css';
import Principal, { MesasShellContext } from '../Principal/Principal';

const DOCENTES_GRID_COLS = '1.5fr 1fr 0.7fr 0.7fr 1fr 1fr ';

const SKELETON_ROWS = 8;

const DOCENTES_COLUMNS = [
  { key: 'docente', label: 'Docente', strong: true },
  { key: 'cargo', label: 'Cargo' },
  { key: 'catedras', label: 'Cátedras', align: 'center' },
  { key: 'no_puede', label: 'No puede', align: 'center' },
  { key: 'observacion', label: 'Observación' },
  { key: 'acciones', label: 'Acciones', align: 'center', actions: true },
];

const SKELETON_WIDTHS = ['72%', '54%', '38%', '46%', '64%', '44%'];

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
    catalogos,
    loading,
    error,
    mensaje,
    busqueda,
    setBusqueda,
    vista,
    cambiarVista,
    conteo,
    obtener,
    guardar,
    darBaja,
    darAlta,
    eliminar,
  } = useDocentes();

  const [modalDocente, setModalDocente] = useState({ abierto: false, modo: 'crear', item: null });
  const [modalInfo, setModalInfo] = useState({ abierto: false, item: null, cargando: false });
  const [modalConfirmar, setModalConfirmar] = useState({ abierto: false, tipo: '', item: null });

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

  async function confirmarOperacion(motivo = '') {
    if (modalConfirmar.tipo === 'baja') return darBaja(modalConfirmar.item, motivo);
    if (modalConfirmar.tipo === 'alta') return darAlta(modalConfirmar.item);
    if (modalConfirmar.tipo === 'eliminar') return eliminar(modalConfirmar.item);
    return { ok: false, mensaje: 'Operación inválida.' };
  }

  const totalVisible = Array.isArray(docentes) ? docentes.length : 0;

  const contenido = (
    <div className="docentes-page mov-page">
      {mensaje && (
        <div className={`mov-alert docentes-alerta ${mensaje.tipo === 'success' ? 'docentes-alerta-success' : 'docentes-alerta-error'}`}>
          {mensaje.texto}
        </div>
      )}

      {error && <div className="mov-alert docentes-alerta docentes-alerta-error">{error}</div>}

      <section className="docentes-card mov-card mov-card--table">
        <div className="mov-card__head docentes-card__head">
          <div className="mov-card__headLeft docentes-card__headLeft">
            <div className="title-mov docentes-titleBox">
              <div className="mov-card__title docentes-section-title">
                Mesas · Docentes
              </div>
              <div className="mov-card__hint">
                Mostrando <b>{totalVisible}</b> docentes
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

                      <div className="mov-gridCell is-center" role="cell" data-label="No puede">
                        <span className="mov-chip mov-chip--neutral docentes-badge docentes-badge-soft">
                          {item.total_indisponibilidades || 0}
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

          {busqueda.trim() !== '' && (
            <span>
              Coincidencias visibles: <strong>{conteo.totalFiltrados}</strong>
            </span>
          )}
        </div>
      </section>

      {modalDocente.abierto && (
        <ModalDocente
          modo={modalDocente.modo}
          item={modalDocente.item}
          catalogos={catalogos}
          onGuardar={guardar}
          onCerrar={() => setModalDocente({ abierto: false, modo: 'crear', item: null })}
        />
      )}

      {modalInfo.abierto && modalInfo.cargando && (
        <div className="docentes-modal-overlay">
          <div className="docentes-modal docentes-modal-sm">
            <div className="docentes-empty">Cargando información del docente...</div>
          </div>
        </div>
      )}

      {modalInfo.abierto && modalInfo.item && (
        <ModalInfoDocente
          item={modalInfo.item}
          onCerrar={() => setModalInfo({ abierto: false, item: null, cargando: false })}
        />
      )}

      {modalConfirmar.abierto && (
        <ModalConfirmarDocente
          tipo={modalConfirmar.tipo}
          item={modalConfirmar.item}
          onConfirmar={confirmarOperacion}
          onCerrar={() => setModalConfirmar({ abierto: false, tipo: '', item: null })}
        />
      )}
    </div>
  );

  return dentroDeShell ? contenido : <Principal>{contenido}</Principal>;
}
