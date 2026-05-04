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
  faPrint,
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

const textoCursoDivision = (curso, division) => {
  const partes = [curso, division].map((item) => String(item || "").trim()).filter(Boolean);
  return partes.length > 0 ? partes.join(" ") : "-";
};

const obtenerIdGrupo = (item) => item.id || item.id_grupo || item.id_no_agrupada || item.numero_mesa;


const MESES_ES = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
];

const DIAS_ES = ["DOMINGO", "LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO"];

const parseFechaMesa = (valor) => {
  const texto = String(valor || "").trim();

  if (!texto) {
    return null;
  }

  let dia = null;
  let mes = null;
  let anio = null;

  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) {
    const [y, m, d] = texto.slice(0, 10).split("-").map(Number);
    anio = y;
    mes = m;
    dia = d;
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(texto)) {
    const [d, m, y] = texto.split("/").map(Number);
    anio = y;
    mes = m;
    dia = d;
  }

  if (!dia || !mes || !anio) {
    return null;
  }

  const fecha = new Date(anio, mes - 1, dia);

  if (Number.isNaN(fecha.getTime())) {
    return null;
  }

  return {
    dia,
    mes,
    anio,
    diaSemana: DIAS_ES[fecha.getDay()],
    mesTexto: MESES_ES[mes - 1] || "",
  };
};

const obtenerPartesFechaMesa = (item) => {
  return parseFechaMesa(item?.fecha_mesa) || parseFechaMesa(item?.fecha) || null;
};

const obtenerTituloVistaPdf = (item) => {
  const partes = obtenerPartesFechaMesa(item);
  return partes ? `MESAS DE EXAMEN ${partes.mesTexto} ${partes.anio}` : "MESAS DE EXAMEN";
};

const normalizarHora = (valor) => {
  const texto = String(valor || "").trim();

  if (!texto) {
    return "";
  }

  if (/hs\.?$/i.test(texto)) {
    return texto.toUpperCase();
  }

  return `${texto.slice(0, 5)} HS.`.toUpperCase();
};

const obtenerHoraMesa = (item) => {
  const turno = String(item?.turno || "").toLowerCase();
  const hora = normalizarHora(item?.hora);

  if (hora) {
    return hora;
  }

  if (turno.includes("mañana") || turno.includes("manana")) {
    return "07:30 HS.";
  }

  if (turno.includes("tarde")) {
    return "13:30 HS.";
  }

  return "-";
};

const obtenerTurnoMesa = (item) => textoCorto(item?.turno).toUpperCase();

const obtenerFechaResumenPdf = (item) => {
  const partes = obtenerPartesFechaMesa(item);
  const turno = obtenerTurnoMesa(item);
  const hora = obtenerHoraMesa(item);

  if (!partes) {
    return `${turno} · ${hora}`;
  }

  return `${partes.diaSemana} ${partes.dia} · ${turno} · ${hora}`;
};

const obtenerHoraBloquePdf = (item) => {
  const partes = obtenerPartesFechaMesa(item);
  const turno = obtenerTurnoMesa(item);
  const hora = obtenerHoraMesa(item);

  if (!partes) {
    return [turno, hora].filter(Boolean);
  }

  return [partes.diaSemana, partes.dia, partes.mesTexto, turno, hora].filter(Boolean);
};

const obtenerTextoNumerosMesa = (grupo) => {
  const numeros = Array.isArray(grupo?.numeros) ? grupo.numeros : [];
  const desdeNumeros = numeros
    .map((numero) => numero?.numero_mesa)
    .filter((numero) => numero !== undefined && numero !== null && numero !== "")
    .join(" · ");

  if (desdeNumeros) {
    return desdeNumeros;
  }

  return String(grupo?.numeros_mesa_texto || grupo?.numero_mesa || "-").replace(/,/g, " · ");
};

const obtenerCursoAlumno = (alumno) => {
  if (!alumno) {
    return "-";
  }

  const cursoAlumno = textoCursoDivision(alumno.curso_alumno, alumno.division_alumno);

  if (cursoAlumno !== "-") {
    return cursoAlumno;
  }

  const cursoCursando = textoCursoDivision(alumno.cursando_curso, alumno.cursando_division);

  if (cursoCursando !== "-") {
    return cursoCursando;
  }

  return textoCorto(alumno.curso);
};

const obtenerMateriaAlumno = (alumno, numero) => textoCorto(alumno?.materia || numero?.materia, "Sin materia");

