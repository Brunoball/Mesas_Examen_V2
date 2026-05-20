// src/components/Mesas_examen/modales/agregar_numero/ModalAgregarNumeroGrupo.jsx
import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faSearch, faSpinner, faTimes } from "@fortawesome/free-solid-svg-icons";
import "./agregar_numero.css";

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

const FilaNoAgrupada = ({ item, agregando, onAgregar }) => (
  <tr>
    <td className="ag-num-center">N° {texto(item.numero_mesa)}</td>
    <td>{texto(item.materia, "Sin materia")}</td>
    <td>{texto(item.docente, "Sin docente")}</td>
    <td>{texto(item.area, "Sin área")}</td>
    <td className="ag-num-center">{texto(item.cantidad_alumnos, "0")}</td>
    <td className="ag-num-center">
      <button
        type="button"
        className="ag-num-add-btn"
        title="Agregar número al grupo"
        disabled={agregando}
        onClick={() => onAgregar(item, "no_agrupada")}
      >
        <FontAwesomeIcon icon={agregando ? faSpinner : faPlus} spin={agregando} />
      </button>
    </td>
  </tr>
);

const FilaPrevia = ({ item, agregando, onAgregar }) => (
  <tr>
    <td>{texto(item.dni)}</td>
    <td>{texto(item.alumno)}</td>
    <td>{texto(item.materia)}</td>
    <td>{texto(item.curso)}</td>
    <td>{texto(item.docente, "Sin docente")}</td>
    <td className="ag-num-center">
      <button
        type="button"
        className="ag-num-add-btn"
        title="Crear número y agregar al grupo"
        disabled={agregando}
        onClick={() => onAgregar(item, "previa_sin_mesa")}
      >
        <FontAwesomeIcon icon={agregando ? faSpinner : faPlus} spin={agregando} />
      </button>
    </td>
  </tr>
);

const ModalAgregarNumeroGrupo = ({ abierto, data, cargando, agregando, error, onClose, onAgregar }) => {
  const [tab, setTab] = useState("no_agrupadas");
  const [busqueda, setBusqueda] = useState("");

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

  return createPortal((
    <div className="ag-num-overlay" role="dialog" aria-modal="true">
      <div className="ag-num-panel">
        <header className="ag-num-header">
          <div>
            <h2>Agregar número al grupo</h2>
            <p>
              Grupo {texto(meta.numero_grupo)} · {texto(meta.fecha)} · Turno {texto(meta.turno)} · Libres {texto(meta.slots_libres, "0")}
            </p>
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
                <table className="ag-num-table">
                  <thead>
                    <tr>
                      <th>N° mesa</th>
                      <th>Materia</th>
                      <th>Docente</th>
                      <th>Área</th>
                      <th>Alumnos</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {noAgrupadas.map((item) => (
                      <FilaNoAgrupada
                        key={`no-${item.numero_mesa}`}
                        item={item}
                        agregando={agregando}
                        onAgregar={onAgregar}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : previas.length === 0 ? (
            <div className="ag-num-empty">No hay previas sin número de mesa disponibles para este día y turno.</div>
          ) : (
            <div className="ag-num-table-wrap">
              <table className="ag-num-table">
                <thead>
                  <tr>
                    <th>DNI</th>
                    <th>Alumno</th>
                    <th>Materia</th>
                    <th>Curso / Div.</th>
                    <th>Docente</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {previas.map((item) => (
                    <FilaPrevia
                      key={`previa-${item.id_previa}`}
                      item={item}
                      agregando={agregando}
                      onAgregar={onAgregar}
                    />
                  ))}
                </tbody>
              </table>
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
