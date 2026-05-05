// src/components/ConfiguracionFormulario/ConfiguracionFormulario.jsx
import React from "react";
import { useNavigate } from "react-router-dom";
import {
  formatoFechaLarga,
  HORAS,
  MINUTOS,
  useConfiguracionFormulario,
} from "./hooks/useConfiguracionFormulario";
import "./ConfiguracionFormulario.css";

export default function ConfiguracionFormulario() {
  const navigate = useNavigate();

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
    estaAbierta,
    guardar,
  } = useConfiguracionFormulario();

  async function handleGuardar(e) {
    e.preventDefault();
    await guardar();
  }

  return (
    <section className="cfgFormPage">
      {toast && (
        <div className={`cfgFormToast cfgFormToast--${toast.tipo}`}>
          {toast.texto}
        </div>
      )}

      <div className="cfgFormShell">
        <header className="cfgFormHeader">
          <div>
            <h1>Configurar Formulario</h1>
            <p>Definí el período de inscripción y el mensaje de cierre.</p>
          </div>

          <span className={`cfgFormStatusPill ${estaAbierta ? "is-open" : "is-closed"}`}>
            <i aria-hidden="true" />
            {estaAbierta ? "Inscripción abierta" : "Inscripción cerrada"}
          </span>
        </header>

        <div className="cfgFormBody">
          <form className="cfgFormCard cfgFormCard--main" onSubmit={handleGuardar}>
            {cargando ? (
              <div className="cfgFormLoading">Cargando configuración...</div>
            ) : (
              <>
                <label className="cfgFormField cfgFormField--full">
                  <span>Título</span>
                  <input
                    type="text"
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    placeholder="Mesas Examen Abril 2026"
                    maxLength={80}
                  />
                </label>

                <div className="cfgFormGroupTitle">Inicio</div>
                <div className="cfgFormDateRow">
                  <input
                    className="cfgFormDate"
                    type="date"
                    value={inicioFecha}
                    onChange={(e) => setInicioFecha(e.target.value)}
                  />

                  <select value={inicioHora} onChange={(e) => setInicioHora(e.target.value)}>
                    {HORAS.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <strong>:</strong>
                  <select value={inicioMinuto} onChange={(e) => setInicioMinuto(e.target.value)}>
                    {MINUTOS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <span className="cfgFormHs">hs</span>
                </div>

                <div className="cfgFormGroupTitle">Fin</div>
                <div className="cfgFormDateRow">
                  <input
                    className="cfgFormDate"
                    type="date"
                    value={finFecha}
                    onChange={(e) => setFinFecha(e.target.value)}
                  />

                  <select value={finHora} onChange={(e) => setFinHora(e.target.value)}>
                    {HORAS.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <strong>:</strong>
                  <select value={finMinuto} onChange={(e) => setFinMinuto(e.target.value)}>
                    {MINUTOS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <span className="cfgFormHs">hs</span>
                </div>

                <label className="cfgFormField cfgFormField--full cfgFormField--message">
                  <span>Mensaje cuando está cerrado</span>
                  <input
                    type="text"
                    value={mensajeCerrado}
                    onChange={(e) => setMensajeCerrado(e.target.value)}
                    maxLength={255}
                  />
                </label>

                <div className="cfgFormActions">
                  <button
                    type="button"
                    className="cfgFormBtn cfgFormBtn--ghost"
                    onClick={() => navigate("/panel")}
                    disabled={guardando}
                  >
                    Volver
                  </button>
                  <button
                    type="submit"
                    className="cfgFormBtn cfgFormBtn--primary"
                    disabled={guardando}
                  >
                    {guardando ? "Guardando..." : "Guardar"}
                  </button>
                </div>
              </>
            )}
          </form>

          <aside className="cfgFormSide">
            <div className="cfgFormCard cfgFormPreview">
              <h2>Previsualización</h2>

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

            <div className="cfgFormTip">
              Consejo: usá rangos de fechas claros. El formulario queda abierto solo entre inicio y fin.
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
