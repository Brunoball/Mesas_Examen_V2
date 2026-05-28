import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBoxOpen, faEdit, faFlask, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";

const TALLERES_GRID_COLS = "1.25fr .75fr .75fr .9fr 1.6fr .75fr .8fr";
const SKELETON_ROWS = 7;

const TALLERES_COLUMNS = [
  { key: "taller", label: "Taller", strong: true },
  { key: "curso", label: "Curso" },
  { key: "division", label: "División" },
  { key: "cantidad", label: "Cantidad cátedras", align: "center" },
  { key: "catedras", label: "Cátedras incluidas" },
  { key: "estado", label: "Estado", align: "center" },
  { key: "acciones", label: "Acciones", align: "center", actions: true },
];

const SKELETON_WIDTHS = ["72%", "48%", "48%", "36%", "76%", "46%", "42%"];

function safeText(value) {
  const text = String(value ?? "").trim();
  return text || "—";
}

function alignClass(align) {
  if (align === "right") return "is-right";
  if (align === "center") return "is-center";
  return "";
}

function renderSkeletonRow(index) {
  return (
    <div
      key={`taller-skel-${index}`}
      className="mov-gridTable mov-gridTable--row mov-row--skeleton global-divTable__row materias-gridRow"
      style={{ gridTemplateColumns: TALLERES_GRID_COLS }}
      role="row"
      aria-hidden="true"
    >
      {TALLERES_COLUMNS.map((column, columnIndex) => (
        <div
          key={column.key}
          className={["mov-gridCell", alignClass(column.align), column.actions ? "mov-gridCell--actions" : ""].filter(Boolean).join(" ")}
          role="cell"
          data-label={column.label}
        >
          {column.actions ? (
            <div className="mov-skelActions">
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

const SeccionTalleres = ({
  cargando,
  talleres = [],
  talleresFiltrados = [],
  onNuevo,
  onEditar,
  onEliminar,
  headerFilters,
  exportButton,
  totalRegistros = talleres.length,
  totalReferencia = talleresFiltrados.length,
  totalVisible = talleresFiltrados.length,
  hayFiltrosActivos = false,
  pagina = 1,
  totalPaginas = 1,
  onAnterior,
  onSiguiente,
}) => {
  return (
    <section className="materias-card subsection-card mov-card mov-card--table">
      <div className="mov-card__head materias-card__head materias-subsection-head">
        <div className="mov-card__headLeft materias-card__headLeft">
          <div className="title-mov materias-titleBox">
            <div className="mov-card__title materias-section-title">
              <FontAwesomeIcon icon={faFlask} /> Materias · Talleres
            </div>
            <div className="mov-card__hint">
              Mostrando <b>{totalVisible}</b> de <b>{totalReferencia}</b> talleres
            </div>
          </div>

          {headerFilters}
        </div>

        <div className="mov-card__actions materias-actionsHead">
          {exportButton}

          <button className="mov-btn mov-btn--primary" type="button" onClick={onNuevo}>
            <FontAwesomeIcon icon={faPlus} /> Nuevo taller
          </button>
        </div>
      </div>

      <div className="materias-divTable global-divTable" role="table" aria-label="Listado de talleres">
        <div
          className="mov-gridTable mov-gridTable--head global-divTable__head materias-gridHead"
          style={{ gridTemplateColumns: TALLERES_GRID_COLS }}
          role="row"
        >
          {TALLERES_COLUMNS.map((column) => (
            <div
              key={column.key}
              className={["mov-gridCell", "mov-gridCell--head", alignClass(column.align)].filter(Boolean).join(" ")}
              role="columnheader"
            >
              {column.label}
            </div>
          ))}
        </div>

        <div className="materias-table-wrap mov-tableWrap global-divTable__wrap" role="rowgroup">
          <div className={`mov-gridBody mov-gridBody--relative global-divTable__body materias-gridBody ${cargando ? "mov-softLoading" : ""}`}>
            {cargando ? (
              <div className="mov-skeletonWrap" aria-busy="true" aria-label="Cargando talleres">
                {Array.from({ length: SKELETON_ROWS }).map((_, index) => renderSkeletonRow(index))}
              </div>
            ) : (
              <>
                {talleresFiltrados.map((t) => (
                  <div
                    key={t.id_taller}
                    className="mov-gridTable mov-gridTable--row global-divTable__row materias-gridRow"
                    style={{ gridTemplateColumns: TALLERES_GRID_COLS }}
                    role="row"
                  >
                    <div className="mov-gridCell is-strong" role="cell" data-label="Taller" title={safeText(t.taller)}>
                      <span className="mov-ellipsissss">{safeText(t.taller)}</span>
                    </div>
                    <div className="mov-gridCell" role="cell" data-label="Curso" title={safeText(t.curso)}>
                      <span className="mov-ellipsissss">{safeText(t.curso)}</span>
                    </div>
                    <div className="mov-gridCell" role="cell" data-label="División" title={safeText(t.division)}>
                      <span className="mov-ellipsissss">{safeText(t.division)}</span>
                    </div>
                    <div className="mov-gridCell is-center" role="cell" data-label="Cantidad cátedras">
                      <span className="mov-chip materias-badge">{t.cantidad_materias || 0}</span>
                    </div>
                    <div className="mov-gridCell" role="cell" data-label="Cátedras incluidas" title={safeText(t.materias)}>
                      <span className="mov-ellipsissss">{safeText(t.materias)}</span>
                    </div>
                    <div className="mov-gridCell is-center" role="cell" data-label="Estado">
                      <span className={`mov-chip materias-badge ${Number(t.activo) === 1 ? "mov-chip--ok" : "mov-chip--neutral"}`}>
                        {Number(t.activo) === 1 ? "ACTIVO" : "INACTIVO"}
                      </span>
                    </div>
                    <div className="mov-gridCell mov-gridCell--actions is-center" role="cell" data-label="Acciones">
                      <div className="mov-actionsInline">
                        <button className="mov-iconBtn materias-icon-btn" title="Editar" onClick={() => onEditar(t)} type="button">
                          <FontAwesomeIcon icon={faEdit} />
                        </button>
                        <button className="mov-iconBtn mov-iconBtn--danger materias-icon-btn materias-icon-danger" title="Eliminar" onClick={() => onEliminar(t)} type="button">
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {talleresFiltrados.length === 0 && (
                  <div className="cc-emptyState materias-emptyState">
                    <FontAwesomeIcon icon={faBoxOpen} className="cc-emptyIcon" />
                    <div className="cc-emptyText">No hay talleres cargados.</div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="materias-footer">
        <span>
          Registros únicos cargados: <strong>{totalRegistros}</strong>
        </span>
        {hayFiltrosActivos && (
          <span>
            Coincidencias encontradas: <strong>{totalReferencia}</strong>
          </span>
        )}

        <div className="materias-pagination">
          <button
            type="button"
            className="mov-btn mov-btn--ghost materias-pageBtn"
            disabled={pagina <= 1 || cargando}
            onClick={onAnterior}
          >
            Anterior
          </button>
          <span>Página {pagina} / {totalPaginas}</span>
          <button
            type="button"
            className="mov-btn mov-btn--ghost materias-pageBtn"
            disabled={pagina >= totalPaginas || cargando}
            onClick={onSiguiente}
          >
            Siguiente
          </button>
        </div>
      </div>
    </section>
  );
};

export default SeccionTalleres;
