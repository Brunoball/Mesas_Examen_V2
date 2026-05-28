// src/components/Mesas_examen/Mesas_examen.jsx
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faLayerGroup,
  faMagnifyingGlass,
  faTrash,
  faUserPlus,
  faSpinner,
  faTriangleExclamation,
  faCheck,
  faCheckCircle,
  faChartLine,
  faEdit,
  faTimes,
  faChevronUp,
  faChevronDown,
  faEnvelope,
} from "@fortawesome/free-solid-svg-icons";

import "../Global/Global_css/roots.css";
import "../Global/Global_css/Global_Section.css";
import "../Global/Global_css/Global_DivTable.css";
import "./Mesas_examen.css";
import "../Global/Global_css/Global_MesasResponsive.css";
import Principal, { MesasShellContext } from "../Principal/Principal";
import BASE_URL from "../../config/config";
import { useMesasExamen } from "./hooks/useMesasExamen";
import ModalCrearMesa from "./modales/ModalCrearMesa";
import ModalEditarMesa from "./modales/ModalEditarMesa";
import ModalEliminarGlobal from "../Global/Modales/ModalEliminarGlobal";
import Toast from "../Global/Toast";
import ModalTituloPdfMesas from "./modales/exportar_pdf/ModalTituloPdfMesas";
import ModalNotificacionesEmailMesas from "./modales/notificaciones_email/ModalNotificacionesEmailMesas";
import { descargarPdfMesas } from "./modales/exportar_pdf/mesasPdfExporter";
import ModalExportarHistorialGlobal from "../Global/Modales/ModalExportarGlobal";
import BotonExportarHistorialGlobal from "../Global/Botones/BotonExportarHistorialGlobal";
import TextoExpandibleGlobal from "../Global/Modales/TextoExpandibleGlobal";
import {
  contarMesasHistorial,
  contarRegistrosHistorialExportacion,
  descargarExcelHistorialMesas,
  descargarPdfHistorialMesas,
} from "./modales/exportar_historial/historialMesasExporter";
import { obtenerLogoInstitucionalMesas, obtenerPerfilInstitucional } from "./api/mesasExamenApi";

const textoCorto = (valor, fallback = "-") => {
  const texto = String(valor || "").trim();
  return texto || fallback;
};

const textoCursoDivision = (curso, division) => {
  const partes = [curso, division].map((item) => String(item || "").trim()).filter(Boolean);
  return partes.length > 0 ? partes.join(" ") : "-";
};

const normalizarTextoBusqueda = (valor) =>
  String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const normalizarTextoBusquedaFlexible = (valor) =>
  normalizarTextoBusqueda(valor)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const obtenerTerminosBusqueda = (valor) => {
  const texto = normalizarTextoBusquedaFlexible(valor);
  if (!texto) return [];

  const palabras = texto.split(" ").filter(Boolean);
  if (palabras.length <= 1) {
    return palabras.map((palabra) => ({ tipo: "palabra", valor: palabra }));
  }

  // Si el usuario escribe un nombre completo o una frase, se resalta solamente
  // esa coincidencia completa. Así, "GAMBOGGI, BENJAMIN ALEXANDER" no pinta
  // todos los "BENJAMIN" sueltos de la misma mesa.
  return [{ tipo: "frase", valor: palabras.join(" ") }];
};

const crearIndiceBusquedaFlexible = (texto) => {
  const caracteres = Array.from(String(texto || ""));
  let normalizado = "";
  const indicesOriginales = [];

  const agregarEspacio = (indice) => {
    if (!normalizado || normalizado.endsWith(" ")) return;
    normalizado += " ";
    indicesOriginales.push(indice);
  };

  caracteres.forEach((caracter, indice) => {
    const limpio = caracter
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    Array.from(limpio).forEach((charNormalizado) => {
      if (/^[\p{L}\p{N}]$/u.test(charNormalizado)) {
        normalizado += charNormalizado;
        indicesOriginales.push(indice);
      } else {
        agregarEspacio(indice);
      }
    });
  });

  while (normalizado.endsWith(" ")) {
    normalizado = normalizado.slice(0, -1);
    indicesOriginales.pop();
  }

  return { caracteres, normalizado, indicesOriginales };
};

const obtenerValorTerminoBusqueda = (termino) => {
  if (!termino) return "";
  if (typeof termino === "string") return normalizarTextoBusquedaFlexible(termino);
  return normalizarTextoBusquedaFlexible(termino.valor);
};

const obtenerRangosResaltado = (texto, terminos = []) => {
  if (!texto || !Array.isArray(terminos) || terminos.length === 0) return [];

  const { caracteres, normalizado, indicesOriginales } = crearIndiceBusquedaFlexible(texto);
  const rangos = [];

  terminos
    .map((termino) => obtenerValorTerminoBusqueda(termino))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .forEach((termino) => {
      let desde = 0;
      while (desde < normalizado.length) {
        const posicion = normalizado.indexOf(termino, desde);
        if (posicion === -1) break;

        const inicioOriginal = indicesOriginales[posicion];
        const finOriginal = indicesOriginales[posicion + termino.length - 1] + 1;

        if (
          Number.isInteger(inicioOriginal)
          && Number.isInteger(finOriginal)
          && !rangos.some((rango) => inicioOriginal < rango.fin && finOriginal > rango.inicio)
        ) {
          rangos.push({ inicio: inicioOriginal, fin: finOriginal });
        }

        desde = posicion + Math.max(termino.length, 1);
      }
    });

  if (rangos.length === 0) return [];

  return rangos.sort((a, b) => a.inicio - b.inicio).reduce((fusionados, rango) => {
    const ultimo = fusionados[fusionados.length - 1];
    if (ultimo && rango.inicio <= ultimo.fin) {
      ultimo.fin = Math.max(ultimo.fin, rango.fin);
    } else {
      fusionados.push({ ...rango });
    }
    return fusionados;
  }, []).map((rango) => ({
    inicio: rango.inicio,
    fin: rango.fin,
    texto: caracteres.slice(rango.inicio, rango.fin).join(""),
  }));
};

const ResaltarBusqueda = ({ value, terminos = [], fallback = "-" }) => {
  const texto = textoCorto(value, fallback);
  const rangos = obtenerRangosResaltado(texto, terminos);

  if (rangos.length === 0) return <>{texto}</>;

  const partes = [];
  let cursor = 0;

  rangos.forEach((rango, index) => {
    if (rango.inicio > cursor) {
      partes.push(texto.slice(cursor, rango.inicio));
    }

    partes.push(
      <mark key={`mark-${index}-${rango.inicio}`} className="mesas-searchMark">
        {rango.texto}
      </mark>
    );

    cursor = rango.fin;
  });

  if (cursor < texto.length) {
    partes.push(texto.slice(cursor));
  }

  return <>{partes}</>;
};

const scrollHastaCoincidenciaBusqueda = (nodo) => {
  if (!nodo) return;

  const objetivo = nodo.querySelector?.(".mesas-searchMark") || nodo;
  const contenedor = nodo.closest?.(".mesas-pdf-view");

  if (!contenedor || typeof contenedor.scrollTo !== "function") {
    objetivo.scrollIntoView?.({ behavior: "smooth", block: "center", inline: "nearest" });
    return;
  }

  const contenedorRect = contenedor.getBoundingClientRect();
  const objetivoRect = objetivo.getBoundingClientRect();
  const desplazamientoActual = contenedor.scrollTop;
  const destino = desplazamientoActual
    + (objetivoRect.top - contenedorRect.top)
    - (contenedor.clientHeight / 2)
    + (objetivoRect.height / 2);

  contenedor.scrollTo({
    top: Math.max(0, destino),
    behavior: "smooth",
  });
};

const obtenerIdGrupo = (item) => item.id || item.id_grupo || item.id_no_agrupada || item.numero_mesa;

const MESES_ES = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];

const DIAS_ES = ["DOMINGO", "LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO"];

