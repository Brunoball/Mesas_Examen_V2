// src/components/Dashbord/Dashbord.jsx
import React, { useEffect, useMemo, useState } from "react";
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
import "../Global/Global_css/Global_DashbordResponsive.css";
import { useDashbord } from "./hooks/useDashbord";
import Toast from "../Global/Toast";

const numero = (valor) => Number(valor || 0).toLocaleString("es-AR");

const texto = (valor, fallback = "-") => {
  const limpio = String(valor ?? "").trim();
  return limpio || fallback;
};

const totalDia = (item) =>
  Number(item?.grupos || 0) +
  Number(item?.numeros || 0) +
  Number(item?.no_agrupadas || 0);

const maximoGrafico = (items) => {
  const max = Math.max(1, ...items.map((item) => totalDia(item)));
  return Math.max(1, Math.ceil(max / 10) * 10);
};

function SkeletonChart() {
  return (
    <div className="dashbord-chart dashbord-chart--loading" aria-hidden="true">
      <div className="dashbord-chart__axis">
        {[1, 2, 3, 4, 5].map((item) => (
          <span key={item} className="dashbord-skeletonText dashbord-skeletonText--axis">&nbsp;</span>
        ))}
      </div>

      <div className="dashbord-chart__plot">
        <div className="dashbord-chart__grid" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>

        <div className="dashbord-chart__bars">
          {[72, 48, 84, 58, 66, 38, 76, 52].map((alto, index) => (
            <div className="dashbord-chart__item" key={index}>
              <div className="dashbord-stackBar dashbord-stackBar--skeleton" style={{ height: `${alto}%` }} />
              <strong className="dashbord-skeletonText dashbord-skeletonText--date">&nbsp;</strong>
            </div>
          ))}
        </div>
      </div>
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
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!error) return;

    setToast({
      id: Date.now(),
      tipo: "error",
      texto: error,
    });
  }, [error]);

  const cerrarToast = () => setToast(null);
  const handleRecargar = () => {
    cerrarToast();
    recargar();
  };

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
      },
      {
        key: "mesas",
        title: "Números de mesa",
        value: tarjetas.numeros_mesa,
        subtitle: `${numero(indicadores.mesas_registros)} registros generados`,
        icon: faLayerGroup,
      },
      {
        key: "grupos",
        title: "Grupos finales",
        value: tarjetas.grupos_finales,
        subtitle: `${numero(indicadores.numeros_agrupados)} números agrupados`,
        icon: faLayerGroup,
      },
      {
        key: "pendientes",
        title: "Sin agrupar",
        value: tarjetas.no_agrupadas,
        subtitle: `${numero(indicadores.previas_sin_mesa)} previas sin mesa`,
        icon: faTriangleExclamation,
        alert: Number(tarjetas.no_agrupadas || 0) > 0,
      },
    ],
    [tarjetas, indicadores]
  );

  const miniCards = useMemo(
    () => [
      {
        key: "numeracion",
        label: "Numeración",
        value: indicadores.porcentaje_numerado,
        icon: faChartLine,
      },
      {
        key: "agrupacion",
        label: "Agrupación",
        value: indicadores.porcentaje_agrupado,
        icon: faLayerGroup,
      },
      {
        key: "catedras",
        label: "Cátedras con docente",
        value: indicadores.porcentaje_catedras_con_docente,
        icon: faGraduationCap,
      },
      {
        key: "disponibilidad",
        label: "Docentes con disponibilidad",
        value: indicadores.porcentaje_docentes_con_disponibilidad,
        icon: faCheckCircle,
      },
    ],
    [indicadores]
  );

  const maxGrafico = useMemo(() => maximoGrafico(graficoDias), [graficoDias]);
  const marcasGrafico = useMemo(
    () => [maxGrafico, Math.round(maxGrafico * 0.75), Math.round(maxGrafico * 0.5), Math.round(maxGrafico * 0.25), 0],
    [maxGrafico]
  );
  const pendientes = Number(tarjetas.no_agrupadas || 0);
  const rangoArmado = texto(periodo.rango_armado?.label, "Sin armado");
  const anioActual = texto(periodo.anio_actual, new Date().getFullYear());

  return (
    <section className="dashbord-page">
      {toast && (
        <Toast
          key={toast.id}
          tipo={toast.tipo}
          mensaje={toast.texto}
          onClose={cerrarToast}
        />
      )}

      <header className="dashbord-header">
        <div className="dashbord-header__title">
          <h1>Dashboard de Mesas de Examen</h1>
          <p>Resumen visual del armado, la numeración y los pendientes principales.</p>
        </div>

        <div className="dashbord-header__tools" aria-label="Acciones y periodo del dashboard">
          <span className={`dashbord-chip ${loading ? "is-loading" : ""}`}>
            {loading ? (
              <span className="dashbord-skeletonText dashbord-skeletonText--chip">&nbsp;</span>
            ) : (
              <>
                <FontAwesomeIcon icon={faCalendarDays} />
                Año {anioActual}
              </>
            )}
          </span>
          <span className={`dashbord-chip dashbord-chip--wide ${loading ? "is-loading" : ""}`} title={loading ? "" : rangoArmado}>
            {loading ? <span className="dashbord-skeletonText dashbord-skeletonText--chipWide">&nbsp;</span> : rangoArmado}
          </span>

        </div>
      </header>

      {error && !loading ? (
        <div className="dashbord-state">
          <FontAwesomeIcon icon={faRotateRight} />
          <strong>Dashboard sin datos disponibles</strong>
          <span>Usá el botón para volver a consultar la información.</span>
          <button type="button" className="dashbord-btn" onClick={handleRecargar}>
            Reintentar
          </button>
        </div>
      ) : (
        <div className={`dashbord-layout ${loading ? "dashbord-layout--loading" : ""}`} aria-busy={loading}>
          <section className="dashbord-cards dashbord-cards--top" aria-label="Indicadores principales">
            {cards.map((card) => (
              <article
                key={card.key}
                className={`dashbord-card ${card.alert ? "dashbord-card--alert" : ""} ${loading ? "is-loading" : ""}`}
              >
                <div className="dashbord-card__icon">
                  <FontAwesomeIcon icon={card.icon} />
                </div>

                <div className="dashbord-card__body">
                  <span className={`dashbord-card__title ${loading ? "dashbord-skeletonText dashbord-skeletonText--cardTitle" : ""}`}>
                    {loading ? " " : card.title}
                  </span>
                  <strong className={loading ? "dashbord-skeletonText dashbord-skeletonText--cardValue" : ""}>
                    {loading ? " " : numero(card.value)}
                  </strong>
                  <small className={loading ? "dashbord-skeletonText dashbord-skeletonText--cardSmall" : ""}>
                    {loading ? " " : card.subtitle}
                  </small>
                </div>
              </article>
            ))}
          </section>

          <div className="dashbord-mainGrid">
            <article className="dashbord-panel dashbord-panel--chart">
              <div className="dashbord-panel__head dashbord-panel__head--chart">
                <div>
                  <h2>Armado por fecha</h2>
                  <p className={loading ? "dashbord-skeletonText dashbord-skeletonText--panelText" : ""}>
                    {loading ? " " : "Distribución diaria de grupos, números generados y previas sin agrupar."}
                  </p>
                </div>

                <div className={`dashbord-legend ${loading ? "is-loading" : ""}`} aria-label="Referencias del gráfico">
                  <span className={loading ? "dashbord-skeletonText dashbord-skeletonText--legend" : ""}>{loading ? " " : <><i className="is-primary" /> Grupos</>}</span>
                  <span className={loading ? "dashbord-skeletonText dashbord-skeletonText--legend" : ""}>{loading ? " " : <><i className="is-secondary" /> Números</>}</span>
                  <span className={loading ? "dashbord-skeletonText dashbord-skeletonText--legend" : ""}>{loading ? " " : <><i className="is-alert" /> Sin agrupar</>}</span>
                </div>
              </div>

              {loading ? (
                <SkeletonChart />
              ) : graficoDias.length === 0 ? (
                <EmptyChart />
              ) : (
                <div className="dashbord-chart" aria-label="Gráfico de mesas por día">
                  <div className="dashbord-chart__axis" aria-hidden="true">
                    {marcasGrafico.map((marca) => (
                      <span key={marca}>{numero(marca)}</span>
                    ))}
                  </div>

                  <div className="dashbord-chart__plot">
                    <div className="dashbord-chart__grid" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>

                    <div className="dashbord-chart__bars">
                      {graficoDias.map((item) => {
                        const grupos = Number(item.grupos || 0);
                        const numeros = Number(item.numeros || 0);
                        const sinAgrupar = Number(item.no_agrupadas || 0);
                        const total = grupos + numeros + sinAgrupar;
                        const altura = total > 0 ? Math.max(8, (total / maxGrafico) * 100) : 0;
                        const proporcion = (valor) => (total > 0 ? (valor / total) * 100 : 0);

                        return (
                          <div className="dashbord-chart__item" key={item.fecha_mesa || item.label}>
                            <div
                              className="dashbord-stackBar"
                              style={{ height: `${altura}%` }}
                              title={`${numero(total)} registros el ${texto(item.label)}`}
                            >
                              {grupos > 0 ? (
                                <span
                                  className="dashbord-stackBar__segment is-primary"
                                  style={{ flexBasis: `${proporcion(grupos)}%` }}
                                  title={`${numero(grupos)} grupos`}
                                />
                              ) : null}
                              {numeros > 0 ? (
                                <span
                                  className="dashbord-stackBar__segment is-secondary"
                                  style={{ flexBasis: `${proporcion(numeros)}%` }}
                                  title={`${numero(numeros)} números`}
                                />
                              ) : null}
                              {sinAgrupar > 0 ? (
                                <span
                                  className="dashbord-stackBar__segment is-alert"
                                  style={{ flexBasis: `${proporcion(sinAgrupar)}%` }}
                                  title={`${numero(sinAgrupar)} sin agrupar`}
                                />
                              ) : null}
                            </div>
                            <strong>{texto(item.label)}</strong>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </article>

            <aside className="dashbord-sidePanel" aria-label="Estado del armado">


              <article className="dashbord-panel dashbord-panel--progress">
                <div className="dashbord-panel__head dashbord-panel__head--progress">
                  <div className="dashbord-panel__headContent">
                    <div className="header-dashboars">
                      <h2>Estado del armado</h2>
                      <span className={`dashbord-reviewChip ${pendientes > 0 ? "is-alert" : "is-ok"} ${loading ? "dashbord-skeletonText dashbord-skeletonText--review" : ""}`}>
                        {loading ? (
                          " "
                        ) : (
                          <>
                            <FontAwesomeIcon icon={pendientes > 0 ? faTriangleExclamation : faCheckCircle} />
                            {texto(estadoArmado.titulo, "Sin información")}
                          </>
                        )}
                      </span>
                    </div>
                    <p className={loading ? "dashbord-skeletonText dashbord-skeletonText--panelText" : ""}>
                      {loading ? " " : texto(estadoArmado.detalle, "-")}
                    </p>
                  </div>

                 
                </div>

                <div className="dashbord-progressList">
                  {miniCards.map((item) => {
                    const porcentaje = Math.max(0, Math.min(100, Number(item.value || 0)));

                    return (
                      <div key={item.key} className="dashbord-progressItem">
                        <div className="dashbord-progressItem__top">
                          <span className={loading ? "dashbord-skeletonText dashbord-skeletonText--progressLabel" : ""}>
                            {loading ? (
                              " "
                            ) : (
                              <>
                                <FontAwesomeIcon icon={item.icon} />
                                {item.label}
                              </>
                            )}
                          </span>
                          <strong className={loading ? "dashbord-skeletonText dashbord-skeletonText--progressValue" : ""}>
                            {loading ? " " : `${numero(item.value)}%`}
                          </strong>
                        </div>
                        <div className={`dashbord-progressTrack ${loading ? "dashbord-progressTrack--loading" : ""}`} aria-hidden="true">
                          <span style={{ width: loading ? "64%" : `${porcentaje}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            </aside>
          </div>
        </div>
      )}

      <footer className="dashbord-footer">
        Desarrollado por{" "}
        <a href="https://3devsnet.com" target="_blank" rel="noopener noreferrer">
          3devs.solutions
        </a>
      </footer>
    </section>
  );
}

export default Dashbord;
