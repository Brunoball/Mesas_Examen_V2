// src/components/Mesas_examen/Mesas_examen.jsx
import React, { useCallback, useContext, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faLayerGroup,
  faMagnifyingGlass,
  faTrash,
  faUserPlus,
  faLinkSlash,
  faSpinner,
  faTriangleExclamation,
  faCheckCircle,
  faEdit,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";

import "../Global/Global_css/roots.css";
import "../Global/Global_css/Global_Section.css";
import "./Mesas_examen.css";
import Principal, { MesasShellContext } from "../Principal/Principal";
import { useMesasExamen } from "./hooks/useMesasExamen";
import ModalCrearMesa from "./modales/ModalCrearMesa";
import ModalEditarMesa from "./modales/ModalEditarMesa";
import ModalEliminarGlobal from "../Global/Modales/ModalEliminarGlobal";
import Toast from "../Global/Toast";
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

const MesaPdfCard = ({ grupo, esNoAgrupada = false, onEdit, onDelete }) => {
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
    eliminarEdicion,
    personaEdicion,
    masEdicion,
    flechasEdicion,
    agregarNumeroEdicion,
    crearMesas,
    eliminarBorrador,
    cargando,
    armando,
    agrupando,
    error,
  } = useMesasExamen({ onToast: mostrarToastGlobal });

  const totalVisible = Array.isArray(mesasFiltradas) ? mesasFiltradas.length : 0;
  const totalReferencia = tab === "no-agrupadas" ? totalNoAgrupadas : totalGrupos;
  const hayBusquedaActiva = String(busqueda || "").trim() !== "";

  const contenido = (
    <div className="mesas-page mov-page">
      <section className="mesas-shell-card mesas-card-pdf-mode mesas-card-pdf-fijo mov-card mov-card--table">
        <div className="mov-card__head mesas-card__head mesas-panel-head">
          <div className="mov-card__headLeft mesas-card__headLeft">
            <div className="title-mov mesas-titleBox">
              <div className="mov-card__title mesas-section-title">
                Mesas de Examen
              </div>
              <div className="mov-card__hint">
                Mostrando <b>{totalVisible}</b> de <b>{totalReferencia}</b> registros
              </div>
            </div>

            <div className="mov-headFilters mesas-headFilters">
              <div className="mesas-filterTabs" aria-label="Cambiar vista de mesas">
                <span className="mesas-filterTabs__label">Vista</span>
                <div className="mov-tabs mesas-tabsInline">
                  <button
                    className={`mov-tab mesas-tab mesas-tab-counter ${tab === "grupos-finales" ? "is-active" : ""}`}
                    type="button"
                    onClick={() => setTab("grupos-finales")}
                  >
                    <FontAwesomeIcon icon={faLayerGroup} />
                    Grupos finales: {totalGrupos}
                  </button>

                  <button
                    className={`mov-tab mesas-tab mesas-tab-link ${tab === "no-agrupadas" ? "is-active" : ""}`}
                    type="button"
                    onClick={() => setTab("no-agrupadas")}
                  >
                    <FontAwesomeIcon icon={faLinkSlash} />
                    No agrupadas: {totalNoAgrupadas}
                  </button>
                </div>
              </div>

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
              Eliminar Armado
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
          </div>
        )}

        <div className="mesas-pdf-view">
          {cargando ? (
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
              />
            ))
          )}
        </div>
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