const leerJsonStorage = (key) => {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const obtenerOrigenDesdeUrl = (url) => {
  const value = String(url || "").trim();
  if (!value) return "";

  try {
    return new URL(value, window.location.origin).origin.replace(/\/+$/, "");
  } catch {
    return "";
  }
};

const resolverPublicBaseUrl = () => {
  const publicEnvUrl = String(
    process.env.REACT_APP_PUBLIC_BASE_URL || process.env.REACT_APP_APP_URL || ""
  ).trim();

  if (publicEnvUrl) return publicEnvUrl.replace(/\/+$/, "");

  const configOrigin = obtenerOrigenDesdeUrl(BASE_URL);
  if (configOrigin) return configOrigin;

  if (typeof window !== "undefined") {
    return String(window.location.origin || "").replace(/\/+$/, "");
  }

  return "";
};

const normalizarLogoInstitucionalUrl = (url) => {
  const value = String(url || "").trim();

  if (
    !value
    || value.toLowerCase() === "null"
    || value.toLowerCase() === "undefined"
    || value === "-"
  ) {
    return "";
  }

  if (/^(https?:)?\/\//i.test(value) || value.startsWith("data:") || value.startsWith("blob:")) {
    return value;
  }

  const clean = value.replace(/\\/g, "/");
  const publicBase = resolverPublicBaseUrl();

  return clean.startsWith("/") ? `${publicBase}${clean}` : `${publicBase}/${clean}`;
};

const obtenerDatosInstitucionalesDesde = (perfil = null, tenantDirecto = null) => {
  const tenant = perfil?.tenant || tenantDirecto || null;
  const candidatosLogo = [
    tenant?.logo_icono_url,
    tenant?.logo_url,
    perfil?.tenant_logo_icono_url,
    perfil?.tenant_logo_url,
    perfil?.logo_icono_url,
    perfil?.logo_url,
  ];

  const logoUrl = normalizarLogoInstitucionalUrl(
    candidatosLogo.find((item) => String(item || "").trim() !== "")
  );
  const logoDataUrl = normalizarLogoInstitucionalUrl(
    tenant?.logo_data_url || perfil?.logo_data_url || ""
  );

  const nombre = textoCorto(
    tenant?.nombre || perfil?.tenant_nombre || perfil?.institucion || perfil?.nombre_institucion,
    "Institución"
  );

  return { logoUrl, logoDataUrl, nombre };
};

const obtenerDatosInstitucionalesLocales = () => {
  const usuarioLocal = leerJsonStorage("usuario");
  const tenantLocal = leerJsonStorage("tenant");
  return obtenerDatosInstitucionalesDesde(usuarioLocal, tenantLocal);
};

const obtenerDatosInstitucionalesDesdeEndpointLogo = async (datosBase = null) => {
  const actual = datosBase || obtenerDatosInstitucionalesLocales();

  try {
    const logoData = await obtenerLogoInstitucionalMesas();

    if (!logoData?.exito) {
      return actual;
    }

    const datosLogo = obtenerDatosInstitucionalesDesde(null, logoData.tenant || {
      nombre: logoData.nombre || logoData.tenant_nombre,
      logo_url: logoData.logo_url,
      logo_icono_url: logoData.logo_icono_url || logoData.logo_url,
      logo_data_url: logoData.logo_data_url,
    });

    return {
      ...actual,
      ...datosLogo,
      logoUrl: datosLogo.logoUrl || actual.logoUrl,
      logoDataUrl: datosLogo.logoDataUrl || logoData.logo_data_url || actual.logoDataUrl || "",
      nombre: datosLogo.nombre !== "Institución" ? datosLogo.nombre : actual.nombre,
    };
  } catch (_) {
    return actual;
  }
};

const obtenerInicialesInstitucion = (nombre = "Institución") => {
  const iniciales = String(nombre || "Institución")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte.charAt(0).toUpperCase())
    .join("");

  return iniciales || "I";
};

const HISTORIAL_RESULTADOS_GRID_COLS = "0.65fr 1.35fr 0.65fr 1.2fr 0.55fr 1.15fr 0.45fr 1.15fr";
const HISTORIAL_ARMADOS_GRID_COLS = "0.95fr 1fr 1.35fr 0.65fr 0.75fr 0.7fr 0.95fr 0.9fr";
const HISTORIAL_DETALLE_GRID_COLS = "0.48fr 0.35fr 0.3fr 1.25fr 0.45fr 1.15fr 1.15fr 0.35fr 0.3fr 0.35fr";

const HISTORIAL_RESULTADOS_COLUMNS = [
  { key: "fecha", label: "Fecha nota" },
  { key: "alumno", label: "Alumno" },
  { key: "dni", label: "DNI", align: "is-center" },
  { key: "materia", label: "Materia" },
  { key: "mesa", label: "Mesa" },
  { key: "docente", label: "Docente" },
  { key: "nota", label: "Nota", align: "is-center" },
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
  { key: "dni", label: "DNI", align: "is-center" },
  { key: "materia", label: "Materia" },
  { key: "docente", label: "Docente" },
  { key: "tipo", label: "Tipo", align: "is-center" },
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

const obtenerFechaFiltroMesa = (item) => {
  const texto = String(item?.fecha_mesa || item?.fecha || "").trim();
  if (!texto) return "";

  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) {
    return texto.slice(0, 10);
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(texto)) {
    const [dia, mes, anio] = texto.split("/");
    return `${anio}-${mes}-${dia}`;
  }

  return "";
};

const obtenerLabelFechaFiltroMesa = (item) => {
  const partes = obtenerPartesFechaMesa(item);
  const fechaISO = obtenerFechaFiltroMesa(item);

  if (!partes) {
    return textoCorto(item?.fecha_mesa || item?.fecha || fechaISO, "Sin fecha");
  }

  const dia = String(partes.dia).padStart(2, "0");
  const mes = String(partes.mes).padStart(2, "0");
  return `${partes.diaSemana} ${dia}/${mes}/${partes.anio}`;
};

const obtenerClaveTurnoFiltroMesa = (item) => normalizarTextoBusquedaFlexible(item?.turno);

const obtenerLabelTurnoFiltroMesa = (item) => textoCorto(item?.turno, "Sin turno").toUpperCase();

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

const obtenerNumerosItemMesa = (grupo) => {
  const numeros = Array.isArray(grupo?.numeros) ? grupo.numeros : [];
  const desdeNumeros = numeros
    .map((numero) => Number(numero?.numero_mesa || 0))
    .filter((numero) => numero > 0);

  if (desdeNumeros.length > 0) return desdeNumeros;

  const numeroUnico = Number(grupo?.numero_mesa || 0);
  if (numeroUnico > 0) return [numeroUnico];

  return String(grupo?.numeros_mesa_texto || "")
    .split(/[,·]/)
    .map((item) => Number(String(item).trim()))
    .filter((numero) => numero > 0);
};

