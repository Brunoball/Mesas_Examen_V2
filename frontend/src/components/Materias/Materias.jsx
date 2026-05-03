// src/components/Materias/Materias.jsx
import React, { useContext } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faBook,
  faChevronDown,
  faDiagramProject,
  faEdit,
  faFilter,
  faFlask,
  faLayerGroup,
  faMagnifyingGlass,
  faPlus,
  faPowerOff,
  faRotateRight,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";

import "./Materias.css";
import ModalMateria from "./modales/ModalMateria";
import ModalCorrelativa from "./modales/ModalCorrelativa";
import ModalTaller from "./modales/ModalTaller";
import ModalArea from "./modales/ModalArea";
import SeccionCorrelativas from "./secciones/SeccionCorrelativas";
import SeccionTalleres from "./secciones/SeccionTalleres";
import SeccionAreas from "./secciones/SeccionAreas";
import { useMaterias } from "./hooks/useMaterias";
import Principal, { MesasShellContext } from "../Principal/Principal";

const Materias = () => {
  const navigate = useNavigate();
  const dentroDeShell = useContext(MesasShellContext);

  const state = useMaterias();

  const {
    seccionActiva,
    setSeccionActiva,
    busqueda,
    setBusqueda,
    soloActivas,
    setSoloActivas,
    cargando,
    mensaje,
    catalogos,
    materias,
    correlativas,
    talleres,
    areas,
    materiasFiltradas,
    correlativasFiltradas,
    talleresFiltrados,
    areasFiltradas,
    modalMateria,
    setModalMateria,
    modalCorrelativa,
    setModalCorrelativa,
    modalTaller,
    setModalTaller,
    modalArea,
    setModalArea,
    cargarTodo,
    guardarMateria,
    eliminarMateria,
    cambiarEstadoMateria,
    guardarCorrelativa,
    eliminarCorrelativa,
    guardarTaller,
    eliminarTaller,
    agregarMateriaTaller,
    quitarMateriaTaller,
    obtenerMateriasPorCurso,
    precargarMateriasDeCursos,
    guardarArea,
    eliminarArea,
  } = state;

  const volverAMaterias = () => setSeccionActiva("materias");

  const renderContenido = () => {
    if (seccionActiva === "correlativas") {
      return (
        <SeccionCorrelativas
          cargando={cargando}
          correlativas={correlativas}
          correlativasFiltradas={correlativasFiltradas}
          onVolver={volverAMaterias}
          onRefresh={cargarTodo}
          onNueva={() => setModalCorrelativa({ abierto: true, item: null })}
          onEditar={(item) => setModalCorrelativa({ abierto: true, item })}
          onEliminar={eliminarCorrelativa}
        />
      );
    }

    if (seccionActiva === "talleres") {
      return (
        <SeccionTalleres
          cargando={cargando}
          talleres={talleres}
          talleresFiltrados={talleresFiltrados}
          onVolver={volverAMaterias}
          onRefresh={cargarTodo}
          onNuevo={() => setModalTaller({ abierto: true, item: null })}
          onEditar={(item) => setModalTaller({ abierto: true, item })}
          onEliminar={eliminarTaller}
        />
      );
    }

    if (seccionActiva === "areas") {
      return (
        <SeccionAreas
          cargando={cargando}
          areas={areas}
          areasFiltradas={areasFiltradas}
          onVolver={volverAMaterias}
          onRefresh={cargarTodo}
          onNueva={() => setModalArea({ abierto: true, item: null })}
          onEditar={(item) => setModalArea({ abierto: true, item })}
          onEliminar={eliminarArea}
        />
      );
    }

    return (
      <>
        <section className="materias-card">
          <div className="materias-card-header">
            <div>
              <h2>Listado principal de materias</h2>
              <p>
                Esta es la sección principal. Desde acá editás materias y abajo accedés a las subsecciones separadas.
              </p>
            </div>

            <div className="materias-header-actions">
              <button
                className="materias-btn ghost"
                onClick={cargarTodo}
                disabled={cargando}
                type="button"
              >
                <FontAwesomeIcon icon={faRotateRight} />
                {cargando ? "Actualizando..." : "Actualizar"}
              </button>

              <button
                className="materias-btn primary"
                onClick={() => setModalMateria({ abierto: true, item: null })}
                type="button"
              >
                <FontAwesomeIcon icon={faPlus} />
                Nueva materia
              </button>
            </div>
          </div>

          <div className="materias-table-wrap">
            <table className="materias-table">
              <thead>
                <tr>
                  <th>Materia</th>
                  <th>Área</th>
                  <th>Cursos</th>
                  <th>Talleres</th>
                  <th>Correlativas</th>
                  <th>Estado</th>
                  <th className="acciones">Acciones</th>
                </tr>
              </thead>

              <tbody>
                {materiasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="empty">
                      {cargando ? "Cargando..." : "No hay materias para mostrar."}
                    </td>
                  </tr>
                ) : (
                  materiasFiltradas.map((m) => (
                    <tr key={m.id_materia}>
                      <td>
                        <strong>{m.materia}</strong>
                      </td>

                      <td>{m.areas || "-"}</td>
                      <td>{m.cursos || "-"}</td>
                      <td>{m.talleres || "-"}</td>
                      <td>{m.cantidad_correlativas || 0}</td>

                      <td>
                        <span className={`badge ${Number(m.activo) === 1 ? "ok" : "off"}`}>
                          {Number(m.activo) === 1 ? "ACTIVA" : "INACTIVA"}
                        </span>
                      </td>

                      <td className="acciones">
                        <button
                          className="icon-btn"
                          title="Editar"
                          onClick={() => setModalMateria({ abierto: true, item: m })}
                          type="button"
                        >
                          <FontAwesomeIcon icon={faEdit} />
                        </button>

                        <button
                          className="icon-btn"
                          title="Activar / desactivar"
                          onClick={() => cambiarEstadoMateria(m)}
                          type="button"
                        >
                          <FontAwesomeIcon icon={faPowerOff} />
                        </button>

                        <button
                          className="icon-btn danger"
                          title="Eliminar"
                          onClick={() => eliminarMateria(m)}
                          type="button"
                        >
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

        <div className="materias-subsections-bar">
          <div className="materias-subsections-title">
            <span>Subsecciones de materias</span>
            <small>Separadas para no mezclar el mantenimiento principal con reglas especiales.</small>
          </div>

          <div className="materias-subsections-buttons">
            <button className="materias-section-btn" type="button" onClick={() => setSeccionActiva("correlativas")}>
              <FontAwesomeIcon icon={faDiagramProject} />
              Correlativas
              <b>{correlativas.length}</b>
            </button>

            <button className="materias-section-btn" type="button" onClick={() => setSeccionActiva("talleres")}>
              <FontAwesomeIcon icon={faFlask} />
              Talleres
              <b>{talleres.length}</b>
            </button>

            <button className="materias-section-btn" type="button" onClick={() => setSeccionActiva("areas")}>
              <FontAwesomeIcon icon={faLayerGroup} />
              Áreas
              <b>{areas.length}</b>
            </button>
          </div>
        </div>

        <div className="materias-bottom-actions main-bottom">
          <button className="materias-btn back" onClick={() => navigate("/panel")} type="button">
            <FontAwesomeIcon icon={faArrowLeft} />
            Volver Atrás
          </button>
        </div>
      </>
    );
  };

  const contenido = (
    <div className="materias-page">
      <header className="materias-topbar">
        <div className="materias-title-wrap">
          <h1>Materias</h1>
          <p>
            {seccionActiva === "materias"
              ? "Administración principal de materias."
              : "Subsección del módulo de materias."}
          </p>
        </div>

        <div className="materias-search">
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por materia, área, taller, curso o correlatividad"
          />
          <FontAwesomeIcon icon={faMagnifyingGlass} className="materias-search-icon" />
        </div>

        <button
          className="materias-filter-btn"
          type="button"
          onClick={() => setSoloActivas((v) => !v)}
        >
          <FontAwesomeIcon icon={faFilter} />
          {soloActivas ? "Solo activas" : "Todas"}
          <FontAwesomeIcon icon={faChevronDown} />
        </button>
      </header>

      <main className="materias-content">
        {mensaje && <div className={`materias-toast ${mensaje.tipo}`}>{mensaje.texto}</div>}

        {renderContenido()}
      </main>

      {modalMateria.abierto && (
        <ModalMateria
          item={modalMateria.item}
          areas={catalogos.areas}
          onClose={() => setModalMateria({ abierto: false, item: null })}
          onSave={guardarMateria}
        />
      )}

      {modalCorrelativa.abierto && (
        <ModalCorrelativa
          item={modalCorrelativa.item}
          materias={catalogos.materias}
          materiasPorCurso={catalogos.materiasPorCurso}
          cursos={catalogos.cursos}
          onObtenerMateriasPorCurso={obtenerMateriasPorCurso}
          onPrecargarMateriasDeCursos={precargarMateriasDeCursos}
          onClose={() => setModalCorrelativa({ abierto: false, item: null })}
          onSave={guardarCorrelativa}
        />
      )}

      {modalTaller.abierto && (
        <ModalTaller
          item={modalTaller.item}
          cursos={catalogos.cursos}
          areas={catalogos.areas}
          onObtenerMateriasPorCurso={obtenerMateriasPorCurso}
          onClose={() => setModalTaller({ abierto: false, item: null })}
          onSave={guardarTaller}
          onAddMateria={agregarMateriaTaller}
          onRemoveMateria={quitarMateriaTaller}
        />
      )}

      {modalArea.abierto && (
        <ModalArea
          item={modalArea.item}
          materias={catalogos.materias}
          onClose={() => setModalArea({ abierto: false, item: null })}
          onSave={guardarArea}
        />
      )}
    </div>
  );

  return dentroDeShell ? contenido : <Principal>{contenido}</Principal>;
};

export default Materias;
