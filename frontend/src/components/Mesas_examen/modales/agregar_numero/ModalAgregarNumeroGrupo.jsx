// src/components/Mesas_examen/modales/agregar_numero/ModalAgregarNumeroGrupo.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faSearch, faSpinner, faTimes } from "@fortawesome/free-solid-svg-icons";
import "./agregar_numero.css";
import TextoExpandibleGlobal from "../../../Global/Modales/TextoExpandibleGlobal";

const texto = (valor, fallback = "-") => {
  const salida = String(valor ?? "").trim();
  return salida || fallback;
};

const normalizar = (valor) => String(valor || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

const coincide = (item, busqueda, campos) => {
  const q = normalizar(busqueda);
  if (!q) return true;
  return campos.some((campo) => normalizar(item?.[campo]).includes(q));
};

const NO_AGRUPADAS_GRID_COLS = "0.8fr 1.55fr 1.3fr 1.05fr 0.75fr 0.65fr";
const PREVIAS_GRID_COLS = "0.9fr 1.45fr 1.45fr 0.95fr 1.25fr 0.65fr";

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
  <div className="ag-num-grid-row ag-num-grid-head" style={{ gridTemplateColumns: gridCols }} role="row">
    {columns.map((column) => (
      <div key={column.key} className="ag-num-grid-cell ag-num-grid-cell-head" role="columnheader">
        {column.label}
      </div>
    ))}
  </div>
);

const FilaNoAgrupada = ({ item, agregando, onAgregar }) => (
  <div className="ag-num-grid-row ag-num-grid-data-row" style={{ gridTemplateColumns: NO_AGRUPADAS_GRID_COLS }} role="row">
    <div className="ag-num-grid-cell ag-num-center" role="cell" data-label="N° mesa">N° {texto(item.numero_mesa)}</div>
    <div className="ag-num-grid-cell is-strong" role="cell" data-label="Materia">
      <TextoExpandibleGlobal value={item.materia} fallback="Sin materia" title="Materia" subtitle={`Mesa N° ${texto(item.numero_mesa)}`} />
    </div>
    <div className="ag-num-grid-cell" role="cell" data-label="Docente">
      <TextoExpandibleGlobal value={item.docente} fallback="Sin docente" title="Docente" subtitle={`DNI ${texto(item.dni)}`} />
    </div>
    <div className="ag-num-grid-cell" role="cell" data-label="Área">
      <TextoExpandibleGlobal value={item.area} fallback="Sin área" title="Área" subtitle={`Mesa N° ${texto(item.numero_mesa)}`} />
    </div>
    <div className="ag-num-grid-cell ag-num-center" role="cell" data-label="Alumnos">{texto(item.cantidad_alumnos, "0")}</div>
    <div className="ag-num-grid-cell ag-num-center ag-num-grid-actions" role="cell" data-label="Acción">
      <button
        type="button"
        className="mov-iconBtn materias-icon-btn ag-num-add-btn"
        title="Agregar número al grupo"
        disabled={agregando}
        onClick={() => onAgregar(item, "no_agrupada")}
      >
        <FontAwesomeIcon icon={agregando ? faSpinner : faPlus} spin={agregando} />
      </button>
    </div>
  </div>
);

const FilaPrevia = ({ item, agregando, onAgregar }) => (
  <div className="ag-num-grid-row ag-num-grid-data-row" style={{ gridTemplateColumns: PREVIAS_GRID_COLS }} role="row">
    <div className="ag-num-grid-cell" role="cell" data-label="DNI">{texto(item.dni)}</div>
    <div className="ag-num-grid-cell is-strong" role="cell" data-label="Alumno">
      <TextoExpandibleGlobal value={item.alumno} title="Alumno" subtitle={`DNI ${texto(item.dni)}`} />
    </div>
    <div className="ag-num-grid-cell" role="cell" data-label="Materia">
      <TextoExpandibleGlobal value={item.materia} title="Materia" subtitle={`DNI ${texto(item.dni)}`} />
    </div>
    <div className="ag-num-grid-cell" role="cell" data-label="Curso / Div.">{texto(item.curso)}</div>
    <div className="ag-num-grid-cell" role="cell" data-label="Docente">
      <TextoExpandibleGlobal value={item.docente} fallback="Sin docente" title="Docente" subtitle={`Mesa N° ${texto(item.numero_mesa)}`} />
    </div>
    <div className="ag-num-grid-cell ag-num-center ag-num-grid-actions" role="cell" data-label="Acción">
      <button
        type="button"
        className="mov-iconBtn materias-icon-btn ag-num-add-btn"
        title="Crear número y agregar al grupo"
        disabled={agregando}
        onClick={() => onAgregar(item, "previa_sin_mesa")}
      >
        <FontAwesomeIcon icon={agregando ? faSpinner : faPlus} spin={agregando} />
      </button>
    </div>
  </div>
);

