// src/components/Estadisticas/Estadisticas.jsx
import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarDays,
  faChartLine,
  faCheckCircle,
  faCircleExclamation,
  faSpinner,
  faTriangleExclamation,
  faClock,
  faUsers,
  faTimesCircle,
} from "@fortawesome/free-solid-svg-icons";

import "../Global/Global_css/roots.css";
import "../Global/Global_css/Global_Section.css";
import Principal, { MesasShellContext } from "../Principal/Principal";
import { apiGet } from "../_shared/api/apiClient";
import "./Estadisticas.css";

const ESTADOS = [
  {
    key: "aprobados",
    label: "Aprobados",
    icon: faCheckCircle,
    className: "is-approved",
    description: "Nota 7 o superior",
  },
  {
    key: "ausentes",
    label: "Ausentes",
    icon: faClock,
    className: "is-absent",
    description: "Sin nota cargada",
  },
  {
    key: "desaprobados",
    label: "Desaprobados",
    icon: faTimesCircle,
    className: "is-failed",
    description: "Nota entre 1 y 6",
  },
];

const numberFormatter = new Intl.NumberFormat("es-AR");

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatNumber(value) {
  return numberFormatter.format(toNumber(value));
}

function percent(value, total) {
  const base = toNumber(total);
  if (base <= 0) return 0;
  return Math.round((toNumber(value) * 1000) / base) / 10;
}

function getErrorMessage(error, fallback) {
  return error?.data?.mensaje || error?.message || fallback;
}

function StatCard({ item }) {
  return (
    <article className={`estadCard ${item.className || ""}`}>
      <div className="estadCard__icon" aria-hidden="true">
        <FontAwesomeIcon icon={item.icon} />
      </div>

      <div className="estadCard__body">
        <span className="estadCard__label">{item.label}</span>
        <strong className="estadCard__value">{formatNumber(item.value)}</strong>
        <span className="estadCard__detail">{item.detail}</span>
      </div>
    </article>
  );
}

