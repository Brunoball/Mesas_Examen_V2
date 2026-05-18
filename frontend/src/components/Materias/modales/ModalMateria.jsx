// src/components/Materias/modales/ModalMateria.jsx
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBook,
  faCheckCircle,
  faLayerGroup,
  faSave,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";
import "../../Global/Global_css/Global_Modals.css";
import "./ModalMaterias.css";

const TAB_FICHA = "ficha";
const TAB_AREAS = "areas";

const ModalMateria = ({ item, areas = [], onClose, onSave }) => {
  const idsIniciales = useMemo(() => {
    if (!item?.ids_areas) return [];
    return String(item.ids_areas).split(",").filter(Boolean).map(Number);
  }, [item]);

  const [pestaniaActiva, setPestaniaActiva] = useState(TAB_FICHA);
  const [materia, setMateria] = useState(item?.materia || "");
  const [activo, setActivo] = useState(item ? Number(item.activo) === 1 : true);
  const [idsAreas, setIdsAreas] = useState(idsIniciales);
  const [error, setError] = useState("");

  useEffect(() => {
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      onClose?.();
    };

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onClose]);

  const toggleArea = (id) => {
    setIdsAreas((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const guardar = (e) => {
    e.preventDefault();

    if (!materia.trim()) {
      setPestaniaActiva(TAB_FICHA);
      setError("El nombre de la materia es obligatorio.");
      return;
    }

    setError("");
    onSave({
      id_materia: item?.id_materia || null,
      materia: materia.trim(),
      activo,
      ids_areas: idsAreas,
    });
  };

  return createPortal(
    <div
      className="gm-modalOverlay materias-modal-overlay"
      role="presentation"
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <form
        className="gm-modal gm-modal--materias materias-modal materias-editor-modal"
        onSubmit={guardar}
        role="dialog"
        aria-modal="true"
        aria-labelledby="materia-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gm-modal__header materias-modal-header">
          <div className="gm-modal__headIcon materias-modal-icon" aria-hidden="true">
            <FontAwesomeIcon icon={faBook} />
          </div>

          <div className="gm-modal__headText">
            <h2 id="materia-modal-title">{item ? "Editar materia" : "Nueva materia"}</h2>
            <p>Completá los datos principales y vinculá las áreas desde una vista ordenada.</p>
          </div>

          <button type="button" className="gm-modal__close modal-close" onClick={onClose} aria-label="Cerrar modal">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="gm-modal__content materias-editor-content">
          {error && (
            <div className="gm-alert gm-alert--error gm-alert--banner materias-editor-alert">
              {error}
            </div>
          )}

          <div className="gm-tabs gm-tabs--google materias-modal-tabs" role="tablist" aria-label="Secciones de la materia">
            <button
              type="button"
              role="tab"
              id="materia-tab-ficha"
              aria-controls="materia-panel-ficha"
              aria-selected={pestaniaActiva === TAB_FICHA}
              className={`gm-tab${pestaniaActiva === TAB_FICHA ? " is-active" : ""}`}
              onClick={() => setPestaniaActiva(TAB_FICHA)}
            >
              <FontAwesomeIcon icon={faBook} />
              <span>Ficha principal</span>
            </button>

            <button
              type="button"
              role="tab"
              id="materia-tab-areas"
              aria-controls="materia-panel-areas"
              aria-selected={pestaniaActiva === TAB_AREAS}
              className={`gm-tab${pestaniaActiva === TAB_AREAS ? " is-active" : ""}`}
              onClick={() => setPestaniaActiva(TAB_AREAS)}
            >
              <FontAwesomeIcon icon={faLayerGroup} />
              <span>Áreas relacionadas</span>
              {idsAreas.length > 0 && <span className="gm-tab__badge">{idsAreas.length}</span>}
            </button>
          </div>

          {pestaniaActiva === TAB_FICHA && (
            <section className="gm-panel materias-editor-panel" id="materia-panel-ficha" role="tabpanel" aria-labelledby="materia-tab-ficha">
              <div className="gm-panel__head">
                <div>
                  <span className="gm-panel__eyebrow">Ficha principal</span>
                  <h3>
                    <FontAwesomeIcon icon={faBook} />
                    Datos de la materia
                  </h3>
                </div>
                <span className="gm-panel__tag">Obligatorio</span>
              </div>

              <div className="gm-panel__body">
                <div className="gm-formRow gm-formRow--split materias-editor-mainRow">
                  <label className="gm-field">
                    <input
                      className="gm-input"
                      value={materia}
                      onChange={(e) => setMateria(e.target.value.toUpperCase())}
                      placeholder=" "
                      autoFocus
                    />
                    <span className="gm-label">Nombre de la materia</span>
                  </label>

                  <div className="gm-field gm-field--status materias-editor-status">
                    <div className="gm-statusToggle" role="group" aria-label="Estado de la materia">
                      <button
                        type="button"
                        className={`gm-statusToggle__btn ${activo ? "is-active" : ""}`}
                        onClick={() => setActivo(true)}
                      >
                        <FontAwesomeIcon icon={faCheckCircle} />
                        Activa
                      </button>

                      <button
                        type="button"
                        className={`gm-statusToggle__btn gm-statusToggle__btn--danger ${!activo ? "is-active" : ""}`}
                        onClick={() => setActivo(false)}
                      >
                        Inactiva
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {pestaniaActiva === TAB_AREAS && (
            <section className="gm-panel materias-editor-panel" id="materia-panel-areas" role="tabpanel" aria-labelledby="materia-tab-areas">
              <div className="gm-panel__head gm-panel__head--split">
                <div>
                  <span className="gm-panel__eyebrow">Agrupación</span>
                  <h3>
                    <FontAwesomeIcon icon={faLayerGroup} />
                    Áreas relacionadas
                  </h3>
                </div>
                <span className="gm-panel__tag">{idsAreas.length} seleccionada{idsAreas.length === 1 ? "" : "s"}</span>
              </div>

              <div className="gm-panel__body">
                <div className="materias-modalCheckGrid materias-editor-checkGrid">
                  {areas.length === 0 ? (
                    <div className="gm-emptySchedule materias-modalEmpty">
                      <strong>No hay áreas cargadas.</strong>
                      <span>Podés guardar la materia sin área y vincularla más adelante.</span>
                    </div>
                  ) : (
                    areas.map((a) => (
                      <label key={a.id_area} className={`materias-modalCheck ${idsAreas.includes(Number(a.id_area)) ? "is-checked" : ""}`}>
                        <input
                          type="checkbox"
                          checked={idsAreas.includes(Number(a.id_area))}
                          onChange={() => toggleArea(Number(a.id_area))}
                        />
                        <span>{a.area}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </section>
          )}
        </div>

        <div className="gm-modal__actions modal-actions materias-editor-actions">
          <button type="button" className="gm-btn gm-btn--ghost" onClick={onClose}>
            Cancelar
          </button>

          <button type="submit" className="gm-btn gm-btn--primary">
            <FontAwesomeIcon icon={faSave} />
            Guardar materia
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
};

export default ModalMateria;
