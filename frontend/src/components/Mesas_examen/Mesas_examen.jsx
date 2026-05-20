// src/components/Mesas_examen/Mesas_examen.jsx
import React, { useCallback, useContext, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faLayerGroup,
  faMagnifyingGlass,
  faTrash,
  faUserPlus,
  faSpinner,
  faTriangleExclamation,
  faCheckCircle,
  faEdit,
  faTimes,
  faFilePdf,
} from "@fortawesome/free-solid-svg-icons";

import "../Global/Global_css/roots.css";
import "../Global/Global_css/Global_Section.css";
import "../Global/Global_css/Global_DivTable.css";
import "./Mesas_examen.css";
import Principal, { MesasShellContext } from "../Principal/Principal";
import { useMesasExamen } from "./hooks/useMesasExamen";
import ModalCrearMesa from "./modales/ModalCrearMesa";
import ModalEditarMesa from "./modales/ModalEditarMesa";
import ModalEliminarGlobal from "../Global/Modales/ModalEliminarGlobal";
import Toast from "../Global/Toast";
import ModalTituloPdfMesas from "./modales/exportar_pdf/ModalTituloPdfMesas";
import { descargarPdfMesas } from "./modales/exportar_pdf/mesasPdfExporter";
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
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];

const DIAS_ES = ["DOMINGO", "LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO"];

const HISTORIAL_RESULTADOS_GRID_COLS = "0.95fr 1.35fr 0.75fr 1.2fr 0.95fr 1.15fr 0.55fr 0.9fr 1.15fr";
const HISTORIAL_ARMADOS_GRID_COLS = "0.95fr 1fr 1.35fr 0.65fr 0.75fr 0.7fr 0.95fr 0.9fr";
const HISTORIAL_DETALLE_GRID_COLS = "0.9fr 0.65fr 0.65fr 1.25fr 0.75fr 1.15fr 1.15fr 0.75fr 0.55fr 0.65fr";

const HISTORIAL_RESULTADOS_COLUMNS = [
  { key: "fecha", label: "Fecha nota" },
  { key: "alumno", label: "Alumno" },
  { key: "dni", label: "DNI" },
  { key: "materia", label: "Materia" },
  { key: "mesa", label: "Mesa" },
  { key: "docente", label: "Docente" },
  { key: "nota", label: "Nota", align: "is-center" },
  { key: "resultado", label: "Resultado", align: "is-center" },
  { key: "motivo", label: "Motivo" },
];

const HISTORIAL_ARMADOS_COLUMNS = [
  { key: "guardado", label: "Guardado" },
  { key: "codigo", label: "Código" },
  { key: "motivo", label: "Motivo" },
  { key: "mesas", label: "Mesas", align: "is-center" },
  { key: "previas", label: "Previas", align: "is-center" },
  { key: "grupos", label: "Grupos", align: "is-center" },
  { key: "noAgrupadas", label: "No agrupadas", align: "is-center" },
  { key: "detalle", label: "Detalle", align: "is-center" },
];

const HISTORIAL_DETALLE_COLUMNS = [
  { key: "fecha", label: "Fecha" },
  { key: "grupo", label: "Grupo", align: "is-center" },
  { key: "mesa", label: "Mesa", align: "is-center" },
  { key: "alumno", label: "Alumno" },
  { key: "dni", label: "DNI" },
  { key: "materia", label: "Materia" },
  { key: "docente", label: "Docente" },
  { key: "tipo", label: "Tipo" },
  { key: "nota", label: "Nota", align: "is-center" },
  { key: "activa", label: "Activa", align: "is-center" },
];

const alignClass = (align) => align || "";

const parseFechaMesa = (valor) => {
  const texto = String(valor || "").trim();
  if (!texto) return null;

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

  if (!dia || !mes || !anio) return null;

  const fecha = new Date(anio, mes - 1, dia);
  if (Number.isNaN(fecha.getTime())) return null;

  return {
    dia,
    mes,
    anio,
    diaSemana: DIAS_ES[fecha.getDay()],
    mesTexto: MESES_ES[mes - 1] || "",
  };
};

const obtenerPartesFechaMesa = (item) =>
  parseFechaMesa(item?.fecha_mesa) || parseFechaMesa(item?.fecha) || null;

const obtenerTituloVistaPdf = (item) => {
  const partes = obtenerPartesFechaMesa(item);
  return partes ? `MESAS DE EXAMEN ${partes.mesTexto} ${partes.anio}` : "MESAS DE EXAMEN";
};

const normalizarHora = (valor) => {
  const texto = String(valor || "").trim();
  if (!texto) return "";
  if (/hs\.?$/i.test(texto)) return texto.toUpperCase();
  return `${texto.slice(0, 5)} HS.`.toUpperCase();
};

const obtenerHoraMesa = (item) => {
  const turno = String(item?.turno || "").toLowerCase();
  const hora = normalizarHora(item?.hora);
  if (hora) return hora;
  if (turno.includes("mañana") || turno.includes("manana")) return "07:30 HS.";
  if (turno.includes("tarde")) return "13:30 HS.";
  return "-";
};

const obtenerTurnoMesa = (item) => textoCorto(item?.turno).toUpperCase();

