// src/components/Dashbord/Dashbord.jsx
import React, { useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarDays,
  faChartLine,
  faCheckCircle,
  faGraduationCap,
  faLayerGroup,
  faRotateRight,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";

import "./Dashbord.css";
import { useDashbord } from "./hooks/useDashbord";

const numero = (valor) => Number(valor || 0).toLocaleString("es-AR");

const texto = (valor, fallback = "-") => {
  const limpio = String(valor ?? "").trim();
  return limpio || fallback;
};

const clampPercent = (valor) => Math.max(0, Math.min(100, Number(valor || 0)));

const maximoGrafico = (items) => {
  const max = Math.max(
    1,
    ...items.map((item) =>
      Math.max(
        Number(item.grupos || 0),
        Number(item.numeros || 0),
        Number(item.no_agrupadas || 0)
      )
    )
  );

  return max;
};

function LoadingState() {
  return (
    <div className="dashbord-state dashbord-state--loading">
      <FontAwesomeIcon icon={faRotateRight} spin />
      <strong>Cargando dashboard...</strong>
      <span>Obteniendo resumen general del sistema.</span>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="dashbord-emptyChart">
      <FontAwesomeIcon icon={faCalendarDays} />
      <strong>Sin fechas de mesas cargadas</strong>
      <span>Cuando generes el armado, acá se va a ver la distribución por día.</span>
    </div>
  );
}

function Dashbord() {
  const { data, loading, error, recargar } = useDashbord();

  const tarjetas = data?.tarjetas || {};
  const indicadores = data?.indicadores || {};
  const periodo = data?.periodo || {};
  const estadoArmado = data?.estado_armado || {};
  const graficoDias = Array.isArray(data?.grafico_dias) ? data.grafico_dias : [];

  const cards = useMemo(
    () => [
      {
        key: "previas",
        title: "Previas inscriptas",
        value: tarjetas.previas_inscriptas,
        subtitle: `${numero(tarjetas.alumnos_inscriptos)} alumnos distintos`,
        icon: faGraduationCap,
        tone: "blue",
      },
      {
        key: "mesas",
        title: "Números de mesa",
        value: tarjetas.numeros_mesa,
        subtitle: `${numero(indicadores.mesas_registros)} registros generados`,
        icon: faLayerGroup,
        tone: "green",
      },
      {
        key: "grupos",
        title: "Grupos finales",
        value: tarjetas.grupos_finales,
        subtitle: `${numero(indicadores.numeros_agrupados)} números agrupados`,
        icon: faLayerGroup,
        tone: "purple",
      },
      {
        key: "pendientes",
        title: "Sin agrupar",
        value: tarjetas.no_agrupadas,
        subtitle: `${numero(indicadores.previas_sin_mesa)} previas sin mesa`,
        icon: faTriangleExclamation,
        tone: Number(tarjetas.no_agrupadas || 0) > 0 ? "red" : "green",
      },
    ],
    [tarjetas, indicadores]
  );

  const maxGrafico = useMemo(() => maximoGrafico(graficoDias), [graficoDias]);
  const estadoCodigo = texto(estadoArmado.codigo, "sin_armado");

  return (
    <section className="dashbord-page">
      <header className="dashbord-hero">
        <div className="dashbord-hero__text">
          <span className="dashbord-kicker">Panel general</span>
          <h1>Dashboard de Mesas de Examen</h1>
          <p>
            Vista rápida del armado: previas inscriptas, números de mesa, grupos finales
            y pendientes principales.
          </p>
        </div>

        <div className="dashbord-hero__actions">
          <div className="dashbord-period">
            <FontAwesomeIcon icon={faChartLine} />
            <span>Año {texto(periodo.anio_actual, new Date().getFullYear())}</span>
            <strong>{texto(periodo.rango_armado?.label, "Sin armado")}</strong>
          </div>

          <button type="button" className="dashbord-btn dashbord-btn--ghost" onClick={recargar}>
            <FontAwesomeIcon icon={faRotateRight} spin={loading} />
            Actualizar
          </button>
        </div>
      </header>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <div className="dashbord-state dashbord-state--error">
          <FontAwesomeIcon icon={faTriangleExclamation} />
          <strong>No se pudo cargar el dashboard</strong>
          <span>{error}</span>
          <button type="button" className="dashbord-btn" onClick={recargar}>
            Reintentar
          </button>
        </div>
      ) : (
        <>
          <div className="dashbord-cards">
            {cards.map((card) => (
              <article key={card.key} className={`dashbord-card dashbord-card--${card.tone}`}>
                <div className="dashbord-card__icon">
                  <FontAwesomeIcon icon={card.icon} />
                </div>
                <div className="dashbord-card__body">
                  <span>{card.title}</span>
                  <strong>{numero(card.value)}</strong>
                  <small>{card.subtitle}</small>
                </div>
              </article>
            ))}
          </div>

          <div className="dashbord-grid">
            <article className="dashbord-panel dashbord-panel--chart">
              <div className="dashbord-panel__head">
                <div>
                  <h2>Distribución del armado por fecha</h2>
                  <p>Grupos finales, números de mesa y pendientes sin agrupar.</p>
                </div>

                <div className="dashbord-legend">
                  <span><i className="is-blue" /> Grupos</span>
                  <span><i className="is-green" /> Números</span>
                  <span><i className="is-red" /> Sin agrupar</span>
                </div>
              </div>

              {graficoDias.length === 0 ? (
                <EmptyChart />
              ) : (
                <div className="dashbord-bars" aria-label="Gráfico de mesas por día">
                  {graficoDias.map((item) => {
                    const hGrupos = Math.max(4, (Number(item.grupos || 0) / maxGrafico) * 100);
                    const hNumeros = Math.max(4, (Number(item.numeros || 0) / maxGrafico) * 100);
                    const hNoAgrupadas = Number(item.no_agrupadas || 0) > 0
                      ? Math.max(4, (Number(item.no_agrupadas || 0) / maxGrafico) * 100)
                      : 0;

                    return (
                      <div className="dashbord-bars__item" key={item.fecha_mesa || item.label}>
                        <div className="dashbord-bars__cols">
                          <span
                            className="dashbord-bar dashbord-bar--blue"
                            style={{ height: `${hGrupos}%` }}
                            title={`${numero(item.grupos)} grupos`}
                          />
                          <span
                            className="dashbord-bar dashbord-bar--green"
                            style={{ height: `${hNumeros}%` }}
                            title={`${numero(item.numeros)} números`}
                          />
                          <span
                            className="dashbord-bar dashbord-bar--red"
                            style={{ height: `${hNoAgrupadas}%` }}
                            title={`${numero(item.no_agrupadas)} sin agrupar`}
                          />
                        </div>
                        <strong>{texto(item.label)}</strong>
                      </div>
                    );
                  })}
                </div>
              )}
            </article>

            <aside className="dashbord-panel dashbord-panel--status">
              <div className="dashbord-panel__head">
                <div>
                  <h2>Indicadores generales</h2>
                  <p>Estado principal del sistema y del armado actual.</p>
                </div>
              </div>

              <div className={`dashbord-status dashbord-status--${estadoCodigo}`}>
                <div className="dashbord-status__icon">
                  <FontAwesomeIcon icon={estadoCodigo === "completo" ? faCheckCircle : faChartLine} />
                </div>
                <div>
                  <span>Estado del armado</span>
                  <strong>{texto(estadoArmado.titulo, "Sin información")}</strong>
                  <small>{texto(estadoArmado.detalle, "-")}</small>
                </div>
              </div>

              <div className="dashbord-miniGrid">
                <div className="dashbord-miniCard">
                  <span>Numeración</span>
                  <strong>{numero(indicadores.porcentaje_numerado)}%</strong>
                  <div className="dashbord-progress">
                    <i style={{ width: `${clampPercent(indicadores.porcentaje_numerado)}%` }} />
                  </div>
                </div>

                <div className="dashbord-miniCard">
                  <span>Agrupación</span>
                  <strong>{numero(indicadores.porcentaje_agrupado)}%</strong>
                  <div className="dashbord-progress">
                    <i style={{ width: `${clampPercent(indicadores.porcentaje_agrupado)}%` }} />
                  </div>
                </div>

                <div className="dashbord-miniCard">
                  <span>Cátedras con docente</span>
                  <strong>{numero(indicadores.porcentaje_catedras_con_docente)}%</strong>
                  <div className="dashbord-progress">
                    <i style={{ width: `${clampPercent(indicadores.porcentaje_catedras_con_docente)}%` }} />
                  </div>
                </div>

                <div className="dashbord-miniCard">
                  <span>Docentes con disponibilidad</span>
                  <strong>{numero(indicadores.porcentaje_docentes_con_disponibilidad)}%</strong>
                  <div className="dashbord-progress">
                    <i style={{ width: `${clampPercent(indicadores.porcentaje_docentes_con_disponibilidad)}%` }} />
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}

export default Dashbord;
