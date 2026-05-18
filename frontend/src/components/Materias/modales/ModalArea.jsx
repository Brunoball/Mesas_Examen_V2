// src/components/Materias/modales/ModalArea.jsx
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBook,
  faCheckCircle,
  faLayerGroup,
  faPlus,
  faSave,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";
import "../../Global/Global_css/Global_Modals.css";
import "./ModalMaterias.css";

const TAB_FICHA = "ficha";
const TAB_MATERIAS = "materias";

const parseIds = (valor) => {
  if (!valor) return [];
  return String(valor)
    .split(",")
    .map((x) => Number(x))
    .filter((x) => x > 0);
};

const ModalArea = ({ item, materias = [], onClose, onSave }) => {
  const idsIniciales = useMemo(() => parseIds(item?.ids_materias), [item]);

  const [pestaniaActiva, setPestaniaActiva] = useState(TAB_FICHA);
  const [area, setArea] = useState(item?.area || "");
  const [activo, setActivo] = useState(item ? Number(item.activo) === 1 : true);
  const [idsMaterias, setIdsMaterias] = useState(idsIniciales);
  const [idMateriaSeleccionada, setIdMateriaSeleccionada] = useState("");
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

  const materiasActivas = useMemo(() => {
    return materias
      .filter((m) => Number(m.activo ?? 1) === 1)
      .sort((a, b) => String(a.materia).localeCompare(String(b.materia), "es"));
  }, [materias]);

  const materiasSeleccionadas = useMemo(() => {
    return idsMaterias
      .map((id) => materiasActivas.find((m) => Number(m.id_materia) === Number(id)))
      .filter(Boolean);
  }, [idsMaterias, materiasActivas]);

  const materiasDisponibles = useMemo(() => {
    return materiasActivas.filter((m) => !idsMaterias.includes(Number(m.id_materia)));
  }, [materiasActivas, idsMaterias]);

  const agregarMateria = () => {
    const id = Number(idMateriaSeleccionada);
    if (id <= 0) return;

    setIdsMaterias((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setIdMateriaSeleccionada("");
  };

  const quitarMateria = (id) => {
    setIdsMaterias((prev) => prev.filter((x) => Number(x) !== Number(id)));
  };

  const guardar = (e) => {
    e.preventDefault();

    if (!area.trim()) {
      setPestaniaActiva(TAB_FICHA);
      setError("El nombre del área es obligatorio.");
      return;
    }

    setError("");
    onSave({
      id_area: item?.id_area || null,
      area: area.trim(),
      activo,
      materias: idsMaterias,
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
        className="gm-modal gm-modal--materias-lg materias-modal materias-editor-modal large"
        onSubmit={guardar}
        role="dialog"
        aria-modal="true"
        aria-labelledby="area-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gm-modal__header materias-modal-header">
          <div className="gm-modal__headIcon materias-modal-icon" aria-hidden="true">
            <FontAwesomeIcon icon={faLayerGroup} />
          </div>

          <div className="gm-modal__headText">
            <h2 id="area-modal-title">{item ? "Editar área" : "Nueva área"}</h2>
            <p>Organizá el área y asociá sus materias desde pestañas simples.</p>
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

          <div className="gm-tabs gm-tabs--google materias-modal-tabs" role="tablist" aria-label="Secciones del área">
            <button
              type="button"
              role="tab"
              id="area-tab-ficha"
              aria-controls="area-panel-ficha"
              aria-selected={pestaniaActiva === TAB_FICHA}
              className={`gm-tab${pestaniaActiva === TAB_FICHA ? " is-active" : ""}`}
              onClick={() => setPestaniaActiva(TAB_FICHA)}
            >
              <FontAwesomeIcon icon={faLayerGroup} />
              <span>Ficha principal</span>
            </button>

            <button
              type="button"
              role="tab"
              id="area-tab-materias"
              aria-controls="area-panel-materias"
              aria-selected={pestaniaActiva === TAB_MATERIAS}
              className={`gm-tab${pestaniaActiva === TAB_MATERIAS ? " is-active" : ""}`}
              onClick={() => setPestaniaActiva(TAB_MATERIAS)}
            >
              <FontAwesomeIcon icon={faBook} />
              <span>Materias del área</span>
              {materiasSeleccionadas.length > 0 && (
                <span className="gm-tab__badge">{materiasSeleccionadas.length}</span>
              )}
            </button>
          </div>

          {pestaniaActiva === TAB_FICHA && (
            <section className="gm-panel materias-editor-panel" id="area-panel-ficha" role="tabpanel" aria-labelledby="area-tab-ficha">
              <div className="gm-panel__head">
                <div>
                  <span className="gm-panel__eyebrow">Ficha principal</span>
                  <h3>
                    <FontAwesomeIcon icon={faLayerGroup} />
                    Datos del área
                  </h3>
                </div>
                <span className="gm-panel__tag">Obligatorio</span>
              </div>

              <div className="gm-panel__body">
                <div className="gm-formRow gm-formRow--split materias-editor-mainRow">
                  <label className="gm-field">
                    <input
                      className="gm-input"
                      value={area}
                      onChange={(e) => setArea(e.target.value.toUpperCase())}
                      placeholder=" "
                      autoFocus
                    />
                    <span className="gm-label">Nombre del área</span>
                  </label>

                  <div className="gm-field gm-field--status materias-editor-status">
                    <div className="gm-statusToggle" role="group" aria-label="Estado del área">
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

          {pestaniaActiva === TAB_MATERIAS && (
            <section className="gm-panel materias-editor-panel" id="area-panel-materias" role="tabpanel" aria-labelledby="area-tab-materias">
              <div className="gm-panel__head gm-panel__head--split">
                <div>
                  <span className="gm-panel__eyebrow">Materias del área</span>
                  <h3>
                    <FontAwesomeIcon icon={faBook} />
                    Vinculación de materias
                  </h3>
                </div>
                <span className="gm-panel__tag">{materiasSeleccionadas.length} agregada{materiasSeleccionadas.length === 1 ? "" : "s"}</span>
              </div>

              <div className="gm-panel__body">
                <div className="area-add-row materias-modalAddRow materias-editor-addRow">
                  <label className="gm-field">
                    <select
                      className="gm-input gm-select"
                      value={idMateriaSeleccionada}
                      onChange={(e) => setIdMateriaSeleccionada(e.target.value)}
                    >
                      <option value="">Seleccionar materia</option>
                      {materiasDisponibles.map((m) => (
                        <option key={m.id_materia} value={m.id_materia}>
                          {m.materia}
                        </option>
                      ))}
                    </select>
                    <span className="gm-label is-up">Materia</span>
                  </label>

                  <button type="button" className="gm-btn gm-btn--soft" onClick={agregarMateria} disabled={!idMateriaSeleccionada}>
                    <FontAwesomeIcon icon={faPlus} />
                    Agregar
                  </button>
                </div>

                {materiasSeleccionadas.length === 0 ? (
                  <div className="gm-emptySchedule materias-modalEmpty">
                    <strong>Todavía no agregaste materias.</strong>
                    <span>Seleccioná una materia del listado y presioná Agregar.</span>
                  </div>
                ) : (
                  <div className="chip-list area-chip-list materias-modalChipList materias-editor-chipList">
                    {materiasSeleccionadas.map((m) => (
                      <span className="chip materias-modalChip" key={m.id_materia}>
                        {m.materia}
                        <button type="button" onClick={() => quitarMateria(m.id_materia)} title="Quitar materia">
                          <FontAwesomeIcon icon={faTimes} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
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
            Guardar área
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
};

export default ModalArea;
