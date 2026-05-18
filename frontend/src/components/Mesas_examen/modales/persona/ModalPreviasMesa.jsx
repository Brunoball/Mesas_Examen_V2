// src/components/Mesas_examen/modales/persona/ModalPreviasMesa.jsx
import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faExchangeAlt, faSpinner, faTimes, faTrash } from "@fortawesome/free-solid-svg-icons";

import "./persona.css";

const texto = (valor, fallback = "-") => {
  const salida = String(valor ?? "").trim();
  return salida || fallback;
};

const ModalPreviasMesa = ({ abierto, numero, data, cargando, error, onClose, onMover, onEliminar }) => {
  if (!abierto) return null;

  const numeroMesa = numero?.numero_mesa || data?.numero_mesa || "-";
  const previas = Array.isArray(data?.previas) ? data.previas : [];

  return (
    <div className="persona-modal-overlay" role="dialog" aria-modal="true">
      <div className="persona-modal persona-modal-previas">
        <header className="persona-modal-header">
          <div>
            <h3>Previas de la mesa N° {texto(numeroMesa)}</h3>
            {data?.meta?.area && <p>{data.meta.area}</p>}
          </div>
          <button type="button" className="persona-close" onClick={onClose} aria-label="Cerrar">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </header>

        <section className="persona-modal-body">
          {cargando ? (
            <div className="persona-loading">
              <FontAwesomeIcon icon={faSpinner} spin /> Cargando previas...
            </div>
          ) : error ? (
            <div className="persona-error">{error}</div>
          ) : previas.length === 0 ? (
            <div className="persona-empty">Este número de mesa no tiene previas vinculadas.</div>
          ) : (
            <div className="persona-table-wrap">
              <table className="persona-table">
                <thead>
                  <tr>
                    <th>DNI</th>
                    <th>Alumno</th>
                    <th>Curso</th>
                    <th>Materia</th>
                    <th>Docente</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {previas.map((previa) => (
                    <tr key={`${previa.id_previa}-${previa.numero_mesa}`}>
                      <td>{texto(previa.dni)}</td>
                      <td>{texto(previa.alumno)}</td>
                      <td>{texto(previa.curso)}</td>
                      <td>{texto(previa.materia)}</td>
                      <td>{texto(previa.docente)}</td>
                      <td>
                        <div className="persona-actions">
                          <button
                            type="button"
                            className="persona-btn persona-btn-move"
                            title="Mover solo esta previa / alumno"
                            onClick={() => onMover(previa)}
                          >
                            <FontAwesomeIcon icon={faExchangeAlt} />
                          </button>
                          <button
                            type="button"
                            className="persona-btn persona-btn-delete"
                            title="Eliminar previa de esta mesa"
                            onClick={() => onEliminar(previa)}
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer className="persona-modal-footer">
          <button type="button" className="persona-btn-secondary" onClick={onClose}>Cerrar</button>
        </footer>
      </div>
    </div>
  );
};

export default ModalPreviasMesa;