const obtenerFechaResumenPdf = (item) => {
  const partes = obtenerPartesFechaMesa(item);
  const turno = obtenerTurnoMesa(item);
  const hora = obtenerHoraMesa(item);
  if (!partes) return `${turno} · ${hora}`;
  return `${partes.diaSemana} ${partes.dia} · ${turno} · ${hora}`;
};

const obtenerTextoNumerosMesa = (grupo) => {
  const numeros = Array.isArray(grupo?.numeros) ? grupo.numeros : [];
  const desdeNumeros = numeros
    .map((numero) => numero?.numero_mesa)
    .filter((numero) => numero !== undefined && numero !== null && numero !== "")
    .join(" · ");
  if (desdeNumeros) return desdeNumeros;
  return String(grupo?.numeros_mesa_texto || grupo?.numero_mesa || "-").replace(/,/g, " · ");
};

const obtenerCursoAlumno = (alumno) => {
  if (!alumno) return "-";

  // En la vista de mesas tiene que mostrarse el curso/división de la materia
  // adeudada, no el curso actual del estudiante.
  const cursoMateria = textoCursoDivision(alumno.curso_materia, alumno.division_materia);
  if (cursoMateria !== "-") return cursoMateria;

  const cursoMateriaTexto = textoCorto(alumno.curso_materia_texto, "");
  if (cursoMateriaTexto) return cursoMateriaTexto;

  const cursoAlumno = textoCursoDivision(alumno.curso_alumno, alumno.division_alumno);
  if (cursoAlumno !== "-") return cursoAlumno;

  const cursoCursando = textoCursoDivision(alumno.cursando_curso, alumno.cursando_division);
  if (cursoCursando !== "-") return cursoCursando;

  return textoCorto(alumno.curso);
};

const obtenerMateriaAlumno = (alumno, numero) =>
  textoCorto(alumno?.materia || numero?.materia, "Sin materia");

const obtenerDocenteAlumno = (alumno, numero) =>
  textoCorto(alumno?.docente || numero?.docente, "Sin docente");

const obtenerKeyNotaAlumno = (alumno) => {
  const idPrevia = alumno?.id_previa || "sin-previa";
  const idMesa = alumno?.id_mesa || alumno?.numero_mesa || "sin-mesa";
  return `${idPrevia}-${idMesa}`;
};

const obtenerNotaActualAlumno = (alumno) => {
  const nota = Number(alumno?.nota || 0);
  return nota >= 1 && nota <= 10 ? String(nota) : "";
};

const SelectorNotaAlumno = ({ alumno, onGuardarNota, guardando }) => {
  if (!alumno?.id_previa) {
    return <span className="mesas-nota-placeholder">-</span>;
  }

  const valorActual = obtenerNotaActualAlumno(alumno);

  return (
    <div className="mesas-nota-selectWrap">
      <select
        className={`mesas-nota-select ${valorActual ? "is-selected" : ""}`}
        value={valorActual}
        disabled={guardando}
        title="Asignar nota de examen"
        onChange={(e) => onGuardarNota?.({ alumno, nota: e.target.value })}
      >
        <option value="">Nota</option>
        {Array.from({ length: 10 }, (_, index) => index + 1).map((nota) => (
          <option key={nota} value={nota}>{nota}</option>
        ))}
      </select>
      {guardando && <FontAwesomeIcon className="mesas-nota-spinner" icon={faSpinner} spin />}
    </div>
  );
};

const agruparAlumnosParaVistaPdf = (numero) => {
  const alumnos = Array.isArray(numero?.alumnos) ? numero.alumnos : [];

  if (alumnos.length === 0) {
    return [{
      id: `numero-${numero?.numero_mesa || "sin-numero"}-vacio`,
      materia: textoCorto(numero?.materia, "Sin registros"),
      docente: textoCorto(numero?.docente, "Sin docente"),
      alumnos: [null],
      observacion: textoCorto(numero?.observacion, ""),
    }];
  }

  const grupos = new Map();
  alumnos.forEach((alumno) => {
    const materia = obtenerMateriaAlumno(alumno, numero);
    const docente = obtenerDocenteAlumno(alumno, numero);
    const key = `${materia.toLowerCase()}__${docente.toLowerCase()}`;
    if (!grupos.has(key)) {
      grupos.set(key, { id: key, materia, docente, alumnos: [], observacion: "" });
    }
    grupos.get(key).alumnos.push(alumno);
  });

  return Array.from(grupos.values());
};

const obtenerNumerosVistaPdf = (grupo) => {
  const numeros = Array.isArray(grupo?.numeros) ? grupo.numeros : [];
  if (numeros.length > 0) return numeros;
  return [{
    numero_mesa: grupo?.numero_mesa || grupo?.numeros_mesa_texto || grupo?.id_grupo || "-",
    tipo_mesa: grupo?.tipo_mesa || grupo?.tipos_mesa_texto || "",
    prioridad: grupo?.prioridad_max ?? grupo?.prioridad ?? 0,
    materia: grupo?.materia || "",
    docente: grupo?.docente || "",
    observacion: grupo?.observacion || grupo?.motivo || "",
    alumnos: Array.isArray(grupo?.alumnos) ? grupo.alumnos : [],
  }];
};

