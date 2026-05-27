// src/components/Configuracion/Configuracion.jsx
import React, { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronRight,
  faClipboardList,
  faSliders,
  faUserGear,
} from "@fortawesome/free-solid-svg-icons";

import ConfiguracionFormulario from "./Formulario/ConfiguracionFormulario";
import ConfiguracionUsuarios from "./Usuarios/ConfiguracionUsuarios";
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
  const [seccionActiva, setSeccionActiva] = useState("inicio");

  const cards = useMemo(
    () => [
      {
        id: "formulario",
        title: "Configuración del formulario",
        description:
          "Definí cuándo abre y cierra la inscripción del formulario público de mesas.",
        status: { text: "Inscripción", type: "success" },
        metaTop: "Formulario público",
        metaBottom: "Apertura, cierre y mensaje de aviso",
        icon: faClipboardList,
        onClick: () => setSeccionActiva("formulario"),
      },
      {
        id: "usuarios",
        title: "Configuración de usuarios",
        description:
          "Administrá usuarios del sistema: altas, bajas, roles y contraseña.",
        status: { text: "Usuarios y permisos", type: "neutral" },
        metaTop: "Usuarios",
        metaBottom: "Crear, editar, eliminar y activar",
        icon: faUserGear,
        onClick: () => setSeccionActiva("usuarios"),
      },
    ],
    []
  );

  if (seccionActiva === "formulario") {
    return <ConfiguracionFormulario onVolver={() => setSeccionActiva("inicio")} />;
  }

  if (seccionActiva === "usuarios") {
    return <ConfiguracionUsuarios onVolver={() => setSeccionActiva("inicio")} />;
  }

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
            Desde esta sección se centraliza la configuración general del sistema:
            formulario público y usuarios habilitados para entrar al panel.
          </p>
        </div>
      </header>

      <div className="cfg-cards">
        {cards.map((card) => (
          <div key={card.id} className="cfg-cardWrap">
            <button
              type="button"
              className="cfg-card"
              onClick={card.onClick}
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
