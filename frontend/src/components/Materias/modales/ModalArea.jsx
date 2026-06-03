// src/components/Materias/modales/ModalArea.jsx
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBook,
  faCheckCircle,
  faLayerGroup,
  faMagnifyingGlass,
  faPlus,
  faSave,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";
import "../../Global/Global_css/Global_Modals.css";
import "./ModalMaterias.css";

const TAB_FICHA = "ficha";
const TAB_MATERIAS = "materias";
const aMayusculas = (valor) => String(valor ?? "").toUpperCase();

const normalizar = (texto) =>
  String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const puntuarMateria = (materia, busqueda) => {
  const q = normalizar(busqueda);
  if (!q) return 0;

  const nombre = normalizar(materia?.materia);
  const areas = normalizar(materia?.areas);

  if (nombre === q) return 0;
  if (nombre.startsWith(q)) return 1;
  if (nombre.includes(q)) return 2;
  if (areas.includes(q)) return 3;

  return 99;
};

const parseIds = (valor) => {
  if (!valor) return [];
  return String(valor)
    .split(",")
    .map((x) => Number(x))
    .filter((x) => x > 0);
};

const ModalArea = ({ item, materias = [], onClose, onSave, onToast }) => {
  const idsIniciales = useMemo(() => parseIds(item?.ids_materias), [item]);

  const [pestaniaActiva, setPestaniaActiva] = useState(TAB_FICHA);
  const [area, setArea] = useState(aMayusculas(item?.area || ""));
  const [activo, setActivo] = useState(item ? Number(item.activo) === 1 : true);
  const [idsMaterias, setIdsMaterias] = useState(idsIniciales);
  const [idMateriaSeleccionada, setIdMateriaSeleccionada] = useState("");
  const [busquedaMateria, setBusquedaMateria] = useState("");

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

  useEffect(() => {
    setPestaniaActiva(TAB_FICHA);
    setArea(aMayusculas(item?.area || ""));
    setActivo(item ? Number(item.activo) === 1 : true);
    setIdsMaterias(parseIds(item?.ids_materias));
    setIdMateriaSeleccionada("");
    setBusquedaMateria("");
  }, [item]);

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
    const q = normalizar(busquedaMateria);

    return materiasActivas
      .filter((m) => !idsMaterias.includes(Number(m.id_materia)))
      .map((m) => ({
        materia: m,
        puntaje: puntuarMateria(m, q),
      }))
      .filter(({ puntaje }) => !q || puntaje < 99)
      .sort((a, b) => {
        if (a.puntaje !== b.puntaje) return a.puntaje - b.puntaje;
        return String(a.materia.materia || "").localeCompare(
          String(b.materia.materia || ""),
          "es"
        );
      })
      .map(({ materia }) => materia);
  }, [materiasActivas, idsMaterias, busquedaMateria]);

  useEffect(() => {
    if (!busquedaMateria.trim()) {
      setIdMateriaSeleccionada("");
      return;
    }

    const primeraMateria = materiasDisponibles[0];
    setIdMateriaSeleccionada(primeraMateria?.id_materia ? String(primeraMateria.id_materia) : "");
  }, [busquedaMateria, materiasDisponibles]);

  const agregarMateria = (idForzado = null) => {
    const id = Number(idForzado || idMateriaSeleccionada);
    if (id <= 0) return;

    setIdsMaterias((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setIdMateriaSeleccionada("");
    setBusquedaMateria("");
  };

  const quitarMateria = (id) => {
    setIdsMaterias((prev) => prev.filter((x) => Number(x) !== Number(id)));
  };

  const guardar = (e) => {
    e.preventDefault();

    if (!area.trim()) {
      setPestaniaActiva(TAB_FICHA);
      onToast?.("error", "El nombre del área es obligatorio.");
      return;
    }
    onSave({
      id_area: item?.id_area || null,
      area: aMayusculas(area).trim(),
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
            <p>Definí el área, su estado y las materias vinculadas sin recargar la vista.</p>
          </div>

          <button type="button" className="gm-modal__close modal-close" onClick={onClose} aria-label="Cerrar modal">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="gm-modal__content materias-editor-content">
          <div className="materias-editor-summary" aria-label="Resumen del área">
            <div className={`materias-editor-summaryItem ${activo ? "is-active" : "is-inactive"}`}>
              <span>Estado</span>
              <strong>{activo ? "Activa" : "Inactiva"}</strong>
            </div>

            <div className="materias-editor-summaryItem">
              <span>Materias</span>
              <strong>{materiasSeleccionadas.length} agregada{materiasSeleccionadas.length === 1 ? "" : "s"}</strong>
            </div>
          </div>

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
                  <span className="gm-panel__eyebrow">Datos principales</span>
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
                      onChange={(e) => setArea(aMayusculas(e.target.value))}
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
                  <span className="gm-panel__eyebrow">Vinculación</span>
                  <h3>
                    <FontAwesomeIcon icon={faBook} />
                    Vinculación de materias
                  </h3>
                </div>
                <span className="gm-panel__tag">{materiasSeleccionadas.length} agregada{materiasSeleccionadas.length === 1 ? "" : "s"}</span>
              </div>

              <div className="gm-panel__body">
                <div className="area-add-row materias-modalAddRow materias-editor-addRow materias-editor-addRow--withSearch">
                  <label className="gm-field materias-searchField">
                    <input
                      className="gm-input"
                      value={busquedaMateria}
                      onChange={(e) => setBusquedaMateria(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        const primeraMateria = materiasDisponibles[0];
                        agregarMateria(idMateriaSeleccionada || primeraMateria?.id_materia);
                      }}
                      placeholder=" "
                      autoComplete="off"
                    />
                    <span className="gm-label">Buscar materia</span>
                    <FontAwesomeIcon className="materias-searchField__icon" icon={faMagnifyingGlass} />
                  </label>

                  <label className="gm-field">
                    <select
                      className="gm-input gm-select"
                      value={idMateriaSeleccionada}
                      onChange={(e) => setIdMateriaSeleccionada(e.target.value)}
                    >
                      <option value="">
                        {busquedaMateria.trim() ? "Primera coincidencia seleccionada" : "Seleccionar materia"}
                      </option>
                      {materiasDisponibles.map((m) => (
                        <option key={m.id_materia} value={m.id_materia}>
                          {aMayusculas(m.materia)}
                        </option>
                      ))}
                    </select>
                    <span className="gm-label is-up">Materia</span>
                  </label>

                  <button type="button" className="gm-btn gm-btn--soft" onClick={() => agregarMateria()} disabled={!idMateriaSeleccionada}>
                    <FontAwesomeIcon icon={faPlus} />
                    Agregar
                  </button>
                </div>

                {busquedaMateria.trim() && materiasDisponibles.length === 0 && (
                  <div className="materias-searchEmpty">
                    No se encontraron materias disponibles con esa búsqueda.
                  </div>
                )}

                {materiasSeleccionadas.length === 0 ? (
                  <div className="gm-emptySchedule materias-modalEmpty">
                    <strong>Todavía no agregaste materias.</strong>
                    <span>Seleccioná una materia del listado y presioná Agregar.</span>
                  </div>
                ) : (
                  <div className="chip-list area-chip-list materias-modalChipList materias-editor-chipList">
                    {materiasSeleccionadas.map((m) => (
                      <span className="chip materias-modalChip" key={m.id_materia}>
                        {aMayusculas(m.materia)}
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
