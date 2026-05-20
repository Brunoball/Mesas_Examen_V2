// src/components/Mesas_examen/modales/mas/ModalAgregarPreviaMesa.jsx
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faMagnifyingGlass,
  faPlus,
  faSpinner,
  faTimes,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";

import "./mas.css";

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

const ModalAgregarPreviaMesa = ({
  abierto,
  numero,
  data,
  cargando = false,
  agregando = false,
  error = "",
  onClose,
  onConfirm,
}) => {
  const [busqueda, setBusqueda] = useState("");
  const [previaSeleccionada, setPreviaSeleccionada] = useState(null);

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

  return createPortal((
    <div className="mas-modal-overlay" role="dialog" aria-modal="true">
      <div className="mas-modal-panel">
        <header className="mas-modal-header">
          <div>
            <h3>Agregar alumno a la mesa N° {texto(numeroMesa)}</h3>
            <p>{texto(data?.area || data?.meta?.area, "Área sin definir")}</p>
          </div>
          <button type="button" onClick={onClose} disabled={agregando} aria-label="Cerrar">
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

          {error && (
            <div className="mas-alerta-error">
              <FontAwesomeIcon icon={faTriangleExclamation} />
              {error}
            </div>
          )}

          {cargando ? (
            <div className="mas-empty">
              <FontAwesomeIcon icon={faSpinner} spin />
              Analizando previas disponibles...
            </div>
          ) : previas.length === 0 ? (
            <div className="mas-empty">
              No hay previas sin mesa disponibles para esta área, fecha y turno.
            </div>
          ) : (
            <div className="mas-tabla-wrap">
              <table className="mas-tabla">
                <thead>
                  <tr>
                    <th>Seleccionar</th>
                    <th>DNI</th>
                    <th>Alumno</th>
                    <th>Curso</th>
                    <th>Materia</th>
                    <th>Docente</th>
                  </tr>
                </thead>
                <tbody>
                  {previas.map((previa) => {
                    const activa = String(previaSeleccionada?.id_previa) === String(previa.id_previa);
                    return (
                      <tr key={previa.id_previa} className={activa ? "seleccionada" : ""}>
                        <td>
                          <button
                            type="button"
                            className={`mas-radio ${activa ? "activo" : ""}`}
                            onClick={() => setPreviaSeleccionada(previa)}
                            title="Seleccionar previa"
                          >
                            {activa && <FontAwesomeIcon icon={faCheck} />}
                          </button>
                        </td>
                        <td>{texto(previa.dni)}</td>
                        <td>{texto(previa.alumno)}</td>
                        <td>{texto(previa.curso)}</td>
                        <td>{texto(previa.materia)}</td>
                        <td>{texto(previa.docente)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer className="mas-modal-footer">
          <button type="button" className="mas-btn cancelar" onClick={onClose} disabled={agregando}>
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
