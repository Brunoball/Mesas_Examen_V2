// src/components/Mesas_examen/modales/ModalCrearMesa.jsx
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarDays,
  faCheck,
  faClock,
  faLayerGroup,
  faSpinner,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";

import "../../Global/Global_css/Global_Modals.css";
import "./ModalCrearMesa.css";

const esFechaValida = (fecha) => /^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ""));

const normalizarTexto = (valor) => String(valor || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .trim();

const turnoCoincideModo = (turno, modo) => {
  const modoNormalizado = normalizarTexto(modo || "combinado");

  if (modoNormalizado === "combinado" || modoNormalizado === "ambos" || modoNormalizado === "todos") {
    return true;
  }

  const idTurno = Number(turno?.id_turno ?? turno?.id ?? 0);
  const nombreTurno = normalizarTexto(turno?.turno ?? turno?.nombre ?? turno?.descripcion ?? "");

  if (modoNormalizado === "manana" || modoNormalizado === "solo_manana") {
    return idTurno === 1 || nombreTurno.includes("manana") || nombreTurno.includes("matut");
  }

  if (modoNormalizado === "tarde" || modoNormalizado === "solo_tarde") {
    return idTurno === 2 || nombreTurno.includes("tarde") || nombreTurno.includes("vesp");
  }

  return true;
};

const filtrarTurnosPorModo = (turnos, modo) => (Array.isArray(turnos) ? turnos : [])
  .filter((turno) => turnoCoincideModo(turno, modo));

const textoModoTurnos = {
  manana: "Solo mañana",
  tarde: "Solo tarde",
  combinado: "Mañana y tarde",
};

const crearFechaLocal = (fecha) => {
  if (!esFechaValida(fecha)) return null;

  const [anio, mes, dia] = fecha.split("-").map(Number);
  return new Date(anio, mes - 1, dia);
};

const formatearFechaLocal = (date) => {
  const anio = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  const dia = String(date.getDate()).padStart(2, "0");

  return `${anio}-${mes}-${dia}`;
};

const esFinDeSemana = (fecha) => {
  const date = crearFechaLocal(fecha);
  if (!date) return false;

  const diaSemana = date.getDay();
  return diaSemana === 0 || diaSemana === 6;
};

const sumarDiasLocal = (fecha, dias) => {
  const date = crearFechaLocal(fecha);
  if (!date) return "";

  date.setDate(date.getDate() + dias);
  return formatearFechaLocal(date);
};

const ModalCrearMesa = ({
  abierto,
  parametros,
  cargando = false,
  onClose,
  onConfirm,
  onToast,
}) => {
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [tipoArmado, setTipoArmado] = useState("area");
  const [modoTurnos, setModoTurnos] = useState("combinado");
  const [, setError] = useState("");

  const mostrarError = (mensaje) => {
    setError(mensaje);
    onToast?.("error", mensaje, 4200);
  };

  useEffect(() => {
    if (abierto && parametros) {
      const inicioActual = formatearFechaLocal(new Date());
      const finTresDiasDespues = sumarDiasLocal(inicioActual, 3);

      setFechaInicio(inicioActual);
      setFechaFin(finTresDiasDespues || inicioActual);
      setTipoArmado("area");
      setModoTurnos("combinado");
      setError("");
    }
  }, [abierto, parametros]);

  if (!abierto) {
    return null;
  }

  const portalTarget = typeof document !== "undefined" ? document.body : null;
  if (!portalTarget) return null;

  const totalPrevias = parametros?.total_previas_para_armar || 0;
  const turnos = parametros?.turnos || [];
  const turnosFiltrados = filtrarTurnosPorModo(turnos, modoTurnos);

  const abrirCalendario = (e) => {
    const input = e.currentTarget;

    if (!input || input.disabled || typeof input.showPicker !== "function") {
      return;
    }

    try {
      input.showPicker();
    } catch (_) {
      // Algunos navegadores solo permiten abrir el calendario desde una acción directa del usuario.
    }
  };

  const handleFechaInicioChange = (e) => {
    const nuevaFecha = e.target.value;

    if (esFinDeSemana(nuevaFecha)) {
      mostrarError("No se puede elegir sábado ni domingo como fecha de inicio. Seleccioná un día hábil.");
      return;
    }

    setFechaInicio(nuevaFecha);

    if (fechaFin && nuevaFecha && fechaFin < nuevaFecha) {
      setFechaFin(nuevaFecha);
    }

    setError("");
  };

  const handleFechaFinChange = (e) => {
    const nuevaFecha = e.target.value;

    if (esFinDeSemana(nuevaFecha)) {
      mostrarError("No se puede elegir sábado ni domingo como fecha de finalización. Seleccioná un día hábil.");
      return;
    }

    setFechaFin(nuevaFecha);
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!fechaInicio) {
      mostrarError("Seleccioná una fecha de inicio.");
      return;
    }

    if (!fechaFin) {
      mostrarError("Seleccioná una fecha de finalización.");
      return;
    }

    if (esFinDeSemana(fechaInicio)) {
      mostrarError("La fecha de inicio no puede ser sábado ni domingo.");
      return;
    }

    if (esFinDeSemana(fechaFin)) {
      mostrarError("La fecha de finalización no puede ser sábado ni domingo.");
      return;
    }

    if (fechaFin < fechaInicio) {
      mostrarError("La fecha de finalización no puede ser menor que la fecha de inicio.");
      return;
    }

    if (turnosFiltrados.length === 0) {
      mostrarError("No hay turnos activos para la opción seleccionada. Elegí otra opción de turnos.");
      return;
    }

    setError("");

    await onConfirm({
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      limpiar_borrador: true,
      excluir_fines_semana: true,
      tipo_armado: tipoArmado,
      modo_turnos: modoTurnos,
    });
  };

  return createPortal((
    <div className="mesas-modal-overlay">
      <div className="mesas-modal">
        <div className="mesas-modal-header">
          <div className="mesas-modal-head-icon" aria-hidden="true">
            <FontAwesomeIcon icon={faCalendarDays} />
          </div>

          <div className="mesas-modal-head-text">
            <h3>Crear mesas de examen</h3>
            <p>Cruza previas con cátedras/docentes, genera los números y asigna fecha/turno.</p>
          </div>

          <button
            type="button"
            className="mesas-modal-close"
            onClick={onClose}
            disabled={cargando}
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mesas-modal-form">
          <div className="mesas-modal-body">
          <div className="mesas-modal-indicator">
            <span className="mesas-modal-indicator__icon" aria-hidden="true">
              <FontAwesomeIcon icon={faCalendarDays} />
            </span>
            <span>
              El armado usa únicamente días hábiles. Si el rango incluye sábado o domingo,
              el sistema los descarta automáticamente y continúa con el siguiente día hábil.
            </span>
          </div>

          <div className="mesas-modal-grid">
            <label className="mesas-field">
              <span>
                <FontAwesomeIcon icon={faCalendarDays} />
                Fecha de inicio
              </span>
              <input
                type="date"
                value={fechaInicio}
                onChange={handleFechaInicioChange}
                onClick={abrirCalendario}
                disabled={cargando}
              />
            </label>

            <label className="mesas-field">
              <span>
                <FontAwesomeIcon icon={faCalendarDays} />
                Fecha de finalización
              </span>
              <input
                type="date"
                value={fechaFin}
                min={fechaInicio || undefined}
                onChange={handleFechaFinChange}
                onClick={abrirCalendario}
                disabled={cargando}
              />
            </label>
          </div>

          <div className="mesas-modal-info">
            <div className="mesas-modal-info-card mesas-modal-info-card--blue">
              <span className="mesas-modal-info-card__icon" aria-hidden="true">
                <FontAwesomeIcon icon={faLayerGroup} />
              </span>
              <div className="mesas-modal-info-card__body">
                <span>Previas</span>
                <strong>{totalPrevias}</strong>
                <small>inscriptas para armar</small>
              </div>
            </div>

            <div className="mesas-modal-info-card mesas-modal-info-card--green">
              <span className="mesas-modal-info-card__icon" aria-hidden="true">
                <FontAwesomeIcon icon={faClock} />
              </span>
              <div className="mesas-modal-info-card__body">
                <span>Turnos</span>
                <strong>{turnosFiltrados.length}</strong>
                <small>{textoModoTurnos[modoTurnos] || "seleccionados"}</small>
              </div>
            </div>
          </div>

          {turnos.length > 0 && (
            <div className="mesas-turnos-preview">
              <span className="mesas-turnos-title">
                <FontAwesomeIcon icon={faClock} />
                Turnos que usará el armado:
              </span>

              <div className="mesas-turnos-list">
                {turnosFiltrados.length > 0 ? turnosFiltrados.map((turno) => (
                  <span key={turno.id_turno} className="mesas-turno-pill">
                    {turno.turno}
                  </span>
                )) : (
                  <span className="mesas-turno-pill mesas-turno-pill--empty">
                    No hay turnos activos para esta opción
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="mesas-tipo-armado-box mesas-modo-turnos-box">
            <span className="mesas-tipo-armado-title">
              Turnos para armar
            </span>

            <div className="mesas-tipo-armado-grid mesas-modo-turnos-grid">
              <label className={`mesas-tipo-armado-card mesas-modo-turnos-card ${modoTurnos === "manana" ? "activo" : ""}`}>
                <input
                  type="radio"
                  name="modo_turnos"
                  checked={modoTurnos === "manana"}
                  onChange={() => setModoTurnos("manana")}
                  disabled={cargando}
                />
                <span className="mesas-check-visual" aria-hidden="true">
                  <FontAwesomeIcon icon={faCheck} />
                </span>
                <div>
                  <strong>Solo mañana</strong>
                  <span>Usa únicamente los slots de turno mañana dentro del rango elegido.</span>
                </div>
              </label>

              <label className={`mesas-tipo-armado-card mesas-modo-turnos-card ${modoTurnos === "tarde" ? "activo" : ""}`}>
                <input
                  type="radio"
                  name="modo_turnos"
                  checked={modoTurnos === "tarde"}
                  onChange={() => setModoTurnos("tarde")}
                  disabled={cargando}
                />
                <span className="mesas-check-visual" aria-hidden="true">
                  <FontAwesomeIcon icon={faCheck} />
                </span>
                <div>
                  <strong>Solo tarde</strong>
                  <span>Usa únicamente los slots de turno tarde dentro del rango elegido.</span>
                </div>
              </label>

              <label className={`mesas-tipo-armado-card mesas-modo-turnos-card ${modoTurnos === "combinado" ? "activo" : ""}`}>
                <input
                  type="radio"
                  name="modo_turnos"
                  checked={modoTurnos === "combinado"}
                  onChange={() => setModoTurnos("combinado")}
                  disabled={cargando}
                />
                <span className="mesas-check-visual" aria-hidden="true">
                  <FontAwesomeIcon icon={faCheck} />
                </span>
                <div>
                  <strong>Combinado</strong>
                  <span>Distribuye entre mañana y tarde para aprovechar mejor todos los días.</span>
                </div>
              </label>
            </div>
          </div>

          <div className="mesas-tipo-armado-box">
            <span className="mesas-tipo-armado-title">
              Criterio de armado
            </span>

            <div className="mesas-tipo-armado-grid">
              <label className={`mesas-tipo-armado-card ${tipoArmado === "area" ? "activo" : ""}`}>
                <input
                  type="checkbox"
                  checked={tipoArmado === "area"}
                  onChange={() => setTipoArmado("area")}
                  disabled={cargando}
                />
                <span className="mesas-check-visual" aria-hidden="true">
                  <FontAwesomeIcon icon={faCheck} />
                </span>
                <div>
                  <strong>Armado por área</strong>
                  <span>Reparte entre los slots disponibles, respetando área, docentes, alumnos y correlativas.</span>
                </div>
              </label>

              <label className={`mesas-tipo-armado-card ${tipoArmado === "docentes" ? "activo" : ""}`}>
                <input
                  type="checkbox"
                  checked={tipoArmado === "docentes"}
                  onChange={() => setTipoArmado("docentes")}
                  disabled={cargando}
                />
                <span className="mesas-check-visual" aria-hidden="true">
                  <FontAwesomeIcon icon={faCheck} />
                </span>
                <div>
                  <strong>Armado por disponibilidad docente</strong>
                  <span>Prioriza días/turnos disponibles del docente y usa el área como criterio secundario.</span>
                </div>
              </label>
            </div>
          </div>


          </div>

          <div className="mesas-modal-actions">
            <button
              type="button"
              className="btn-modal-cancel"
              onClick={onClose}
              disabled={cargando}
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="btn-modal-confirm"
              disabled={cargando || totalPrevias === 0 || turnosFiltrados.length === 0}
            >
              {cargando ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} spin />
                  Armando...
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faCheck} />
                  Crear y calendarizar
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  ), portalTarget);
};

export default ModalCrearMesa;