const ModalAgregarNumeroGrupo = ({ abierto, data, cargando, agregando, error, onClose, onAgregar }) => {
  const [tab, setTab] = useState("no_agrupadas");
  const [busqueda, setBusqueda] = useState("");
  const overlayRef = useEscapeClose(abierto, onClose, agregando);

  const noAgrupadas = useMemo(() => {
    const lista = Array.isArray(data?.no_agrupadas) ? data.no_agrupadas : [];
    return lista.filter((item) => coincide(item, busqueda, ["numero_mesa", "materia", "docente", "area", "alumnos_texto"]));
  }, [data, busqueda]);

  const previas = useMemo(() => {
    const lista = Array.isArray(data?.previas_sin_mesa) ? data.previas_sin_mesa : [];
    return lista.filter((item) => coincide(item, busqueda, ["dni", "alumno", "materia", "curso", "docente", "area"]));
  }, [data, busqueda]);

  if (!abierto) return null;

  const portalTarget = typeof document !== "undefined" ? document.body : null;
  if (!portalTarget) return null;

  const meta = data?.meta || {};
  const placeholder = tab === "no_agrupadas"
    ? "Buscar por número, materia, docente, alumno..."
    : "Buscar por DNI, alumno, materia, curso...";

  const columnsNoAgrupadas = [
    { key: "numero", label: "N° mesa" },
    { key: "materia", label: "Materia" },
    { key: "docente", label: "Docente" },
    { key: "area", label: "Área" },
    { key: "alumnos", label: "Alumnos" },
    { key: "accion", label: "Acción" },
  ];

  const columnsPrevias = [
    { key: "dni", label: "DNI" },
    { key: "alumno", label: "Alumno" },
    { key: "materia", label: "Materia" },
    { key: "curso", label: "Curso / Div." },
    { key: "docente", label: "Docente" },
    { key: "accion", label: "Acción" },
  ];

  return createPortal((
    <div ref={overlayRef} className="ag-num-overlay" role="dialog" aria-modal="true" data-mesa-modal-root="true">
      <div className="ag-num-panel">
        <header className="ag-num-header">
          <div className="ag-num-header-title">
            <span className="ag-num-header-icon" aria-hidden="true">
              <FontAwesomeIcon icon={faPlus} />
            </span>
            <div className="ag-num-header-text">
              <h2>Agregar número al grupo</h2>
              <div className="ag-num-header-meta">
                <span>Grupo <strong>{texto(meta.numero_grupo)}</strong></span>
                <span>Fecha <strong>{texto(meta.fecha)}</strong></span>
                <span>Turno <strong>{texto(meta.turno)}</strong></span>
                <span>Libres <strong>{texto(meta.slots_libres, "0")}</strong></span>
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={agregando} aria-label="Cerrar">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </header>

        <div className="ag-num-tabs">
          <button
            type="button"
            className={tab === "no_agrupadas" ? "active" : ""}
            onClick={() => setTab("no_agrupadas")}
          >
            Mesas no agrupadas
          </button>
          <button
            type="button"
            className={tab === "previas" ? "active" : ""}
            onClick={() => setTab("previas")}
          >
            Previas sin número de mesa
          </button>
        </div>

        <section className="ag-num-content">
          <label className="ag-num-search">
            <FontAwesomeIcon icon={faSearch} />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={placeholder}
            />
          </label>

          {error && <div className="ag-num-error">{error}</div>}

          {cargando ? (
            <div className="ag-num-empty">
              <FontAwesomeIcon icon={faSpinner} spin /> Buscando opciones válidas...
            </div>
          ) : tab === "no_agrupadas" ? (
            noAgrupadas.length === 0 ? (
              <div className="ag-num-empty">No hay mesas no agrupadas disponibles.</div>
            ) : (
              <div className="ag-num-table-wrap">
                <div className="ag-num-table ag-num-div-table" role="table" aria-label="Mesas no agrupadas disponibles">
                  <GridHead columns={columnsNoAgrupadas} gridCols={NO_AGRUPADAS_GRID_COLS} />
                  <div className="ag-num-grid-body" role="rowgroup">
                    {noAgrupadas.map((item) => (
                      <FilaNoAgrupada
                        key={`no-${item.numero_mesa}`}
                        item={item}
                        agregando={agregando}
                        onAgregar={onAgregar}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )
          ) : previas.length === 0 ? (
            <div className="ag-num-empty">No hay previas sin número de mesa disponibles para este día y turno.</div>
          ) : (
            <div className="ag-num-table-wrap">
              <div className="ag-num-table ag-num-div-table" role="table" aria-label="Previas sin número de mesa">
                <GridHead columns={columnsPrevias} gridCols={PREVIAS_GRID_COLS} />
                <div className="ag-num-grid-body" role="rowgroup">
                  {previas.map((item) => (
                    <FilaPrevia
                      key={`previa-${item.id_previa}`}
                      item={item}
                      agregando={agregando}
                      onAgregar={onAgregar}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        <footer className="ag-num-footer">
          <button type="button" onClick={onClose} disabled={agregando}>Cerrar</button>
        </footer>
      </div>
    </div>
  ), portalTarget);
};

export default ModalAgregarNumeroGrupo;
