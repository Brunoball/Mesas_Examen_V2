// src/components/Materias/Materias.jsx
import React, { useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBook,
  faBoxOpen,
  faDiagramProject,
  faEdit,
  faMagnifyingGlass,
  faPlus,
  faFlask,
  faLayerGroup,
  faPowerOff,
  faTimes,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";

import "../Global/Global_css/roots.css";
import "../Global/Global_css/Global_Section.css";
import "../Global/Global_css/Global_DivTable.css";
import "./Materias.css";
import "../Global/Global_css/Global_MateriasResponsive.css";
import ModalMateria from "./modales/ModalMateria";
import ModalCorrelativa from "./modales/ModalCorrelativa";
import ModalTaller from "./modales/ModalTaller";
import ModalArea from "./modales/ModalArea";
import ModalEliminarGlobal from "../Global/Modales/ModalEliminarGlobal";
import ModalExportarGlobal from "../Global/Modales/ModalExportarGlobal.jsx";
import BotonExportarHistorialGlobal from "../Global/Botones/BotonExportarHistorialGlobal.jsx";
import SeccionCorrelativas from "./secciones/SeccionCorrelativas";
import SeccionTalleres from "./secciones/SeccionTalleres";
import SeccionAreas from "./secciones/SeccionAreas";
import { useMaterias } from "./hooks/useMaterias";
import Principal, { MesasShellContext } from "../Principal/Principal";
import Toast from "../Global/Toast";

const MATERIAS_GRID_COLS = "2.4fr 1.1fr .8fr 1.05fr .7fr .7fr .8fr";
const SKELETON_ROWS = 7;

const MATERIAS_COLUMNS = [
  { key: "materia", label: "Materia", strong: true },
  { key: "area", label: "Área" },
  { key: "cursos", label: "Cursos", align: "center" },
  { key: "talleres", label: "Talleres" },
  { key: "correlativas", label: "Correlativas", align: "center" },
  { key: "estado", label: "Estado", align: "center" },
  { key: "acciones", label: "Acciones", align: "center", actions: true },
];

const SKELETON_WIDTHS = ["74%", "58%", "54%", "52%", "38%", "46%", "42%"];

const MATERIAS_POR_PAGINA = 100;

const MATERIAS_EXPORT_COLUMNS = [
  { label: "Materia", value: (item) => safeText(item.materia) },
  { label: "Área", value: (item) => safeText(item.areas) },
  { label: "Cursos", value: (item) => safeText(item.cursos) },
  { label: "Talleres", value: (item) => safeText(item.talleres) },
  { label: "Correlativas", value: (item) => item.cantidad_correlativas || 0 },
  { label: "Estado", value: (item) => (Number(item.activo) === 1 ? "ACTIVA" : "INACTIVA") },
];

const AREAS_EXPORT_COLUMNS = [
  { label: "Área", value: (item) => safeText(item.area) },
  { label: "Cantidad materias", value: (item) => item.cantidad_materias || 0 },
  { label: "Materias incluidas", value: (item) => safeText(item.materias) },
];

const CORRELATIVAS_EXPORT_COLUMNS = [
  { label: "Correlativa anterior", value: (item) => safeText(item.materia_relacionada) },
  { label: "Curso anterior", value: (item) => safeText(item.curso_relacionada) },
  { label: "Materia posterior", value: (item) => safeText(item.materia) },
  { label: "Curso posterior", value: (item) => safeText(item.curso) },
  { label: "Tipo", value: (item) => safeText(item.tipo) },
  { label: "Bloqueos", value: (item) => safeText(item.bloqueos) },
];

const TALLERES_EXPORT_COLUMNS = [
  { label: "Taller", value: (item) => formatearNombreTaller(item.taller) },
  { label: "Curso", value: (item) => safeText(item.curso) },
  { label: "División", value: (item) => safeText(item.division) },
  { label: "Cantidad cátedras", value: (item) => item.cantidad_materias || 0 },
  { label: "Cátedras incluidas", value: (item) => safeText(item.materias) },
  { label: "Estado", value: (item) => (Number(item.activo) === 1 ? "ACTIVO" : "INACTIVO") },
];

function safeText(value) {
  const text = String(value ?? "").trim();
  return text || "—";
}

function formatearNombreTaller(value) {
  return safeText(value);
}

function alignClass(align) {
  if (align === "right") return "is-right";
  if (align === "center") return "is-center";
  return "";
}

function normalizarTipoToast(tipo) {
  if (tipo === "ok" || tipo === "success" || tipo === "exito") return "exito";
  if (tipo === "warning" || tipo === "advertencia") return "advertencia";
  if (tipo === "alerta") return "alerta";
  if (tipo === "cargando") return "cargando";
  if (tipo === "error") return "error";
  return "info";
}

function obtenerDuracionToast(tipo) {
  const tipoToast = normalizarTipoToast(tipo);
  return ["error", "advertencia", "alerta", "cargando"].includes(tipoToast) ? undefined : 3800;
}


function calcularInfoPagina(registros = [], paginaActual = 1) {
  const total = Array.isArray(registros) ? registros.length : 0;
  const totalPaginas = Math.max(1, Math.ceil(total / MATERIAS_POR_PAGINA));
  const pagina = Math.min(Math.max(1, Number(paginaActual || 1)), totalPaginas);
  const inicio = (pagina - 1) * MATERIAS_POR_PAGINA;
  const visibles = (Array.isArray(registros) ? registros : []).slice(inicio, inicio + MATERIAS_POR_PAGINA);

  return {
    pagina,
    totalPaginas,
    totalReferencia: total,
    totalVisible: visibles.length,
    registrosVisibles: visibles,
  };
}

function renderSkeletonRow(index) {
  return (
    <div
      key={`materia-skel-${index}`}
      className="mov-gridTable mov-gridTable--row mov-row--skeleton global-divTable__row materias-gridRow"
      style={{ gridTemplateColumns: MATERIAS_GRID_COLS }}
      role="row"
      aria-hidden="true"
    >
      {MATERIAS_COLUMNS.map((column, columnIndex) => (
        <div
          key={column.key}
          className={[
            "mov-gridCell",
            alignClass(column.align),
            column.actions ? "mov-gridCell--actions" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          role="cell"
          data-label={column.label}
        >
          {column.actions ? (
            <div className="mov-skelActions">
              <span className="mov-skelIcon" />
              <span className="mov-skelIcon" />
              <span className="mov-skelIcon" />
            </div>
          ) : (
            <span
              className="mov-skeletonBar"
              style={{ width: SKELETON_WIDTHS[(index + columnIndex) % SKELETON_WIDTHS.length] }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

const Materias = () => {
  const location = useLocation();
  const dentroDeShell = useContext(MesasShellContext);
  const [paginasPorSeccion, setPaginasPorSeccion] = useState({
    materias: 1,
    areas: 1,
    correlativas: 1,
    talleres: 1,
  });
  const [modalExportar, setModalExportar] = useState(false);

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
    mostrarMensaje,
    limpiarMensaje,
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
    confirmacion,
    cerrarConfirmacion,
    confirmarAccion,
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
    obtenerCatedrasTaller,
    precargarMateriasDeCursos,
    guardarArea,
    eliminarArea,
  } = state;

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const seccion = params.get("seccion") || "materias";
    const seccionesValidas = ["materias", "areas", "correlativas", "talleres"];

    setSeccionActiva(seccionesValidas.includes(seccion) ? seccion : "materias");
  }, [location.search, setSeccionActiva]);

  const valorBusqueda = String(busqueda ?? "");
  const listaMaterias = Array.isArray(materias) ? materias : [];
  const listaMateriasFiltradas = Array.isArray(materiasFiltradas) ? materiasFiltradas : [];
  const totalActivas = listaMaterias.filter((m) => Number(m.activo) === 1).length;

  const hayFiltrosMaterias = Boolean(valorBusqueda.trim() || soloActivas);

  useEffect(() => {
    setPaginasPorSeccion((prev) => ({
      ...prev,
      [seccionActiva]: 1,
    }));
  }, [seccionActiva, valorBusqueda, soloActivas]);

  const infoMaterias = useMemo(
    () => calcularInfoPagina(listaMateriasFiltradas, paginasPorSeccion.materias),
    [listaMateriasFiltradas, paginasPorSeccion.materias]
  );
  const infoAreas = useMemo(
    () => calcularInfoPagina(areasFiltradas, paginasPorSeccion.areas),
    [areasFiltradas, paginasPorSeccion.areas]
  );
  const infoCorrelativas = useMemo(
    () => calcularInfoPagina(correlativasFiltradas, paginasPorSeccion.correlativas),
    [correlativasFiltradas, paginasPorSeccion.correlativas]
  );
  const infoTalleres = useMemo(
    () => calcularInfoPagina(talleresFiltrados, paginasPorSeccion.talleres),
    [talleresFiltrados, paginasPorSeccion.talleres]
  );

  const cambiarPagina = (seccion, delta) => {
    const infoPorSeccion = {
      materias: infoMaterias,
      areas: infoAreas,
      correlativas: infoCorrelativas,
      talleres: infoTalleres,
    };
    const info = infoPorSeccion[seccion] || infoMaterias;

    setPaginasPorSeccion((prev) => ({
      ...prev,
      [seccion]: Math.min(Math.max(1, Number(prev[seccion] || 1) + delta), info.totalPaginas),
    }));
  };

  const exportMetaPorSeccion = {
    materias: {
      titulo: 'Mesas · Materias',
      nombreArchivo: 'materias',
      registros: infoMaterias.registrosVisibles,
      registrosTodos: listaMateriasFiltradas,
      columnas: MATERIAS_EXPORT_COLUMNS,
      totalVisible: infoMaterias.totalVisible,
      totalTodos: infoMaterias.totalReferencia,
      pagina: infoMaterias.pagina,
      totalPaginas: infoMaterias.totalPaginas,
      descripcion: 'materias',
    },
    areas: {
      titulo: 'Materias · Áreas',
      nombreArchivo: 'materias_areas',
      registros: infoAreas.registrosVisibles,
      registrosTodos: areasFiltradas,
      columnas: AREAS_EXPORT_COLUMNS,
      totalVisible: infoAreas.totalVisible,
      totalTodos: infoAreas.totalReferencia,
      pagina: infoAreas.pagina,
      totalPaginas: infoAreas.totalPaginas,
      descripcion: 'áreas',
    },
    correlativas: {
      titulo: 'Materias · Correlativas',
      nombreArchivo: 'materias_correlativas',
      registros: infoCorrelativas.registrosVisibles,
      registrosTodos: correlativasFiltradas,
      columnas: CORRELATIVAS_EXPORT_COLUMNS,
      totalVisible: infoCorrelativas.totalVisible,
      totalTodos: infoCorrelativas.totalReferencia,
      pagina: infoCorrelativas.pagina,
      totalPaginas: infoCorrelativas.totalPaginas,
      descripcion: 'correlatividades',
    },
    talleres: {
      titulo: 'Materias · Talleres',
      nombreArchivo: 'materias_talleres',
      registros: infoTalleres.registrosVisibles,
      registrosTodos: talleresFiltrados,
      columnas: TALLERES_EXPORT_COLUMNS,
      totalVisible: infoTalleres.totalVisible,
      totalTodos: infoTalleres.totalReferencia,
      pagina: infoTalleres.pagina,
      totalPaginas: infoTalleres.totalPaginas,
      descripcion: 'talleres',
    },
  };

  const exportMetaActual = exportMetaPorSeccion[seccionActiva] || exportMetaPorSeccion.materias;

  const seccionesExportActuales = [{
    titulo: exportMetaActual.titulo,
    subtitulo: `Página actual: ${exportMetaActual.pagina} de ${exportMetaActual.totalPaginas} · Registros visibles: ${exportMetaActual.totalVisible}`,
    columnas: exportMetaActual.columnas,
    registros: exportMetaActual.registros,
  }];

  const seccionesExportTodos = [
    {
      titulo: 'Mesas · Materias',
      subtitulo: `Todos los registros filtrados · Total: ${listaMateriasFiltradas.length}`,
      columnas: MATERIAS_EXPORT_COLUMNS,
      registros: listaMateriasFiltradas,
    },
    {
      titulo: 'Materias · Áreas',
      subtitulo: `Todos los registros filtrados · Total: ${areasFiltradas.length}`,
      columnas: AREAS_EXPORT_COLUMNS,
      registros: areasFiltradas,
    },
    {
      titulo: 'Materias · Correlativas',
      subtitulo: `Todos los registros filtrados · Total: ${correlativasFiltradas.length}`,
      columnas: CORRELATIVAS_EXPORT_COLUMNS,
      registros: correlativasFiltradas,
    },
    {
      titulo: 'Materias · Talleres',
      subtitulo: `Todos los registros filtrados · Total: ${talleresFiltrados.length}`,
      columnas: TALLERES_EXPORT_COLUMNS,
      registros: talleresFiltrados,
    },
  ];

  const totalTodosExportar = seccionesExportTodos.reduce((acc, seccion) => acc + seccion.registros.length, 0);

  function renderBotonExportar() {
    return (
      <BotonExportarHistorialGlobal
        className="mov-btn mov-btn--secondary"
        label="Exportar"
        icon="excel"
        disabled={cargando || totalTodosExportar === 0}
        onClick={() => setModalExportar(true)}
      />
    );
  }

  const getConfirmacionConfig = () => {
    const item = confirmacion?.item || {};
    const tipo = confirmacion?.tipo || '';

    if (tipo === 'estado_materia') {
      const activa = Number(item?.activo) === 1;
      return {
        operacion: activa ? 'baja' : 'alta',
        icon: faPowerOff,
        title: activa ? 'Desactivar materia' : 'Activar materia',
        message: activa
          ? 'La materia dejará de figurar como activa, pero se conservará en el sistema.'
          : 'La materia volverá a figurar como activa.',
        confirmLabel: activa ? 'Desactivar' : 'Activar',
        loadingLabel: 'Procesando...',
        successMessage: activa ? 'Materia desactivada correctamente.' : 'Materia activada correctamente.',
        errorMessage: 'No se pudo cambiar el estado de la materia.',
        details: [
          { label: 'Materia', value: item?.materia },
          { label: 'Estado actual', value: activa ? 'Activa' : 'Inactiva' },
        ],
      };
    }

    if (tipo === 'eliminar_correlativa') {
      return {
        operacion: 'eliminar',
        icon: faDiagramProject,
        title: 'Eliminar correlatividad',
        message: 'Se eliminará esta relación de correlatividad.',
        confirmLabel: 'Eliminar',
        loadingLabel: 'Eliminando correlatividad...',
        successMessage: 'Correlatividad eliminada correctamente.',
        errorMessage: 'No se pudo eliminar la correlatividad.',
        details: [
          { label: 'Materia', value: item?.materia },
          { label: 'Curso', value: item?.curso },
          { label: 'Correlativa', value: item?.materia_relacionada },
        ],
      };
    }

    if (tipo === 'eliminar_taller') {
      return {
        operacion: 'eliminar',
        icon: faFlask,
        title: 'Eliminar taller',
        message: 'Se eliminará o desactivará el taller según las reglas del backend.',
        confirmLabel: 'Eliminar',
        loadingLabel: 'Eliminando taller...',
        successMessage: 'Taller eliminado correctamente.',
        errorMessage: 'No se pudo eliminar el taller.',
        details: [
          { label: 'Taller', value: item?.taller },
          { label: 'Curso', value: item?.curso },
          { label: 'División', value: item?.division },
        ],
      };
    }

    if (tipo === 'eliminar_area') {
      return {
        operacion: 'eliminar',
        icon: faLayerGroup,
        title: 'Eliminar área',
        message: 'Se eliminará o desactivará el área según las reglas del backend.',
        confirmLabel: 'Eliminar',
        loadingLabel: 'Eliminando área...',
        successMessage: 'Área eliminada correctamente.',
        errorMessage: 'No se pudo eliminar el área.',
        details: [
          { label: 'Área', value: item?.area },
          { label: 'Materias', value: item?.materias },
          { label: 'Estado', value: Number(item?.activo) === 1 ? 'Activa' : 'Inactiva' },
        ],
      };
    }

    return {
      operacion: 'eliminar',
      icon: faBook,
      title: 'Eliminar materia',
      message: 'Se eliminará o desactivará la materia según las reglas del backend.',
      confirmLabel: 'Eliminar',
      loadingLabel: 'Eliminando materia...',
      successMessage: 'Materia eliminada correctamente.',
      errorMessage: 'No se pudo eliminar la materia.',
      details: [
        { label: 'Materia', value: item?.materia },
        { label: 'Área', value: item?.areas },
        { label: 'Estado', value: Number(item?.activo) === 1 ? 'Activa' : 'Inactiva' },
      ],
    };
  };

  const confirmacionConfig = getConfirmacionConfig();


  const renderFiltrosGlobales = () => (
    <div className="mov-headFilters materias-headFilters materias-globalFilters materias-integratedFilters">
      <div className="mov-search materias-searchFilter">

        <div className="materias-searchBox">
          <input
            id="materias-busqueda"
            className="cc-input cc-input--floating catedras-searchInput"
            type="text"
            value={valorBusqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por materia, área, taller, curso o correlatividad"
          />
                  <span className="catedras-filterTabs__label">
          <FontAwesomeIcon icon={faMagnifyingGlass} /> Búsqueda
        </span>
          {valorBusqueda.trim() !== "" && (
            <button
              type="button"
              className="mov-clearSearch materias-clearSearch"
              title="Limpiar búsqueda"
              onClick={() => setBusqueda("")}
            >
              <FontAwesomeIcon icon={faTimes} />
            </button>
          )}
        </div>
      </div>


    </div>
  );

  const renderContenido = () => {
    if (seccionActiva === "correlativas") {
      return (
        <SeccionCorrelativas
          cargando={cargando}
          correlativas={correlativas}
          correlativasFiltradas={infoCorrelativas.registrosVisibles}
          onNueva={() => setModalCorrelativa({ abierto: true, item: null })}
          onEditar={(item) => setModalCorrelativa({ abierto: true, item })}
          onEliminar={eliminarCorrelativa}
          headerFilters={renderFiltrosGlobales()}
          exportButton={renderBotonExportar()}
          totalRegistros={correlativas.length}
          totalReferencia={infoCorrelativas.totalReferencia}
          totalVisible={infoCorrelativas.totalVisible}
          hayFiltrosActivos={hayFiltrosMaterias}
          pagina={infoCorrelativas.pagina}
          totalPaginas={infoCorrelativas.totalPaginas}
          onAnterior={() => cambiarPagina("correlativas", -1)}
          onSiguiente={() => cambiarPagina("correlativas", 1)}
        />
      );
    }

    if (seccionActiva === "talleres") {
      return (
        <SeccionTalleres
          cargando={cargando}
          talleres={talleres}
          talleresFiltrados={infoTalleres.registrosVisibles}
          onNuevo={() => setModalTaller({ abierto: true, item: null })}
          onEditar={(item) => setModalTaller({ abierto: true, item })}
          onEliminar={eliminarTaller}
          headerFilters={renderFiltrosGlobales()}
          exportButton={renderBotonExportar()}
          totalRegistros={talleres.length}
          totalReferencia={infoTalleres.totalReferencia}
          totalVisible={infoTalleres.totalVisible}
          hayFiltrosActivos={hayFiltrosMaterias}
          pagina={infoTalleres.pagina}
          totalPaginas={infoTalleres.totalPaginas}
          onAnterior={() => cambiarPagina("talleres", -1)}
          onSiguiente={() => cambiarPagina("talleres", 1)}
        />
      );
    }

    if (seccionActiva === "areas") {
      return (
        <SeccionAreas
          cargando={cargando}
          areas={areas}
          areasFiltradas={infoAreas.registrosVisibles}
          onNueva={() => setModalArea({ abierto: true, item: null })}
          onEditar={(item) => setModalArea({ abierto: true, item })}
          onEliminar={eliminarArea}
          headerFilters={renderFiltrosGlobales()}
          exportButton={renderBotonExportar()}
          totalRegistros={areas.length}
          totalReferencia={infoAreas.totalReferencia}
          totalVisible={infoAreas.totalVisible}
          hayFiltrosActivos={hayFiltrosMaterias}
          pagina={infoAreas.pagina}
          totalPaginas={infoAreas.totalPaginas}
          onAnterior={() => cambiarPagina("areas", -1)}
          onSiguiente={() => cambiarPagina("areas", 1)}
        />
      );
    }

    return (
      <section className="materias-card mov-card mov-card--table">
        <div className="mov-card__head materias-card__head materias-main-head">
          <div className="mov-card__headLeft materias-card__headLeft">
            <div className="title-mov materias-titleBox">
              <div className="mov-card__title materias-section-title">
                <FontAwesomeIcon icon={faBook} /> Materias · Materias
              </div>
              <div className="mov-card__hint">
                Mostrando <b>{infoMaterias.totalVisible}</b> de <b>{infoMaterias.totalReferencia}</b> materias
              </div>
            </div>

            {renderFiltrosGlobales()}
          </div>

          <div className="mov-card__actions materias-actionsHead">
            {renderBotonExportar()}

            <button
              className="mov-btn mov-btn--primary"
              onClick={() => setModalMateria({ abierto: true, item: null })}
              type="button"
            >
              <FontAwesomeIcon icon={faPlus} /> Nueva materia
            </button>
          </div>
        </div>

        <div className="materias-divTable global-divTable" role="table" aria-label="Listado de materias">
          <div
            className="mov-gridTable mov-gridTable--head global-divTable__head materias-gridHead"
            style={{ gridTemplateColumns: MATERIAS_GRID_COLS }}
            role="row"
          >
            {MATERIAS_COLUMNS.map((column) => (
              <div
                key={column.key}
                className={["mov-gridCell", "mov-gridCell--head", alignClass(column.align)]
                  .filter(Boolean)
                  .join(" ")}
                role="columnheader"
              >
                {column.label}
              </div>
            ))}
          </div>

          <div className="materias-table-wrap mov-tableWrap global-divTable__wrap" role="rowgroup">
            <div
              className={`mov-gridBody mov-gridBody--relative global-divTable__body materias-gridBody ${cargando ? "mov-softLoading" : ""}`}
            >
              {cargando ? (
                <div className="mov-skeletonWrap" aria-busy="true" aria-label="Cargando materias">
                  {Array.from({ length: SKELETON_ROWS }).map((_, index) => renderSkeletonRow(index))}
                </div>
              ) : (
                <>
                  {infoMaterias.registrosVisibles.map((m) => (
                    <div
                      key={m.id_materia}
                      className="mov-gridTable mov-gridTable--row global-divTable__row materias-gridRow"
                      style={{ gridTemplateColumns: MATERIAS_GRID_COLS }}
                      role="row"
                    >
                      <div className="mov-gridCell is-strong" role="cell" data-label="Materia" title={safeText(m.materia)}>
                        <div className="materias-name-cell">
                          <strong>{safeText(m.materia)}</strong>
                        </div>
                      </div>

                      <div className="mov-gridCell" role="cell" data-label="Área" title={safeText(m.areas)}>
                        <span className="mov-ellipsissss">{safeText(m.areas)}</span>
                      </div>

                      <div className="mov-gridCell is-center" role="cell" data-label="Cursos" title={safeText(m.cursos)}>
                        <span className="mov-ellipsissss">{safeText(m.cursos)}</span>
                      </div>

                      <div className="mov-gridCell" role="cell" data-label="Talleres" title={safeText(m.talleres)}>
                        <span className="mov-ellipsissss">{safeText(m.talleres)}</span>
                      </div>

                      <div className="mov-gridCell is-center" role="cell" data-label="Correlativas">
                        <span className="mov-chip materias-badge">{m.cantidad_correlativas || 0}</span>
                      </div>

                      <div className="mov-gridCell is-center" role="cell" data-label="Estado">
                        <span className={`mov-chip materias-badge ${Number(m.activo) === 1 ? "mov-chip--ok" : "mov-chip--neutral"}`}>
                          {Number(m.activo) === 1 ? "ACTIVA" : "INACTIVA"}
                        </span>
                      </div>

                      <div className="mov-gridCell mov-gridCell--actions is-center" role="cell" data-label="Acciones">
                        <div className="mov-actionsInline">
                          <button
                            className="mov-iconBtn materias-icon-btn"
                            title="Editar"
                            onClick={() => setModalMateria({ abierto: true, item: m })}
                            type="button"
                          >
                            <FontAwesomeIcon icon={faEdit} />
                          </button>

                          <button
                            className="mov-iconBtn materias-icon-btn"
                            title="Activar / desactivar"
                            onClick={() => cambiarEstadoMateria(m)}
                            type="button"
                          >
                            <FontAwesomeIcon icon={faPowerOff} />
                          </button>

                          <button
                            className="mov-iconBtn mov-iconBtn--danger materias-icon-btn materias-icon-danger"
                            title="Eliminar"
                            onClick={() => eliminarMateria(m)}
                            type="button"
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {infoMaterias.registrosVisibles.length === 0 && (
                    <div className="cc-emptyState materias-emptyState">
                      <FontAwesomeIcon icon={faBoxOpen} className="cc-emptyIcon" />
                      <div className="cc-emptyText">No hay materias para mostrar.</div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="materias-footer">
          <span>
            Registros únicos cargados: <strong>{listaMaterias.length}</strong>
          </span>
          <span>
            Activas: <strong>{totalActivas}</strong>
          </span>
          {hayFiltrosMaterias && (
            <span>
              Coincidencias encontradas: <strong>{infoMaterias.totalReferencia}</strong>
            </span>
          )}

          <div className="materias-pagination">
            <button
              type="button"
              className="mov-btn mov-btn--ghost materias-pageBtn"
              disabled={infoMaterias.pagina <= 1 || cargando}
              onClick={() => cambiarPagina("materias", -1)}
            >
              Anterior
            </button>

            <span>Página {infoMaterias.pagina} / {infoMaterias.totalPaginas}</span>

            <button
              type="button"
              className="mov-btn mov-btn--ghost materias-pageBtn"
              disabled={infoMaterias.pagina >= infoMaterias.totalPaginas || cargando}
              onClick={() => cambiarPagina("materias", 1)}
            >
              Siguiente
            </button>
          </div>
        </div>
      </section>
    );
  };

  const contenido = (
    <div className="materias-page mov-page">
      {mensaje && (
        <Toast
          key={mensaje.id || `${mensaje.tipo}-${mensaje.texto}`}
          tipo={normalizarTipoToast(mensaje.tipo)}
          mensaje={mensaje.texto}
          duracion={obtenerDuracionToast(mensaje.tipo)}
          onClose={limpiarMensaje}
        />
      )}

      <main className="materias-content">{renderContenido()}</main>

      {modalMateria.abierto && (
        <ModalMateria
          item={modalMateria.item}
          areas={catalogos.areas}
          onClose={() => setModalMateria({ abierto: false, item: null })}
          onSave={guardarMateria}
          onToast={mostrarMensaje}
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
          onToast={mostrarMensaje}
        />
      )}

      {modalTaller.abierto && (
        <ModalTaller
          item={modalTaller.item}
          cursos={catalogos.cursos}
          divisiones={catalogos.divisiones}
          areas={catalogos.areas}
          onObtenerMateriasPorCurso={obtenerMateriasPorCurso}
          onObtenerCatedrasTaller={obtenerCatedrasTaller}
          onClose={() => setModalTaller({ abierto: false, item: null })}
          onSave={guardarTaller}
          onAddMateria={agregarMateriaTaller}
          onRemoveMateria={quitarMateriaTaller}
          onToast={mostrarMensaje}
        />
      )}

      {modalArea.abierto && (
        <ModalArea
          item={modalArea.item}
          materias={catalogos.materias}
          onClose={() => setModalArea({ abierto: false, item: null })}
          onSave={guardarArea}
          onToast={mostrarMensaje}
        />
      )}

      <ModalExportarGlobal
        abierto={modalExportar}
        title={`Exportar ${exportMetaActual.descripcion}`}
        subtitle="Elegí si querés exportar solo la pestaña actual o todos los registros de todas las pestañas."
        tituloArchivo="Mesas · Materias"
        nombreArchivo="materias"
        seccionesActuales={seccionesExportActuales}
        seccionesTodos={seccionesExportTodos}
        cantidadActual={exportMetaActual.totalVisible}
        totalTodos={totalTodosExportar}
        totalLabelSingular="registro disponible"
        totalLabelPlural="registros disponibles"
        subtituloArchivoActual={`Pestaña actual: ${exportMetaActual.descripcion} · Página ${exportMetaActual.pagina} de ${exportMetaActual.totalPaginas}`}
        subtituloArchivoTodos={`Todas las pestañas del módulo materias · Total: ${totalTodosExportar} registros`}
        alcanceActualLabel="Exportar solo actual"
        alcanceActualDescription="Descarga solo la página visible de la pestaña actual."
        alcanceTodosLabel="Exportar todos los registros"
        alcanceTodosDescription="Descarga juntas las pestañas Materias, Áreas, Correlativas y Talleres, respetando búsqueda y filtros."
        onClose={() => setModalExportar(false)}
        onSuccess={(texto) => mostrarMensaje('exito', texto)}
        onError={(texto) => mostrarMensaje('error', texto)}
      />

      <ModalEliminarGlobal
        open={Boolean(confirmacion?.abierto)}
        operacion={confirmacionConfig.operacion}
        row={confirmacion?.item}
        icon={confirmacionConfig.icon}
        title={confirmacionConfig.title}
        message={confirmacionConfig.message}
        warning={confirmacionConfig.warning ?? ""}
        confirmLabel={confirmacionConfig.confirmLabel}
        loadingLabel={confirmacionConfig.loadingLabel}
        successMessage={confirmacionConfig.successMessage}
        errorMessage={confirmacionConfig.errorMessage}
        details={confirmacionConfig.details}
        onClose={cerrarConfirmacion}
        onConfirm={confirmarAccion}
        onToast={mostrarMensaje}
        hideLocalError
      />
    </div>
  );

  return dentroDeShell ? contenido : <Principal>{contenido}</Principal>;
};

export default Materias;
