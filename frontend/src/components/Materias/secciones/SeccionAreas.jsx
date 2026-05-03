import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faEdit, faLayerGroup, faPlus, faRotateRight, faTrash } from "@fortawesome/free-solid-svg-icons";

const SeccionAreas = ({
  cargando,
  areas = [],
  areasFiltradas = [],
  onVolver,
  onRefresh,
  onNueva,
  onEditar,
  onEliminar,
}) => {
  return (
    <section className="materias-card subsection-card">
      <div className="materias-card-header">
        <div>
          <h2>
            <FontAwesomeIcon icon={faLayerGroup} /> Áreas
          </h2>
          <p>Creá áreas y agregales las materias que correspondan desde un desplegable.</p>
        </div>

        <div className="materias-header-actions">
          <button className="materias-btn ghost" type="button" onClick={onVolver}>
            <FontAwesomeIcon icon={faArrowLeft} />
            Volver a materias
          </button>

          <button className="materias-btn ghost" onClick={onRefresh} disabled={cargando} type="button">
            <FontAwesomeIcon icon={faRotateRight} />
            {cargando ? "Actualizando..." : "Actualizar"}
          </button>

          <button className="materias-btn primary" type="button" onClick={onNueva}>
            <FontAwesomeIcon icon={faPlus} />
            Nueva área
          </button>
        </div>
      </div>

      <div className="subsection-summary">
        <span>Total áreas: <b>{areas.length}</b></span>
        <span>Visibles: <b>{areasFiltradas.length}</b></span>
      </div>

      <div className="materias-table-wrap">
        <table className="materias-table">
          <thead>
            <tr>
              <th>Área</th>
              <th>Cantidad materias</th>
              <th>Materias incluidas</th>
              <th>Estado</th>
              <th className="acciones">Acciones</th>
            </tr>
          </thead>

          <tbody>
            {areasFiltradas.length === 0 ? (
              <tr>
                <td colSpan="5" className="empty">
                  {cargando ? "Cargando..." : "No hay áreas cargadas."}
                </td>
              </tr>
            ) : (
              areasFiltradas.map((a) => (
                <tr key={a.id_area}>
                  <td><strong>{a.area}</strong></td>
                  <td>{a.cantidad_materias || 0}</td>
                  <td>{a.materias || "-"}</td>
                  <td>
                    <span className={`badge ${Number(a.activo) === 1 ? "ok" : "off"}`}>
                      {Number(a.activo) === 1 ? "ACTIVA" : "INACTIVA"}
                    </span>
                  </td>
                  <td className="acciones">
                    <button className="icon-btn" title="Editar" onClick={() => onEditar(a)} type="button">
                      <FontAwesomeIcon icon={faEdit} />
                    </button>
                    <button className="icon-btn danger" title="Eliminar" onClick={() => onEliminar(a)} type="button">
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default SeccionAreas;
