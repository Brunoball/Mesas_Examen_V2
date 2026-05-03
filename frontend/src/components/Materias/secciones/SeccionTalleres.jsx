import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faEdit, faFlask, faPlus, faRotateRight, faTrash } from "@fortawesome/free-solid-svg-icons";

const SeccionTalleres = ({
  cargando,
  talleres = [],
  talleresFiltrados = [],
  onVolver,
  onRefresh,
  onNuevo,
  onEditar,
  onEliminar,
}) => {
  return (
    <section className="materias-card subsection-card">
      <div className="materias-card-header">
        <div>
          <h2>
            <FontAwesomeIcon icon={faFlask} /> Talleres
          </h2>
          <p>Cada taller pertenece a un curso/año y contiene únicamente materias de ese curso según cátedras.</p>
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

          <button className="materias-btn primary" type="button" onClick={onNuevo}>
            <FontAwesomeIcon icon={faPlus} />
            Nuevo taller
          </button>
        </div>
      </div>

      <div className="subsection-summary">
        <span>Total talleres: <b>{talleres.length}</b></span>
        <span>Visibles: <b>{talleresFiltrados.length}</b></span>
      </div>

      <div className="materias-table-wrap">
        <table className="materias-table">
          <thead>
            <tr>
              <th>Taller</th>
              <th>Curso</th>
              <th>Cantidad materias</th>
              <th>Materias incluidas</th>
              <th>Estado</th>
              <th className="acciones">Acciones</th>
            </tr>
          </thead>

          <tbody>
            {talleresFiltrados.length === 0 ? (
              <tr>
                <td colSpan="6" className="empty">
                  {cargando ? "Cargando..." : "No hay talleres cargados."}
                </td>
              </tr>
            ) : (
              talleresFiltrados.map((t) => (
                <tr key={t.id_taller}>
                  <td><strong>{t.taller}</strong></td>
                  <td>{t.curso || "-"}</td>
                  <td>{t.cantidad_materias || 0}</td>
                  <td>{t.materias || "-"}</td>
                  <td>
                    <span className={`badge ${Number(t.activo) === 1 ? "ok" : "off"}`}>
                      {Number(t.activo) === 1 ? "ACTIVO" : "INACTIVO"}
                    </span>
                  </td>
                  <td className="acciones">
                    <button className="icon-btn" title="Editar" onClick={() => onEditar(t)} type="button">
                      <FontAwesomeIcon icon={faEdit} />
                    </button>
                    <button className="icon-btn danger" title="Eliminar" onClick={() => onEliminar(t)} type="button">
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

export default SeccionTalleres;
