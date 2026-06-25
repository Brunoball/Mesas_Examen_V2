// src/components/Estadisticas/modales/ModalDetallePrevias.jsx
import React, { useEffect, useMemo, useState } from "react";
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

  return (
    <div className="estadModalDetalle" role="dialog" aria-modal="true" aria-labelledby="estadModalDetalleTitulo">
      <div className="estadModalDetalle__backdrop" onClick={onClose} />

      <section className="estadModalDetalle__panel">
        <header className="estadModalDetalle__head">
          <div>
            <span className="estadModalDetalle__eyebrow">Detalle de previas</span>
            <h2 id="estadModalDetalleTitulo">{titulo || "Previas de la estadística"}</h2>
            {subtitulo ? <p>{subtitulo}</p> : null}
          </div>

          <button type="button" className="estadModalDetalle__close" onClick={onClose} aria-label="Cerrar detalle">
            ×
          </button>
        </header>

        <div className="estadModalDetalle__tools">
          <div className="estadModalDetalle__count">
            <strong>{formatNumber(total)}</strong>
            <span>{total === 1 ? "previa encontrada" : "previas encontradas"}</span>
          </div>

          <label className="estadModalDetalle__search">
            <span>Buscar</span>
            <input
              type="search"
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              placeholder="Alumno, DNI, materia, docente..."
              disabled={loading || total === 0}
            />
          </label>
        </div>

        {dimension === "tipo" ? (
          <div className="estadModalDetalle__hint">
            Estás viendo las previas que forman este tipo de mesa. Sirve para comparar rápido contra el armado de mesas.
          </div>
        ) : null}

        <div className="estadModalDetalle__body">
          {loading ? (
            <div className="estadModalDetalle__state">Cargando detalle...</div>
          ) : error ? (
            <div className="estadModalDetalle__state is-error">{error}</div>
          ) : total === 0 ? (
            <div className="estadModalDetalle__state">No hay previas para mostrar en este filtro.</div>
          ) : previasFiltradas.length === 0 ? (
            <div className="estadModalDetalle__state">No hay coincidencias con esa búsqueda.</div>
          ) : (
            <div className="estadModalDetalle__tableWrap">
              <table className="estadModalDetalle__table">
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
                          <span className={`estadModalDetalle__badge is-${String(previa.tipo_mesa || "simple").toLowerCase()}`}>{tipo}</span>
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
      </section>
    </div>
  );
}

export default ModalDetallePrevias;
