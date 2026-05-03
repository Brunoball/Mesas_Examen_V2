// src/components/Materias/modales/ModalMateria.jsx
import React, { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBook, faSave, faTimes } from "@fortawesome/free-solid-svg-icons";

const ModalMateria = ({ item, areas = [], onClose, onSave }) => {
  const idsIniciales = useMemo(() => {
    if (!item?.ids_areas) return [];
    return String(item.ids_areas).split(",").filter(Boolean).map(Number);
  }, [item]);

  const [materia, setMateria] = useState(item?.materia || "");
  const [activo, setActivo] = useState(item ? Number(item.activo) === 1 : true);
  const [idsAreas, setIdsAreas] = useState(idsIniciales);

  const toggleArea = (id) => {
    setIdsAreas((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const guardar = (e) => {
    e.preventDefault();
    onSave({
      id_materia: item?.id_materia || null,
      materia,
      activo,
      ids_areas: idsAreas,
    });
  };

  return (
    <div className="materias-modal-overlay">
      <form className="materias-modal" onSubmit={guardar}>
        <div className="materias-modal-header">
          <div className="materias-modal-icon"><FontAwesomeIcon icon={faBook} /></div>
          <div>
            <h3>{item ? "Editar materia" : "Nueva materia"}</h3>
            <p>El nombre se guardará en mayúsculas desde el backend.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}><FontAwesomeIcon icon={faTimes} /></button>
        </div>

        <label className="form-label">
          Nombre de la materia
          <input value={materia} onChange={(e) => setMateria(e.target.value.toUpperCase())} placeholder="EJ: MATEMÁTICA" autoFocus />
        </label>

        <div className="form-label">
          Áreas relacionadas
          <div className="check-grid">
            {areas.length === 0 ? <span className="muted">No hay áreas cargadas.</span> : areas.map((a) => (
              <label key={a.id_area} className="check-item">
                <input type="checkbox" checked={idsAreas.includes(Number(a.id_area))} onChange={() => toggleArea(Number(a.id_area))} />
                {a.area}
              </label>
            ))}
          </div>
        </div>

        <label className="check-inline">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          Materia activa
        </label>

        <div className="modal-actions">
          <button type="button" className="materias-btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="materias-btn primary"><FontAwesomeIcon icon={faSave} /> Guardar</button>
        </div>
      </form>
    </div>
  );
};

export default ModalMateria;
