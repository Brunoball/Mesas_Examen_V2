// src/components/Configuracion/Formulario/ConfiguracionFormulario.jsx
import React, { useContext } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faCalendarAlt,
  faClock,
  faCog,
  faInfoCircle,
  faSave,
} from "@fortawesome/free-solid-svg-icons";
import {
  formatoFechaLarga,
  HORAS,
  MINUTOS,
  useConfiguracionFormulario,
} from "./hooks/useConfiguracionFormulario";
import Principal, { MesasShellContext } from "../../Principal/Principal";
import "../../Global/Global_css/roots.css";
import "../../Global/Global_css/Global_Section.css";
import "./ConfiguracionFormulario.css";
import Toast from "../../Global/Toast";

function fieldClass(value = "") {
  return `cc-floatingField cfgFormFloating ${String(value).trim() ? "is-active" : ""}`;
}

function openNativePicker(event) {
  const input = event.currentTarget;

  if (!input || typeof input.showPicker !== "function") return;

  try {
    input.showPicker();
  } catch (error) {
    // Chrome exige que showPicker() se ejecute por un gesto real del usuario.
    // Si el navegador no lo permite, no rompemos la pantalla: el input sigue funcionando normal.
    if (error?.name !== "NotAllowedError" && error?.name !== "InvalidStateError") {
      console.warn("No se pudo abrir el calendario nativo:", error);
    }
  }
}