const obtenerCambiosDocenteParaGrupo = (grupo, cambiosPorNumero = new Map()) => {
  const numeros = obtenerNumerosItemMesa(grupo);
  return numeros.flatMap((numero) => cambiosPorNumero.get(Number(numero)) || []);
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

const FechaVerticalMesa = ({ grupo, terminosBusqueda = [] }) => {
  const partes = obtenerPartesFechaMesa(grupo);
  const turno = obtenerTurnoMesa(grupo);
  const hora = obtenerHoraMesa(grupo);

  if (!partes) {
    return (
      <div className="pdf-hora-stack">
        <strong><ResaltarBusqueda value={grupo?.fecha || grupo?.fecha_mesa} terminos={terminosBusqueda} /></strong>
        <strong><ResaltarBusqueda value={turno} terminos={terminosBusqueda} /></strong>
        <strong><ResaltarBusqueda value={hora} terminos={terminosBusqueda} /></strong>
      </div>
    );
  }

  return (
    <div className="pdf-hora-stack">
      <strong><ResaltarBusqueda value={partes.diaSemana} terminos={terminosBusqueda} /></strong>
      <strong><ResaltarBusqueda value={partes.dia} terminos={terminosBusqueda} /></strong>
      <strong><ResaltarBusqueda value={partes.mesTexto} terminos={terminosBusqueda} /></strong>
      <strong><ResaltarBusqueda value={turno} terminos={terminosBusqueda} /></strong>
      <strong><ResaltarBusqueda value={hora} terminos={terminosBusqueda} /></strong>
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

const PDF_GRID_COLS = "9% 22% 24% 8% 8% 7% 22%";

const LogoInstitucionalPdf = ({ logoUrl = "", nombre = "Institución" }) => {
  const [logoError, setLogoError] = useState(false);
  const mostrarLogo = Boolean(logoUrl) && !logoError;

  useEffect(() => {
    setLogoError(false);
  }, [logoUrl]);

  return mostrarLogo ? (
    <img src={logoUrl} alt={`Logo de ${nombre}`} onError={() => setLogoError(true)} />
  ) : (
    <span className="mesas-pdf-logoFallback" aria-hidden="true">
      {obtenerInicialesInstitucion(nombre)}
    </span>
  );
};

const PdfGridHead = () => (
  <div className="mesas-pdf-gridHead" style={{ gridTemplateColumns: PDF_GRID_COLS }} role="row">
    <div className="mesas-pdf-headCell pdf-col-hora" role="columnheader">Hora</div>
    <div className="mesas-pdf-headCell pdf-col-materia" role="columnheader">Espacio Curricular</div>
    <div className="mesas-pdf-headCell pdf-col-estudiante" role="columnheader">Estudiante</div>
    <div className="mesas-pdf-headCell pdf-col-dni" role="columnheader">DNI</div>
    <div className="mesas-pdf-headCell pdf-col-curso" role="columnheader">Curso</div>
    <div className="mesas-pdf-headCell pdf-col-nota" role="columnheader">Nota</div>
    <div className="mesas-pdf-headCell pdf-col-docente" role="columnheader">Docentes</div>
  </div>
);

const MesaPdfCard = ({
  grupo,
  esNoAgrupada = false,
  onEdit,
  onDelete,
  onGuardarNota,
  guardandoNotas = {},
  terminosBusqueda = [],
  cambiosDocentePendientes = [],
  onAbrirCambiosDocente,
  cardRef = null,
  logoInstitucionalUrl = "",
  institucionNombre = "Institución",
}) => {
  const bloques = obtenerBloquesVistaPdf(grupo);
  const totalFilas = Math.max(
    1,
    bloques.reduce((total, bloque) => total + Math.max(1, bloque.alumnos.length), 0)
  );
  const numerosTexto = obtenerTextoNumerosMesa(grupo);
  const tieneCambioDocentePendiente = Array.isArray(cambiosDocentePendientes) && cambiosDocentePendientes.length > 0;
  const numerosCambiados = useMemo(() => new Set(
    (Array.isArray(cambiosDocentePendientes) ? cambiosDocentePendientes : [])
      .map((cambio) => Number(cambio?.numero_mesa || 0))
      .filter((numero) => numero > 0)
  ), [cambiosDocentePendientes]);
  const numerosHeader = useMemo(() => obtenerNumerosItemMesa(grupo), [grupo]);
  let horaMostrada = false;

  return (
    <article
      ref={cardRef}
      className={`mesas-pdf-sheet ${terminosBusqueda.length > 0 ? "mesas-pdf-sheet--searching" : ""} ${tieneCambioDocentePendiente ? "mesas-pdf-sheet--docenteCambio" : ""}`}
      data-mesas-search-result={terminosBusqueda.length > 0 ? "true" : undefined}
      data-mesa-docente-cambio={tieneCambioDocentePendiente ? "true" : undefined}
    >
      <header className="mesas-pdf-header">
        <div className="mesas-pdf-brand">
          <LogoInstitucionalPdf logoUrl={logoInstitucionalUrl} nombre={institucionNombre} />
          <div>
            <h3>{obtenerTituloVistaPdf(grupo)}</h3>
            <p>{institucionNombre}</p>
          </div>
        </div>
        <div className="mesas-pdf-meta">
          <span><ResaltarBusqueda value={obtenerFechaResumenPdf(grupo)} terminos={terminosBusqueda} /></span>
          <strong className="mesas-numeroMesaHeaderWrap">
            <span>N° de mesa:</span>
            {numerosHeader.length > 0 ? (
              <span className="mesas-numeroMesaHeaderList">
                {numerosHeader.map((numero, index) => {
                  const afectado = numerosCambiados.has(Number(numero));
                  return (
                    <React.Fragment key={`numero-header-${numero}-${index}`}>
                      <span
                        className={`mesas-numeroMesaHeader ${afectado ? "mesas-numeroMesaHeader--docenteCambio" : ""}`}
                        title={afectado ? "Este número tiene cambio de docente pendiente" : undefined}
                      >
                        <ResaltarBusqueda value={String(numero)} terminos={terminosBusqueda} />
                      </span>
                      {index < numerosHeader.length - 1 && <span className="mesas-numeroMesaHeaderSep">·</span>}
                    </React.Fragment>
                  );
                })}
              </span>
            ) : (
              <ResaltarBusqueda value={numerosTexto} terminos={terminosBusqueda} />
            )}
          </strong>
          {tieneCambioDocentePendiente && (
            <button
              type="button"
              className="mesas-docenteCambioBadge"
              onClick={onAbrirCambiosDocente}
              title="Ver cambios de docente pendientes"
            >
              <FontAwesomeIcon icon={faTriangleExclamation} /> Docente cambiado pendiente
            </button>
          )}
        </div>
      </header>

      <div className="mesas-pdf-table-wrap">
        <div className="mesas-pdf-table mesas-pdf-divTable" role="table" aria-label="Detalle de mesa">
          <PdfGridHead />
          <div className="mesas-pdf-gridBody" style={{ gridTemplateColumns: PDF_GRID_COLS }} role="rowgroup">
            {bloques.map((bloque) =>
              bloque.alumnos.map((alumno, alumnoIndex) => {
                const debeMostrarHora = !horaMostrada;
                if (debeMostrarHora) horaMostrada = true;
                const rowSpanMateria = Math.max(1, bloque.alumnos.length);

                return (
                  <React.Fragment key={`${bloque.id}-${alumno?.id_mesa || alumno?.id_previa || alumnoIndex}`}>
                    {debeMostrarHora && (
                      <div className="mesas-pdf-cell pdf-hora-cell" style={{ gridRow: `span ${totalFilas}` }} role="cell" data-label="Hora">
                        <FechaVerticalMesa grupo={grupo} terminosBusqueda={terminosBusqueda} />
                      </div>
                    )}

                    {alumnoIndex === 0 && (
                      <div
                        className="mesas-pdf-cell pdf-materia-line-cell"
                        style={{ gridRow: `span ${rowSpanMateria}` }}
                        role="cell"
                        data-label="Espacio Curricular"
                      >
                        <strong><ResaltarBusqueda value={bloque.materia} terminos={terminosBusqueda} /></strong>
                      </div>
                    )}

                    <div className="mesas-pdf-cell pdf-estudiante-cell" role="cell" data-label="Estudiante">
                      {alumno ? <ResaltarBusqueda value={alumno.estudiante || alumno.alumno} fallback="Sin estudiante" terminos={terminosBusqueda} /> : "Sin alumnos vinculados"}
                    </div>
                    <div className="mesas-pdf-cell pdf-dni-cell" role="cell" data-label="DNI">
                      {alumno ? <ResaltarBusqueda value={alumno.dni} terminos={terminosBusqueda} /> : "-"}
                    </div>
                    <div className="mesas-pdf-cell pdf-curso-cell" role="cell" data-label="Curso">
                      {alumno ? <ResaltarBusqueda value={obtenerCursoAlumno(alumno)} terminos={terminosBusqueda} /> : "-"}
                    </div>
                    <div className="mesas-pdf-cell pdf-nota-cell" role="cell" data-label="Nota">
                      <SelectorNotaAlumno
                        alumno={alumno}
                        guardando={alumno ? !!guardandoNotas[obtenerKeyNotaAlumno(alumno)] : false}
                        onGuardarNota={onGuardarNota}
                      />
                    </div>

                    {alumnoIndex === 0 && (
                      <div
                        className="mesas-pdf-cell pdf-docente-line-cell"
                        style={{ gridRow: `span ${rowSpanMateria}` }}
                        role="cell"
                        data-label="Docentes"
                      >
                        <strong><ResaltarBusqueda value={bloque.docente} terminos={terminosBusqueda} /></strong>
                      </div>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </div>
        </div>
      </div>

      <footer className="mesas-pdf-actions" aria-label="Acciones de mesa">
        <div className="mov-actionsInline mesas-pdf-actionsInline">
          <button type="button" className="mov-iconBtn materias-icon-btn mesas-pdf-iconBtn" onClick={onEdit} title="Editar" aria-label="Editar">
            <FontAwesomeIcon icon={faEdit} />
          </button>
          <button type="button" className="mov-iconBtn mov-iconBtn--danger materias-icon-btn materias-icon-danger mesas-pdf-iconBtn" onClick={onDelete} title="Eliminar" aria-label="Eliminar">
            <FontAwesomeIcon icon={faTrash} />
          </button>
        </div>
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

const HistorialDescripcionExpandible = ({ value, title = "Descripción completa", subtitle = "" }) => (
  <TextoExpandibleGlobal
    value={value}
    fallback="Sin descripción"
    title={title}
    subtitle={subtitle}
    className="mesas-historial-expandible"
    textClassName="mesas-historial-expandible__text"
    buttonClassName="mesas-historial-expandible__button"
    modalCloseLabel="Cerrar"
  />
);

const HistorialMesasPanel = ({ historial, busqueda = "", terminosBusqueda = [] }) => {
  const resultados = Array.isArray(historial?.resultados) ? historial.resultados : [];
  const armados = Array.isArray(historial?.armados) ? historial.armados : [];
  const resumen = historial?.resumen || {};
  const detalle = historial?.detalleArmado || null;
  const detalleFilas = Array.isArray(detalle?.detalle) ? detalle.detalle : [];
  const filasHistorialRefs = useRef({});
  const hayBusquedaHistorial = String(busqueda || "").trim() !== "";

  const registrarFilaHistorial = useCallback((clave, node) => {
    if (!clave) return;

    if (node) {
      filasHistorialRefs.current[clave] = node;
    } else {
      delete filasHistorialRefs.current[clave];
    }
  }, []);

  useEffect(() => {
    if (!hayBusquedaHistorial || historial?.cargando) return undefined;

    const clavePrimerResultado = resultados[0]?.id_resultado
      ? `resultado-${resultados[0].id_resultado}`
      : armados[0]?.id_armado_historial
        ? `armado-${armados[0].id_armado_historial}`
        : detalleFilas[0]?.id_historial_detalle
          ? `detalle-${detalleFilas[0].id_historial_detalle}`
          : "";

    if (!clavePrimerResultado) return undefined;

    const timer = window.setTimeout(() => {
      const nodo = filasHistorialRefs.current[clavePrimerResultado];
      if (!nodo) return;

      scrollHastaCoincidenciaBusqueda(nodo);
    }, 140);

    return () => window.clearTimeout(timer);
  }, [armados, detalleFilas, hayBusquedaHistorial, historial?.cargando, resultados]);

  const totalAprobadas = resumen.total_aprobadas ?? resultados.filter((item) => Number(item.aprobado) === 1).length;
  const totalDesaprobadas = resumen.total_desaprobadas ?? resultados.filter((item) => Number(item.aprobado) !== 1).length;
  const tarjetasHistorial = [
    {
      key: "resultados",
      titulo: "Resultados",
      valor: resumen.total_resultados ?? resultados.length,
      detalle: "notas registradas",
      icono: faChartLine,
      tono: "blue",
    },
    {
      key: "aprobadas",
      titulo: "Aprobadas",
      valor: totalAprobadas,
      detalle: "previas aprobadas",
      icono: faCheckCircle,
      tono: "green",
    },
    {
      key: "no-aprobadas",
      titulo: "No aprobadas",
      valor: totalDesaprobadas,
      detalle: "previas pendientes",
      icono: faTriangleExclamation,
      tono: "red",
    },
    {
      key: "armados",
      titulo: "Armados eliminados",
      valor: resumen.total_armados ?? armados.length,
      detalle: "guardados en historial",
      icono: faLayerGroup,
      tono: "purple",
    },
  ];

  return (
    <div className="mesas-historial-panel">
      <div className="mesas-historial-resumen" aria-label="Resumen del historial">
        {tarjetasHistorial.map((tarjeta) => (
          <article key={tarjeta.key} className={`mesas-historial-kpi mesas-historial-kpi--${tarjeta.tono}`}>
            <div className="mesas-historial-kpiIcon">
              <FontAwesomeIcon icon={tarjeta.icono} />
            </div>
            <div className="mesas-historial-kpiBody">
              <span>{tarjeta.titulo}</span>
              <strong>{Number(tarjeta.valor || 0).toLocaleString("es-AR")}</strong>
              <small>{tarjeta.detalle}</small>
            </div>
          </article>
        ))}
      </div>

      {historial?.cargando ? (
        <div className="cc-emptyState mesas-empty mesas-pdf-empty">
          <FontAwesomeIcon icon={faSpinner} spin />
          <div className="cc-emptyText">Cargando historial...</div>
        </div>
      ) : (
        <>
          <section className="mesas-historial-section mov-card mov-card--table">
            <div className="mesas-historial-sectionTitle mesas-historial-sectionTitle--withIndicators">
              <h4>Historial de notas y previas</h4>

              <div className="mesas-historial-indicadores" aria-label="Indicadores de resultado">
                <span className="mesas-historial-indicador mesas-historial-indicador--approved">
                  <span className="mesas-historial-indicador__dot" aria-hidden="true" />
                  Aprobó
                </span>
                <span className="mesas-historial-indicador mesas-historial-indicador--pending">
                  <span className="mesas-historial-indicador__dot" aria-hidden="true" />
                  No aprobó
                </span>
              </div>
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
                        const claveFila = `resultado-${item.id_resultado}`;
                        return (
                          <div
                            key={claveFila}
                            ref={(node) => registrarFilaHistorial(claveFila, node)}
                            className={[
                              "mov-gridTable",
                              "mov-gridTable--row",
                              "global-divTable__row",
                              "mesas-historial-gridRow",
                              "mesas-historial-gridRow--resultado",
                              aprobado ? "is-approved" : "is-pending",
                            ].join(" ")}
                            style={{ gridTemplateColumns: HISTORIAL_RESULTADOS_GRID_COLS }}
                            role="row"
                            data-mesas-search-result={terminosBusqueda.length > 0 ? "true" : undefined}
                          >
                            <div className="mov-gridCell" role="cell" data-label="Fecha nota">
                              <ResaltarBusqueda value={item.fecha_nota_texto || item.fecha_nota} terminos={terminosBusqueda} />
                            </div>
                            <div className="mov-gridCell is-strong" role="cell" data-label="Alumno" title={textoCorto(item.alumno)}>
                              <ResaltarBusqueda value={item.alumno} terminos={terminosBusqueda} />
                            </div>
                            <div className="mov-gridCell is-center" role="cell" data-label="DNI"><ResaltarBusqueda value={item.dni} terminos={terminosBusqueda} /></div>
                            <div className="mov-gridCell" role="cell" data-label="Materia" title={textoCorto(item.materia)}>
                              <ResaltarBusqueda value={item.materia} terminos={terminosBusqueda} />
                            </div>
                            <div className="mov-gridCell" role="cell" data-label="Mesa">
                              <div className="mesas-historial-stack">
                                <span className="mesas-historial-chip">N° <ResaltarBusqueda value={item.numero_mesa} terminos={terminosBusqueda} /></span>
                                {item.numero_grupo && <small>Grupo <ResaltarBusqueda value={item.numero_grupo} terminos={terminosBusqueda} /></small>}
                                {item.fecha_mesa_texto && <small><ResaltarBusqueda value={item.fecha_mesa_texto} terminos={terminosBusqueda} /></small>}
                              </div>
                            </div>
                            <div className="mov-gridCell" role="cell" data-label="Docente" title={textoCorto(item.docente)}>
                              <ResaltarBusqueda value={item.docente} terminos={terminosBusqueda} />
                            </div>
                            <div className="mov-gridCell is-center" role="cell" data-label="Nota">
                              <strong className="mesas-historial-nota">{item.nota}</strong>
                            </div>
                            <div className="mov-gridCell mesas-historial-descriptionCell" role="cell" data-label="Motivo">
                              <HistorialDescripcionExpandible
                                value={item.descripcion || item.motivo}
                                title="Descripción completa"
                                subtitle={`Historial de ${textoCorto(item.alumno, "alumno")}`}
                              />
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
                      {armados.map((item) => {
                        const claveFila = `armado-${item.id_armado_historial}`;

                        return (
                        <div
                          key={claveFila}
                          ref={(node) => registrarFilaHistorial(claveFila, node)}
                          className="mov-gridTable mov-gridTable--row global-divTable__row mesas-historial-gridRow"
                          style={{ gridTemplateColumns: HISTORIAL_ARMADOS_GRID_COLS }}
                          role="row"
                          data-mesas-search-result={terminosBusqueda.length > 0 ? "true" : undefined}
                        >
                          <div className="mov-gridCell" role="cell" data-label="Guardado">
                            <ResaltarBusqueda value={item.creado_en_texto || item.creado_en} terminos={terminosBusqueda} />
                          </div>
                          <div className="mov-gridCell is-strong" role="cell" data-label="Código" title={textoCorto(item.codigo_armado)}>
                            <ResaltarBusqueda value={item.codigo_armado} terminos={terminosBusqueda} />
                          </div>
                          <div className="mov-gridCell mesas-historial-descriptionCell" role="cell" data-label="Motivo">
                            <HistorialDescripcionExpandible
                              value={item.descripcion || item.motivo}
                              title="Descripción completa"
                              subtitle={`Armado ${textoCorto(item.codigo_armado, "sin código")}`}
                            />
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
                        );
                      })}
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
                        {detalleFilas.map((item) => {
                          const claveFila = `detalle-${item.id_historial_detalle}`;

                          return (
                          <div
                            key={claveFila}
                            ref={(node) => registrarFilaHistorial(claveFila, node)}
                            className="mov-gridTable mov-gridTable--row global-divTable__row mesas-historial-gridRow"
                            style={{ gridTemplateColumns: HISTORIAL_DETALLE_GRID_COLS }}
                            role="row"
                          >
                            <div className="mov-gridCell" role="cell" data-label="Fecha"><ResaltarBusqueda value={item.fecha_mesa_texto || item.fecha_mesa} terminos={terminosBusqueda} /></div>
                            <div className="mov-gridCell is-center" role="cell" data-label="Grupo"><ResaltarBusqueda value={item.numero_grupo} terminos={terminosBusqueda} /></div>
                            <div className="mov-gridCell is-center" role="cell" data-label="Mesa"><ResaltarBusqueda value={item.numero_mesa} terminos={terminosBusqueda} /></div>
                            <div className="mov-gridCell is-strong" role="cell" data-label="Alumno" title={textoCorto(item.alumno)}><ResaltarBusqueda value={item.alumno} terminos={terminosBusqueda} /></div>
                            <div className="mov-gridCell is-center" role="cell" data-label="DNI"><ResaltarBusqueda value={item.dni} terminos={terminosBusqueda} /></div>
                            <div className="mov-gridCell" role="cell" data-label="Materia" title={textoCorto(item.materia)}><ResaltarBusqueda value={item.materia} terminos={terminosBusqueda} /></div>
                            <div className="mov-gridCell" role="cell" data-label="Docente" title={textoCorto(item.docente)}><ResaltarBusqueda value={item.docente} terminos={terminosBusqueda} /></div>
                            <div className="mov-gridCell is-center" role="cell" data-label="Tipo"><ResaltarBusqueda value={item.tipo_mesa} terminos={terminosBusqueda} /></div>
                            <div className="mov-gridCell is-center" role="cell" data-label="Nota"><ResaltarBusqueda value={item.nota} terminos={terminosBusqueda} /></div>
                            <div className="mov-gridCell is-center" role="cell" data-label="Activa">{Number(item.previa_activa) === 1 ? "Sí" : "No"}</div>
                          </div>
                          );
                        })}
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


const ModalCambiosDocentePendientes = ({
  abierto = false,
  cambios = [],
  cargando = false,
  resolviendoId = null,
  ignorandoId = null,
  onClose,
  onAplicar,
  onIgnorar,
  onAbrirMesa,
}) => {
  if (!abierto) return null;

  const lista = Array.isArray(cambios) ? cambios : [];

  const contenido = (
    <div className="mesas-docenteCambioOverlay" role="dialog" aria-modal="true" aria-label="Cambios de docente pendientes">
      <div className="mesas-docenteCambioModal">
        <div className="mesas-docenteCambioModal__head">
          <div className="mesas-docenteCambioModal__icon">
            <FontAwesomeIcon icon={faTriangleExclamation} />
          </div>
          <div>
            <h3>Cambios de docente detectados</h3>
            <p>
              Hay números de mesa armados con una cátedra cuyo docente fue modificado. Revisalos para evitar cruces o docentes incorrectos en el armado.
            </p>
          </div>
          <button type="button" className="mesas-docenteCambioModal__close" onClick={onClose} title="Cerrar">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        {cargando ? (
          <div className="mesas-docenteCambioModal__loading">
            <FontAwesomeIcon icon={faSpinner} spin /> Buscando cambios pendientes...
          </div>
        ) : lista.length === 0 ? (
          <div className="mesas-docenteCambioModal__empty">No hay cambios pendientes.</div>
        ) : (
          <div className="mesas-docenteCambioList">
            {lista.map((cambio) => {
              const id = Number(cambio?.id_cambio || 0);
              const ocupado = resolviendoId === id || ignorandoId === id;

              return (
                <article key={id || `${cambio?.numero_mesa}-${cambio?.id_catedra}`} className="mesas-docenteCambioItem">
                  <div className="mesas-docenteCambioItem__main">
                    <strong>Mesa N° {textoCorto(cambio?.numero_mesa)}</strong>
                    {cambio?.numero_grupo && <span>Grupo {cambio.numero_grupo}</span>}
                    <small>{textoCorto(cambio?.materia, "Materia sin especificar")}</small>
                  </div>

                  <div className="mesas-docenteCambioItem__docentes">
                    <div>
                      <span>Antes</span>
                      <strong>{textoCorto(cambio?.docente_anterior, "Sin docente")}</strong>
                    </div>
                    <div>
                      <span>Nuevo</span>
                      <strong>{textoCorto(cambio?.docente_nuevo, "Sin docente")}</strong>
                    </div>
                  </div>

                  <div className="mesas-docenteCambioItem__meta">
                    <span>{textoCorto(cambio?.fecha_mesa_texto || cambio?.fecha_mesa, "Sin fecha")}</span>
                    <span>{textoCorto(cambio?.turno, "Sin turno")}</span>
                  </div>

                  <div className="mesas-docenteCambioItem__actions">
                    <button
                      type="button"
                      className="mesas-docenteCambioBtn mesas-docenteCambioBtn--ghost"
                      onClick={() => onAbrirMesa?.(cambio)}
                      disabled={ocupado}
                    >
                      Ver mesa
                    </button>
                    <button
                      type="button"
                      className="mesas-docenteCambioBtn mesas-docenteCambioBtn--primary"
                      onClick={() => onAplicar?.(cambio)}
                      disabled={ocupado}
                    >
                      {resolviendoId === id ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faEdit} />}
                      Aplicar y editar
                    </button>
                    <button
                      type="button"
                      className="mesas-docenteCambioBtn mesas-docenteCambioBtn--danger"
                      onClick={() => onIgnorar?.(cambio)}
                      disabled={ocupado}
                    >
                      {ignorandoId === id ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faTimes} />}
                      Ignorar
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(contenido, document.body) : contenido;
};

const MesasExamen = () => {
  const dentroDeShell = useContext(MesasShellContext);
  const [toastGlobal, setToastGlobal] = useState(null);
  const erroresToastRef = useRef({});

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
    mesasFiltradas: mesasFiltradasBase,
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
    cambiosDocente,
    guardandoNotas,
    guardarNotaAlumno,
    crearMesas,
    eliminarBorrador,
    cargando,
    armando,
    agrupando,
    error,
  } = useMesasExamen({ onToast: mostrarToastGlobal });

  const [indiceBusquedaActivo, setIndiceBusquedaActivo] = useState(0);
  const [datosInstitucionales, setDatosInstitucionales] = useState(() => obtenerDatosInstitucionalesLocales());
  const [modalNotificacionesEmailAbierto, setModalNotificacionesEmailAbierto] = useState(false);

  const abrirModalNotificacionesEmail = useCallback(() => {
    setModalNotificacionesEmailAbierto(true);
  }, []);

  const cerrarModalNotificacionesEmail = useCallback(() => {
    setModalNotificacionesEmailAbierto(false);
  }, []);

  useEffect(() => {
    let cancelado = false;

    setDatosInstitucionales(obtenerDatosInstitucionalesLocales());

    const cargarDatosInstitucionales = async () => {
      try {
        const data = await obtenerPerfilInstitucional();
        if (cancelado || !data?.exito) return;

        const perfilApi = data.perfil || data.usuario || null;
        const tenantApi = data.tenant || perfilApi?.tenant || null;
        const datos = obtenerDatosInstitucionalesDesde(perfilApi, tenantApi);

        if (datos.logoUrl || datos.logoDataUrl || datos.nombre !== "Institución") {
          setDatosInstitucionales(datos);
        }

        const datosConLogo = await obtenerDatosInstitucionalesDesdeEndpointLogo(datos);
        if (!cancelado) {
          setDatosInstitucionales(datosConLogo);
        }
      } catch (_) {
        if (!cancelado) {
          setDatosInstitucionales(obtenerDatosInstitucionalesLocales());
        }
      }
    };

    cargarDatosInstitucionales();

    return () => {
      cancelado = true;
    };
  }, []);

  const [filtroFechaMesa, setFiltroFechaMesa] = useState("");
  const [filtroTurnoMesa, setFiltroTurnoMesa] = useState("");

  const baseOpcionesFiltrosMesas = useMemo(() => {
    if (tab === "historial") return [];
    return tab === "no-agrupadas"
      ? (Array.isArray(noAgrupadas) ? noAgrupadas : [])
      : (Array.isArray(gruposFinales) ? gruposFinales : []);
  }, [gruposFinales, noAgrupadas, tab]);

  const opcionesFechaMesas = useMemo(() => {
    const mapa = new Map();

    baseOpcionesFiltrosMesas.forEach((item) => {
      const value = obtenerFechaFiltroMesa(item);
      if (!value || mapa.has(value)) return;
      mapa.set(value, { value, label: obtenerLabelFechaFiltroMesa(item) });
    });

    return Array.from(mapa.values()).sort((a, b) => a.value.localeCompare(b.value));
  }, [baseOpcionesFiltrosMesas]);

  const opcionesTurnoMesas = useMemo(() => {
    const mapa = new Map();

    baseOpcionesFiltrosMesas.forEach((item) => {
      const value = obtenerClaveTurnoFiltroMesa(item);
      if (!value || mapa.has(value)) return;
      mapa.set(value, { value, label: obtenerLabelTurnoFiltroMesa(item) });
    });

    return Array.from(mapa.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [baseOpcionesFiltrosMesas]);

  useEffect(() => {
    if (tab === "historial") {
      if (filtroFechaMesa) setFiltroFechaMesa("");
      if (filtroTurnoMesa) setFiltroTurnoMesa("");
      return;
    }

    if (filtroFechaMesa && !opcionesFechaMesas.some((item) => item.value === filtroFechaMesa)) {
      setFiltroFechaMesa("");
    }

    if (filtroTurnoMesa && !opcionesTurnoMesas.some((item) => item.value === filtroTurnoMesa)) {
      setFiltroTurnoMesa("");
    }
  }, [filtroFechaMesa, filtroTurnoMesa, opcionesFechaMesas, opcionesTurnoMesas, tab]);

  const mesasFiltradas = useMemo(() => {
    const base = Array.isArray(mesasFiltradasBase) ? mesasFiltradasBase : [];
    if (tab === "historial") return base;

    return base.filter((item) => {
      const coincideFecha = !filtroFechaMesa || obtenerFechaFiltroMesa(item) === filtroFechaMesa;
      const coincideTurno = !filtroTurnoMesa || obtenerClaveTurnoFiltroMesa(item) === filtroTurnoMesa;
      return coincideFecha && coincideTurno;
    });
  }, [filtroFechaMesa, filtroTurnoMesa, mesasFiltradasBase, tab]);

  const hayFiltrosMesasActivos = tab !== "historial" && Boolean(filtroFechaMesa || filtroTurnoMesa);
  const limpiarFiltrosMesas = useCallback(() => {
    setFiltroFechaMesa("");
    setFiltroTurnoMesa("");
  }, []);

  const totalHistorialVisible = (Array.isArray(historial?.resultados) ? historial.resultados.length : 0)
    + (Array.isArray(historial?.armados) ? historial.armados.length : 0);
  const totalVisible = tab === "historial" ? totalHistorialVisible : (Array.isArray(mesasFiltradas) ? mesasFiltradas.length : 0);
  const totalReferencia = tab === "historial" ? totalHistorialVisible : tab === "no-agrupadas" ? totalNoAgrupadas : totalGrupos;
  const hayMesasCreadas = totalGrupos > 0 || totalNoAgrupadas > 0;
  const hayBusquedaActiva = String(busqueda || "").trim() !== "";
  const totalResultadosBusqueda = hayBusquedaActiva ? totalVisible : 0;
  const hayResultadosBusqueda = hayBusquedaActiva && totalResultadosBusqueda > 0;
  const puedeNavegarBusqueda = hayResultadosBusqueda && totalResultadosBusqueda > 1;
  const indiceBusquedaVisible = hayResultadosBusqueda ? Math.min(indiceBusquedaActivo + 1, totalResultadosBusqueda) : 0;
  const terminosBusqueda = useMemo(() => obtenerTerminosBusqueda(busqueda), [busqueda]);
  const tarjetasMesasRefs = useRef({});
  const cambiosDocentePorNumero = useMemo(() => {
    const mapa = new Map();
    const pendientes = Array.isArray(cambiosDocente?.pendientes) ? cambiosDocente.pendientes : [];

    pendientes.forEach((cambio) => {
      const numero = Number(cambio?.numero_mesa || 0);
      if (!numero) return;
      const actuales = mapa.get(numero) || [];
      actuales.push(cambio);
      mapa.set(numero, actuales);
    });

    return mapa;
  }, [cambiosDocente?.pendientes]);

  const cambiosDocentePendientesLista = Array.isArray(cambiosDocente?.pendientes) ? cambiosDocente.pendientes : [];
  const totalCambiosDocentePendientes = cambiosDocentePendientesLista.length;
  const textoNumerosCambiosDocente = useMemo(() => {
    const numeros = Array.from(new Set(
      cambiosDocentePendientesLista
        .map((cambio) => Number(cambio?.numero_mesa || 0))
        .filter((numero) => numero > 0)
    ));

    if (numeros.length === 0) return "Sin número específico";
    return numeros.slice(0, 8).join(" · ") + (numeros.length > 8 ? ` · +${numeros.length - 8}` : "");
  }, [cambiosDocentePendientesLista]);

  const abrirPanelCambiosDocente = useCallback(() => {
    if (typeof cambiosDocente?.abrir === "function") {
      cambiosDocente.abrir();
      return;
    }

    cambiosDocente?.recargar?.({ abrirModal: true });
  }, [cambiosDocente]);

  const recargarCambiosDocente = useCallback(() => {
    cambiosDocente?.recargar?.({ abrirModal: false });
  }, [cambiosDocente]);

  const capturarScrollVistaMesas = useCallback(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return null;

    const contenedor = document.querySelector(".mesas-pdf-view");

    return {
      contenedorTop: contenedor ? contenedor.scrollTop : 0,
      contenedorLeft: contenedor ? contenedor.scrollLeft : 0,
      windowX: window.scrollX || window.pageXOffset || 0,
      windowY: window.scrollY || window.pageYOffset || 0,
    };
  }, []);

  const restaurarScrollVistaMesas = useCallback((posicion) => {
    if (!posicion || typeof window === "undefined" || typeof document === "undefined") return;

    let intentos = 0;
    const aplicar = () => {
      const contenedor = document.querySelector(".mesas-pdf-view");

      if (contenedor) {
        contenedor.scrollTop = posicion.contenedorTop || 0;
        contenedor.scrollLeft = posicion.contenedorLeft || 0;
      }

      if (typeof window.scrollTo === "function") {
        window.scrollTo(posicion.windowX || 0, posicion.windowY || 0);
      }

      intentos += 1;
      if (intentos < 4) {
        window.setTimeout(aplicar, intentos === 1 ? 0 : 80);
      }
    };

    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(aplicar);
    } else {
      window.setTimeout(aplicar, 0);
    }
  }, []);

  const guardarNotaAlumnoManteniendoScroll = useCallback(async (payload = {}) => {
    const posicion = capturarScrollVistaMesas();

    try {
      return await guardarNotaAlumno(payload);
    } finally {
      restaurarScrollVistaMesas(posicion);
    }
  }, [capturarScrollVistaMesas, guardarNotaAlumno, restaurarScrollVistaMesas]);

  const registrarTarjetaMesa = useCallback((id, node) => {
    const clave = String(id || "");
    if (!clave) return;

    if (node) {
      tarjetasMesasRefs.current[clave] = node;
    } else {
      delete tarjetasMesasRefs.current[clave];
    }
  }, []);

  const [modalTituloPdfAbierto, setModalTituloPdfAbierto] = useState(false);
  const [exportandoPdf, setExportandoPdf] = useState(false);
  const [modalExportarHistorialAbierto, setModalExportarHistorialAbierto] = useState(false);
  const [exportandoHistorial, setExportandoHistorial] = useState(false);
  const [guardarHistorialArmado, setGuardarHistorialArmado] = useState(true);
  const [confirmarSinHistorialArmado, setConfirmarSinHistorialArmado] = useState(false);

  useEffect(() => {
    if (!eliminarArmado?.modalAbierto) {
      setGuardarHistorialArmado(true);
      setConfirmarSinHistorialArmado(false);
      return;
    }

    setGuardarHistorialArmado(true);
    setConfirmarSinHistorialArmado(false);
  }, [eliminarArmado?.modalAbierto]);

  const obtenerNodosResultadosBusqueda = useCallback(() => {
    if (typeof document === "undefined") return [];

    const contenedor = document.querySelector(".mesas-pdf-view");
    if (!contenedor) return [];

    return Array.from(contenedor.querySelectorAll('[data-mesas-search-result="true"]'));
  }, []);

  const desplazarAResultadoBusqueda = useCallback((indice = 0) => {
    const nodos = obtenerNodosResultadosBusqueda();
    if (nodos.length === 0) return;

    const indiceSeguro = ((indice % nodos.length) + nodos.length) % nodos.length;
    scrollHastaCoincidenciaBusqueda(nodos[indiceSeguro]);
  }, [obtenerNodosResultadosBusqueda]);

  const cambiarResultadoBusqueda = useCallback((direccion) => {
    if (!hayResultadosBusqueda) return;

    setIndiceBusquedaActivo((actual) => {
      const siguiente = ((actual + direccion) % totalResultadosBusqueda + totalResultadosBusqueda) % totalResultadosBusqueda;

      window.setTimeout(() => {
        desplazarAResultadoBusqueda(siguiente);
      }, 0);

      return siguiente;
    });
  }, [desplazarAResultadoBusqueda, hayResultadosBusqueda, totalResultadosBusqueda]);

  useEffect(() => {
    setIndiceBusquedaActivo(0);

    if (!hayResultadosBusqueda) return undefined;

    const timer = window.setTimeout(() => {
      desplazarAResultadoBusqueda(0);
    }, 140);

    return () => window.clearTimeout(timer);
  }, [busqueda, desplazarAResultadoBusqueda, hayResultadosBusqueda, tab, totalResultadosBusqueda]);

  const cambiarGuardarHistorialArmado = useCallback((event) => {
    const checked = !!event.target.checked;
    setGuardarHistorialArmado(checked);
    if (checked) {
      setConfirmarSinHistorialArmado(false);
    }
  }, []);

  const prepararConfirmacionEliminarArmado = useCallback(() => {
    if (!guardarHistorialArmado && !confirmarSinHistorialArmado) {
      setConfirmarSinHistorialArmado(true);
      return false;
    }

    return true;
  }, [guardarHistorialArmado, confirmarSinHistorialArmado]);

  const confirmarEliminarArmadoDesdeModal = useCallback(() => {
    return eliminarArmado?.confirmar?.({
      guardarHistorial: guardarHistorialArmado,
    });
  }, [eliminarArmado, guardarHistorialArmado]);

  const cerrarModalEliminarArmado = useCallback(() => {
    setGuardarHistorialArmado(true);
    setConfirmarSinHistorialArmado(false);
    eliminarArmado?.cerrar?.();
  }, [eliminarArmado]);

  const contenidoEliminarArmado = confirmarSinHistorialArmado ? (
    <div className="mesas-eliminar-historial mesas-eliminar-historial--danger">
      <strong>Vas a eliminar el armado sin guardar historial.</strong>
      <span>Después no vas a poder recuperar el historial de estas mesas eliminadas desde el historial de armados.</span>
    </div>
  ) : (
    <div className="mesas-eliminar-historial">
      <label
        className={`mesas-eliminar-historial__check ${guardarHistorialArmado ? "activo" : ""} ${eliminarArmado?.eliminando ? "is-disabled" : ""}`}
      >
        <input
          type="checkbox"
          checked={guardarHistorialArmado}
          onChange={cambiarGuardarHistorialArmado}
          disabled={!!eliminarArmado?.eliminando}
        />
        <span className="mesas-check-visual" aria-hidden="true">
          <FontAwesomeIcon icon={faCheck} />
        </span>
        <span className="mesas-option-check__text">
          <strong>Guardar historial del armado antes de eliminar</strong>
          <small>Guarda un respaldo de las mesas, grupos, mesas no agrupadas y alumnos vinculados antes de eliminarlos.</small>
        </span>
      </label>
    </div>
  );

  useEffect(() => {
    const errores = {
      principal: error,
      edicion: errorEdicion,
      persona: personaEdicion?.errorPersona,
      moverPersona: personaEdicion?.errorMover,
      mas: masEdicion?.error,
      flechas: flechasEdicion?.error,
      agregarNumero: agregarNumeroEdicion?.error,
      historial: historial?.error,
    };

    Object.entries(errores).forEach(([clave, mensaje]) => {
      const texto = String(mensaje || "").trim();

      if (!texto) {
        delete erroresToastRef.current[clave];
        return;
      }

      if (erroresToastRef.current[clave] === texto) return;

      erroresToastRef.current[clave] = texto;
      mostrarToastGlobal("error", texto, 4200);
    });
  }, [
    error,
    errorEdicion,
    personaEdicion?.errorPersona,
    personaEdicion?.errorMover,
    masEdicion?.error,
    flechasEdicion?.error,
    agregarNumeroEdicion?.error,
    historial?.error,
    mostrarToastGlobal,
  ]);

  const abrirModalExportarPdf = useCallback(() => {
    if (!Array.isArray(mesasFiltradas) || mesasFiltradas.length === 0) {
      mostrarToastGlobal("error", "No hay mesas visibles para exportar.", 3200);
      return;
    }

    setModalTituloPdfAbierto(true);
  }, [mesasFiltradas, mostrarToastGlobal]);

  const abrirModalExportarHistorial = useCallback(() => {
    const cantidadArmados = Array.isArray(historial?.armados) ? historial.armados.length : 0;
    if (cantidadArmados <= 0) {
      mostrarToastGlobal("error", "No hay armados guardados en el historial para exportar.", 3400);
      return;
    }

    setModalExportarHistorialAbierto(true);
  }, [historial?.armados, mostrarToastGlobal]);

  const cerrarModalExportarPdf = useCallback(() => {
    if (exportandoPdf) return;
    setModalTituloPdfAbierto(false);
  }, [exportandoPdf]);

  const cerrarModalExportarHistorial = useCallback(() => {
    if (exportandoHistorial) return;
    setModalExportarHistorialAbierto(false);
  }, [exportandoHistorial]);

  const confirmarExportarPdf = useCallback(async ({ tituloFijo, continuacion } = {}) => {
    if (!Array.isArray(mesasFiltradas) || mesasFiltradas.length === 0) {
      mostrarToastGlobal("error", "No hay mesas visibles para exportar.", 3200);
      return;
    }

    setExportandoPdf(true);

    try {
      // Refrescamos el logo justo antes de exportar. Esto evita que el PDF salga
      // con el bloque azul "LOGO" si la carga inicial todavía no convirtió la imagen.
      const datosExportacion = await obtenerDatosInstitucionalesDesdeEndpointLogo(datosInstitucionales);
      setDatosInstitucionales(datosExportacion);

      await descargarPdfMesas({
        mesas: mesasFiltradas,
        tab,
        tituloFijo,
        continuacion,
        logoUrl: datosExportacion.logoDataUrl || datosExportacion.logoUrl,
        institucionNombre: datosExportacion.nombre,
      });

      setModalTituloPdfAbierto(false);
      mostrarToastGlobal("exito", "PDF descargado correctamente.", 3000);
    } catch (_) {
      mostrarToastGlobal("error", "No se pudo generar el PDF. Intentá nuevamente.", 3800);
    } finally {
      setExportandoPdf(false);
    }
  }, [datosInstitucionales, mesasFiltradas, tab, mostrarToastGlobal]);

  const confirmarExportarHistorial = useCallback(async ({ formato = "excel" } = {}) => {
    if (exportandoHistorial) return;

    setExportandoHistorial(true);

    try {
      const data = await historial?.obtenerExportacion?.();
      const cantidadMesas = contarMesasHistorial(data);
      const cantidadRegistros = contarRegistrosHistorialExportacion(data);

      if (cantidadRegistros <= 0) {
        mostrarToastGlobal("error", "No hay historial para exportar.", 3600);
        return;
      }

      if (formato === "pdf") {
        descargarPdfHistorialMesas(data);
        mostrarToastGlobal("exito", `PDF del historial descargado correctamente (${cantidadMesas} mesas).`, 3200);
      } else {
        descargarExcelHistorialMesas(data);
        mostrarToastGlobal("exito", `Excel del historial descargado correctamente (2 hojas, ${cantidadMesas} mesas).`, 3200);
      }

      setModalExportarHistorialAbierto(false);
    } catch (err) {
      mostrarToastGlobal("error", err?.message || "No se pudo exportar el historial.", 4000);
    } finally {
      setExportandoHistorial(false);
    }
  }, [exportandoHistorial, historial, mostrarToastGlobal]);

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
                        placeholder="Busqueda"
                      />
                      <span className="mesas-filterTabs__label mesas-searchLabel">
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

                    {hayBusquedaActiva && (
                      <div className="mesas-searchNavigator" aria-label="Resultados de la búsqueda">
                        <span className="mesas-searchNavigator__count">
                          {hayResultadosBusqueda
                            ? `${indiceBusquedaVisible} de ${totalResultadosBusqueda} resultados`
                            : "0 resultados"}
                        </span>
                        <div className="mesas-searchNavigator__buttons">
                          <button
                            type="button"
                            className="mesas-searchNavigator__btn"
                            title="Resultado anterior"
                            aria-label="Resultado anterior"
                            onClick={() => cambiarResultadoBusqueda(-1)}
                            disabled={!puedeNavegarBusqueda}
                          >
                            <FontAwesomeIcon icon={faChevronUp} />
                          </button>
                          <button
                            type="button"
                            className="mesas-searchNavigator__btn"
                            title="Resultado siguiente"
                            aria-label="Resultado siguiente"
                            onClick={() => cambiarResultadoBusqueda(1)}
                            disabled={!puedeNavegarBusqueda}
                          >
                            <FontAwesomeIcon icon={faChevronDown} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {tab !== "historial" && (
                <>
                  <div className="cc-filter mesas-selectFilter mesas-selectFilter--fecha">
                    <div className={`cc-floatingField mesas-floatingSelect ${filtroFechaMesa ? "is-active" : ""}`}>
                      <select
                        className="cc-input cc-input--floating mesas-filterSelect"
                        value={filtroFechaMesa}
                        onChange={(e) => setFiltroFechaMesa(e.target.value)}
                        disabled={cargando || opcionesFechaMesas.length === 0}
                      >
                        <option value="">Todas las fechas</option>
                        {opcionesFechaMesas.map((item) => (
                          <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                      </select>
                      <span className="mesas-filterTabs__label mesas-selectLabel">Fecha</span>
                    </div>
                  </div>

                  <div className="cc-filter mesas-selectFilter mesas-selectFilter--turno">
                    <div className={`cc-floatingField mesas-floatingSelect ${filtroTurnoMesa ? "is-active" : ""}`}>
                      <select
                        className="cc-input cc-input--floating mesas-filterSelect"
                        value={filtroTurnoMesa}
                        onChange={(e) => setFiltroTurnoMesa(e.target.value)}
                        disabled={cargando || opcionesTurnoMesas.length === 0}
                      >
                        <option value="">Todos los turnos</option>
                        {opcionesTurnoMesas.map((item) => (
                          <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                      </select>
                      <span className="mesas-filterTabs__label mesas-selectLabel">Turno</span>
                    </div>
                  </div>

                  {hayFiltrosMesasActivos && (
                    <button
                      type="button"
                      className="mesas-clearTableFilters"
                      onClick={limpiarFiltrosMesas}
                      title="Limpiar filtros de fecha y turno"
                    >
                      <FontAwesomeIcon icon={faTimes} />
                      Limpiar
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="mov-card__actions mesas-actionsHead">
            <BotonExportarHistorialGlobal
              className="mov-btn mov-btn--secondary mesas-actionBtn mesas-exportBtn"
              icon={tab === "historial" ? "excel" : "pdf"}
              label={tab === "historial" ? "Exportar historial" : "PDF"}
              onClick={tab === "historial" ? abrirModalExportarHistorial : abrirModalExportarPdf}
              disabled={cargando || armando || agrupando || (tab === "historial" ? historial?.cargando || exportandoHistorial || totalVisible === 0 : totalVisible === 0)}
            />

            <button
              className="mov-btn mov-btn--secondary mesas-actionBtn mesas-notifyBtn"
              type="button"
              onClick={abrirModalNotificacionesEmail}
              disabled={cargando || armando || agrupando || tab === "historial" || !hayMesasCreadas}
              title={!hayMesasCreadas ? "Primero tenés que crear y asignar las mesas." : "Notificar por email fecha, turno, hora y materia"}
            >
              <FontAwesomeIcon icon={faEnvelope} />
              Notificar
            </button>

            <button
              className="mov-btn mov-btn--primary mesas-actionBtn mesas-createBtn"
              type="button"
              onClick={abrirModalCrear}
              disabled={cargando || armando || agrupando || hayMesasCreadas}
              title={hayMesasCreadas ? "Ya hay mesas creadas. Eliminá el armado actual para crear uno nuevo." : "Crear mesas"}
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
              disabled={cargando || armando || agrupando || !hayMesasCreadas}
              title={!hayMesasCreadas ? "No hay mesas creadas para eliminar." : "Eliminar mesas"}
            >
              <FontAwesomeIcon icon={faTrash} />
              Eliminar mesas
            </button>
          </div>
        </div>

        {resumenArmado && (
          <div className="mesas-statusAlerts">
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
                        {resumenArmado.actualizados ?? 0} | Grupos finales:{" "}
                        {resumenArmado.grupos_finales?.total_grupos_generados ?? "-"} | No agrupadas:{" "}
                        {resumenArmado.grupos_finales?.total_no_agrupadas ?? "-"}
                      </span>
                    </>
                  )}
                </div>
              </div>
          </div>
        )}

        {tab !== "historial" && totalCambiosDocentePendientes > 0 && (
          <div className="mesas-docenteCambioAlert">
            <div className="mesas-docenteCambioAlert__icon">
              <FontAwesomeIcon icon={faTriangleExclamation} />
            </div>
            <div className="mesas-docenteCambioAlert__text">
              <strong>{totalCambiosDocentePendientes} cambio{totalCambiosDocentePendientes === 1 ? "" : "s"} de docente pendiente{totalCambiosDocentePendientes === 1 ? "" : "s"}</strong>
              <span>Números afectados: {textoNumerosCambiosDocente}. Podés cerrar el popup y volver a abrirlo desde acá.</span>
            </div>
            <div className="mesas-docenteCambioAlert__actions">
              <button type="button" onClick={abrirPanelCambiosDocente}>Ver cambios</button>
              <button type="button" className="secondary" onClick={recargarCambiosDocente} disabled={!!cambiosDocente?.cargando}>
                {cambiosDocente?.cargando ? <FontAwesomeIcon icon={faSpinner} spin /> : "Actualizar"}
              </button>
            </div>
          </div>
        )}

        <div className={`mesas-pdf-view ${tab === "historial" ? "mesas-pdf-view--historial" : ""}`}>
          {tab === "historial" ? (
            <HistorialMesasPanel historial={historial} busqueda={busqueda} terminosBusqueda={terminosBusqueda} />
          ) : cargando ? (
            <div className="cc-emptyState mesas-empty mesas-pdf-empty">
              <FontAwesomeIcon icon={faSpinner} spin />
              <div className="cc-emptyText">Cargando mesas...</div>
            </div>
          ) : mesasFiltradas.length === 0 ? (
            <div className="cc-emptyState mesas-empty mesas-pdf-empty">
              <div className="cc-emptyText">
                {hayFiltrosMesasActivos
                  ? "No hay mesas para la fecha y turno seleccionados."
                  : busqueda
                    ? "No se encontraron mesas que coincidan con la búsqueda."
                    : tab === "no-agrupadas"
                      ? "No hay números pendientes sin agrupar para mostrar."
                      : "No hay grupos finales cargados. Presioná Crear Mesas para generar el armado."}
              </div>
            </div>
          ) : (
            mesasFiltradas.map((item) => {
              const idTarjeta = obtenerIdGrupo(item);
              const cambiosItem = obtenerCambiosDocenteParaGrupo(item, cambiosDocentePorNumero);

              return (
              <MesaPdfCard
                key={`pdf-${idTarjeta}`}
                cardRef={(node) => registrarTarjetaMesa(idTarjeta, node)}
                grupo={item}
                esNoAgrupada={tab === "no-agrupadas"}
                cambiosDocentePendientes={cambiosItem}
                onAbrirCambiosDocente={abrirPanelCambiosDocente}
                onEdit={() => abrirModalEditar(item, tab === "no-agrupadas" ? "no_agrupada" : "grupo")}
                onDelete={() => eliminarMesaDesdeEdicion(construirPayloadEliminar(item, tab))}
                onGuardarNota={guardarNotaAlumnoManteniendoScroll}
                guardandoNotas={guardandoNotas}
                terminosBusqueda={terminosBusqueda}
                logoInstitucionalUrl={datosInstitucionales.logoDataUrl || datosInstitucionales.logoUrl}
                institucionNombre={datosInstitucionales.nombre}
              />
              );
            })
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
        onToast={mostrarToastGlobal}
      />

      <ModalCambiosDocentePendientes
        abierto={!!cambiosDocente?.modalAbierto}
        cambios={cambiosDocente?.pendientes || []}
        cargando={!!cambiosDocente?.cargando}
        resolviendoId={cambiosDocente?.resolviendoId}
        ignorandoId={cambiosDocente?.ignorandoId}
        onClose={cambiosDocente?.cerrar}
        onAplicar={cambiosDocente?.aplicar}
        onIgnorar={cambiosDocente?.ignorar}
        onAbrirMesa={cambiosDocente?.abrirMesa}
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
        cambiosDocentePendientes={cambiosDocentePendientesLista}
        aplicandoCambioDocenteId={cambiosDocente?.resolviendoId}
        onAplicarCambioDocente={cambiosDocente?.aplicar}
      />

      <ModalTituloPdfMesas
        abierto={modalTituloPdfAbierto}
        loading={exportandoPdf}
        onClose={cerrarModalExportarPdf}
        onConfirm={confirmarExportarPdf}
      />

      <ModalNotificacionesEmailMesas
        abierto={modalNotificacionesEmailAbierto}
        onClose={cerrarModalNotificacionesEmail}
        onToast={mostrarToastGlobal}
      />

      <ModalExportarHistorialGlobal
        abierto={modalExportarHistorialAbierto}
        loading={exportandoHistorial}
        cantidadArmados={Array.isArray(historial?.armados) ? historial.armados.length : 0}
        busqueda={busqueda}
        onClose={cerrarModalExportarHistorial}
        onConfirm={confirmarExportarHistorial}
      />

      <ModalEliminarGlobal
        open={!!eliminarArmado?.modalAbierto}
        operacion="eliminar"
        loading={!!eliminarArmado?.eliminando}
        tone={confirmarSinHistorialArmado ? "danger" : "warning"}
        title={confirmarSinHistorialArmado ? "Eliminar sin guardar historial" : "Eliminar mesas"}
        message={
          confirmarSinHistorialArmado
            ? "¿Estás seguro de eliminar las mesas sin guardar historial del armado?"
            : "¿Seguro que querés eliminar todas las mesas del armado actual?"
        }
        warning={
          confirmarSinHistorialArmado
            ? "Esta acción es irreversible: se borrará el armado actual y no se guardará registro histórico de estas mesas."
            : "Las notas cargadas se mantienen en el historial de resultados. Elegí abajo si también querés guardar el historial del armado."
        }
        details={[
          { label: "Grupos finales", value: totalGrupos },
          { label: "No agrupadas", value: totalNoAgrupadas },
          { label: "Total visible", value: totalVisible },
          { label: "Historial del armado", value: guardarHistorialArmado ? "Se guardará" : "No se guardará" },
        ]}
        extraContent={contenidoEliminarArmado}
        confirmLabel={confirmarSinHistorialArmado ? "Sí, eliminar sin historial" : "Eliminar mesas"}
        loadingLabel="Eliminando..."
        loadingMessage={guardarHistorialArmado ? "Eliminando mesas y guardando historial..." : "Eliminando mesas sin guardar historial..."}
        successMessage={
          guardarHistorialArmado
            ? "Mesas eliminadas correctamente. Historial del armado guardado."
            : "Mesas eliminadas correctamente sin guardar historial del armado."
        }
        errorMessage="No se pudieron eliminar las mesas."
        onClose={cerrarModalEliminarArmado}
        onBeforeConfirm={prepararConfirmacionEliminarArmado}
        onConfirm={confirmarEliminarArmadoDesdeModal}
        hideLocalError
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
        hideLocalError
      />

      {toastGlobal && (typeof document !== "undefined"
        ? createPortal(
          <div className="mesas-toastPortal">
            <Toast
              key={toastGlobal.id}
              tipo={toastGlobal.tipo}
              mensaje={toastGlobal.mensaje}
              duracion={toastGlobal.duracion}
              onClose={cerrarToastGlobal}
            />
          </div>,
          document.body
        )
        : (
          <Toast
            key={toastGlobal.id}
            tipo={toastGlobal.tipo}
            mensaje={toastGlobal.mensaje}
            duracion={toastGlobal.duracion}
            onClose={cerrarToastGlobal}
          />
        )
      )}
    </div>
  );

  return dentroDeShell ? contenido : <Principal>{contenido}</Principal>;
};

export default MesasExamen;
