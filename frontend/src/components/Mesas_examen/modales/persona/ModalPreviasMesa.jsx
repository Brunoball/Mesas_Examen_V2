// src/components/Mesas_examen/modales/persona/ModalPreviasMesa.jsx
import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faExchangeAlt, faTimes, faTrash, faUser } from "@fortawesome/free-solid-svg-icons";

import "./persona.css";
import TextoExpandibleGlobal from "../../../Global/Modales/TextoExpandibleGlobal";

const texto = (valor, fallback = "-") => {
  const salida = String(valor ?? "").trim();
  return salida || fallback;
};

const PREVIAS_GRID_COLS = "0.45fr 1.5fr 0.5fr 1.45fr 1.25fr 0.52fr";
const COLUMNAS_CENTRADAS = new Set(["dni", "alumno", "curso", "accion"]);

const isTopMesaModal = (node) => {
  if (typeof document === "undefined" || !node) return true;
  const modales = Array.from(document.querySelectorAll("[data-mesa-modal-root='true'], .gdel-overlay, [data-global-info-modal-root='true']"));
  return modales[modales.length - 1] === node;
};

const useEscapeClose = (abierto, onClose, disabled = false) => {
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== "Escape" || disabled) return;
      if (!isTopMesaModal(overlayRef.current)) return;

      event.preventDefault();
      event.stopPropagation();
      onClose?.();
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [abierto, onClose, disabled]);

  return overlayRef;
};

const GridHead = ({ columns, gridCols }) => (
  <div className="persona-grid-row persona-grid-head" style={{ gridTemplateColumns: gridCols }} role="row">
    {columns.map((column) => (
      <div
        key={column.key}
        className={`persona-grid-cell persona-grid-cell-head ${COLUMNAS_CENTRADAS.has(column.key) ? "is-center" : ""}`}
        role="columnheader"
      >
        {column.label}
      </div>
    ))}
  </div>
);


const PersonaTableSkeleton = ({ columns, gridCols, rows = 4 }) => (
  <div className="persona-table-wrap persona-table-wrap-skeleton" aria-hidden="true">
    <div className="persona-table persona-div-table persona-table-skeleton" role="presentation">
      <GridHead columns={columns} gridCols={gridCols} />
      <div className="persona-grid-body" role="presentation">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={`persona-skeleton-row-${rowIndex}`}
            className="persona-grid-row persona-grid-data-row persona-grid-skeleton-row"
            style={{ gridTemplateColumns: gridCols }}
            role="presentation"
          >
            {columns.map((column, colIndex) => (
              <div key={`${column.key}-${colIndex}`} className="persona-grid-cell" role="presentation">
                <span className={`persona-skeleton-line persona-skeleton-line--${column.key}`} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  </div>
);

const ModalPreviasMesa = ({ abierto, numero, data, cargando, onClose, onMover, onEliminar }) => {
  const overlayRef = useEscapeClose(abierto, onClose);

  if (!abierto) return null;

  const portalTarget = typeof document !== "undefined" ? document.body : null;
  if (!portalTarget) return null;

  const numeroMesa = numero?.numero_mesa || data?.numero_mesa || "-";
  const previas = Array.isArray(data?.previas) ? data.previas : [];

  const columns = [
    { key: "dni", label: "DNI" },
    { key: "alumno", label: "Alumno" },
    { key: "curso", label: "Curso" },
    { key: "materia", label: "Materia" },
    { key: "docente", label: "Docente" },
    { key: "accion", label: "Acción" },
  ];

  return createPortal((
    <div ref={overlayRef} className="persona-modal-overlay" role="dialog" aria-modal="true" data-mesa-modal-root="true">
      <div className={`persona-modal persona-modal-previas ${cargando ? "is-loading" : ""}`}>
        <header className="persona-modal-header">
          <div className="persona-header-title">
            <span className="persona-header-icon" aria-hidden="true">
              <FontAwesomeIcon icon={faUser} />
            </span>
            <div className="persona-header-text">
              <h3>Previas de la mesa N° {texto(numeroMesa)}</h3>
              {data?.meta?.area && (
                <div className="persona-header-meta">
                  <span>{data.meta.area}</span>
                </div>
              )}
            </div>
          </div>
          <button type="button" className="persona-close mesa-submodal-close" onClick={onClose} aria-label="Cerrar">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </header>

        <section className="persona-modal-body">
          {cargando ? (
            <PersonaTableSkeleton columns={columns} gridCols={PREVIAS_GRID_COLS} rows={4} />
          ) : (previas.length === 0 ? (
            <div className="persona-empty">Este número de mesa no tiene previas vinculadas.</div>
          ) : (
            <div className="persona-table-wrap">
              <div className="persona-table persona-div-table" role="table" aria-label={`Previas de la mesa N° ${texto(numeroMesa)}`}>
                <GridHead columns={columns} gridCols={PREVIAS_GRID_COLS} />
                <div className="persona-grid-body" role="rowgroup">
                  {previas.map((previa) => (
                    <div
                      key={`${previa.id_previa}-${previa.numero_mesa}`}
                      className="persona-grid-row persona-grid-data-row"
                      style={{ gridTemplateColumns: PREVIAS_GRID_COLS }}
                      role="row"
                    >
                      <div className="persona-grid-cell is-center" role="cell" data-label="DNI">{texto(previa.dni)}</div>
                      <div className="persona-grid-cell is-strong is-center" role="cell" data-label="Alumno">
                        <TextoExpandibleGlobal value={previa.alumno} title="Alumno" subtitle={`Mesa N° ${texto(numeroMesa)}`} />
                      </div>
                      <div className="persona-grid-cell is-center" role="cell" data-label="Curso">{texto(previa.curso)}</div>
                      <div className="persona-grid-cell" role="cell" data-label="Materia">
                        <TextoExpandibleGlobal value={previa.materia} title="Materia" subtitle={`Mesa N° ${texto(numeroMesa)}`} />
                      </div>
                      <div className="persona-grid-cell" role="cell" data-label="Docente">
                        <TextoExpandibleGlobal value={previa.docente} title="Docente" subtitle={`Mesa N° ${texto(numeroMesa)}`} />
                      </div>
                      <div className="persona-grid-cell persona-grid-cell-actions" role="cell" data-label="Acción">
                        <div className="persona-actions">
                          <button
                            type="button"
                            className="mov-iconBtn materias-icon-btn persona-action-icon"
                            title="Mover solo esta previa / alumno"
                            onClick={() => onMover(previa)}
                          >
                            <FontAwesomeIcon icon={faExchangeAlt} />
                          </button>
                          <button
                            type="button"
                            className="mov-iconBtn mov-iconBtn--danger materias-icon-btn materias-icon-danger persona-action-icon"
                            title="Eliminar previa de esta mesa"
                            onClick={() => onEliminar(previa)}
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </section>

        <footer className="persona-modal-footer">
          <button type="button" className="persona-btn-secondary mesa-submodal-footer-close" onClick={onClose}>Cerrar</button>
        </footer>
      </div>
    </div>
  ), portalTarget);
};

export default ModalPreviasMesa;
