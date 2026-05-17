// src/components/Mesas_examen/modales/persona/ModalMoverPreviaMesa.jsx
import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faSpinner, faTimes } from "@fortawesome/free-solid-svg-icons";

import "./persona.css";

const texto = (valor, fallback = "-") => {
  const salida = String(valor ?? "").trim();
  return salida || fallback;
};

const ModalMoverPreviaMesa = ({ abierto, previa, destinosData, cargando, moviendo, error, onClose, onConfirm }) => {
  const [numeroSeleccionado, setNumeroSeleccionado] = useState("");

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

  const puedeConfirmar = !!destinoSeleccionado?.valido && !moviendo && !cargando;

  return (
    <div className="persona-modal-overlay persona-modal-overlay-top" role="dialog" aria-modal="true">
      <div className="persona-modal persona-modal-mover">
        <header className="persona-modal-header">
          <div>
            <h3>Mover previa de {texto(previa?.alumno)}</h3>
            <p>Materia: <strong>{texto(previa?.materia)}</strong></p>
            <p>Mesa actual: <strong>N° {texto(previa?.numero_mesa)}</strong></p>
            {destinosData?.area && <p>Área destino: <strong>{destinosData.area}</strong></p>}
          </div>
          <button type="button" className="persona-close" onClick={onClose} aria-label="Cerrar" disabled={moviendo}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </header>

        <section className="persona-modal-body persona-modal-body-scroll">
          {cargando ? (
            <div className="persona-loading">
              <FontAwesomeIcon icon={faSpinner} spin /> Buscando números compatibles del área...
            </div>
          ) : error ? (
            <div className="persona-error">{error}</div>
          ) : destinos.length === 0 ? (
            <div className="persona-empty">No hay otros números de mesa disponibles dentro del área de esta materia.</div>
          ) : (
            <div className="persona-table-wrap">
              <table className="persona-table persona-table-mover">
                <thead>
                  <tr>
                    <th>Seleccionar</th>
                    <th>N° Mesa</th>
                    <th>Fecha</th>
                    <th>Turno</th>
                    <th>Materia</th>
                    <th>Docente</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {destinos.map((destino) => {
                    const errores = Array.isArray(destino.errores) ? destino.errores : [];
                    return (
                      <tr key={destino.numero_mesa} className={!destino.valido ? "persona-row-disabled" : ""}>
                        <td>
                          <input
                            type="radio"
                            name="numero-destino-previa"
                            value={destino.numero_mesa}
                            checked={String(numeroSeleccionado) === String(destino.numero_mesa)}
                            disabled={!destino.valido || moviendo}
                            onChange={(e) => setNumeroSeleccionado(e.target.value)}
                          />
                        </td>
                        <td>{texto(destino.numero_mesa)}</td>
                        <td>{texto(destino.fecha)}</td>
                        <td>{texto(destino.turno)}</td>
                        <td>{texto(destino.materia)}</td>
                        <td>{texto(destino.docente)}</td>
                        <td>
                          {destino.valido ? (
                            <span className="persona-status-ok">Disponible</span>
                          ) : (
                            <span className="persona-status-bad" title={errores.join(" | ")}>Bloqueada</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!cargando && !error && destinoSeleccionado && !destinoSeleccionado.valido && (
            <div className="persona-error persona-error-small">
              {(destinoSeleccionado.errores || ["El destino seleccionado no es válido."]).join(" ")}
            </div>
          )}
        </section>

        <footer className="persona-modal-footer persona-modal-footer-actions">
          <button type="button" className="persona-btn-secondary" onClick={onClose} disabled={moviendo}>Cancelar</button>
          <button
            type="button"
            className="persona-btn-primary"
            disabled={!puedeConfirmar}
            onClick={() => onConfirm(destinoSeleccionado)}
          >
            <FontAwesomeIcon icon={moviendo ? faSpinner : faCheck} spin={moviendo} />
            Mover previa
          </button>
        </footer>
      </div>
    </div>
  );
};

export default ModalMoverPreviaMesa;
