// src/components/Mesas_examen/Mesas_examen.jsx
import React, { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faLayerGroup,
  faMagnifyingGlass,
  faTrash,
  faUsers,
  faUserPlus,
  faLinkSlash,
  faChevronDown,
  faChevronRight,
  faSpinner,
  faRotateRight,
  faTriangleExclamation,
  faCheckCircle,
} from "@fortawesome/free-solid-svg-icons";

import "./Mesas_examen.css";
import Principal, { MesasShellContext } from "../Principal/Principal";
import { useMesasExamen } from "./hooks/useMesasExamen";
import ModalCrearMesa from "./modales/ModalCrearMesa";
import logo from "../../imagenes/Escudo.png";

const textoCorto = (valor, fallback = "-") => {
  const texto = String(valor || "").trim();
  return texto || fallback;
};

const MesasExamen = () => {
  const navigate = useNavigate();
  const dentroDeShell = useContext(MesasShellContext);
  const [mesasAbiertas, setMesasAbiertas] = useState({});

  const {
    busqueda,
    setBusqueda,
    tab,
    setTab,

    mesas,
    mesasFiltradas,

    totalObservadas,
    totalArmadas,
    totalAlumnos,

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

  const toggleMesa = (mesaId) => {
    setMesasAbiertas((actual) => ({
      ...actual,
      [mesaId]: !actual[mesaId],
    }));
  };

  const contenido = (
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
            placeholder="Buscar por mesa, docente, alumno, DNI, materia, turno o fecha"
          />
          <FontAwesomeIcon icon={faMagnifyingGlass} className="mesas-search-icon" />
        </div>

        <div className="mesas-top-actions">
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

          <button
            className="btn-action btn-delete"
            type="button"
            onClick={eliminarBorrador}
            disabled={armando || mesas.length === 0}
          >
            <FontAwesomeIcon icon={faTrash} />
            Eliminar Borrador
          </button>

          <button className="btn-action btn-reload" type="button" onClick={cargarMesas}>
            {cargando ? (
              <FontAwesomeIcon icon={faSpinner} spin />
            ) : (
              <FontAwesomeIcon icon={faRotateRight} />
            )}
            Recargar
            <FontAwesomeIcon icon={faChevronDown} />
          </button>
        </div>
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
            Mesas: {mesas.length}
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
                    ? `${mesas.length} mesas cargadas · ${totalAlumnos} alumnos/previas`
                    : "Sin datos cargados"}
              </p>
              <strong>Vista agrupada por número de mesa</strong>
            </div>
          </div>

          <div className="mesas-table-wrap">
            <table className="mesas-table mesas-table-grupos">
              <thead>
                <tr>
                  <th className="col-numero-mesa">N° Mesa</th>
                  <th className="col-hora">Fecha / Turno</th>
                  <th>Espacio Curricular</th>
                  <th>Alumnos</th>
                  <th>Tipo</th>
                  <th>Docente/s</th>
                  <th className="col-acciones">Detalle</th>
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
                  mesasFiltradas.map((item) => {
                    const mesaAbierta = !!mesasAbiertas[item.id];
                    const alumnos = Array.isArray(item.alumnos) ? item.alumnos : [];
                    const materias = Array.isArray(item.materias) ? item.materias : [];

                    return (
                      <React.Fragment key={item.id}>
                        <tr className={item.estado === "observada" ? "fila-observada" : ""}>
                          <td className="numero-mesa-cell">
                            <span className="numero-mesa-badge">
                              {item.numero_mesa ?? "S/N"}
                            </span>
                            <small>{item.estado || "borrador"}</small>
                          </td>

                          <td className="hora-cell">
                            <div className="hora-box mesa-hora-box">
                              {textoCorto(item.fecha)}
                              <br />
                              {textoCorto(item.turno)}
                            </div>
                          </td>

                          <td className="materia-cell">
                            <strong>
                              {materias.length > 1
                                ? `${materias.length} espacios curriculares`
                                : textoCorto(item.materia)}
                            </strong>

                            {materias.length > 1 && (
                              <div className="materias-pills">
                                {materias.map((materia) => (
                                  <span key={`${item.id}-mat-${materia.id || materia.nombre}`}>
                                    {materia.nombre}
                                  </span>
                                ))}
                              </div>
                            )}

                            {item.observacion && (
                              <small className="observacion-mesa">{item.observacion}</small>
                            )}
                          </td>

                          <td>
                            <div className="mesa-alumnos-resumen">
                              <strong>{item.cantidad_alumnos || alumnos.length}</strong>
                              <span>alumnos/previas</span>
                              {Number(item.cantidad_alumnos_distintos || 0) > 0 && (
                                <small>{item.cantidad_alumnos_distintos} DNI distintos</small>
                              )}
                            </div>
                          </td>

                          <td>
                            <span className={`tipo-mesa tipo-${item.tipo_mesa || "simple"}`}>
                              {item.tipo_mesa || "simple"}
                            </span>
                          </td>

                          <td className="docente-cell">
                            <strong>{textoCorto(item.docente)}</strong>
                          </td>

                          <td className="acciones-cell">
                            <button
                              type="button"
                              className="btn-ver-alumnos"
                              onClick={() => toggleMesa(item.id)}
                            >
                              <FontAwesomeIcon icon={mesaAbierta ? faChevronDown : faChevronRight} />
                              {mesaAbierta ? "Ocultar" : "Ver alumnos"}
                            </button>
                          </td>
                        </tr>

                        {mesaAbierta && (
                          <tr className="fila-detalle-alumnos">
                            <td colSpan="7">
                              <div className="alumnos-panel">
                                <div className="alumnos-panel-header">
                                  <strong>{item.numero_mesa_texto || `Mesa N° ${item.numero_mesa}`}</strong>
                                  <span>{alumnos.length} registros dentro de esta mesa</span>
                                </div>

                                <div className="alumnos-grid">
                                  {alumnos.map((alumno) => (
                                    <article
                                      className={`alumno-card ${
                                        alumno.estado === "observada" ? "alumno-card-observada" : ""
                                      }`}
                                      key={`${item.id}-${alumno.id_mesa}`}
                                    >
                                      <div className="alumno-card-top">
                                        <strong>{textoCorto(alumno.estudiante)}</strong>
                                        <span>DNI: {textoCorto(alumno.dni)}</span>
                                      </div>

                                      <div className="alumno-card-data">
                                        <span>
                                          <b>Materia:</b> {textoCorto(alumno.materia)}
                                        </span>
                                        <span>
                                          <b>Curso:</b> {textoCorto(alumno.curso)}
                                        </span>
                                        <span>
                                          <b>Condición:</b> {textoCorto(alumno.condicion)}
                                        </span>
                                        <span>
                                          <b>Docente:</b> {textoCorto(alumno.docente)}
                                        </span>
                                      </div>

                                      {alumno.observacion && (
                                        <p className="alumno-observacion">{alumno.observacion}</p>
                                      )}
                                    </article>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="mesas-footer-actions">
          <button className="btn-action btn-back" type="button" onClick={volver}>
            <FontAwesomeIcon icon={faArrowLeft} />
            Volver Atrás
          </button>
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

  return dentroDeShell ? contenido : <Principal>{contenido}</Principal>;
};

export default MesasExamen;