const obtenerBloquesVistaPdf = (grupo) => {
  const numeros = obtenerNumerosVistaPdf(grupo);

  return numeros.flatMap((numero, numeroIndex) =>
    agruparAlumnosParaVistaPdf(numero).map((bloque, bloqueIndex) => ({
      ...bloque,
      id: `${numero?.numero_mesa || numeroIndex}-${bloque.id || bloqueIndex}`,
      numeroMesa: textoCorto(numero?.numero_mesa),
      tipoMesa: textoCorto(numero?.tipo_mesa, "-"),
      prioridad: numero?.prioridad ?? grupo?.prioridad_max ?? 0,
      observacion: textoCorto(bloque.observacion || numero?.observacion || grupo?.motivo || grupo?.observacion, ""),
    }))
  );
};

const FechaVerticalMesa = ({ grupo }) => {
  const partes = obtenerPartesFechaMesa(grupo);
  const turno = obtenerTurnoMesa(grupo);
  const hora = obtenerHoraMesa(grupo);

  if (!partes) {
    return (
      <div className="pdf-hora-stack">
        <strong>{textoCorto(grupo?.fecha || grupo?.fecha_mesa)}</strong>
        <strong>{turno}</strong>
        <strong>{hora}</strong>
      </div>
    );
  }

  return (
    <div className="pdf-hora-stack">
      <strong>{partes.diaSemana}</strong>
      <strong>{partes.dia}</strong>
      <strong>{partes.mesTexto}</strong>
      <strong>{turno}</strong>
      <strong>{hora}</strong>
    </div>
  );
};

const construirPayloadEliminar = (item, tab) => ({
  tipo: tab === "no-agrupadas" ? "no_agrupada" : "grupo",
  id_grupo: item.id_grupo || item.numero_grupo || null,
  numero_grupo: item.numero_grupo || item.id_grupo || null,
  id_no_agrupada: item.id_no_agrupada || null,
  numero_mesa: item.numero_mesa || item.numeros?.[0]?.numero_mesa || null,
});