const obtenerDocenteAlumno = (alumno, numero) => textoCorto(alumno?.docente || numero?.docente, "Sin docente");

const obtenerNotaAlumno = (alumno) => {
  const nota = alumno?.nota;

  if (nota === undefined || nota === null || nota === "") {
    return "-";
  }

  return String(nota);
};

const agruparAlumnosParaVistaPdf = (numero) => {
  const alumnos = Array.isArray(numero?.alumnos) ? numero.alumnos : [];

  if (alumnos.length === 0) {
    return [
      {
        id: `numero-${numero?.numero_mesa || "sin-numero"}-vacio`,
        materia: textoCorto(numero?.materia, "Sin registros"),
        docente: textoCorto(numero?.docente, "Sin docente"),
        alumnos: [null],
      },
    ];
  }

  const grupos = new Map();

  alumnos.forEach((alumno) => {
    const materia = obtenerMateriaAlumno(alumno, numero);
    const docente = obtenerDocenteAlumno(alumno, numero);
    const key = `${materia.toLowerCase()}__${docente.toLowerCase()}`;

    if (!grupos.has(key)) {
      grupos.set(key, {
        id: key,
        materia,
        docente,
        alumnos: [],
      });
    }

    grupos.get(key).alumnos.push(alumno);
  });

  return Array.from(grupos.values());
};

const obtenerSeccionesVistaPdf = (grupo) => {
  const numeros = Array.isArray(grupo?.numeros) ? grupo.numeros : [];
  const base = numeros.length > 0 ? numeros : [{ numero_mesa: grupo?.numero_mesa, alumnos: grupo?.alumnos || [] }];

  return base.flatMap((numero) =>
    agruparAlumnosParaVistaPdf(numero).map((seccion) => ({
      ...seccion,
      numero,
    }))
  );
};

const obtenerNumerosVistaPdf = (grupo) => {
  const numeros = Array.isArray(grupo?.numeros) ? grupo.numeros : [];

  if (numeros.length > 0) {
    return numeros;
  }

  return [
    {
      numero_mesa: grupo?.numero_mesa || grupo?.numeros_mesa_texto || grupo?.id_grupo || "-",
      tipo_mesa: grupo?.tipo_mesa || grupo?.tipos_mesa_texto || "",
      prioridad: grupo?.prioridad_max ?? grupo?.prioridad ?? 0,
      materia: grupo?.materia || "",
      docente: grupo?.docente || "",
      alumnos: Array.isArray(grupo?.alumnos) ? grupo.alumnos : [],
    },
  ];
};

const obtenerFilasVistaPdf = (grupo) => {
  const numeros = obtenerNumerosVistaPdf(grupo);

  return numeros.flatMap((numero, numeroIndex) => {
    const alumnos = Array.isArray(numero?.alumnos) ? numero.alumnos : [];
    const materiaNumero = textoCorto(numero?.materia || grupo?.materia, "Sin materia");
    const docenteNumero = textoCorto(numero?.docente || grupo?.docente, "Sin docente");

    if (alumnos.length === 0) {
      return [
        {
          id: `fila-vacia-${numeroIndex}-${numero?.numero_mesa || "sin-numero"}`,
          numeroMesa: textoCorto(numero?.numero_mesa),
          tipoMesa: textoCorto(numero?.tipo_mesa, "-"),
          prioridad: numero?.prioridad ?? grupo?.prioridad_max ?? 0,
          materia: materiaNumero,
          docente: docenteNumero,
          estudiante: "Sin alumnos vinculados",
          dni: "-",
          curso: "-",
          nota: "-",
          observacion: textoCorto(numero?.observacion || grupo?.motivo || grupo?.observacion, ""),
        },
      ];
    }

    return alumnos.map((alumno, alumnoIndex) => ({
      id: `fila-${numero?.numero_mesa || numeroIndex}-${alumno?.id_mesa || alumno?.id_previa || alumnoIndex}`,
      numeroMesa: textoCorto(alumno?.numero_mesa || numero?.numero_mesa),
      tipoMesa: textoCorto(alumno?.tipo_mesa || numero?.tipo_mesa, "-"),
      prioridad: numero?.prioridad ?? grupo?.prioridad_max ?? 0,
      materia: obtenerMateriaAlumno(alumno, numero),
      docente: obtenerDocenteAlumno(alumno, numero),
      estudiante: textoCorto(alumno?.estudiante || alumno?.alumno, "Sin estudiante"),
      dni: textoCorto(alumno?.dni),
      curso: obtenerCursoAlumno(alumno),
      nota: obtenerNotaAlumno(alumno),
      observacion: textoCorto(alumno?.observacion || numero?.observacion || "", ""),
    }));
  });
};

