// src/components/Mesas_examen/modales/persona/ModalMoverPreviaMesa.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faExchangeAlt, faSpinner, faTimes, faUser } from "@fortawesome/free-solid-svg-icons";

import "./persona.css";
import TextoExpandibleGlobal from "../../../Global/Modales/TextoExpandibleGlobal";

const texto = (valor, fallback = "-") => {
  const salida = String(valor ?? "").trim();
  return salida || fallback;
};

const MOVER_GRID_COLS = "0.75fr 0.5fr .7fr 0.6fr 1.7fr 1.5fr";
const COLUMNAS_CENTRADAS = new Set(["seleccionar", "mesa", "fecha", "turno"]);

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

const ModalMoverPreviaMesa = ({ abierto, previa, destinosData, cargando, moviendo, onClose, onConfirm }) => {
  const [numeroSeleccionado, setNumeroSeleccionado] = useState("");
  const overlayRef = useEscapeClose(abierto, onClose, moviendo);

  const destinos = useMemo(() => {
    return Array.isArray(destinosData?.destinos) ? destinosData.destinos : [];
  }, [destinosData]);

  const destinoSeleccionado = useMemo(() => {
    return destinos.find((destino) => String(destino.numero_mesa) === String(numeroSeleccionado)) || null;
  }, [destinos, numeroSeleccionado]);

  useEffect(() => {
    if (!abierto) return;
    const primeroValido = destinos.find((destino) => destino.valido);
    setNumeroSeleccionado(primeroValido ? String(primeroValido.numero_mesa) : "");
  }, [abierto, destinos]);

  if (!abierto) return null;

  const portalTarget = typeof document !== "undefined" ? document.body : null;
  if (!portalTarget) return null;

  const puedeConfirmar = !!destinoSeleccionado?.valido && !moviendo && !cargando;
  const columns = [
    { key: "seleccionar", label: "Seleccionar" },
    { key: "mesa", label: "N° Mesa" },
    { key: "fecha", label: "Fecha" },
    { key: "turno", label: "Turno" },
    { key: "materia", label: "Materia" },
    { key: "docente", label: "Docente" },
  ];

  return createPortal((
    <div ref={overlayRef} className="persona-modal-overlay persona-modal-overlay-top" role="dialog" aria-modal="true" data-mesa-modal-root="true">
      <div className="persona-modal persona-modal-mover">
        <header className="persona-modal-header persona-modal-header-compact">
          <div className="persona-header-title">
            <span className="persona-header-icon" aria-hidden="true">
              <FontAwesomeIcon icon={faExchangeAlt} />
            </span>
            <div className="persona-header-text">
              <h3>Mover previa</h3>
              <div className="persona-header-meta">
                <span>Mesa actual: <strong>N° {texto(previa?.numero_mesa)}</strong></span>
                <span>Área destino: <strong>{texto(destinosData?.area, "Sin área")}</strong></span>
              </div>
            </div>
          </div>
          <button type="button" className="persona-close mesa-submodal-close" onClick={onClose} aria-label="Cerrar" disabled={moviendo}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </header>

        <section className="persona-modal-body persona-modal-body-scroll">
          <div className="persona-mover-info-card">
            <div className="persona-dashboard-card persona-dashboard-card--blue">
              <span className="persona-dashboard-card__icon" aria-hidden="true"><FontAwesomeIcon icon={faUser} /></span>
              <div className="persona-dashboard-card__body">
                <span>Alumno</span>
                <strong>
                  <TextoExpandibleGlobal value={previa?.alumno} title="Alumno" subtitle={`Mesa actual N° ${texto(previa?.numero_mesa)}`} />
                </strong>
              </div>
            </div>
            <div className="persona-dashboard-card persona-dashboard-card--green">
              <span className="persona-dashboard-card__icon" aria-hidden="true"><FontAwesomeIcon icon={faCheck} /></span>
              <div className="persona-dashboard-card__body">
                <span>Materia</span>
                <strong>
                  <TextoExpandibleGlobal value={previa?.materia} title="Materia" subtitle={`Mesa actual N° ${texto(previa?.numero_mesa)}`} />
                </strong>
              </div>
            </div>
            <div className="persona-dashboard-card persona-dashboard-card--purple">
              <span className="persona-dashboard-card__icon" aria-hidden="true"><FontAwesomeIcon icon={faExchangeAlt} /></span>
              <div className="persona-dashboard-card__body">
                <span>Detalle</span>
                <strong>DNI {texto(previa?.dni)} · Curso {texto(previa?.curso)}</strong>
              </div>
            </div>
            <p>Esta acción mueve únicamente este alumno/previa. No mueve el número de mesa completo.</p>
          </div>

          {cargando ? (
            <div className="persona-loading">
              <FontAwesomeIcon icon={faSpinner} spin /> Buscando números compatibles del área...
            </div>
          ) : destinos.length === 0 ? (
            <div className="persona-empty">No hay otros números de mesa disponibles dentro del área de esta materia.</div>
          ) : (
            <div className="persona-table-wrap">
              <div className="persona-table persona-div-table persona-table-mover" role="table" aria-label="Números de mesa destino">
                <GridHead columns={columns} gridCols={MOVER_GRID_COLS} />
                <div className="persona-grid-body" role="rowgroup">
                  {destinos.map((destino) => {
                    const errores = Array.isArray(destino.errores) ? destino.errores : [];
                    const seleccionado = String(numeroSeleccionado) === String(destino.numero_mesa);
                    const seleccionarDestino = () => {
                      if (!destino.valido || moviendo) return;
                      setNumeroSeleccionado((actual) => (String(actual) === String(destino.numero_mesa) ? "" : String(destino.numero_mesa)));
                    };

                    return (
                      <div
                        key={destino.numero_mesa}
                        className={`persona-grid-row persona-grid-data-row ${destino.valido ? "persona-row-selectable" : "persona-row-disabled"} ${seleccionado ? "persona-row-selected" : ""}`}
                        style={{ gridTemplateColumns: MOVER_GRID_COLS }}
                        role="row"
                        tabIndex={destino.valido && !moviendo ? 0 : -1}
                        aria-selected={seleccionado}
                        title={!destino.valido && errores.length ? errores.join(" | ") : undefined}
                        onClick={seleccionarDestino}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            seleccionarDestino();
                          }
                        }}
                      >
                        <div className="persona-grid-cell persona-grid-cell-actions" role="cell" data-label="Seleccionar">
                          <button
                            type="button"
                            className={`persona-radio ${seleccionado ? "activo" : ""}`}
                            disabled={!destino.valido || moviendo}
                            onClick={(event) => {
                              event.stopPropagation();
                              seleccionarDestino();
                            }}
                            title={seleccionado ? "Deseleccionar destino" : "Seleccionar destino"}
                            aria-label={`${seleccionado ? "Deseleccionar" : "Seleccionar"} mesa N° ${texto(destino.numero_mesa)}`}
                            aria-pressed={seleccionado}
                          >
                            {seleccionado && <FontAwesomeIcon icon={faCheck} />}
                          </button>
                        </div>
                        <div className="persona-grid-cell is-center" role="cell" data-label="N° Mesa">{texto(destino.numero_mesa)}</div>
                        <div className="persona-grid-cell is-center" role="cell" data-label="Fecha">{texto(destino.fecha)}</div>
                        <div className="persona-grid-cell is-center" role="cell" data-label="Turno">{texto(destino.turno)}</div>
                        <div className="persona-grid-cell" role="cell" data-label="Materia">
                          <TextoExpandibleGlobal value={destino.materia} title="Materia destino" subtitle={`Mesa N° ${texto(destino.numero_mesa)}`} />
                        </div>
                        <div className="persona-grid-cell" role="cell" data-label="Docente">
                          <TextoExpandibleGlobal value={destino.docente} title="Docente destino" subtitle={`Mesa N° ${texto(destino.numero_mesa)}`} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

        </section>

        <footer className="persona-modal-footer persona-modal-footer-actions">
          <button type="button" className="persona-btn-secondary mesa-submodal-footer-close" onClick={onClose} disabled={moviendo}>Cerrar</button>
          <button
            type="button"
            className="persona-btn-primary"
            disabled={!puedeConfirmar}
            onClick={() => onConfirm(destinoSeleccionado)}
          >
            <FontAwesomeIcon icon={moviendo ? faSpinner : faCheck} spin={moviendo} />
            Mover solo esta previa
          </button>
        </footer>
      </div>
    </div>
  ), portalTarget);
};

export default ModalMoverPreviaMesa;
