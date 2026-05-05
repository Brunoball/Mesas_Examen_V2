import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBoxOpen, faEdit, faLayerGroup, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";

const AREAS_GRID_COLS = "1.15fr .85fr 1.7fr .75fr .8fr";
const SKELETON_ROWS = 7;

const AREAS_COLUMNS = [
  { key: "area", label: "Área", strong: true },
  { key: "cantidad", label: "Cantidad materias", align: "center" },
  { key: "materias", label: "Materias incluidas" },
  { key: "estado", label: "Estado", align: "center" },
  { key: "acciones", label: "Acciones", align: "center", actions: true },
];

const SKELETON_WIDTHS = ["70%", "36%", "74%", "46%", "42%"];

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
      key={`area-skel-${index}`}
      className="mov-gridTable mov-gridTable--row mov-row--skeleton global-divTable__row materias-gridRow"
      style={{ gridTemplateColumns: AREAS_GRID_COLS }}
      role="row"
      aria-hidden="true"
    >
      {AREAS_COLUMNS.map((column, columnIndex) => (
        <div
          key={column.key}
          className={[
            "mov-gridCell",
            alignClass(column.align),
            column.actions ? "mov-gridCell--actions" : "",
          ].filter(Boolean).join(" ")}
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

const SeccionAreas = ({
  cargando,
  areas = [],
  areasFiltradas = [],
  onNueva,
  onEditar,
  onEliminar,
  headerFilters,
}) => {
  return (
    <section className="materias-card subsection-card mov-card mov-card--table">
      <div className="mov-card__head materias-card__head materias-subsection-head">
        <div className="mov-card__headLeft materias-card__headLeft">
          <div className="title-mov materias-titleBox">
            <div className="mov-card__title materias-section-title">
              <FontAwesomeIcon icon={faLayerGroup} /> Materias · Áreas
            </div>
            <div className="mov-card__hint">
              Total áreas: <b>{areas.length}</b> · Visibles: <b>{areasFiltradas.length}</b>
            </div>
          </div>

          {headerFilters}
        </div>

        <div className="mov-card__actions materias-actionsHead">

          <button className="mov-btn mov-btn--primary" type="button" onClick={onNueva}>
            <FontAwesomeIcon icon={faPlus} /> Nueva área
          </button>
        </div>
      </div>

      <div className="materias-divTable global-divTable" role="table" aria-label="Listado de áreas">
        <div
          className="mov-gridTable mov-gridTable--head global-divTable__head materias-gridHead"
          style={{ gridTemplateColumns: AREAS_GRID_COLS }}
          role="row"
        >
          {AREAS_COLUMNS.map((column) => (
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
              <div className="mov-skeletonWrap" aria-busy="true" aria-label="Cargando áreas">
                {Array.from({ length: SKELETON_ROWS }).map((_, index) => renderSkeletonRow(index))}
              </div>
            ) : (
              <>
                {areasFiltradas.map((a) => (
                  <div
                    key={a.id_area}
                    className="mov-gridTable mov-gridTable--row global-divTable__row materias-gridRow"
                    style={{ gridTemplateColumns: AREAS_GRID_COLS }}
                    role="row"
                  >
                    <div className="mov-gridCell is-strong" role="cell" data-label="Área" title={safeText(a.area)}>
                      <span className="mov-ellipsissss">{safeText(a.area)}</span>
                    </div>
                    <div className="mov-gridCell is-center" role="cell" data-label="Cantidad materias">
                      <span className="mov-chip materias-badge">{a.cantidad_materias || 0}</span>
                    </div>
                    <div className="mov-gridCell" role="cell" data-label="Materias incluidas" title={safeText(a.materias)}>
                      <span className="mov-ellipsissss">{safeText(a.materias)}</span>
                    </div>
                    <div className="mov-gridCell is-center" role="cell" data-label="Estado">
                      <span className={`mov-chip materias-badge ${Number(a.activo) === 1 ? "mov-chip--ok" : "mov-chip--neutral"}`}>
                        {Number(a.activo) === 1 ? "ACTIVA" : "INACTIVA"}
                      </span>
                    </div>
                    <div className="mov-gridCell mov-gridCell--actions is-center" role="cell" data-label="Acciones">
                      <div className="mov-actionsInline">
                        <button className="mov-iconBtn materias-icon-btn" title="Editar" onClick={() => onEditar(a)} type="button">
                          <FontAwesomeIcon icon={faEdit} />
                        </button>
                        <button className="mov-iconBtn mov-iconBtn--danger materias-icon-btn materias-icon-danger" title="Eliminar" onClick={() => onEliminar(a)} type="button">
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {areasFiltradas.length === 0 && (
                  <div className="cc-emptyState materias-emptyState">
                    <FontAwesomeIcon icon={faBoxOpen} className="cc-emptyIcon" />
                    <div className="cc-emptyText">No hay áreas cargadas.</div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default SeccionAreas;
