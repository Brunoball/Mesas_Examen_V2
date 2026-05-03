// src/components/Materias/modales/ModalArea.jsx
import React, { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLayerGroup, faPlus, faSave, faTimes } from "@fortawesome/free-solid-svg-icons";

const parseIds = (valor) => {
  if (!valor) return [];
  return String(valor)
    .split(",")
    .map((x) => Number(x))
    .filter((x) => x > 0);
};

const ModalArea = ({ item, materias = [], onClose, onSave }) => {
  const idsIniciales = useMemo(() => parseIds(item?.ids_materias), [item]);

  const [area, setArea] = useState(item?.area || "");
  const [activo, setActivo] = useState(item ? Number(item.activo) === 1 : true);
  const [idsMaterias, setIdsMaterias] = useState(idsIniciales);
  const [idMateriaSeleccionada, setIdMateriaSeleccionada] = useState("");
  const [error, setError] = useState("");

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

  return (
    <div className="materias-modal-overlay">
      <form className="materias-modal large" onSubmit={guardar}>
        <div className="materias-modal-header">
          <div className="materias-modal-icon">
            <FontAwesomeIcon icon={faLayerGroup} />
          </div>
          <div>
            <h3>{item ? "Editar área" : "Nueva área"}</h3>
            <p>Creá el área y agregá las materias desde el desplegable. Podés seleccionar varias.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        {error && <div className="modal-inline-error">{error}</div>}

        <div className="form-grid two">
          <label className="form-label">
            Nombre del área
            <input
              value={area}
              onChange={(e) => setArea(e.target.value.toUpperCase())}
              placeholder="EJ: MATEMÁTICAS"
              autoFocus
            />
          </label>

          <label className="check-inline top-check">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Área activa
          </label>
        </div>

        <div className="taller-box area-box">
          <div className="taller-box-title-row">
            <div>
              <h4>Materias del área</h4>
              <p className="muted">Seleccioná una materia y agregala. Las materias agregadas aparecen abajo.</p>
            </div>
          </div>

          <div className="area-add-row">
            <select value={idMateriaSeleccionada} onChange={(e) => setIdMateriaSeleccionada(e.target.value)}>
              <option value="">Seleccionar materia</option>
              {materiasDisponibles.map((m) => (
                <option key={m.id_materia} value={m.id_materia}>
                  {m.materia}
                </option>
              ))}
            </select>

            <button type="button" className="materias-btn ghost" onClick={agregarMateria} disabled={!idMateriaSeleccionada}>
              <FontAwesomeIcon icon={faPlus} />
              Agregar
            </button>
          </div>

          {materiasSeleccionadas.length === 0 ? (
            <div className="asignar-empty">
              <span className="muted">Todavía no agregaste materias a esta área.</span>
            </div>
          ) : (
            <div className="chip-list area-chip-list">
              {materiasSeleccionadas.map((m) => (
                <span className="chip" key={m.id_materia}>
                  {m.materia}
                  <button type="button" onClick={() => quitarMateria(m.id_materia)} title="Quitar materia">
                    <FontAwesomeIcon icon={faTimes} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="materias-btn ghost" onClick={onClose}>
            Cancelar
          </button>

          <button type="submit" className="materias-btn primary">
            <FontAwesomeIcon icon={faSave} />
            Guardar área
          </button>
        </div>
      </form>
    </div>
  );
};

export default ModalArea;
