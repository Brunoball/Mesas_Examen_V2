import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faDiagramProject, faEdit, faPlus, faRotateRight, faTrash } from "@fortawesome/free-solid-svg-icons";

const SeccionCorrelativas = ({
  cargando,
  correlativas = [],
  correlativasFiltradas = [],
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
            <FontAwesomeIcon icon={faDiagramProject} /> Correlativas
          </h2>
          <p>Reglas entre materias anteriores y posteriores. Las materias se filtran por curso desde cátedras.</p>
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
            Nueva correlatividad
          </button>
        </div>
      </div>

      <div className="subsection-summary">
        <span>Total correlativas: <b>{correlativas.length}</b></span>
        <span>Visibles: <b>{correlativasFiltradas.length}</b></span>
      </div>

      <div className="materias-table-wrap">
        <table className="materias-table">
          <thead>
            <tr>
              <th>Materia posterior</th>
              <th>Curso posterior</th>
              <th>Correlativa anterior</th>
              <th>Curso anterior</th>
              <th>Tipo</th>
              <th>Bloqueos</th>
              <th>Estado</th>
              <th className="acciones">Acciones</th>
            </tr>
          </thead>

          <tbody>
            {correlativasFiltradas.length === 0 ? (
              <tr>
                <td colSpan="8" className="empty">
                  {cargando ? "Cargando..." : "No hay correlatividades cargadas."}
                </td>
              </tr>
            ) : (
              correlativasFiltradas.map((c) => (
                <tr key={c.id_materia_correlativa}>
                  <td><strong>{c.materia}</strong></td>
                  <td>{c.curso}</td>
                  <td>{c.materia_relacionada}</td>
                  <td>{c.curso_relacionada}</td>
                  <td><span className="badge info">{String(c.tipo || "").toUpperCase()}</span></td>
                  <td>
                    <span className="mini-text">Inscripción: {Number(c.bloquea_inscripcion) === 1 ? "SÍ" : "NO"}</span>
                    <br />
                    <span className="mini-text">Armado: {Number(c.bloquea_armado) === 1 ? "SÍ" : "NO"}</span>
                  </td>
                  <td>
                    <span className={`badge ${Number(c.activo) === 1 ? "ok" : "off"}`}>
                      {Number(c.activo) === 1 ? "ACTIVA" : "INACTIVA"}
                    </span>
                  </td>
                  <td className="acciones">
                    <button className="icon-btn" title="Editar" onClick={() => onEditar(c)} type="button">
                      <FontAwesomeIcon icon={faEdit} />
                    </button>
                    <button className="icon-btn danger" title="Eliminar" onClick={() => onEliminar(c)} type="button">
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

export default SeccionCorrelativas;