const MesaPdfCard = ({ grupo, esNoAgrupada = false, onEdit, onDelete, onGuardarNota, guardandoNotas = {} }) => {
  const bloques = obtenerBloquesVistaPdf(grupo);
  const totalFilas = Math.max(
    1,
    bloques.reduce((total, bloque) => total + Math.max(1, bloque.alumnos.length), 0)
  );
  const numerosTexto = obtenerTextoNumerosMesa(grupo);
  let horaMostrada = false;

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
          <strong>N° de mesa: {numerosTexto}</strong>
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
              <th className="pdf-col-hora">Hora</th>
              <th className="pdf-col-materia">Espacio Curricular</th>
              <th className="pdf-col-estudiante">Estudiante</th>
              <th className="pdf-col-dni">DNI</th>
              <th className="pdf-col-curso">Curso</th>
              <th className="pdf-col-nota">Nota</th>
              <th className="pdf-col-docente">Docentes</th>
            </tr>
          </thead>
          <tbody>
            {bloques.map((bloque) =>
              bloque.alumnos.map((alumno, alumnoIndex) => {
                const debeMostrarHora = !horaMostrada;
                if (debeMostrarHora) horaMostrada = true;

                return (
                  <tr
                    key={`${bloque.id}-${alumno?.id_mesa || alumno?.id_previa || alumnoIndex}`}
                    className={`${alumnoIndex === 0 ? "pdf-row-inicio-materia" : ""} ${bloque.observacion ? "pdf-row-observada" : ""}`}
                  >
                    {debeMostrarHora && (
                      <td className="pdf-hora-cell" rowSpan={totalFilas}>
                        <FechaVerticalMesa grupo={grupo} />
                      </td>
                    )}

                    {alumnoIndex === 0 && (
                      <td className="pdf-materia-line-cell" rowSpan={Math.max(1, bloque.alumnos.length)}>
                        <strong>{bloque.materia}</strong>
                        {bloque.observacion && <small>{bloque.observacion}</small>}
                      </td>
                    )}

                    <td className="pdf-estudiante-cell">
                      {alumno ? textoCorto(alumno.estudiante || alumno.alumno, "Sin estudiante") : "Sin alumnos vinculados"}
                    </td>
                    <td className="pdf-dni-cell">{alumno ? textoCorto(alumno.dni) : "-"}</td>
                    <td className="pdf-curso-cell">{alumno ? obtenerCursoAlumno(alumno) : "-"}</td>
                    <td className="pdf-nota-cell">
                      <SelectorNotaAlumno
                        alumno={alumno}
                        guardando={alumno ? !!guardandoNotas[obtenerKeyNotaAlumno(alumno)] : false}
                        onGuardarNota={onGuardarNota}
                      />
                    </td>

                    {alumnoIndex === 0 && (
                      <td className="pdf-docente-line-cell" rowSpan={Math.max(1, bloque.alumnos.length)}>
                        <strong>{bloque.docente}</strong>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <footer className="mesas-pdf-actions">
        <button type="button" className="mesas-pdf-action mesas-pdf-action-edit" onClick={onEdit}>
          <FontAwesomeIcon icon={faEdit} />
          Editar
        </button>
        <button type="button" className="mesas-pdf-action mesas-pdf-action-delete" onClick={onDelete}>
          <FontAwesomeIcon icon={faTrash} />
          Eliminar
        </button>
      </footer>
    </article>
  );
};


const HistorialGridHead = ({ columns, gridCols }) => (
  <div
    className="mov-gridTable mov-gridTable--head global-divTable__head mesas-historial-gridHead"
    style={{ gridTemplateColumns: gridCols }}
    role="row"
  >
    {columns.map((column) => (
      <div
        key={column.key}
        className={["mov-gridCell", "mov-gridCell--head", alignClass(column.align)].filter(Boolean).join(" ")}
        role="columnheader"
      >
        {column.label}
      </div>
    ))}
  </div>
);

const HistorialMesasPanel = ({ historial }) => {
  const resultados = Array.isArray(historial?.resultados) ? historial.resultados : [];
  const armados = Array.isArray(historial?.armados) ? historial.armados : [];
  const resumen = historial?.resumen || {};
  const detalle = historial?.detalleArmado || null;
  const detalleFilas = Array.isArray(detalle?.detalle) ? detalle.detalle : [];

  return (
    <div className="mesas-historial-panel">
      <div className="mesas-historial-head">
        <div className="mesas-historial-title">
          <h3>Historial completo de mesas</h3>
          <p>Acá quedan registradas las notas cargadas, las previas aprobadas/desaprobadas y los armados eliminados.</p>
        </div>
        <button
          type="button"
          className="mov-btn mov-btn--secondary mesas-historial-refresh"
          onClick={historial?.cargar}
          disabled={historial?.cargando}
        >
          <FontAwesomeIcon icon={historial?.cargando ? faSpinner : faCheckCircle} spin={!!historial?.cargando} />
          Actualizar historial
        </button>
      </div>

      {historial?.error && (
        <div className="mov-alert mesas-alert mesas-alert-error mesas-historial-error">
          <FontAwesomeIcon icon={faTriangleExclamation} />
          {historial.error}
        </div>
      )}

      <div className="mesas-historial-resumen">
        <div className="mesas-historial-kpi">
          <span>Resultados</span>
          <strong>{resumen.total_resultados ?? resultados.length}</strong>
        </div>
        <div className="mesas-historial-kpi is-ok">
          <span>Aprobadas</span>
          <strong>{resumen.total_aprobadas ?? resultados.filter((item) => Number(item.aprobado) === 1).length}</strong>
        </div>
        <div className="mesas-historial-kpi is-warn">
          <span>No aprobadas</span>
          <strong>{resumen.total_desaprobadas ?? resultados.filter((item) => Number(item.aprobado) !== 1).length}</strong>
        </div>
        <div className="mesas-historial-kpi">
          <span>Armados guardados</span>
          <strong>{resumen.total_armados ?? armados.length}</strong>
        </div>
      </div>

      {historial?.cargando ? (
        <div className="cc-emptyState mesas-empty mesas-pdf-empty">
          <FontAwesomeIcon icon={faSpinner} spin />
          <div className="cc-emptyText">Cargando historial...</div>
        </div>
      ) : (
        <>
          <section className="mesas-historial-section mov-card mov-card--table">
            <div className="mesas-historial-sectionTitle">
              <h4>Historial de notas y previas</h4>
            </div>

            {resultados.length === 0 ? (
              <div className="cc-emptyState mesas-empty mesas-historial-empty">
                <div className="cc-emptyText">Todavía no hay notas cargadas en el historial.</div>
              </div>
            ) : (
              <>
                <div className="mesas-historial-divTable global-divTable" role="table" aria-label="Historial de notas y previas">
                  <HistorialGridHead columns={HISTORIAL_RESULTADOS_COLUMNS} gridCols={HISTORIAL_RESULTADOS_GRID_COLS} />

                  <div className="mesas-historial-tableWrap mov-tableWrap global-divTable__wrap" role="rowgroup">
                    <div className="mov-gridBody global-divTable__body mesas-historial-gridBody">
                      {resultados.map((item) => {
                        const aprobado = Number(item.aprobado) === 1;
                        return (
                          <div
                            key={`resultado-${item.id_resultado}`}
                            className="mov-gridTable mov-gridTable--row global-divTable__row mesas-historial-gridRow"
                            style={{ gridTemplateColumns: HISTORIAL_RESULTADOS_GRID_COLS }}
                            role="row"
                          >
                            <div className="mov-gridCell" role="cell" data-label="Fecha nota">
                              {textoCorto(item.fecha_nota_texto || item.fecha_nota)}
                            </div>
                            <div className="mov-gridCell is-strong" role="cell" data-label="Alumno" title={textoCorto(item.alumno)}>
                              {textoCorto(item.alumno)}
                            </div>
                            <div className="mov-gridCell" role="cell" data-label="DNI">{textoCorto(item.dni)}</div>
                            <div className="mov-gridCell" role="cell" data-label="Materia" title={textoCorto(item.materia)}>
                              {textoCorto(item.materia)}
                            </div>
                            <div className="mov-gridCell" role="cell" data-label="Mesa">
                              <div className="mesas-historial-stack">
                                <span className="mesas-historial-chip">N° {textoCorto(item.numero_mesa)}</span>
                                {item.numero_grupo && <small>Grupo {item.numero_grupo}</small>}
                                {item.fecha_mesa_texto && <small>{item.fecha_mesa_texto}</small>}
                              </div>
                            </div>
                            <div className="mov-gridCell" role="cell" data-label="Docente" title={textoCorto(item.docente)}>
                              {textoCorto(item.docente)}
                            </div>
                            <div className="mov-gridCell is-center" role="cell" data-label="Nota">
                              <strong className="mesas-historial-nota">{item.nota}</strong>
                            </div>
                            <div className="mov-gridCell is-center" role="cell" data-label="Resultado">
                              <span className={`mesas-historial-estado ${aprobado ? "is-approved" : "is-pending"}`}>
                                {aprobado ? "Aprobada" : "No aprobada"}
                              </span>
                            </div>
                            <div className="mov-gridCell" role="cell" data-label="Motivo" title={textoCorto(item.motivo)}>
                              {textoCorto(item.motivo)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="mesas-recordsFoot mesas-historial-countFoot">
                  <b>{resultados.length}</b> registros visibles
                </div>
              </>
            )}
          </section>

          <section className="mesas-historial-section mov-card mov-card--table">
            <div className="mesas-historial-sectionTitle">
              <h4>Historial de armados eliminados</h4>
            </div>

            {armados.length === 0 ? (
              <div className="cc-emptyState mesas-empty mesas-historial-empty">
                <div className="cc-emptyText">Todavía no hay armados eliminados guardados.</div>
              </div>
            ) : (
              <>
                <div className="mesas-historial-divTable global-divTable" role="table" aria-label="Historial de armados eliminados">
                  <HistorialGridHead columns={HISTORIAL_ARMADOS_COLUMNS} gridCols={HISTORIAL_ARMADOS_GRID_COLS} />

                  <div className="mesas-historial-tableWrap mov-tableWrap global-divTable__wrap" role="rowgroup">
                    <div className="mov-gridBody global-divTable__body mesas-historial-gridBody">
                      {armados.map((item) => (
                        <div
                          key={`armado-${item.id_armado_historial}`}
                          className="mov-gridTable mov-gridTable--row global-divTable__row mesas-historial-gridRow"
                          style={{ gridTemplateColumns: HISTORIAL_ARMADOS_GRID_COLS }}
                          role="row"
                        >
                          <div className="mov-gridCell" role="cell" data-label="Guardado">
                            {textoCorto(item.creado_en_texto || item.creado_en)}
                          </div>
                          <div className="mov-gridCell is-strong" role="cell" data-label="Código" title={textoCorto(item.codigo_armado)}>
                            {textoCorto(item.codigo_armado)}
                          </div>
                          <div className="mov-gridCell" role="cell" data-label="Motivo" title={textoCorto(item.motivo)}>
                            {textoCorto(item.motivo)}
                          </div>
                          <div className="mov-gridCell is-center" role="cell" data-label="Mesas">{item.total_mesas ?? 0}</div>
                          <div className="mov-gridCell is-center" role="cell" data-label="Previas">{item.total_previas ?? 0}</div>
                          <div className="mov-gridCell is-center" role="cell" data-label="Grupos">{item.total_grupos ?? 0}</div>
                          <div className="mov-gridCell is-center" role="cell" data-label="No agrupadas">{item.total_no_agrupadas ?? 0}</div>
                          <div className="mov-gridCell mov-gridCell--actions is-center" role="cell" data-label="Detalle">
                            <button
                              type="button"
                              className="mesas-historial-detailBtn"
                              onClick={() => historial?.verDetalleArmado?.(item.id_armado_historial)}
                              disabled={historial?.cargandoDetalle}
                            >
                              <FontAwesomeIcon icon={historial?.cargandoDetalle ? faSpinner : faLayerGroup} spin={!!historial?.cargandoDetalle} />
                              Ver detalle
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mesas-recordsFoot mesas-historial-countFoot">
                  <b>{armados.length}</b> armados visibles
                </div>
              </>
            )}
          </section>

          {detalle && (
            <section className="mesas-historial-section mesas-historial-detalle mov-card mov-card--table">
              <div className="mesas-historial-sectionTitle">
                <div>
                  <h4>Detalle del armado {textoCorto(detalle.armado?.codigo_armado, "")}</h4>
                </div>
                <button type="button" className="mesas-historial-closeBtn" onClick={historial?.cerrarDetalleArmado}>
                  <FontAwesomeIcon icon={faTimes} /> Cerrar detalle
                </button>
              </div>

              {historial?.cargandoDetalle ? (
                <div className="cc-emptyState mesas-empty mesas-historial-empty">
                  <FontAwesomeIcon icon={faSpinner} spin />
                  <div className="cc-emptyText">Cargando detalle...</div>
                </div>
              ) : (
                <>
                  <div className="mesas-historial-divTable global-divTable" role="table" aria-label="Detalle del armado eliminado">
                    <HistorialGridHead columns={HISTORIAL_DETALLE_COLUMNS} gridCols={HISTORIAL_DETALLE_GRID_COLS} />

                    <div className="mesas-historial-tableWrap mov-tableWrap global-divTable__wrap" role="rowgroup">
                      <div className="mov-gridBody global-divTable__body mesas-historial-gridBody">
                        {detalleFilas.map((item) => (
                          <div
                            key={`detalle-${item.id_historial_detalle}`}
                            className="mov-gridTable mov-gridTable--row global-divTable__row mesas-historial-gridRow"
                            style={{ gridTemplateColumns: HISTORIAL_DETALLE_GRID_COLS }}
                            role="row"
                          >
                            <div className="mov-gridCell" role="cell" data-label="Fecha">{textoCorto(item.fecha_mesa_texto || item.fecha_mesa)}</div>
                            <div className="mov-gridCell is-center" role="cell" data-label="Grupo">{textoCorto(item.numero_grupo)}</div>
                            <div className="mov-gridCell is-center" role="cell" data-label="Mesa">{textoCorto(item.numero_mesa)}</div>
                            <div className="mov-gridCell is-strong" role="cell" data-label="Alumno" title={textoCorto(item.alumno)}>{textoCorto(item.alumno)}</div>
                            <div className="mov-gridCell" role="cell" data-label="DNI">{textoCorto(item.dni)}</div>
                            <div className="mov-gridCell" role="cell" data-label="Materia" title={textoCorto(item.materia)}>{textoCorto(item.materia)}</div>
                            <div className="mov-gridCell" role="cell" data-label="Docente" title={textoCorto(item.docente)}>{textoCorto(item.docente)}</div>
                            <div className="mov-gridCell" role="cell" data-label="Tipo">{textoCorto(item.tipo_mesa)}</div>
                            <div className="mov-gridCell is-center" role="cell" data-label="Nota">{textoCorto(item.nota)}</div>
                            <div className="mov-gridCell is-center" role="cell" data-label="Activa">{Number(item.previa_activa) === 1 ? "Sí" : "No"}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mesas-recordsFoot mesas-historial-countFoot">
                    <b>{detalleFilas.length}</b> registros guardados del armado final
                  </div>
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
};

const MesasExamen = () => {
  const dentroDeShell = useContext(MesasShellContext);
  const [toastGlobal, setToastGlobal] = useState(null);

  const mostrarToastGlobal = useCallback((tipo = "exito", mensaje = "Operación realizada con éxito.", duracion = 2800) => {
    setToastGlobal({
      id: `${Date.now()}-${Math.random()}`,
      tipo,
      mensaje,
      duracion,
    });
  }, []);

  const cerrarToastGlobal = useCallback(() => {
    setToastGlobal(null);
  }, []);

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
    parametrosArmado,
    resumenArmado,
    modalCrearAbierto,
    abrirModalCrear,
    cerrarModalCrear,
    modalEditarAbierto,
    grupoEdicion,
    tipoEdicion,
    cargandoEdicion,
    guardandoEdicion,
    errorEdicion,
    slotsEdicion,
    cargandoSlotsEdicion,
    cargarSlotsEdicion,
    abrirModalEditar,
    cerrarModalEditar,
    guardarEdicionProgramacion,
    crearGrupoUnicoDesdeNoAgrupada,
    eliminarMesaDesdeEdicion,
    eliminarArmado,
    eliminarEdicion,
    personaEdicion,
    masEdicion,
    flechasEdicion,
    agregarNumeroEdicion,
    historial,
    guardandoNotas,
    guardarNotaAlumno,
    crearMesas,
    eliminarBorrador,
    cargando,
    armando,
    agrupando,
    error,
  } = useMesasExamen({ onToast: mostrarToastGlobal });

  const totalHistorialVisible = (Array.isArray(historial?.resultados) ? historial.resultados.length : 0)
    + (Array.isArray(historial?.armados) ? historial.armados.length : 0);
  const totalVisible = tab === "historial" ? totalHistorialVisible : (Array.isArray(mesasFiltradas) ? mesasFiltradas.length : 0);
  const totalReferencia = tab === "historial" ? totalHistorialVisible : tab === "no-agrupadas" ? totalNoAgrupadas : totalGrupos;
  const hayBusquedaActiva = String(busqueda || "").trim() !== "";

  const [modalTituloPdfAbierto, setModalTituloPdfAbierto] = useState(false);
  const [exportandoPdf, setExportandoPdf] = useState(false);

  const abrirModalExportarPdf = useCallback(() => {
    if (tab === "historial") {
      mostrarToastGlobal("error", "El historial no se exporta desde este botón. Usá la vista de mesas para generar el PDF.", 3200);
      return;
    }

    if (!Array.isArray(mesasFiltradas) || mesasFiltradas.length === 0) {
      mostrarToastGlobal("error", "No hay mesas visibles para exportar.", 3200);
      return;
    }

    setModalTituloPdfAbierto(true);
  }, [mesasFiltradas, tab, mostrarToastGlobal]);

  const cerrarModalExportarPdf = useCallback(() => {
    if (exportandoPdf) return;
    setModalTituloPdfAbierto(false);
  }, [exportandoPdf]);

  const confirmarExportarPdf = useCallback(({ tituloFijo, continuacion } = {}) => {
    if (!Array.isArray(mesasFiltradas) || mesasFiltradas.length === 0) {
      mostrarToastGlobal("error", "No hay mesas visibles para exportar.", 3200);
      return;
    }

    setExportandoPdf(true);

    try {
      descargarPdfMesas({
        mesas: mesasFiltradas,
        tab,
        tituloFijo,
        continuacion,
      });

      setModalTituloPdfAbierto(false);
      mostrarToastGlobal("exito", "PDF descargado correctamente.", 3000);
    } catch (_) {
      mostrarToastGlobal("error", "No se pudo generar el PDF. Intentá nuevamente.", 3800);
    } finally {
      setExportandoPdf(false);
    }
  }, [mesasFiltradas, tab, mostrarToastGlobal]);

  const contenido = (
    <div className="mesas-page mov-page">
      <section className="mesas-shell-card mesas-card-pdf-mode mesas-card-pdf-fijo mov-card mov-card--table">
        <div className="mov-card__head mesas-card__head mesas-panel-head">
          <div className="mov-card__headLeft mesas-card__headLeft">
            <div className="title-mov mesas-titleBox">
              <div className="mov-card__title mesas-section-title">
                Mesas de Examen
              </div>

              <div className="mesas-titleTabs" aria-label="Cambiar vista de mesas">
                <button
                  className={`mov-tab mesas-titleTab ${tab === "grupos-finales" ? "is-active" : ""}`}
                  type="button"
                  onClick={() => setTab("grupos-finales")}
                >
                  Grupos finales
                </button>

                <button
                  className={`mov-tab mesas-titleTab ${tab === "no-agrupadas" ? "is-active" : ""}`}
                  type="button"
                  onClick={() => setTab("no-agrupadas")}
                >
                  No agrupadas
                </button>

                <button
                  className={`mov-tab mesas-titleTab ${tab === "historial" ? "is-active" : ""}`}
                  type="button"
                  onClick={() => setTab("historial")}
                >
                  Historial
                </button>
              </div>
            </div>

            <div className="mov-headFilters mesas-headFilters">
              <div className="cc-filter mesas-searchFilter">
                <div className={`cc-floatingField cc-floatingField--search mesas-floatingSearch ${hayBusquedaActiva ? "is-active" : ""}`}>
                  <div className="cc-searchInput">
                    <div className="cc-searchInput__fieldWrap">
                      <input
                        className="cc-input cc-input--floating mesas-searchInput"
                        type="text"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        placeholder="Buscar"
                      />
                      <span className="cc-floatingLabel mesas-searchLabel">
                        <FontAwesomeIcon icon={faMagnifyingGlass} /> Búsqueda
                      </span>
                      {hayBusquedaActiva && (
                        <button
                          type="button"
                          className="cc-clearSearch cc-clearSearch--inside mesas-clearSearch"
                          title="Limpiar búsqueda"
                          onClick={() => setBusqueda("")}
                        >
                          <FontAwesomeIcon icon={faTimes} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mov-card__actions mesas-actionsHead">
            <button
              className="mov-btn mov-btn--secondary mesas-actionBtn mesas-exportBtn"
              type="button"
              onClick={abrirModalExportarPdf}
              disabled={tab === "historial" || cargando || armando || agrupando || totalVisible === 0}
            >
              <FontAwesomeIcon icon={faFilePdf} />
              Exportar PDF
            </button>

            <button
              className="mov-btn mov-btn--primary mesas-actionBtn mesas-createBtn"
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
              className="mov-btn mov-btn--danger mesas-actionBtn mesas-deleteBtn"
              type="button"
              onClick={eliminarBorrador}
              disabled={armando || agrupando || (gruposFinales.length === 0 && noAgrupadas.length === 0)}
            >
              <FontAwesomeIcon icon={faTrash} />
              Eliminar mesas
            </button>
          </div>
        </div>

        {(error || resumenArmado) && (
          <div className="mesas-statusAlerts">
            {error && (
              <div className="mov-alert mesas-alert mesas-alert-error">
                <FontAwesomeIcon icon={faTriangleExclamation} />
                {error}
              </div>
            )}

            {resumenArmado && (
              <div className="mov-alert mesas-alert mesas-alert-ok">
                <FontAwesomeIcon icon={faCheckCircle} />
                <div>
                  {resumenArmado.eliminadas !== undefined ? (
                    <>
                      <strong>Resultado de eliminación</strong>
                      <span>
                        Mesas eliminadas: {resumenArmado.eliminadas ?? 0} | Grupos eliminados:{" "}
                        {resumenArmado.grupos_eliminados ?? 0} | No agrupadas eliminadas:{" "}
                        {resumenArmado.no_agrupadas_eliminadas ?? 0}
                      </span>
                    </>
                  ) : (
                    <>
                      <strong>Resultado del armado</strong>
                      <span>
                        Insertadas: {resumenArmado.insertados ?? 0} | Actualizadas:{" "}
                        {resumenArmado.actualizados ?? 0} | Observadas: {resumenArmado.observados ?? 0} |{" "}
                        Grupos finales: {resumenArmado.grupos_finales?.total_grupos_generados ?? "-"} |{" "}
                        No agrupadas: {resumenArmado.grupos_finales?.total_no_agrupadas ?? "-"}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mesas-pdf-view">
          {tab === "historial" ? (
            <HistorialMesasPanel historial={historial} />
          ) : cargando ? (
            <div className="cc-emptyState mesas-empty mesas-pdf-empty">
              <FontAwesomeIcon icon={faSpinner} spin />
              <div className="cc-emptyText">Cargando mesas...</div>
            </div>
          ) : mesasFiltradas.length === 0 ? (
            <div className="cc-emptyState mesas-empty mesas-pdf-empty">
              <div className="cc-emptyText">
                {busqueda
                  ? "No se encontraron mesas que coincidan con la búsqueda."
                  : tab === "no-agrupadas"
                    ? "No hay números pendientes sin agrupar para mostrar."
                    : "No hay grupos finales cargados. Presioná Crear Mesas para generar el armado."}
              </div>
            </div>
          ) : (
            mesasFiltradas.map((item) => (
              <MesaPdfCard
                key={`pdf-${obtenerIdGrupo(item)}`}
                grupo={item}
                esNoAgrupada={tab === "no-agrupadas"}
                onEdit={() => abrirModalEditar(item, tab === "no-agrupadas" ? "no_agrupada" : "grupo")}
                onDelete={() => eliminarMesaDesdeEdicion(construirPayloadEliminar(item, tab))}
                onGuardarNota={guardarNotaAlumno}
                guardandoNotas={guardandoNotas}
              />
            ))
          )}
        </div>

        {tab !== "historial" && (
          <div className="mesas-recordsFoot">
            Mostrando <b>{totalVisible}</b> de <b>{totalReferencia}</b> registros
          </div>
        )}
      </section>

      <ModalCrearMesa
        abierto={modalCrearAbierto}
        parametros={parametrosArmado}
        cargando={armando}
        onClose={cerrarModalCrear}
        onConfirm={crearMesas}
      />

      <ModalEditarMesa
        abierto={modalEditarAbierto}
        grupo={grupoEdicion}
        tipo={tipoEdicion}
        turnos={parametrosArmado?.turnos || []}
        cargando={cargandoEdicion}
        guardando={guardandoEdicion}
        slotsDisponibles={slotsEdicion}
        cargandoSlots={cargandoSlotsEdicion}
        onLoadSlots={cargarSlotsEdicion}
        error={errorEdicion}
        onClose={cerrarModalEditar}
        onSave={guardarEdicionProgramacion}
        onCrearGrupoUnico={crearGrupoUnicoDesdeNoAgrupada}
        onDelete={eliminarMesaDesdeEdicion}
        persona={personaEdicion}
        mas={masEdicion}
        flechas={flechasEdicion}
        eliminar={eliminarEdicion}
        agregarNumero={agregarNumeroEdicion}
      />

      <ModalTituloPdfMesas
        abierto={modalTituloPdfAbierto}
        loading={exportandoPdf}
        onClose={cerrarModalExportarPdf}
        onConfirm={confirmarExportarPdf}
      />

      <ModalEliminarGlobal
        open={!!eliminarArmado?.modalAbierto}
        operacion="eliminar"
        loading={!!eliminarArmado?.eliminando}
        title="Eliminar mesas"
        message="¿Seguro que querés eliminar todas las mesas del armado actual?"
        warning="Esta acción borra los grupos finales, las no agrupadas y los números de mesa generados. No se puede deshacer."
        details={[
          { label: "Grupos finales", value: totalGrupos },
          { label: "No agrupadas", value: totalNoAgrupadas },
          { label: "Total visible", value: totalVisible },
        ]}
        confirmLabel="Eliminar mesas"
        loadingLabel="Eliminando..."
        loadingMessage="Eliminando mesas..."
        successMessage="Mesas eliminadas correctamente."
        errorMessage="No se pudieron eliminar las mesas."
        onClose={eliminarArmado?.cerrar}
        onConfirm={eliminarArmado?.confirmar}
      />

      <ModalEliminarGlobal
        open={!!eliminarEdicion?.modalAbierto}
        operacion="eliminar"
        loading={!!eliminarEdicion?.eliminando}
        title={eliminarEdicion?.target?.titulo || "Confirmar eliminación"}
        message={eliminarEdicion?.target?.mensaje || "¿Seguro que querés eliminar este registro?"}
        warning={eliminarEdicion?.target?.advertencia || ""}
        details={eliminarEdicion?.target?.details || []}
        confirmLabel={eliminarEdicion?.target?.modo === "numero_grupo" ? "Quitar" : "Eliminar"}
        loadingLabel="Procesando..."
        loadingMessage="Procesando eliminación..."
        successMessage={eliminarEdicion?.target?.modo === "numero_grupo" ? "Número quitado correctamente." : "Mesa eliminada correctamente."}
        errorMessage="No se pudo completar la eliminación."
        onClose={eliminarEdicion?.cerrar}
        onConfirm={eliminarEdicion?.confirmar}
      />

      {toastGlobal && (
        <Toast
          key={toastGlobal.id}
          tipo={toastGlobal.tipo}
          mensaje={toastGlobal.mensaje}
          duracion={toastGlobal.duracion}
          onClose={cerrarToastGlobal}
        />
      )}
    </div>
  );

  return dentroDeShell ? contenido : <Principal>{contenido}</Principal>;
};

export default MesasExamen;
