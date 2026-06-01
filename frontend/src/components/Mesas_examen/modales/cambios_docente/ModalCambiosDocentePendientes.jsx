import React from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEdit,
  faSpinner,
  faTimes,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import "../../../Global/Global_css/Global_Modals.css";
import "./ModalCambiosDocentePendientes.css";

const textoCorto = (valor, fallback = "-") => {
  const texto = String(valor || "").trim();
  return texto || fallback;
};

const ModalCambiosDocentePendientes = ({
  abierto = false,
  cambios = [],
  cargando = false,
  resolviendoId = null,
  ignorandoId = null,
  onClose,
  onAplicar,
  onIgnorar,
  onAbrirMesa,
}) => {
  if (!abierto) return null;

  const lista = Array.isArray(cambios) ? cambios : [];

  const contenido = (
    <div
      className="gm-modalOverlay docenteCambio-modalOverlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="docente-cambio-title"
      aria-describedby="docente-cambio-desc"
      data-mesa-modal-root="true"
    >
      <div className="gm-modal docenteCambio-modal">
        <header className="gm-modal__header docenteCambio-modal__header">
          <span className="gm-modal__headIcon docenteCambio-modal__headIcon" aria-hidden="true">
            <FontAwesomeIcon icon={faTriangleExclamation} />
          </span>

          <div className="gm-modal__headText docenteCambio-modal__headText">
            <h2 id="docente-cambio-title">Cambios de docente detectados</h2>
            <p id="docente-cambio-desc">
              Hay números de mesa armados con una cátedra cuyo docente fue modificado. Revisalos para evitar cruces o docentes incorrectos en el armado.
            </p>
          </div>

          <button type="button" className="gm-modal__close docenteCambio-modal__close" onClick={onClose} title="Cerrar" aria-label="Cerrar modal">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </header>

        <div className="gm-modal__content docenteCambio-modal__content">
          {cargando ? (
            <div className="gm-emptySchedule docenteCambio-empty docenteCambio-empty--loading">
              <span className="gm-emptySchedule__icon docenteCambio-empty__icon" aria-hidden="true">
                <FontAwesomeIcon icon={faSpinner} spin />
              </span>
              <strong>Buscando cambios pendientes...</strong>
              <span>Estamos revisando si quedaron mesas con docentes modificados.</span>
            </div>
          ) : lista.length === 0 ? (
            <div className="gm-emptySchedule docenteCambio-empty">
              <span className="gm-emptySchedule__icon docenteCambio-empty__icon" aria-hidden="true">
                <FontAwesomeIcon icon={faTriangleExclamation} />
              </span>
              <strong>No hay cambios pendientes.</strong>
              <span>Las mesas armadas están sincronizadas con los docentes actuales.</span>
            </div>
          ) : (
            <div className="docenteCambio-list">
              {lista.map((cambio) => {
                const id = Number(cambio?.id_cambio || 0);
                const ocupado = resolviendoId === id || ignorandoId === id;

                return (
                  <article key={id || `${cambio?.numero_mesa}-${cambio?.id_catedra}`} className="gm-panel docenteCambio-item">
                    <div className="gm-panel__body docenteCambio-item__body">
                      <div className="docenteCambio-cardGrid" aria-label="Detalle del cambio de docente pendiente">
                        <section className="docenteCambio-infoCard docenteCambio-infoCard--mesa">
                          <span className="docenteCambio-infoCard__label">Mesa</span>
                          <strong>Mesa N° {textoCorto(cambio?.numero_mesa)}</strong>
                          <p>
                            {cambio?.numero_grupo ? `Grupo ${cambio.numero_grupo}` : "Grupo sin especificar"}
                            <span>{textoCorto(cambio?.materia, "Materia sin especificar")}</span>
                          </p>
                        </section>

                        <section className="docenteCambio-infoCard">
                          <span className="docenteCambio-infoCard__label">Fecha y turno</span>
                          <strong>{textoCorto(cambio?.fecha_mesa_texto || cambio?.fecha_mesa, "Sin fecha")}</strong>
                          <p>{textoCorto(cambio?.turno, "Sin turno")}</p>
                        </section>

                        <section className="docenteCambio-infoCard">
                          <span className="docenteCambio-infoCard__label">Docente anterior</span>
                          <strong>{textoCorto(cambio?.docente_anterior, "Sin docente")}</strong>
                          <p>Docente que tenía la cátedra cuando se armó la mesa.</p>
                        </section>

                        <section className="docenteCambio-infoCard docenteCambio-infoCard--nuevo">
                          <span className="docenteCambio-infoCard__label">Docente nuevo</span>
                          <strong>{textoCorto(cambio?.docente_nuevo, "Sin docente")}</strong>
                          <p>Docente actual detectado para la cátedra.</p>
                        </section>
                      </div>
                    </div>

                    <footer className="gm-modal__actions docenteCambio-item__actions" aria-label="Acciones del cambio de docente">
                      <button
                        type="button"
                        className="gm-btn gm-btn--soft docenteCambio-btn docenteCambio-btn--ver"
                        onClick={() => onAbrirMesa?.(cambio)}
                        disabled={ocupado}
                      >
                        Ver mesa
                      </button>

                      <button
                        type="button"
                        className="gm-btn gm-btn--primary docenteCambio-btn docenteCambio-btn--aplicar"
                        onClick={() => onAplicar?.(cambio)}
                        disabled={ocupado}
                      >
                        {resolviendoId === id ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faEdit} />}
                        Aplicar y editar
                      </button>

                      <button
                        type="button"
                        className="gm-btn gm-btn--ghost docenteCambio-btn docenteCambio-btn--danger"
                        onClick={() => onIgnorar?.(cambio)}
                        disabled={ocupado}
                      >
                        {ignorandoId === id ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faTimes} />}
                        Ignorar
                      </button>
                    </footer>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(contenido, document.body) : contenido;
};

export default ModalCambiosDocentePendientes;
