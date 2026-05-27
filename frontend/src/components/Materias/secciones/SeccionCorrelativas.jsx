import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBoxOpen, faDiagramProject, faEdit, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";

const CORRELATIVAS_GRID_COLS = "1.25fr .85fr 1.25fr .85fr .75fr .9fr .75fr .8fr";
const SKELETON_ROWS = 7;

const CORRELATIVAS_COLUMNS = [
  { key: "anterior", label: "Correlativa anterior", strong: true },
  { key: "cursoAnterior", label: "Curso anterior" },
  { key: "posterior", label: "Materia posterior" },
  { key: "cursoPosterior", label: "Curso posterior" },
  { key: "tipo", label: "Tipo", align: "center" },
  { key: "bloqueos", label: "Bloqueos" },
  { key: "estado", label: "Estado", align: "center" },
  { key: "acciones", label: "Acciones", align: "center", actions: true },
];

const SKELETON_WIDTHS = ["76%", "46%", "70%", "50%", "42%", "66%", "44%", "40%"];

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
      key={`correlativa-skel-${index}`}
      className="mov-gridTable mov-gridTable--row mov-row--skeleton global-divTable__row materias-gridRow"
      style={{ gridTemplateColumns: CORRELATIVAS_GRID_COLS }}
      role="row"
      aria-hidden="true"
    >
      {CORRELATIVAS_COLUMNS.map((column, columnIndex) => (
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

const SeccionCorrelativas = ({
  cargando,
  correlativas = [],
  correlativasFiltradas = [],
  onNueva,
  onEditar,
  onEliminar,
  headerFilters,
  exportButton,
  totalRegistros = correlativas.length,
  totalReferencia = correlativasFiltradas.length,
  totalVisible = correlativasFiltradas.length,
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
              <FontAwesomeIcon icon={faDiagramProject} /> Materias · Correlativas
            </div>
            <div className="mov-card__hint">
              Mostrando <b>{totalVisible}</b> de <b>{totalReferencia}</b> correlatividades
            </div>
          </div>

          {headerFilters}
        </div>

        <div className="mov-card__actions materias-actionsHead">
          {exportButton}

          <button className="mov-btn mov-btn--primary" type="button" onClick={onNueva}>
            <FontAwesomeIcon icon={faPlus} /> Nueva correlatividad
          </button>
        </div>
      </div>

      <div className="materias-divTable global-divTable" role="table" aria-label="Listado de correlativas">
        <div
          className="mov-gridTable mov-gridTable--head global-divTable__head materias-gridHead"
          style={{ gridTemplateColumns: CORRELATIVAS_GRID_COLS }}
          role="row"
        >
          {CORRELATIVAS_COLUMNS.map((column) => (
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
              <div className="mov-skeletonWrap" aria-busy="true" aria-label="Cargando correlativas">
                {Array.from({ length: SKELETON_ROWS }).map((_, index) => renderSkeletonRow(index))}
              </div>
            ) : (
              <>
                {correlativasFiltradas.map((c) => (
                  <div
                    key={c.id_materia_correlativa}
                    className="mov-gridTable mov-gridTable--row global-divTable__row materias-gridRow"
                    style={{ gridTemplateColumns: CORRELATIVAS_GRID_COLS }}
                    role="row"
                  >
                    <div className="mov-gridCell is-strong" role="cell" data-label="Correlativa anterior" title={safeText(c.materia_relacionada)}>
                      <span className="mov-ellipsissss">{safeText(c.materia_relacionada)}</span>
                    </div>
                    <div className="mov-gridCell" role="cell" data-label="Curso anterior" title={safeText(c.curso_relacionada)}>
                      <span className="mov-ellipsissss">{safeText(c.curso_relacionada)}</span>
                    </div>
                    <div className="mov-gridCell" role="cell" data-label="Materia posterior" title={safeText(c.materia)}>
                      <span className="mov-ellipsissss">{safeText(c.materia)}</span>
                    </div>
                    <div className="mov-gridCell" role="cell" data-label="Curso posterior" title={safeText(c.curso)}>
                      <span className="mov-ellipsissss">{safeText(c.curso)}</span>
                    </div>
                    <div className="mov-gridCell is-center" role="cell" data-label="Tipo">
                      <span className="mov-chip materias-badge">{String(c.tipo || "—").toUpperCase()}</span>
                    </div>
                    <div className="mov-gridCell" role="cell" data-label="Bloqueos">
                      <div className="materias-stackText">
                        <span>Inscripción: {Number(c.bloquea_inscripcion) === 1 ? "SÍ" : "NO"}</span>
                        <span>Armado: {Number(c.bloquea_armado) === 1 ? "SÍ" : "NO"}</span>
                      </div>
                    </div>
                    <div className="mov-gridCell is-center" role="cell" data-label="Estado">
                      <span className={`mov-chip materias-badge ${Number(c.activo) === 1 ? "mov-chip--ok" : "mov-chip--neutral"}`}>
                        {Number(c.activo) === 1 ? "ACTIVA" : "INACTIVA"}
                      </span>
                    </div>
                    <div className="mov-gridCell mov-gridCell--actions is-center" role="cell" data-label="Acciones">
                      <div className="mov-actionsInline">
                        <button className="mov-iconBtn materias-icon-btn" title="Editar" onClick={() => onEditar(c)} type="button">
                          <FontAwesomeIcon icon={faEdit} />
                        </button>
                        <button className="mov-iconBtn mov-iconBtn--danger materias-icon-btn materias-icon-danger" title="Eliminar" onClick={() => onEliminar(c)} type="button">
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {correlativasFiltradas.length === 0 && (
                  <div className="cc-emptyState materias-emptyState">
                    <FontAwesomeIcon icon={faBoxOpen} className="cc-emptyIcon" />
                    <div className="cc-emptyText">No hay correlatividades cargadas.</div>
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

export default SeccionCorrelativas;
