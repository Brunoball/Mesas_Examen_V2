// src/components/Estadisticas/modales/ModalDetallePrevias.jsx
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleInfo,
  faMagnifyingGlass,
  faTableList,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";
import "../../Global/Global_css/Global_Modals.css";
import "./ModalDetallePrevias.css";

const numberFormatter = new Intl.NumberFormat("es-AR");

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatNumber(value) {
  return numberFormatter.format(toNumber(value));
}

function normalizarTexto(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function textoSeguro(value, fallback = "-") {
  const texto = String(value ?? "").trim();
  return texto || fallback;
}

function etiquetaTipo(tipo) {
  const normalizado = normalizarTexto(tipo);
  if (normalizado === "taller") return "Taller";
  if (normalizado === "correlativa") return "Correlativa";
  return "Simple";
}

function etiquetaEstado(estado) {
  const normalizado = normalizarTexto(estado);
  if (normalizado === "aprobados" || normalizado === "aprobado") return "Aprobada";
  if (normalizado === "desaprobados" || normalizado === "desaprobado") return "Desaprobada";
  if (normalizado === "ausentes" || normalizado === "ausente") return "Ausente";
  return "Inscriptos";
}

function getCursoMateria(previa) {
  const curso = textoSeguro(previa.materia_curso || previa.materia_id_curso, "");
  const division = textoSeguro(previa.materia_division || previa.materia_id_division, "");
  const completo = `${curso}${division ? ` ${division}` : ""}`.trim();
  return completo || "-";
}

function getCursando(previa) {
  const curso = textoSeguro(previa.cursando_curso || previa.cursando_id_curso, "");
  const division = textoSeguro(previa.cursando_division || previa.cursando_id_division, "");
  const completo = `${curso}${division ? ` ${division}` : ""}`.trim();
  return completo || "-";
}

function getResultado(previa) {
  const estado = etiquetaEstado(previa.estado_resultado);
  const nota = previa.nota === null || previa.nota === undefined || previa.nota === "" ? "Sin nota" : `Nota ${previa.nota}`;
  return `${estado} · ${nota}`;
}

function ModalDetallePrevias({ abierto, titulo, subtitulo, filtro, previas = [], loading, error, onClose }) {
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    if (!abierto) return undefined;

    setBusqueda("");

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [abierto, onClose]);

  const previasFiltradas = useMemo(() => {
    const q = normalizarTexto(busqueda);
    if (!q) return previas;

    return previas.filter((previa) => {
      const texto = normalizarTexto([
        previa.alumno,
        previa.dni,
        previa.materia,
        previa.materias_taller,
        previa.docentes,
        previa.condicion,
        previa.numero_mesa,
        previa.numero_grupo,
        previa.fecha_mesa_texto,
        previa.turno,
        previa.anio,
      ].join(" "));

      return texto.includes(q);
    });
  }, [busqueda, previas]);

  if (!abierto) return null;

  const total = previas.length;
  const dimension = filtro?.dimension || "";

  const modalContent = (
    <div
      className="gm-modalOverlay estadDetalleModal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="estadDetalleModalTitulo"
      data-mesa-modal-root="true"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <section
        className="gm-modal gm-modal--detalle estadDetalleModal__panel"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="gm-modal__header estadDetalleModal__header">
          <span className="gm-modal__headIcon estadDetalleModal__headIcon" aria-hidden="true">
            <FontAwesomeIcon icon={faTableList} />
          </span>

          <div className="gm-modal__headText estadDetalleModal__headText">
            <span className="gm-panel__eyebrow estadDetalleModal__eyebrow">Detalle de previas</span>
            <h2 id="estadDetalleModalTitulo">{titulo || "Previas de la estadística"}</h2>
            {subtitulo ? <p>{subtitulo}</p> : null}
          </div>

          <button type="button" className="gm-modal__close" onClick={onClose} aria-label="Cerrar detalle">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </header>

        <div className="gm-modal__form estadDetalleModal__form">
          <div className="gm-modal__content estadDetalleModal__content">
            <section className="gm-panel estadDetalleModal__toolsPanel" aria-label="Herramientas del detalle">
              <div className="gm-panel__body estadDetalleModal__tools">
                <div className="gm-inlineMetric estadDetalleModal__count">
                  <FontAwesomeIcon icon={faCircleInfo} aria-hidden="true" />
                  <div>
                    <span>Resultado</span>
                    <strong>
                      {formatNumber(total)} {total === 1 ? "previa encontrada" : "previas encontradas"}
                    </strong>
                  </div>
                </div>

                <label className="gm-field estadDetalleModal__search">
                  <FontAwesomeIcon className="estadDetalleModal__searchIcon" icon={faMagnifyingGlass} aria-hidden="true" />
                  <input
                    className="gm-input"
                    type="search"
                    value={busqueda}
                    onChange={(event) => setBusqueda(event.target.value)}
                    placeholder=" "
                    disabled={loading || total === 0}
                  />
                  <span className="gm-label">Buscar alumno, DNI, materia o docente</span>
                </label>
              </div>
            </section>

            {dimension === "tipo" ? (
              <div className="gm-alert gm-alert--info gm-alert--banner estadDetalleModal__hint">
                <FontAwesomeIcon icon={faCircleInfo} aria-hidden="true" />
                <span>Estás viendo las previas que forman este tipo de mesa. Sirve para comparar rápido contra el armado de mesas.</span>
              </div>
            ) : null}

            <div className="gm-panel estadDetalleModal__bodyPanel">
              <div className="gm-panel__body estadDetalleModal__body">
                {loading ? (
                  <div className="gm-emptySchedule estadDetalleModal__state">
                    <strong>Cargando detalle...</strong>
                    <span>Estamos preparando las previas vinculadas a esta estadística.</span>
                  </div>
                ) : error ? (
                  <div className="gm-alert gm-alert--error gm-alert--banner estadDetalleModal__state estadDetalleModal__state--error">
                    <FontAwesomeIcon icon={faCircleInfo} aria-hidden="true" />
                    <span>{error}</span>
                  </div>
                ) : total === 0 ? (
                  <div className="gm-emptySchedule estadDetalleModal__state">
                    <strong>No hay previas para mostrar</strong>
                    <span>No se encontraron registros para este filtro.</span>
                  </div>
                ) : previasFiltradas.length === 0 ? (
                  <div className="gm-emptySchedule estadDetalleModal__state">
                    <strong>Sin coincidencias</strong>
                    <span>No hay resultados con esa búsqueda.</span>
                  </div>
                ) : (
                  <div className="estadDetalleModal__tableWrap">
                    <table className="estadDetalleModal__table">
                      <thead>
                        <tr>
                          <th>Alumno</th>
                          <th>Materia</th>
                          <th>Tipo / resultado</th>
                          <th>Mesa</th>
                          <th>Docentes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previasFiltradas.map((previa, index) => {
                          const key = `${previa.clave_previa || previa.id_previa || "previa"}-${index}`;
                          const tipo = etiquetaTipo(previa.tipo_mesa);
                          const cursoMateria = getCursoMateria(previa);
                          const cursando = getCursando(previa);
                          const materiasTaller = textoSeguro(previa.materias_taller, "");

                          return (
                            <tr key={key}>
                              <td data-label="Alumno">
                                <strong>{textoSeguro(previa.alumno)}</strong>
                                <small>DNI {textoSeguro(previa.dni)} · Cursa {cursando}</small>
                              </td>
                              <td data-label="Materia">
                                <strong>{textoSeguro(previa.materia)}</strong>
                                <small>Curso materia: {cursoMateria} · Año previa {textoSeguro(previa.anio)}</small>
                                {materiasTaller && materiasTaller !== textoSeguro(previa.materia, "") ? (
                                  <em>Taller: {materiasTaller}</em>
                                ) : null}
                              </td>
                              <td data-label="Tipo / resultado">
                                <span className={`estadDetalleModal__badge is-${String(previa.tipo_mesa || "simple").toLowerCase()}`}>{tipo}</span>
                                <small>{getResultado(previa)} · {textoSeguro(previa.condicion)}</small>
                              </td>
                              <td data-label="Mesa">
                                <strong>Mesa {textoSeguro(previa.numero_mesa)}</strong>
                                <small>
                                  Grupo {textoSeguro(previa.numero_grupo)} · {textoSeguro(previa.fecha_mesa_texto)} · {textoSeguro(previa.turno)}
                                </small>
                              </td>
                              <td data-label="Docentes">
                                <span>{textoSeguro(previa.docentes || previa.docente)}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>

          <footer className="gm-modal__actions estadDetalleModal__actions">
            <button type="button" className="gm-btn gm-btn--ghost" onClick={onClose}>
              Cerrar
            </button>
          </footer>
        </div>
      </section>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export default ModalDetallePrevias;