export default function ConfiguracionFormulario({ onVolver = null }) {
  const navigate = useNavigate();
  const dentroDeShell = useContext(MesasShellContext);

  const {
    titulo,
    setTitulo,
    inicioFecha,
    setInicioFecha,
    inicioHora,
    setInicioHora,
    inicioMinuto,
    setInicioMinuto,
    finFecha,
    setFinFecha,
    finHora,
    setFinHora,
    finMinuto,
    setFinMinuto,
    mensajeCerrado,
    setMensajeCerrado,
    cargando,
    guardando,
    toast,
    setToast,
    estaAbierta,
    guardar,
  } = useConfiguracionFormulario();

  async function handleGuardar(e) {
    e.preventDefault();
    await guardar();
  }

  function handleVolver() {
    if (typeof onVolver === "function") {
      onVolver();
      return;
    }

    navigate("/configuracion");
  }

  const contenido = (
    <div className="cfgFormPage mov-page">
      {toast && (
        <Toast
          key={toast.id}
          tipo={toast.tipo}
          mensaje={toast.texto}
          duracion={toast.duracion}
          onClose={() => setToast(null)}
        />
      )}

      <section className="cfgFormCardRoot mov-card mov-card--table">
        <div className="mov-card__head cfgFormHead">
          <div className="mov-card__headLeft cfgFormHeadLeft">
            <div className="title-mov cfgFormTitleBox">
              <div className="mov-card__title cfgFormSectionTitle">
                <FontAwesomeIcon icon={faCog} />
                Mesas · Configuración del formulario
              </div>
              <div className="mov-card__hint">
                Definí el período de inscripción y el mensaje que verá el alumno cuando esté cerrado.
              </div>
            </div>

            <div className="mov-headFilters cfgFormHeadFilters">
              <span className={`cfgFormStatusPill ${estaAbierta ? "is-open" : "is-closed"}`}>
                <i aria-hidden="true" />
                {estaAbierta ? "Inscripción abierta" : "Inscripción cerrada"}
              </span>
            </div>
          </div>

          <div className="mov-card__actions cfgFormHeadActions">
            <button
              type="button"
              className="mov-btn mov-btn--ghost cfgFormHeadBtn"
              onClick={handleVolver}
              disabled={guardando}
            >
              <FontAwesomeIcon icon={faArrowLeft} />
              Volver
            </button>

            <button
              type="submit"
              form="cfgFormMainForm"
              className="mov-btn mov-btn--primary cfgFormHeadBtn"
              disabled={guardando || cargando}
            >
              <FontAwesomeIcon icon={faSave} />
              {guardando ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>

        <div className="cfgFormContent">
          {cargando ? (
            <div className="cfgFormLoading" aria-busy="true">
              <span className="cfgFormLoadingIcon" />
              <div>
                <strong>Cargando configuración</strong>
                <p>Estamos preparando los datos del formulario.</p>
              </div>
            </div>
          ) : (
            <>
              <form id="cfgFormMainForm" className="cfgFormPanel cfgFormPanel--main" onSubmit={handleGuardar}>
                <div className="cfgFormPanelHead">
                  <div>
                    <h2>Datos principales</h2>
                    <p>Configurá el título público y el rango habilitado para la inscripción.</p>
                  </div>
                </div>

                <div className="cfgFormGrid">
                  <label className={`${fieldClass(titulo)} cfgFormGridFull`}>
                    <input
                      className="cc-input cc-input--floating cfgFormInput"
                      type="text"
                      value={titulo}
                      onChange={(e) => setTitulo(e.target.value)}
                      placeholder=" "
                      maxLength={80}
                    />
                    <span className="cc-floatingLabel">Título del formulario</span>
                  </label>

                  <div className="cfgFormDateBlock cfgFormGridFull">
                    <div className="cfgFormDateBlockHead">
                      <span className="cfgFormDateIcon">
                        <FontAwesomeIcon icon={faCalendarAlt} />
                      </span>
                      <div>
                        <h3>Inicio</h3>
                        <p>Momento desde el que el formulario queda habilitado.</p>
                      </div>
                    </div>

                    <div className="cfgFormDateRow">
                      <label className={fieldClass(inicioFecha)}>
                        <input
                          className="cc-input cc-input--floating cfgFormInput cfgFormDate"
                          type="date"
                          value={inicioFecha}
                          onChange={(e) => setInicioFecha(e.target.value)}
                          onClick={openNativePicker}
                          placeholder=" "
                        />
                        <span className="cc-floatingLabel">Fecha</span>
                      </label>

                      <label className={fieldClass(inicioHora)}>
                        <select
                          className="cc-input cc-input--floating cfgFormInput cfgFormSelect"
                          value={inicioHora}
                          onChange={(e) => setInicioHora(e.target.value)}
                        >
                          {HORAS.map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                        <span className="cc-floatingLabel">Hora</span>
                      </label>

                      <label className={fieldClass(inicioMinuto)}>
                        <select
                          className="cc-input cc-input--floating cfgFormInput cfgFormSelect"
                          value={inicioMinuto}
                          onChange={(e) => setInicioMinuto(e.target.value)}
                        >
                          {MINUTOS.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                        <span className="cc-floatingLabel">Min.</span>
                      </label>
                    </div>
                  </div>

                  <div className="cfgFormDateBlock cfgFormGridFull">
                    <div className="cfgFormDateBlockHead">
                      <span className="cfgFormDateIcon cfgFormDateIcon--end">
                        <FontAwesomeIcon icon={faClock} />
                      </span>
                      <div>
                        <h3>Fin</h3>
                        <p>Momento exacto en el que se cierra la inscripción.</p>
                      </div>
                    </div>

                    <div className="cfgFormDateRow">
                      <label className={fieldClass(finFecha)}>
                        <input
                          className="cc-input cc-input--floating cfgFormInput cfgFormDate"
                          type="date"
                          value={finFecha}
                          onChange={(e) => setFinFecha(e.target.value)}
                          onClick={openNativePicker}
                          placeholder=" "
                        />
                        <span className="cc-floatingLabel">Fecha</span>
                      </label>

                      <label className={fieldClass(finHora)}>
                        <select
                          className="cc-input cc-input--floating cfgFormInput cfgFormSelect"
                          value={finHora}
                          onChange={(e) => setFinHora(e.target.value)}
                        >
                          {HORAS.map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                        <span className="cc-floatingLabel">Hora</span>
                      </label>

                      <label className={fieldClass(finMinuto)}>
                        <select
                          className="cc-input cc-input--floating cfgFormInput cfgFormSelect"
                          value={finMinuto}
                          onChange={(e) => setFinMinuto(e.target.value)}
                        >
                          {MINUTOS.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                        <span className="cc-floatingLabel">Min.</span>
                      </label>
                    </div>
                  </div>

                  <label className={`${fieldClass(mensajeCerrado)} cfgFormGridFull cfgFormTextareaField`}>
                    <textarea
                      className="cc-input cc-input--floating cfgFormInput cfgFormTextarea"
                      value={mensajeCerrado}
                      onChange={(e) => setMensajeCerrado(e.target.value)}
                      placeholder=" "
                      maxLength={255}
                      rows={4}
                    />
                    <span className="cc-floatingLabel">Mensaje cuando está cerrado</span>
                  </label>
                </div>

                <div className="cfgFormActionsMobile">
                  <button
                    type="button"
                    className="mov-btn mov-btn--ghost"
                    onClick={handleVolver}
                    disabled={guardando}
                  >
                    <FontAwesomeIcon icon={faArrowLeft} />
                    Volver
                  </button>
                  <button type="submit" className="mov-btn mov-btn--primary" disabled={guardando}>
                    <FontAwesomeIcon icon={faSave} />
                    {guardando ? "Guardando..." : "Guardar"}
                  </button>
                </div>
              </form>

              <aside className="cfgFormSide">
                <div className="cfgFormPanel cfgFormPreview">
                  <div className="cfgFormPanelHead cfgFormPanelHead--compact">
                    <div>
                      <h2>Previsualización</h2>
                      <p>Resumen del estado actual.</p>
                    </div>
                  </div>

                  <div className="cfgFormPreviewList">
                    <div className="cfgFormPreviewRow">
                      <b>Desde</b>
                      <span>{formatoFechaLarga(inicioFecha, inicioHora, inicioMinuto)}</span>
                    </div>

                    <div className="cfgFormPreviewRow">
                      <b>Hasta</b>
                      <span>{formatoFechaLarga(finFecha, finHora, finMinuto)}</span>
                    </div>

                    <div className="cfgFormPreviewRow cfgFormPreviewRow--estado">
                      <b>Estado</b>
                      <em className={estaAbierta ? "is-open" : "is-closed"}>
                        {estaAbierta ? "ABIERTA" : "CERRADA"}
                      </em>
                    </div>
                  </div>
                </div>

                <div className="cfgFormTip">
                  <span className="cfgFormTipIcon">
                    <FontAwesomeIcon icon={faInfoCircle} />
                  </span>
                  <div>
                    <strong>Consejo</strong>
                    <p>
                      Usá rangos claros. El formulario queda abierto únicamente entre la fecha de inicio y la fecha de fin configuradas.
                    </p>
                  </div>
                </div>
              </aside>
            </>
          )}
        </div>
      </section>
    </div>
  );

  return dentroDeShell ? contenido : <Principal>{contenido}</Principal>;
}
