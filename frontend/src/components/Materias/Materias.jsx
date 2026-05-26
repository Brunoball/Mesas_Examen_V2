// src/components/Materias/Materias.jsx
import React, { useContext, useEffect } from "react";
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
import SeccionCorrelativas from "./secciones/SeccionCorrelativas";
import SeccionTalleres from "./secciones/SeccionTalleres";
import SeccionAreas from "./secciones/SeccionAreas";
import { useMaterias } from "./hooks/useMaterias";
import Principal, { MesasShellContext } from "../Principal/Principal";
import Toast from "../Global/Toast";

const MATERIAS_GRID_COLS = "1.35fr 1.1fr 1.05fr 1.05fr .85fr .75fr .8fr";
const SKELETON_ROWS = 7;

const MATERIAS_COLUMNS = [
  { key: "materia", label: "Materia", strong: true },
  { key: "area", label: "Área" },
  { key: "cursos", label: "Cursos" },
  { key: "talleres", label: "Talleres" },
  { key: "correlativas", label: "Correlativas", align: "center" },
  { key: "estado", label: "Estado", align: "center" },
  { key: "acciones", label: "Acciones", align: "center", actions: true },
];

const SKELETON_WIDTHS = ["74%", "58%", "54%", "52%", "38%", "46%", "42%"];

function safeText(value) {
  const text = String(value ?? "").trim();
  return text || "—";
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
  return ["error", "advertencia", "alerta"].includes(tipoToast) ? undefined : 3800;
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
        loadingLabel: 'Eliminando...',
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
        loadingLabel: 'Eliminando...',
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
        loadingLabel: 'Eliminando...',
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
      loadingLabel: 'Eliminando...',
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
          correlativasFiltradas={correlativasFiltradas}
          onNueva={() => setModalCorrelativa({ abierto: true, item: null })}
          onEditar={(item) => setModalCorrelativa({ abierto: true, item })}
          onEliminar={eliminarCorrelativa}
          headerFilters={renderFiltrosGlobales()}
        />
      );
    }

    if (seccionActiva === "talleres") {
      return (
        <SeccionTalleres
          cargando={cargando}
          talleres={talleres}
          talleresFiltrados={talleresFiltrados}
          onNuevo={() => setModalTaller({ abierto: true, item: null })}
          onEditar={(item) => setModalTaller({ abierto: true, item })}
          onEliminar={eliminarTaller}
          headerFilters={renderFiltrosGlobales()}
        />
      );
    }

    if (seccionActiva === "areas") {
      return (
        <SeccionAreas
          cargando={cargando}
          areas={areas}
          areasFiltradas={areasFiltradas}
          onNueva={() => setModalArea({ abierto: true, item: null })}
          onEditar={(item) => setModalArea({ abierto: true, item })}
          onEliminar={eliminarArea}
          headerFilters={renderFiltrosGlobales()}
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
                Mostrando <b>{listaMateriasFiltradas.length}</b> de <b>{listaMaterias.length}</b> materias
              </div>
            </div>

            {renderFiltrosGlobales()}
          </div>

          <div className="mov-card__actions materias-actionsHead">
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
                  {listaMateriasFiltradas.map((m) => (
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

                      <div className="mov-gridCell" role="cell" data-label="Cursos" title={safeText(m.cursos)}>
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

                  {listaMateriasFiltradas.length === 0 && (
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
            Total: <strong>{listaMaterias.length}</strong>
          </span>
          <span>
            Activas: <strong>{totalActivas}</strong>
          </span>
          <span>
            Visibles: <strong>{listaMateriasFiltradas.length}</strong>
          </span>
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
