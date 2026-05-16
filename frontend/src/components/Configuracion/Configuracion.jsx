// src/components/Configuracion/Configuracion.jsx
import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronRight,
  faClipboardList,
  faSliders,
} from "@fortawesome/free-solid-svg-icons";

import "./configuracion.css";

function StatusPill({ type = "neutral", children }) {
  return <span className={`cfg-status cfg-status--${type}`}>{children}</span>;
}

function CardVisual({ icon }) {
  return (
    <div className="cfg-cardLogoBox" aria-hidden="true">
      <FontAwesomeIcon icon={icon} />
    </div>
  );
}

export default function Configuracion() {
  const navigate = useNavigate();

  const cards = useMemo(
    () => [
      {
        id: "formulario",
        title: "Formulario público",
        description:
          "Definí cuándo abre y cierra la inscripción del formulario público de mesas.",
        route: "/configuracion-formulario",
        status: { text: "Principal", type: "success" },
        metaTop: "Inscripción",
        metaBottom: "Apertura, cierre y mensaje de aviso",
        icon: faClipboardList,
      },
    ],
    []
  );

  return (
    <section className="cfg-page">
      <header className="cfg-hero">
        <div className="cfg-hero__icon" aria-hidden="true">
          <FontAwesomeIcon icon={faSliders} />
        </div>

        <div className="cfg-hero__text">
          <p className="cfg-kicker">Panel de configuración</p>
          <h1>Configuración de Mesas</h1>
          <p>
            Desde esta sección se centraliza la configuración general del sistema.
            Por ahora queda disponible únicamente la configuración del formulario público.
          </p>
        </div>
      </header>

      <div className="cfg-cards cfg-cards--single">
        {cards.map((card) => (
          <div key={card.id} className="cfg-cardWrap">
            <button
              type="button"
              className="cfg-card"
              onClick={() => navigate(card.route)}
            >
              <div className="cfg-cardMain">
                <CardVisual icon={card.icon} />

                <div className="cfg-cardBody">
                  <div className="cfg-cardHeader">
                    <h2>{card.title}</h2>
                    <StatusPill type={card.status.type}>{card.status.text}</StatusPill>
                  </div>
                  <p className="cfg-cardDescription">{card.description}</p>
                </div>
              </div>

              <div className="cfg-cardFooter">
                <div className="cfg-cardFooterLeft">
                  <div className="cfg-cardMetaLine">
                    <span className="cfg-cardMetaLabel">Área</span>
                    <span className="cfg-cardMetaValue">{card.metaTop}</span>
                  </div>
                  <div className="cfg-cardMetaLine">
                    <span className="cfg-cardMetaLabel">Detalle</span>
                    <span className="cfg-cardMetaValue">{card.metaBottom}</span>
                  </div>
                </div>

                <div className="cfg-cardFooterRight">
                  <span className="cfg-cardArrow">
                    <FontAwesomeIcon icon={faChevronRight} />
                  </span>
                </div>
              </div>
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