const MesaPdfCard = ({ grupo, esNoAgrupada = false }) => {
  const filas = obtenerFilasVistaPdf(grupo);
  const numerosTexto = obtenerTextoNumerosMesa(grupo);

  return (
    <article className={`mesas-pdf-sheet ${esNoAgrupada ? "mesas-pdf-sheet-observada" : ""}`}>
      <header className="mesas-pdf-header">
        <div className="mesas-pdf-brand">
          <img src={logo} alt="IPET 50" />
          <div>
            <h3>{obtenerTituloVistaPdf(grupo)}</h3>
            <p>IPET N° 50 "Ing. Emilio F. Olmos"</p>
          </div>
        </div>

        <div className="mesas-pdf-meta">
          <span>{obtenerFechaResumenPdf(grupo)}</span>
          <strong>
            {esNoAgrupada
              ? `Sin agrupar · Mesa N° ${numerosTexto}`
              : `Grupo final N° ${textoCorto(grupo?.id_grupo)} · Mesa/s ${numerosTexto}`}
          </strong>
        </div>
      </header>

      {(esNoAgrupada || grupo?.motivo || grupo?.observacion) && (grupo?.motivo || grupo?.observacion) && (
        <div className={`mesas-pdf-observacion ${!esNoAgrupada ? "mesas-pdf-observacion-info" : ""}`}>
          <strong>{esNoAgrupada ? "Motivo sin agrupar:" : "Observación:"}</strong>{" "}
          {textoCorto(grupo.motivo || grupo.observacion)}
        </div>
      )}

      <div className="mesas-pdf-table-wrap">
        <table className="mesas-pdf-table">
          <thead>
            <tr>
              <th className="pdf-col-numero">N° mesa</th>
              <th>Espacio Curricular</th>
              <th>Estudiante</th>
              <th>DNI</th>
              <th>Curso</th>
              <th>Nota</th>
              <th>Docente</th>
              <th className="pdf-col-tipo">Tipo</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr key={fila.id} className={fila.observacion ? "pdf-row-observada" : ""}>
                <td className="pdf-numero-cell">
                  <strong>{fila.numeroMesa}</strong>
                </td>
                <td className="pdf-materia-line-cell">
                  <strong>{fila.materia}</strong>
                  {fila.observacion && <small>{fila.observacion}</small>}
                </td>
                <td className="pdf-estudiante-cell">{fila.estudiante}</td>
                <td>{fila.dni}</td>
                <td>{fila.curso}</td>
                <td className="pdf-nota-cell">
                  <span>{fila.nota}</span>
                </td>
                <td className="pdf-docente-line-cell">
                  <strong>{fila.docente}</strong>
                </td>
                <td className="pdf-tipo-cell">
                  <span>{fila.tipoMesa}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
};

const MesasExamen = () => {
  const navigate = useNavigate();
  const dentroDeShell = useContext(MesasShellContext);
  const [gruposAbiertos, setGruposAbiertos] = useState({});
  const [numerosAbiertos, setNumerosAbiertos] = useState({});
  const [modoVista, setModoVista] = useState("tabla");

  const {
    busqueda,
    setBusqueda,
    tab,
    setTab,

    gruposFinales,
    noAgrupadas,
    mesasFiltradas,

    totalGrupos,
    totalNoAgrupadas,
    totalNumerosAgrupados,
    totalAlumnos,

    parametrosArmado,
    resumenArmado,

    modalCrearAbierto,
    abrirModalCrear,
    cerrarModalCrear,

    crearMesas,
    eliminarBorrador,
    generarGruposFinales,
    cargarMesas,

    cargando,
    armando,
    agrupando,
    error,
  } = useMesasExamen();

  const volver = () => {
    navigate("/panel");
  };

  const toggleModoVista = () => {
    setModoVista((actual) => (actual === "pdf" ? "tabla" : "pdf"));
  };

  const imprimirVistaPdf = () => {
    if (modoVista !== "pdf") {
      setModoVista("pdf");
      setTimeout(() => window.print(), 180);
      return;
    }

    window.print();
  };

  const toggleGrupo = (grupoId) => {
    setGruposAbiertos((actual) => ({
      ...actual,
      [grupoId]: !actual[grupoId],
    }));
  };

  const toggleNumero = (numeroId) => {
    setNumerosAbiertos((actual) => ({
      ...actual,
      [numeroId]: !actual[numeroId],
    }));
  };

  const gruposVisibles = tab === "no-agrupadas" ? noAgrupadas.length : gruposFinales.length;
  const tituloVista = tab === "no-agrupadas" ? "Números no agrupados" : "Mesas finales agrupadas";

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
            placeholder="Buscar por grupo, número, docente, alumno, DNI, materia, curso, división, turno o fecha"
          />
          <FontAwesomeIcon icon={faMagnifyingGlass} className="mesas-search-icon" />
        </div>

        <div className="mesas-top-actions">
          <button
            className="btn-action btn-create"
            type="button"
            onClick={abrirModalCrear}
            disabled={armando || agrupando}
          >
            {armando ? (
              <FontAwesomeIcon icon={faSpinner} spin />
            ) : (
              <FontAwesomeIcon icon={faUserPlus} />
            )}
            Crear Mesas
          </button>

          <button
            className="btn-action btn-group-final"
            type="button"
            onClick={generarGruposFinales}
            disabled={armando || agrupando}
          >
            {agrupando ? (
              <FontAwesomeIcon icon={faSpinner} spin />
            ) : (
              <FontAwesomeIcon icon={faLayerGroup} />
            )}
            Agrupar Finales
          </button>

          <button
            className="btn-action btn-delete"
            type="button"
            onClick={eliminarBorrador}
            disabled={armando || agrupando || (gruposFinales.length === 0 && noAgrupadas.length === 0)}
          >
            <FontAwesomeIcon icon={faTrash} />
            Eliminar Armado
          </button>

          <button
            className={`btn-action ${modoVista === "pdf" ? "btn-view-table" : "btn-view-pdf"}`}
            type="button"
            onClick={toggleModoVista}
          >
            <FontAwesomeIcon icon={faLayerGroup} />
            {modoVista === "pdf" ? "Vista Tabla" : "Vista PDF"}
          </button>

          <button className="btn-action btn-print" type="button" onClick={imprimirVistaPdf}>
            <FontAwesomeIcon icon={faPrint} />
            Imprimir / PDF
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
              <strong>Resultado del armado</strong>
              <span>
                Insertadas: {resumenArmado.insertados ?? 0} | Actualizadas:{" "}
                {resumenArmado.actualizados ?? 0} | Observadas: {resumenArmado.observados ?? 0} |{" "}
                Grupos finales: {resumenArmado.grupos_finales?.total_grupos_generados ?? "-"} |{" "}
                No agrupadas: {resumenArmado.grupos_finales?.total_no_agrupadas ?? "-"}
              </span>
            </div>
          </div>
        )}

        <div className="mesas-tabs">
          <button
            className={`mesas-tab mesas-tab-counter ${tab === "grupos-finales" ? "active" : ""}`}
            type="button"
            onClick={() => setTab("grupos-finales")}
          >
            <FontAwesomeIcon icon={faLayerGroup} />
            Grupos finales: {totalGrupos}
          </button>

          <button
            className={`mesas-tab ${tab === "resumen" ? "active" : ""}`}
            type="button"
            onClick={() => setTab("grupos-finales")}
          >
            <FontAwesomeIcon icon={faUsers} />
            Números agrupados: {totalNumerosAgrupados}
          </button>

          <button
            className={`mesas-tab mesas-tab-link ${tab === "no-agrupadas" ? "active" : ""}`}
            type="button"
            onClick={() => setTab("no-agrupadas")}
          >
            <FontAwesomeIcon icon={faLinkSlash} />
            No agrupadas: {totalNoAgrupadas}
          </button>
        </div>

        <section className={`mesas-card ${modoVista === "pdf" ? "mesas-card-pdf-mode" : ""}`}>
          <div className="mesas-card-header">
            <div className="mesas-card-brand">
              <img src={logo} alt="IPET 50" />

              <div>
                <h2>{tituloVista}</h2>
                <p>IPET N° 50 "Ing. Emilio F. Olmos"</p>
              </div>
            </div>

            <div className="mesas-card-meta">
              <p>
                {cargando
                  ? "Cargando datos..."
                  : gruposVisibles > 0
                    ? `${gruposVisibles} registros visibles · ${totalAlumnos} previas/alumnos`
                    : "Sin grupos finales cargados"}
              </p>
              <strong>{modoVista === "pdf" ? "Vista tipo PDF para revisar agrupación, alumnos y docentes" : "Vista por mesa final, números agrupados y previas"}</strong>
            </div>
          </div>

          {modoVista === "pdf" ? (
            <div className="mesas-pdf-view">
              {cargando ? (
                <div className="mesas-empty mesas-pdf-empty">
                  <FontAwesomeIcon icon={faSpinner} spin /> Cargando vista PDF...
                </div>
              ) : mesasFiltradas.length === 0 ? (
                <div className="mesas-empty mesas-pdf-empty">
                  {tab === "no-agrupadas"
                    ? "No hay números pendientes sin agrupar para mostrar en la vista PDF."
                    : "No hay grupos finales cargados para mostrar en la vista PDF."}
                </div>
              ) : (
                mesasFiltradas.map((item) => (
                  <MesaPdfCard
                    key={`pdf-${obtenerIdGrupo(item)}`}
                    grupo={item}
                    esNoAgrupada={tab === "no-agrupadas"}
                  />
                ))
              )}
            </div>
          ) : (
          <div className="mesas-table-wrap">
            <table className="mesas-table mesas-table-grupos-finales">
              <thead>
                <tr>
                  <th className="col-numero-mesa">Mesa final</th>
                  <th className="col-hora">Fecha / Turno</th>
                  <th>Área</th>
                  <th>Números de mesa</th>
                  <th>Alumnos / previas</th>
                  <th>Prioridad</th>
                  <th className="col-acciones">Detalle</th>
                </tr>
              </thead>

              <tbody>
                {cargando ? (
                  <tr>
                    <td colSpan="7" className="mesas-empty">
                      <FontAwesomeIcon icon={faSpinner} spin /> Cargando mesas finales...
                    </td>
                  </tr>
                ) : mesasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="mesas-empty">
                      {tab === "no-agrupadas"
                        ? "No hay números pendientes sin agrupar."
                        : "No hay grupos finales cargados. Presioná Agrupar Finales después de crear mesas."}
                    </td>
                  </tr>
                ) : (
                  mesasFiltradas.map((item) => {
                    const grupoId = obtenerIdGrupo(item);
                    const grupoAbierto = !!gruposAbiertos[grupoId];
                    const numeros = Array.isArray(item.numeros) ? item.numeros : [];

                    return (
                      <React.Fragment key={grupoId}>
                        <tr className={tab === "no-agrupadas" ? "fila-observada" : ""}>
                          <td className="numero-mesa-cell">
                            <span className="numero-mesa-badge mesa-final-badge">
                              {tab === "no-agrupadas"
                                ? "S/A"
                                : item.id_grupo ?? "-"}
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
                            <strong>{textoCorto(item.area, "Sin área")}</strong>
                            {item.observacion && (
                              <small className="observacion-mesa">{item.observacion}</small>
                            )}
                            {item.motivo && (
                              <small className="observacion-mesa">{item.motivo}</small>
                            )}
                          </td>

                          <td>
                            <div className="numeros-mesa-pills">
                              {numeros.length > 0 ? (
                                numeros.map((numero) => (
                                  <span
                                    key={`${grupoId}-num-pill-${numero.numero_mesa}`}
                                    className={`numero-pill tipo-${numero.tipo_mesa || "simple"}`}
                                  >
                                    N° {numero.numero_mesa}
                                  </span>
                                ))
                              ) : (
                                <span className="numero-pill">{textoCorto(item.numeros_mesa_texto)}</span>
                              )}
                            </div>
                          </td>

                          <td>
                            <div className="mesa-alumnos-resumen">
                              <strong>{item.cantidad_previas || item.cantidad_alumnos || 0}</strong>
                              <span>previas</span>
                              {Number(item.cantidad_alumnos_distintos || 0) > 0 && (
                                <small>{item.cantidad_alumnos_distintos} DNI distintos</small>
                              )}
                            </div>
                          </td>

                          <td>
                            <span className="prioridad-badge">{item.prioridad_max ?? 0}</span>
                          </td>

                          <td className="acciones-cell">
                            <button
                              type="button"
                              className="btn-ver-alumnos"
                              onClick={() => toggleGrupo(grupoId)}
                            >
                              <FontAwesomeIcon icon={grupoAbierto ? faChevronDown : faChevronRight} />
                              {grupoAbierto ? "Ocultar" : "Ver mesa"}
                            </button>
                          </td>
                        </tr>

                        {grupoAbierto && (
                          <tr className="fila-detalle-alumnos">
                            <td colSpan="7">
                              <div className="alumnos-panel grupos-finales-panel">
                                <div className="alumnos-panel-header">
                                  <div>
                                    <strong>
                                      {tab === "no-agrupadas"
                                        ? `Número de mesa ${item.numeros_mesa_texto}`
                                        : item.mesa_final_texto || `Mesa final N° ${item.id_grupo}`}
                                    </strong>
                                    <span>
                                      {numeros.length} número/s de mesa · {item.cantidad_previas || item.cantidad_alumnos || 0} previas
                                    </span>
                                  </div>

                                  <div className="mesa-final-meta-mini">
                                    <span>{textoCorto(item.fecha)}</span>
                                    <span>{textoCorto(item.turno)}</span>
                                    <span>{textoCorto(item.area, "Sin área")}</span>
                                  </div>
                                </div>

                                <div className="numeros-finales-list">
                                  {numeros.map((numero) => {
                                    const numeroId = `${grupoId}-${numero.numero_mesa}`;
                                    const numeroAbierto = numerosAbiertos[numeroId] !== false;
                                    const alumnos = Array.isArray(numero.alumnos) ? numero.alumnos : [];

                                    return (
                                      <article className="numero-final-card" key={numeroId}>
                                        <button
                                          type="button"
                                          className="numero-final-header"
                                          onClick={() => toggleNumero(numeroId)}
                                        >
                                          <div>
                                            <strong>Mesa N° {numero.numero_mesa}</strong>
                                            <span>
                                              {numero.tipo_mesa || "simple"} · Prioridad {numero.prioridad ?? 0} · {alumnos.length} previas
                                            </span>
                                          </div>

                                          <FontAwesomeIcon icon={numeroAbierto ? faChevronDown : faChevronRight} />
                                        </button>

                                        <div className="numero-final-info">
                                          <span>
                                            <b>Materia/s:</b> {textoCorto(numero.materia)}
                                          </span>
                                          <span>
                                            <b>Docente/s:</b> {textoCorto(numero.docente)}
                                          </span>
                                        </div>

                                        {numeroAbierto && (
                                          <div className="alumnos-grid alumnos-grid-final">
                                            {alumnos.length === 0 ? (
                                              <div className="mesas-empty-mini">Sin previas vinculadas a este número.</div>
                                            ) : (
                                              alumnos.map((alumno) => (
                                                <article
                                                  className={`alumno-card ${
                                                    alumno.estado === "observada" ? "alumno-card-observada" : ""
                                                  }`}
                                                  key={`${numeroId}-${alumno.id_mesa}-${alumno.id_previa}`}
                                                >
                                                  <div className="alumno-card-top">
                                                    <strong>{textoCorto(alumno.estudiante || alumno.alumno)}</strong>
                                                    <span>DNI: {textoCorto(alumno.dni)}</span>
                                                  </div>

                                                  <div className="alumno-card-data">
                                                    <span>
                                                      <b>Materia:</b> {textoCorto(alumno.materia)}
                                                    </span>
                                                    <span>
                                                      <b>Curso alumno:</b>{" "}
                                                      {textoCursoDivision(alumno.curso_alumno, alumno.division_alumno)}
                                                    </span>
                                                    <span>
                                                      <b>Curso materia:</b>{" "}
                                                      {textoCursoDivision(alumno.curso_materia, alumno.division_materia)}
                                                    </span>
                                                    <span>
                                                      <b>Condición:</b> {textoCorto(alumno.condicion)}
                                                    </span>
                                                    <span>
                                                      <b>Docente:</b> {textoCorto(alumno.docente)}
                                                    </span>
                                                    <span>
                                                      <b>N° mesa:</b> {textoCorto(alumno.numero_mesa)}
                                                    </span>
                                                  </div>

                                                  {alumno.observacion && (
                                                    <p className="alumno-observacion">{alumno.observacion}</p>
                                                  )}
                                                </article>
                                              ))
                                            )}
                                          </div>
                                        )}
                                      </article>
                                    );
                                  })}
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
          )}

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
