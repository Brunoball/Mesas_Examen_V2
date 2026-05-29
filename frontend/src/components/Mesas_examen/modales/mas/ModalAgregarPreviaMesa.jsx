// src/components/Mesas_examen/modales/mas/ModalAgregarPreviaMesa.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faMagnifyingGlass,
  faPlus,
  faSpinner,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";

import "./mas.css";
import TextoExpandibleGlobal from "../../../Global/Modales/TextoExpandibleGlobal";

const normalizar = (valor) => String(valor || "").toLowerCase().trim();

const texto = (valor, fallback = "-") => {
  const salida = String(valor ?? "").trim();
  return salida || fallback;
};

const obtenerNumero = (numero) => numero?.numero_mesa || numero?.numero || numero;

const previaCoincide = (previa, busqueda) => {
  const textoBusqueda = normalizar(busqueda);
  if (!textoBusqueda) return true;

  return [
    previa?.dni,
    previa?.alumno,
    previa?.materia,
    previa?.docente,
    previa?.curso,
    previa?.curso_materia,
    previa?.area,
    previa?.anio,
  ].some((valor) => normalizar(valor).includes(textoBusqueda));
};

const MAS_GRID_COLS = "0.75fr 0.9fr 1.45fr 0.85fr 1.45fr 1.2fr";
const COLUMNAS_CENTRADAS = new Set(["seleccionar", "dni", "alumno", "curso"]);

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
  <div className="mas-grid-row mas-grid-head" style={{ gridTemplateColumns: gridCols }} role="row">
    {columns.map((column) => (
      <div
        key={column.key}
        className={`mas-grid-cell mas-grid-cell-head ${COLUMNAS_CENTRADAS.has(column.key) ? "is-center" : ""}`}
        role="columnheader"
      >
        {column.label}
      </div>
    ))}
  </div>
);

const ModalAgregarPreviaMesa = ({
  abierto,
  numero,
  data,
  cargando = false,
  agregando = false,
  onClose,
  onConfirm,
}) => {
  const [busqueda, setBusqueda] = useState("");
  const [previaSeleccionada, setPreviaSeleccionada] = useState(null);
  const overlayRef = useEscapeClose(abierto, onClose, agregando);

  const previas = useMemo(() => {
    const lista = Array.isArray(data?.previas) ? data.previas : [];
    return lista.filter((previa) => previaCoincide(previa, busqueda));
  }, [data, busqueda]);

  useEffect(() => {
    setPreviaSeleccionada(null);
  }, [data?.numero_mesa, data?.cantidad]);

  if (!abierto) return null;

  const portalTarget = typeof document !== "undefined" ? document.body : null;
  if (!portalTarget) return null;

  const numeroMesa = obtenerNumero(numero || data?.meta || data);

  const confirmar = () => {
    if (!previaSeleccionada || agregando || typeof onConfirm !== "function") return;
    onConfirm(previaSeleccionada);
  };

  const columns = [
    { key: "seleccionar", label: "Seleccionar" },
    { key: "dni", label: "DNI" },
    { key: "alumno", label: "Alumno" },
    { key: "curso", label: "Curso" },
    { key: "materia", label: "Materia" },
    { key: "docente", label: "Docente" },
  ];

  return createPortal((
    <div ref={overlayRef} className="mas-modal-overlay" role="dialog" aria-modal="true" data-mesa-modal-root="true">
      <div className="mas-modal-panel">
        <header className="mas-modal-header">
          <div className="mas-header-title">
            <span className="mas-header-icon" aria-hidden="true">
              <FontAwesomeIcon icon={faPlus} />
            </span>
            <div className="mas-header-text">
              <h3>Agregar alumno a la mesa N° {texto(numeroMesa)}</h3>
              <div className="mas-header-meta">
                <span>{texto(data?.area || data?.meta?.area, "Área sin definir")}</span>
                {data?.docente_objetivo?.docente && (
                  <span>Docente: {texto(data.docente_objetivo.docente)}</span>
                )}
              </div>
            </div>
          </div>
          <button type="button" className="mesa-submodal-close" onClick={onClose} disabled={agregando} aria-label="Cerrar">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </header>

        <section className="mas-modal-body">
          <div className="mas-buscador">
            <FontAwesomeIcon icon={faMagnifyingGlass} />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por DNI, alumno, materia, curso..."
              autoFocus
            />
          </div>


          {cargando ? (
            <div className="mas-empty">
              <FontAwesomeIcon icon={faSpinner} spin />
              Analizando previas disponibles...
            </div>
          ) : previas.length === 0 ? (
            <div className="mas-empty">
              {data?.mensaje_restriccion || "No hay previas sin mesa disponibles para este mismo docente, área, fecha y turno."}
            </div>
          ) : (
            <div className="mas-tabla-wrap">
              <div className="mas-tabla mas-div-table" role="table" aria-label="Previas disponibles para agregar">
                <GridHead columns={columns} gridCols={MAS_GRID_COLS} />
                <div className="mas-grid-body" role="rowgroup">
                  {previas.map((previa) => {
                    const activa = String(previaSeleccionada?.id_previa) === String(previa.id_previa);
                    return (
                      <div
                        key={previa.id_previa}
                        className={`mas-grid-row mas-grid-data-row ${activa ? "seleccionada" : ""}`}
                        style={{ gridTemplateColumns: MAS_GRID_COLS }}
                        role="row"
                      >
                        <div className="mas-grid-cell mas-grid-cell-actions" role="cell" data-label="Seleccionar">
                          <button
                            type="button"
                            className={`mas-radio ${activa ? "activo" : ""}`}
                            onClick={() => setPreviaSeleccionada(previa)}
                            title="Seleccionar previa"
                          >
                            {activa && <FontAwesomeIcon icon={faCheck} />}
                          </button>
                        </div>
                        <div className="mas-grid-cell is-center" role="cell" data-label="DNI">{texto(previa.dni)}</div>
                        <div className="mas-grid-cell is-strong is-center" role="cell" data-label="Alumno">
                          <TextoExpandibleGlobal value={previa.alumno} title="Alumno" subtitle={`Mesa N° ${texto(numeroMesa)}`} />
                        </div>
                        <div className="mas-grid-cell is-center" role="cell" data-label="Curso">{texto(previa.curso)}</div>
                        <div className="mas-grid-cell" role="cell" data-label="Materia">
                          <TextoExpandibleGlobal value={previa.materia} title="Materia" subtitle={`Mesa N° ${texto(numeroMesa)}`} />
                        </div>
                        <div className="mas-grid-cell" role="cell" data-label="Docente">
                          <TextoExpandibleGlobal value={previa.docente} title="Docente" subtitle={`Mesa N° ${texto(numeroMesa)}`} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </section>

        <footer className="mas-modal-footer">
          <button type="button" className="mas-btn cancelar mesa-submodal-footer-close" onClick={onClose} disabled={agregando}>
            Cerrar
          </button>
          <button
            type="button"
            className="mas-btn confirmar"
            onClick={confirmar}
            disabled={agregando || cargando || !previaSeleccionada}
          >
            <FontAwesomeIcon icon={agregando ? faSpinner : faPlus} spin={agregando} />
            Agregar previa
          </button>
        </footer>
      </div>
    </div>
  ), portalTarget);
};

export default ModalAgregarPreviaMesa;