function DonutChart({ data, total }) {
  const totalSeguro = Math.max(0, toNumber(total));
  const segmentos = data.map((item) => ({
    ...item,
    valor: Math.max(0, toNumber(item.valor)),
    porcentaje: totalSeguro > 0 ? percent(item.valor, totalSeguro) : 0,
  }));

  let acumulado = 0;
  const gradiente = segmentos
    .filter((item) => item.valor > 0)
    .map((item) => {
      const inicio = acumulado;
      acumulado += item.porcentaje;
      return `var(--estad-${item.key}) ${inicio}% ${acumulado}%`;
    })
    .join(", ");

  return (
    <div className="estadDonutWrap">
      <div
        className="estadDonut"
        style={{
          background: gradiente
            ? `conic-gradient(${gradiente}, rgba(120, 102, 97, 0.12) ${acumulado}% 100%)`
            : "rgba(120, 102, 97, 0.12)",
        }}
        aria-label="Gráfico de torta de resultados"
      >
        <div className="estadDonut__center">
          <strong>{formatNumber(totalSeguro)}</strong>
          <span>Inscriptos</span>
        </div>
      </div>

      <div className="estadLegend">
        {segmentos.map((item) => (
          <div className="estadLegend__item" key={item.key}>
            <span className={`estadLegend__dot is-${item.key}`} aria-hidden="true" />
            <span className="estadLegend__label">{item.label}</span>
            <strong className="estadLegend__value">
              {formatNumber(item.valor)} · {item.porcentaje}%
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarraEstado({ estado, total }) {
  const value = toNumber(estado.valor);
  const porcentaje = percent(value, total);

  return (
    <div className={`estadBarRow is-${estado.key}`}>
      <div className="estadBarRow__top">
        <span>{estado.label}</span>
        <strong>{formatNumber(value)} · {porcentaje}%</strong>
      </div>
      <div className="estadBarRow__track" aria-hidden="true">
        <span className="estadBarRow__fill" style={{ width: `${Math.min(100, porcentaje)}%` }} />
      </div>
    </div>
  );
}

function TablaSimple({ rows, total, emptyText }) {
  if (!rows?.length) {
    return <div className="estadEmptyMini">{emptyText}</div>;
  }

  return (
    <div className="estadMiniTable" role="table">
      <div className="estadMiniTable__header" role="row">
        <span role="columnheader">Detalle</span>
        <span role="columnheader">Inscriptos</span>
        <span role="columnheader">Aprob.</span>
        <span role="columnheader">Aus.</span>
        <span role="columnheader">Desap.</span>
      </div>

      {rows.map((row, index) => {
        const key = `${row.label || row.tipo_mesa || row.fecha_mesa || "fila"}-${index}`;
        const inscriptos = toNumber(row.inscriptos);
        const ancho = total > 0 ? Math.max(4, percent(inscriptos, total)) : 0;

        return (
          <div className="estadMiniTable__row" role="row" key={key}>
            <span className="estadMiniTable__main" role="cell" title={row.label || "-"}>
              {row.label || "-"}
              <span className="estadMiniTable__bar" aria-hidden="true">
                <i style={{ width: `${Math.min(100, ancho)}%` }} />
              </span>
            </span>
            <strong role="cell">{formatNumber(row.inscriptos)}</strong>
            <span role="cell">{formatNumber(row.aprobados)}</span>
            <span role="cell">{formatNumber(row.ausentes)}</span>
            <span role="cell">{formatNumber(row.desaprobados)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Estadisticas() {
  const dentroDeShell = useContext(MesasShellContext);
  const [opciones, setOpciones] = useState([]);
  const [idSeleccionado, setIdSeleccionado] = useState("");
  const [resumen, setResumen] = useState(null);
  const [loadingOpciones, setLoadingOpciones] = useState(true);
  const [loadingResumen, setLoadingResumen] = useState(false);
  const [error, setError] = useState("");

  const cargarOpciones = useCallback(async () => {
    setLoadingOpciones(true);
    setError("");

    try {
      const response = await apiGet("estadisticas_mesas_opciones");
      const lista = Array.isArray(response?.data?.opciones) ? response.data.opciones : [];
      setOpciones(lista);

      if (lista.length > 0) {
        setIdSeleccionado((prev) => prev || String(lista[0].id_armado_historial));
      } else {
        setIdSeleccionado("");
        setResumen(null);
      }
    } catch (err) {
      setError(getErrorMessage(err, "No se pudieron cargar las mesas disponibles."));
      setOpciones([]);
      setIdSeleccionado("");
      setResumen(null);
    } finally {
      setLoadingOpciones(false);
    }
  }, []);

  const cargarResumen = useCallback(async (idArmado) => {
    const id = String(idArmado || "").trim();
    if (!id) return;

    setLoadingResumen(true);
    setError("");

    try {
      const response = await apiGet("estadisticas_mesas_resumen", {
        id_armado_historial: id,
      });
      setResumen(response?.data || null);
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo cargar el resumen estadístico."));
      setResumen(null);
    } finally {
      setLoadingResumen(false);
    }
  }, []);

  useEffect(() => {
    cargarOpciones();
  }, [cargarOpciones]);

  useEffect(() => {
    if (idSeleccionado) {
      cargarResumen(idSeleccionado);
    }
  }, [idSeleccionado, cargarResumen]);

  const armadoSeleccionado = useMemo(
    () => opciones.find((item) => String(item.id_armado_historial) === String(idSeleccionado)) || resumen?.armado || null,
    [opciones, idSeleccionado, resumen]
  );

  const totales = resumen?.totales || {};
  const totalInscriptos = toNumber(totales.inscriptos);

  const cards = useMemo(() => {
    const aprobados = toNumber(totales.aprobados);
    const ausentes = toNumber(totales.ausentes);
    const desaprobados = toNumber(totales.desaprobados);

    return [
      {
        key: "inscriptos",
        label: "Inscriptos",
        value: totalInscriptos,
        icon: faUsers,
        className: "is-total",
        detail: "Total del historial seleccionado",
      },
      ...ESTADOS.map((estado) => {
        const value = estado.key === "aprobados" ? aprobados : estado.key === "ausentes" ? ausentes : desaprobados;
        return {
          ...estado,
          value,
          detail: `${percent(value, totalInscriptos)}% sobre inscriptos`,
        };
      }),
    ];
  }, [totales, totalInscriptos]);

  const estadosGrafico = useMemo(
    () =>
      ESTADOS.map((estado) => ({
        key: estado.key,
        label: estado.label,
        valor: toNumber(totales[estado.key]),
      })),
    [totales]
  );

  const contenido = (
    <section className="estadisticasPage">
      <header className="estadHero">
        <div className="estadHero__icon" aria-hidden="true">
          <FontAwesomeIcon icon={faChartLine} />
        </div>

        <div className="estadHero__text">
          <p className="estadHero__eyebrow">Módulo de cierre</p>
          <h1>Estadísticas de mesas</h1>
          <span>
            Resumen por historial guardado: inscriptos, aprobados, ausentes y desaprobados.
          </span>
        </div>

        <button
          type="button"
          className="estadHero__refresh"
          onClick={cargarOpciones}
          disabled={loadingOpciones || loadingResumen}
          title="Actualizar estadísticas"
        >
          {loadingOpciones ? <FontAwesomeIcon icon={faSpinner} spin /> : "Actualizar"}
        </button>
      </header>

      <div className="estadControls">
        <label className="estadSelectBox">
          <span>Seleccionar mesa de examen</span>
          <select
            value={idSeleccionado}
            onChange={(e) => setIdSeleccionado(e.target.value)}
            disabled={loadingOpciones || opciones.length === 0}
          >
            {opciones.length === 0 ? (
              <option value="">No hay historiales guardados</option>
            ) : (
              opciones.map((opcion) => (
                <option value={opcion.id_armado_historial} key={opcion.id_armado_historial}>
                  {opcion.label || opcion.periodo || opcion.codigo_armado}
                </option>
              ))
            )}
          </select>
        </label>

        {armadoSeleccionado && (
          <div className="estadSelectionInfo">
            <span>
              <FontAwesomeIcon icon={faCalendarDays} /> {armadoSeleccionado.periodo || armadoSeleccionado.label}
            </span>
            <small>
              {armadoSeleccionado.fecha_inicio_texto || "-"} a {armadoSeleccionado.fecha_fin_texto || "-"} · Guardado {armadoSeleccionado.creado_en_texto || "-"}
            </small>
          </div>
        )}
      </div>

      {error && (
        <div className="estadAlert" role="alert">
          <FontAwesomeIcon icon={faTriangleExclamation} />
          <span>{error}</span>
        </div>
      )}

      {(loadingOpciones || loadingResumen) && (
        <div className="estadLoading">
          <FontAwesomeIcon icon={faSpinner} spin />
          <span>Cargando estadísticas...</span>
        </div>
      )}

      {!loadingOpciones && !loadingResumen && opciones.length === 0 && !error && (
        <div className="estadEmpty">
          <FontAwesomeIcon icon={faCircleExclamation} />
          <h2>No hay historiales para graficar</h2>
          <p>
            Las estadísticas aparecen cuando se guarda un armado en el historial de mesas.
          </p>
        </div>
      )}

      {!loadingOpciones && !loadingResumen && resumen && (
        <>
          <div className="estadCardsGrid">
            {cards.map((item) => (
              <StatCard item={item} key={item.key} />
            ))}
          </div>

          <div className="estadChartsGrid">
            <article className="estadPanel estadPanel--donut">
              <div className="estadPanel__head">
                <div>
                  <h2>Distribución general</h2>
                  <span>Aprobados, ausentes y desaprobados sobre el total de inscriptos.</span>
                </div>
                <FontAwesomeIcon icon={faChartLine} />
              </div>

              <DonutChart data={estadosGrafico} total={totalInscriptos} />
            </article>

            <article className="estadPanel">
              <div className="estadPanel__head">
                <div>
                  <h2>Comparación por estado</h2>
                  <span>Vista tipo barras para leer rápido los resultados.</span>
                </div>
                <FontAwesomeIcon icon={faChartLine} />
              </div>

              <div className="estadBars">
                {estadosGrafico.map((estado) => (
                  <BarraEstado estado={estado} total={totalInscriptos} key={estado.key} />
                ))}
              </div>
            </article>
          </div>

          <div className="estadDetailsGrid">
            <article className="estadPanel">
              <div className="estadPanel__head">
                <div>
                  <h2>Detalle por fecha</h2>
                  <span>Cómo se distribuyó la mesa seleccionada por día.</span>
                </div>
              </div>
              <TablaSimple
                rows={resumen?.por_fechas || []}
                total={totalInscriptos}
                emptyText="No hay fechas cargadas para este historial."
              />
            </article>

            <article className="estadPanel">
              <div className="estadPanel__head">
                <div>
                  <h2>Detalle por tipo</h2>
                  <span>Simple, correlativa o taller, según el armado guardado.</span>
                </div>
              </div>
              <TablaSimple
                rows={resumen?.por_tipo || []}
                total={totalInscriptos}
                emptyText="No hay tipos de mesa para mostrar."
              />
            </article>
          </div>
        </>
      )}
    </section>
  );

  return dentroDeShell ? contenido : <Principal>{contenido}</Principal>;
}

export default Estadisticas;
