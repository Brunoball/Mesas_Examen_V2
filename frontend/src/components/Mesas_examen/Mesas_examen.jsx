// src/components/Mesas_examen/Mesas_examen.jsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faFileExcel,
  faFilePdf,
  faLayerGroup,
  faMagnifyingGlass,
  faTrash,
  faUsers,
  faUserPlus,
  faLinkSlash,
  faChevronDown,
  faSpinner,
  faRotateRight,
  faTriangleExclamation,
  faCheckCircle,
} from "@fortawesome/free-solid-svg-icons";

import "./Mesas_examen.css";
import { useMesasExamen } from "./hooks/useMesasExamen";
import ModalCrearMesa from "./modales/ModalCrearMesa";
import logo from "../../imagenes/Escudo.png";

const MesasExamen = () => {
  const navigate = useNavigate();

  const {
    busqueda,
    setBusqueda,
    tab,
    setTab,

    mesas,
    mesasFiltradas,

    totalObservadas,
    totalArmadas,

    parametrosArmado,
    resumenArmado,

    modalCrearAbierto,
    abrirModalCrear,
    cerrarModalCrear,

    crearMesas,
    eliminarBorrador,
    cargarMesas,

    cargando,
    armando,
    error,
  } = useMesasExamen();

  const volver = () => {
    navigate("/panel");
  };

  return (
    <div className="mesas-page">
      <header className="mesas-topbar">
        <div className="mesas-title-wrap">
          <h1>Mesas de Examen</h1>
        </div>

        <div className="mesas-search">
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por materia, turno, fecha, número, docente o alumno"
          />
          <FontAwesomeIcon icon={faMagnifyingGlass} className="mesas-search-icon" />
        </div>

        <button className="mesas-filter-btn" type="button" onClick={cargarMesas}>
          {cargando ? (
            <FontAwesomeIcon icon={faSpinner} spin />
          ) : (
            <FontAwesomeIcon icon={faRotateRight} />
          )}
          Recargar
          <FontAwesomeIcon icon={faChevronDown} />
        </button>
      </header>

      <main className="mesas-content">
        {error && (
          <div className="mesas-alert mesas-alert-error">
            <FontAwesomeIcon icon={faTriangleExclamation} />
            {error}
          </div>
        )}

        {resumenArmado && (
          <div className="mesas-alert mesas-alert-ok">
            <FontAwesomeIcon icon={faCheckCircle} />
            <div>
              <strong>Resultado del armado inicial</strong>
              <span>
                Procesadas: {resumenArmado.total_previas_procesadas ?? "-"} |{" "}
                Insertadas: {resumenArmado.insertados ?? 0} |{" "}
                Actualizadas: {resumenArmado.actualizados ?? 0} |{" "}
                Observadas: {resumenArmado.observados ?? 0}
              </span>
            </div>
          </div>
        )}

        <div className="mesas-tabs">
          <button
            className={`mesas-tab mesas-tab-counter ${tab === "contador" ? "active" : ""}`}
            type="button"
            onClick={() => setTab("contador")}
          >
            Registros: {mesas.length}
            <FontAwesomeIcon icon={faUsers} />
          </button>

          <button
            className={`mesas-tab ${tab === "grupos" ? "active" : ""}`}
            type="button"
            onClick={() => setTab("grupos")}
          >
            <FontAwesomeIcon icon={faLayerGroup} />
            Armadas: {totalArmadas}
          </button>

          <button
            className={`mesas-tab mesas-tab-link ${tab === "no-agrupadas" ? "active" : ""}`}
            type="button"
            onClick={() => setTab("no-agrupadas")}
          >
            <FontAwesomeIcon icon={faLinkSlash} />
            Observadas: {totalObservadas}
          </button>
        </div>

        <section className="mesas-card">
          <div className="mesas-card-header">
            <div className="mesas-card-brand">
              <img src={logo} alt="IPET 50" />

              <div>
                <h2>MESAS DE EXAMEN</h2>
                <p>IPET N° 50 "Ing. Emilio F. Olmos"</p>
              </div>
            </div>

            <div className="mesas-card-meta">
              <p>
                {cargando
                  ? "Cargando datos..."
                  : mesas.length > 0
                    ? `${mesas.length} registros cargados`
                    : "Sin datos cargados"}
              </p>
              <strong>N° de mesa: pendiente</strong>
            </div>
          </div>

          <div className="mesas-table-wrap">
            <table className="mesas-table">
              <thead>
                <tr>
                  <th className="col-hora">Fecha / Turno</th>
                  <th>Espacio Curricular</th>
                  <th>Estudiante</th>
                  <th>DNI</th>
                  <th>Curso</th>
                  <th>Tipo</th>
                  <th>Docentes</th>
                </tr>
              </thead>

              <tbody>
                {cargando ? (
                  <tr>
                    <td colSpan="7" className="mesas-empty">
                      <FontAwesomeIcon icon={faSpinner} spin /> Cargando mesas...
                    </td>
                  </tr>
                ) : mesasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="mesas-empty">
                      No hay mesas cargadas todavía.
                    </td>
                  </tr>
                ) : (
                  mesasFiltradas.map((item) => (
                    <tr
                      key={item.id_mesa || item.id}
                      className={item.estado === "observada" ? "fila-observada" : ""}
                    >
                      <td className="hora-cell">
                        <div className="hora-box">
                          {item.fecha || "-"}
                          <br />
                          {item.turno || "-"}
                          <br />
                          {item.estado || "-"}
                        </div>
                      </td>

                      <td className="materia-cell">
                        <strong>{item.materia || "-"}</strong>
                        {item.observacion && (
                          <small className="observacion-mesa">
                            {item.observacion}
                          </small>
                        )}
                      </td>

                      <td>{item.estudiante || "-"}</td>
                      <td>{item.dni || "-"}</td>
                      <td>{item.curso || "-"}</td>

                      <td>
                        <span className={`tipo-mesa tipo-${item.tipo_mesa || "simple"}`}>
                          {item.tipo_mesa || "simple"}
                        </span>
                      </td>

                      <td className="docente-cell">
                        <strong>{item.docente || "-"}</strong>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="mesas-bottom-actions">
          <button className="btn-action btn-back" type="button" onClick={volver}>
            <FontAwesomeIcon icon={faArrowLeft} />
            Volver Atrás
          </button>

          <div className="mesas-right-actions">
            <button
              className="btn-action btn-create"
              type="button"
              onClick={abrirModalCrear}
              disabled={armando}
            >
              {armando ? (
                <FontAwesomeIcon icon={faSpinner} spin />
              ) : (
                <FontAwesomeIcon icon={faUserPlus} />
              )}
              Crear Mesas
            </button>

            <button className="btn-action btn-excel" type="button" disabled>
              <FontAwesomeIcon icon={faFileExcel} />
              Exportar Excel
            </button>

            <button className="btn-action btn-pdf" type="button" disabled>
              <FontAwesomeIcon icon={faFilePdf} />
              Exportar PDF
            </button>

            <button
              className="btn-action btn-delete"
              type="button"
              onClick={eliminarBorrador}
              disabled={armando || mesas.length === 0}
            >
              <FontAwesomeIcon icon={faTrash} />
              Eliminar Borrador
            </button>
          </div>
        </div>
      </main>

      <ModalCrearMesa
        abierto={modalCrearAbierto}
        parametros={parametrosArmado}
        cargando={armando}
        onClose={cerrarModalCrear}
        onConfirm={crearMesas}
      />
    </div>
  );
};

export default MesasExamen;
