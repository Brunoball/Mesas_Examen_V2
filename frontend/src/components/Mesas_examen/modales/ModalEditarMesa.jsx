// src/components/Mesas_examen/modales/ModalEditarMesa.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronLeft,
  faChevronRight,
  faExchangeAlt,
  faSave,
  faEdit,
  faPlus,
  faSpinner,
  faTrash,
  faUser,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";

import "../../Global/Global_css/Global_Modals.css";
import "./ModalEditarMesa.css";
import ModalPreviasMesa from "./persona/ModalPreviasMesa";
import ModalMoverPreviaMesa from "./persona/ModalMoverPreviaMesa";
import ModalEliminarGlobal from "../../Global/Modales/ModalEliminarGlobal";
import ModalAgregarPreviaMesa from "./mas/ModalAgregarPreviaMesa";
import ModalMoverNumeroMesa from "./flechas/ModalMoverNumeroMesa";
import ModalAgregarNumeroGrupo from "./agregar_numero/ModalAgregarNumeroGrupo";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const texto = (valor, fallback = "-") => {
  const salida = String(valor ?? "").trim();
  return salida || fallback;
};


const isTopMesaModal = (node) => {
  if (typeof document === "undefined" || !node) return true;
  const modales = Array.from(document.querySelectorAll("[data-mesa-modal-root='true'], .gdel-overlay, [data-global-info-modal-root='true']"));
  return modales[modales.length - 1] === node;
};

const useEscapeClose = (abierto, onClose, disabled = false) => {
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== "Escape" || disabled) return;
      if (!isTopMesaModal(overlayRef.current)) return;

      event.preventDefault();
      event.stopPropagation();
      onClose?.();
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [abierto, onClose, disabled]);

  return overlayRef;
};

const normalizarFechaInput = (valor) => {
  const textoFecha = String(valor || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(textoFecha)) return textoFecha.slice(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(textoFecha)) {
    const [d, m, y] = textoFecha.split("/");
    return `${y}-${m}-${d}`;
  }
  return "";
};

const obtenerRangoHorarioPorTurno = (turno = "") => {
  const turnoLower = String(turno || "").toLowerCase();
  if (turnoLower.includes("tarde")) {
    return { min: "13:15", max: "18:20", default: "13:15", texto: "13:15 a 18:20" };
  }
  return { min: "07:30", max: "12:30", default: "07:30", texto: "07:30 a 12:30" };
};

const horaAMinutos = (hora) => {
  const match = String(hora || "").match(/^(\d{2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

const ajustarHoraARango = (hora, turno = "") => {
  const rango = obtenerRangoHorarioPorTurno(turno);
  const base = /^\d{2}:\d{2}/.test(String(hora || "")) ? String(hora).slice(0, 5) : rango.default;
  const valor = horaAMinutos(base);
  const min = horaAMinutos(rango.min);
  const max = horaAMinutos(rango.max);

  if (valor === null) return rango.default;
  if (valor < min) return rango.min;
  if (valor > max) return rango.max;
  return base;
};

const formatearHoraInput = (valor, turno = "") => {
  const hora = String(valor || "").trim();
  return ajustarHoraARango(/^\d{2}:\d{2}/.test(hora) ? hora.slice(0, 5) : "", turno);
};

const crearFechaLocal = (yyyyMmDd) => {
  const fecha = normalizarFechaInput(yyyyMmDd);
  if (!fecha) return new Date();
  const [anio, mes, dia] = fecha.split("-").map(Number);
  return new Date(anio, mes - 1, dia);
};

const toYmd = (fecha) => {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
};

const claveSlot = (fecha, idTurno) => `${normalizarFechaInput(fecha)}|${String(idTurno || "")}`;

const obtenerMesPayload = (fecha) => ({
  anio: fecha.getFullYear(),
  mes: fecha.getMonth() + 1,
});

const esFinDeSemana = (fecha) => {
  const dia = fecha.getDay();
  return dia === 0 || dia === 6;
};

const construirDiasCalendario = (mesVisible) => {
  const anio = mesVisible.getFullYear();
  const mes = mesVisible.getMonth();
  const primero = new Date(anio, mes, 1);
  const ultimo = new Date(anio, mes + 1, 0);
  const primerDiaSemana = (primero.getDay() + 6) % 7;
  const dias = [];

  for (let i = primerDiaSemana; i > 0; i -= 1) {
    const fecha = new Date(anio, mes, 1 - i);
    dias.push({ fecha, fueraMes: true });
  }

  for (let dia = 1; dia <= ultimo.getDate(); dia += 1) {
    dias.push({ fecha: new Date(anio, mes, dia), fueraMes: false });
  }

  while (dias.length < 42) {
    const fecha = new Date(anio, mes, dias.length - primerDiaSemana + 1);
    dias.push({ fecha, fueraMes: true });
  }

  return dias;
};

const obtenerTituloMesa = (grupo, tipo) => {
  const primerNumero = grupo?.numeros?.[0]?.numero_mesa || grupo?.numero_mesa || grupo?.numeros_mesa_texto;

  if (tipo === "no_agrupada") {
    return `Editar Mesa N° ${texto(primerNumero)} — Mesa no agrupada`;
  }

  return `Editar Mesa N° ${texto(primerNumero)} — Grupo ${texto(grupo?.id_grupo || grupo?.numero_grupo)}`;
};

const obtenerSubtitulo = (grupo) => {
  const area = texto(grupo?.area, "Sin área");
  const materia = texto(grupo?.materia, "Sin materia");
  return area === "Sin área" ? materia : `${area}: ${materia}`;
};

const esNumeroTaller = (numero) => {
  const tipo = String(numero?.tipo_mesa || numero?.tipo_numero || numero?.tipo || "").toLowerCase();
  return tipo.includes("taller") || Number(numero?.prioridad || numero?.prioridad_numero || 0) === 1;
};

const esGrupoTaller = (grupo, numeros = []) => {
  const tiposTexto = String(grupo?.tipos_mesa_texto || grupo?.tipo_mesa || "").toLowerCase();
  return tiposTexto.includes("taller") || numeros.some(esNumeroTaller) || !!grupo?.es_grupo_taller;
};

const calcularCapacidadSlots = (grupo, numeros = []) => {
  const cantidad = numeros.length;
  const capacidadBackend = Number(grupo?.capacidad_slots || 0);
  if (capacidadBackend > 0) {
    return Math.max(cantidad, capacidadBackend);
  }

  const extra = Math.max(0, Number(grupo?.slots_extra || 0));
  const base = esGrupoTaller(grupo, numeros) ? 1 : 4;
  return Math.max(cantidad, base + extra);
};

const calcularBaseSlots = (grupo, numeros = []) => {
  const baseBackend = Number(grupo?.capacidad_base_slots || 0);
  if (baseBackend > 0) return baseBackend;
  return esGrupoTaller(grupo, numeros) ? 1 : 4;
};

const calcularSlotsExtraLibres = (grupo, numeros = []) => {
  const slotsExtra = Math.max(0, Number(grupo?.slots_extra || 0));
  if (slotsExtra <= 0) return 0;

  const base = calcularBaseSlots(grupo, numeros);
  const extrasUsados = Math.max(0, numeros.length - base);
  return Math.max(0, slotsExtra - extrasUsados);
};

const CalendarMesa = ({ fechaSeleccionada, idTurno, slotsDisponibles = [], cargandoSlots = false, onChange, onMesChange }) => {
  const fechaBase = useMemo(() => crearFechaLocal(fechaSeleccionada), [fechaSeleccionada]);
  const [mesVisible, setMesVisible] = useState(() => new Date(fechaBase.getFullYear(), fechaBase.getMonth(), 1));

  useEffect(() => {
    setMesVisible(new Date(fechaBase.getFullYear(), fechaBase.getMonth(), 1));
  }, [fechaBase]);

  const dias = useMemo(() => construirDiasCalendario(mesVisible), [mesVisible]);
  const ymdSeleccionado = normalizarFechaInput(fechaSeleccionada);

  const slotsPorFecha = useMemo(() => {
    const mapa = new Map();
    (Array.isArray(slotsDisponibles) ? slotsDisponibles : []).forEach((slot) => {
      if (String(slot?.id_turno) === String(idTurno)) {
        mapa.set(claveSlot(slot.fecha_mesa, slot.id_turno), slot);
      }
    });
    return mapa;
  }, [slotsDisponibles, idTurno]);

  useEffect(() => {
    if (typeof onMesChange === "function") {
      onMesChange(obtenerMesPayload(mesVisible));
    }
  }, [mesVisible, onMesChange]);

  const cambiarMes = (delta) => {
    setMesVisible((actual) => new Date(actual.getFullYear(), actual.getMonth() + delta, 1));
  };

  return (
    <div className="editar-mesa-calendar-card">
      <div className="editar-mesa-calendar-head">
        <button type="button" onClick={() => cambiarMes(-1)} aria-label="Mes anterior">
          <FontAwesomeIcon icon={faChevronLeft} />
        </button>
        <strong>{MESES[mesVisible.getMonth()]} De {mesVisible.getFullYear()}</strong>
        <button type="button" onClick={() => cambiarMes(1)} aria-label="Mes siguiente">
          <FontAwesomeIcon icon={faChevronRight} />
        </button>
      </div>

      <div className="editar-mesa-calendar-weekdays">
        {DIAS.map((dia) => <span key={dia}>{dia}</span>)}
      </div>

      <div className="editar-mesa-calendar-grid">
        {dias.map(({ fecha, fueraMes }) => {
          const ymd = toYmd(fecha);
          const weekend = esFinDeSemana(fecha);
          const activo = ymd === ymdSeleccionado;
          const slot = slotsPorFecha.get(claveSlot(ymd, idTurno));
          const disponible = !!slot?.valido;
          const bloqueado = weekend || cargandoSlots || !disponible;
          const motivo = weekend
            ? "Sábados y domingos no disponibles"
            : cargandoSlots
              ? "Validando disponibilidad..."
              : disponible
                ? "Fecha y turno disponible"
                : (slot?.errores || ["Fecha/turno no disponible para esta mesa"]).join(" | ");

          return (
            <button
              key={ymd}
              type="button"
              className={`editar-mesa-day ${fueraMes ? "muted" : ""} ${activo ? "active" : ""} ${weekend ? "weekend" : ""} ${disponible ? "available" : "blocked"}`}
              onClick={() => !bloqueado && onChange(ymd)}
              disabled={bloqueado}
              title={motivo}
            >
              {fecha.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const SlotNumero = ({ numero, onVerPrevias, onAgregarPrevia, onMoverNumero, onEliminarNumero }) => (
  <article className="editar-mesa-slot-card">
    <div className="editar-mesa-slot-actions">
      <span className="editar-mesa-numero-chip">N° {texto(numero?.numero_mesa)}</span>
      <button type="button" title="Ver previas / alumnos" onClick={() => onVerPrevias && onVerPrevias(numero)}>
        <FontAwesomeIcon icon={faUser} />
      </button>
      <button type="button" title="Agregar previa / alumno" onClick={() => onAgregarPrevia && onAgregarPrevia(numero)}>
        <FontAwesomeIcon icon={faPlus} />
      </button>
      <button type="button" title="Mover número a otro grupo" onClick={() => onMoverNumero && onMoverNumero(numero)}>
        <FontAwesomeIcon icon={faExchangeAlt} />
      </button>
      <button type="button" title="Quitar número del grupo" onClick={() => onEliminarNumero && onEliminarNumero(numero)}>
        <FontAwesomeIcon icon={faTrash} />
      </button>
    </div>

    <h3>{texto(numero?.materia, "Sin materia")}</h3>
    <p>Docentes: {texto(numero?.docente, "Sin docente")}</p>
  </article>
);

const SlotVacio = ({ onClick, esExtraLibre = false, eliminando = false, onEliminarSlot }) => (
  <div className={`editar-mesa-slot-empty ${esExtraLibre ? "editar-mesa-slot-empty-extra" : ""}`}>
    <button type="button" className="editar-mesa-slot-empty-main" onClick={onClick}>
      <FontAwesomeIcon icon={faPlus} />
      <span>Agregar número</span>
    </button>

    {esExtraLibre && typeof onEliminarSlot === "function" && (
      <button
        type="button"
        className="editar-mesa-slot-empty-remove"
        onClick={onEliminarSlot}
        disabled={eliminando}
        title="Eliminar este slot libre agregado"
      >
        <FontAwesomeIcon icon={eliminando ? faSpinner : faTrash} spin={eliminando} />
        Quitar slot
      </button>
    )}
  </div>
);

const ModalEditarMesa = ({ abierto, grupo, tipo, turnos = [], cargando, guardando, slotsDisponibles, cargandoSlots = false, onClose, onSave, onCrearGrupoUnico, onDelete, onLoadSlots, persona = {}, mas = {}, flechas = {}, eliminar = {}, agregarNumero = {} }) => {
  const [fechaMesa, setFechaMesa] = useState("");
  const [idTurno, setIdTurno] = useState("");
  const [hora, setHora] = useState("07:30");
  const horaInputRef = useRef(null);
  const overlayRef = useEscapeClose(abierto, onClose, guardando);
  const esNoAgrupada = tipo === "no_agrupada";

  const numeros = useMemo(() => {
    const base = Array.isArray(grupo?.numeros) ? grupo.numeros : [];
    return base;
  }, [grupo]);

  const grupoTieneTaller = useMemo(() => esGrupoTaller(grupo, numeros), [grupo, numeros]);
  const capacidadSlots = useMemo(() => calcularCapacidadSlots(grupo, numeros), [grupo, numeros]);
  const slotsExtraLibres = useMemo(() => calcularSlotsExtraLibres(grupo, numeros), [grupo, numeros]);
  const slotsLibres = Math.max(0, capacidadSlots - numeros.length);

  const slotsValidos = useMemo(() => {
    const lista = Array.isArray(slotsDisponibles?.slots) ? slotsDisponibles.slots : [];
    return lista.filter((slot) => slot?.valido);
  }, [slotsDisponibles]);

  const turnosConSlotsValidos = useMemo(() => {
    const mapa = new Map();
    slotsValidos.forEach((slot) => {
      const id = String(slot?.id_turno || "");
      if (!id) return;
      mapa.set(id, (mapa.get(id) || 0) + 1);
    });
    return mapa;
  }, [slotsValidos]);

  const turnoSeleccionado = useMemo(
    () => turnos.find((item) => String(item.id_turno) === String(idTurno))?.turno || grupo?.turno || "",
    [turnos, idTurno, grupo]
  );

  const rangoHorario = useMemo(() => obtenerRangoHorarioPorTurno(turnoSeleccionado), [turnoSeleccionado]);

  const slotSeleccionadoValido = useMemo(() => {
    if (!fechaMesa || !idTurno) return false;
    return slotsValidos.some((slot) => normalizarFechaInput(slot.fecha_mesa) === fechaMesa && String(slot.id_turno) === String(idTurno));
  }, [slotsValidos, fechaMesa, idTurno]);

  const cargarSlotsMes = useCallback(({ anio, mes }) => {
    if (!grupo || typeof onLoadSlots !== "function") return;
    onLoadSlots({ item: grupo, tipo, anio, mes });
  }, [grupo, tipo, onLoadSlots]);

  useEffect(() => {
    if (!abierto || !grupo) return;

    const fecha = normalizarFechaInput(grupo.fecha_mesa || grupo.fecha);
    const turnoInicial = grupo.id_turno ? String(grupo.id_turno) : String(turnos?.[0]?.id_turno || "");
    const turnoNombre = turnos.find((item) => String(item.id_turno) === String(turnoInicial))?.turno || grupo.turno || "";

    setFechaMesa(fecha || toYmd(new Date()));
    setIdTurno(turnoInicial);
    setHora(formatearHoraInput(grupo.hora, turnoNombre));
  }, [abierto, grupo, turnos]);

  useEffect(() => {
    setHora((actual) => ajustarHoraARango(actual, turnoSeleccionado));
  }, [turnoSeleccionado]);

  useEffect(() => {
    if (!abierto || cargandoSlots || !slotsDisponibles || slotsValidos.length === 0) return;

    const actualEsValido = slotsValidos.some(
      (slot) => normalizarFechaInput(slot.fecha_mesa) === fechaMesa && String(slot.id_turno) === String(idTurno)
    );

    if (actualEsValido) return;

    const primeroMismoTurno = slotsValidos.find((slot) => String(slot.id_turno) === String(idTurno));
    const primero = primeroMismoTurno || slotsValidos[0];

    if (primero) {
      setFechaMesa(normalizarFechaInput(primero.fecha_mesa));
      setIdTurno(String(primero.id_turno));
      setHora(formatearHoraInput(primero.hora_sugerida, primero.turno));
    }
  }, [abierto, cargandoSlots, slotsDisponibles, slotsValidos, fechaMesa, idTurno]);

  if (!abierto) return null;

  const portalTarget = typeof document !== "undefined" ? document.body : null;
  if (!portalTarget) return null;

  const slots = [...numeros];
  while (slots.length < capacidadSlots) slots.push(null);

  const handleSave = () => {
    if (!grupo || !slotSeleccionadoValido) return;

    const horaAjustada = ajustarHoraARango(hora, turnoSeleccionado);
    setHora(horaAjustada);

    onSave({
      tipo,
      numero_grupo: grupo.numero_grupo || grupo.id_grupo || null,
      id_grupo: grupo.id_grupo || grupo.numero_grupo || null,
      id_no_agrupada: grupo.id_no_agrupada || null,
      numero_mesa: tipo === "no_agrupada" ? numeros?.[0]?.numero_mesa : null,
      fecha_mesa: fechaMesa,
      id_turno: Number(idTurno),
      hora: horaAjustada,
    });
  };

  const handleCrearGrupoUnico = () => {
    if (!grupo || !slotSeleccionadoValido || typeof onCrearGrupoUnico !== "function") return;

    const horaAjustada = ajustarHoraARango(hora, turnoSeleccionado);
    setHora(horaAjustada);

    onCrearGrupoUnico({
      id_no_agrupada: grupo.id_no_agrupada || null,
      numero_mesa: numeros?.[0]?.numero_mesa || grupo.numero_mesa || null,
      fecha_mesa: fechaMesa,
      id_turno: Number(idTurno),
      hora: horaAjustada,
    });
  };

  const handleDelete = () => {
    if (!grupo) return;

    onDelete({
      tipo,
      numero_grupo: grupo.numero_grupo || grupo.id_grupo || null,
      id_grupo: grupo.id_grupo || grupo.numero_grupo || null,
      id_no_agrupada: grupo.id_no_agrupada || null,
      numero_mesa: tipo === "no_agrupada" ? numeros?.[0]?.numero_mesa : null,
    });
  };

  const handleHabilitarSlotExtra = () => {
    if (!grupo || typeof agregarNumero.habilitarSlotExtra !== "function") return;
    agregarNumero.habilitarSlotExtra(grupo);
  };

  const handleEliminarSlotExtra = () => {
    if (!grupo || typeof agregarNumero.eliminarSlotExtra !== "function") return;
    agregarNumero.eliminarSlotExtra(grupo);
  };

  const abrirSelectorHora = () => {
    const input = horaInputRef.current;
    if (!input) return;

    input.focus({ preventScroll: true });

    if (typeof input.showPicker === "function") {
      try {
        input.showPicker();
      } catch (_) {
        // Algunos navegadores solo permiten showPicker con una acción directa del usuario.
      }
    }
  };

  const handleHoraChange = (event) => {
    setHora(ajustarHoraARango(event.target.value, turnoSeleccionado));
  };

  const handleHoraBlur = (event) => {
    setHora(ajustarHoraARango(event.target.value, turnoSeleccionado));
  };

  return createPortal((
    <div ref={overlayRef} className="editar-mesa-overlay" role="dialog" aria-modal="true" data-mesa-modal-root="true">
      <div className="editar-mesa-panel">
        <header className="editar-mesa-header">
          <div className="editar-mesa-title">
            <FontAwesomeIcon icon={faEdit} />
            <div>
              <h2>{obtenerTituloMesa(grupo, tipo)}</h2>
              <p>{obtenerSubtitulo(grupo)}</p>
            </div>
          </div>

          <button type="button" className="editar-mesa-close" onClick={onClose} disabled={guardando} aria-label="Cerrar" title="Cerrar">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </header>

        <section className="editar-mesa-body">
          {cargando ? (
            <div className="editar-mesa-loading">
              <FontAwesomeIcon icon={faSpinner} spin /> Cargando mesa para edición...
            </div>
          ) : (
            <>
              <div className="editar-mesa-programacion">
                <h3>Programación</h3>
                <div className="editar-mesa-section-line" />

                <div className="editar-mesa-fields">
                  <label>
                    <span>Turno</span>
                    <select value={idTurno} onChange={(e) => setIdTurno(e.target.value)}>
                      {turnos.map((turno) => {
                        const id = String(turno.id_turno);
                        const haySlotsCargados = !!slotsDisponibles && !cargandoSlots;
                        const sinFechasValidas = haySlotsCargados && slotsValidos.length > 0 && !turnosConSlotsValidos.has(id);

                        return (
                          <option key={turno.id_turno} value={turno.id_turno} disabled={sinFechasValidas}>
                            {turno.turno}{sinFechasValidas ? " — sin fechas" : ""}
                          </option>
                        );
                      })}
                    </select>
                  </label>

                  <label>
                    <span>Horario</span>
                    <div className="editar-mesa-time-input" onClick={abrirSelectorHora} title={`Permitido: ${rangoHorario.texto}`}>
                      <input
                        ref={horaInputRef}
                        type="time"
                        value={hora}
                        min={rangoHorario.min}
                        max={rangoHorario.max}
                        step="60"
                        onChange={handleHoraChange}
                        onBlur={handleHoraBlur}
                      />
                    </div>
                    <small className="editar-mesa-help">Permitido: {rangoHorario.texto}</small>
                  </label>
                </div>

                <CalendarMesa
                  fechaSeleccionada={fechaMesa}
                  idTurno={idTurno}
                  slotsDisponibles={slotsDisponibles?.slots || []}
                  cargandoSlots={cargandoSlots}
                  onChange={setFechaMesa}
                  onMesChange={cargarSlotsMes}
                />

                {cargandoSlots && (
                  <div className="editar-mesa-disponibilidad-info">
                    <FontAwesomeIcon icon={faSpinner} spin /> Analizando docentes, alumnos y correlativas...
                  </div>
                )}

                {!cargandoSlots && slotsDisponibles && slotsValidos.length === 0 && (
                  <div className="editar-mesa-disponibilidad-error">
                    No hay fechas/turnos válidos en este mes para esta mesa.
                  </div>
                )}

                {!cargandoSlots && fechaMesa && idTurno && !slotSeleccionadoValido && slotsValidos.length > 0 && (
                  <div className="editar-mesa-disponibilidad-error">
                    Esa fecha y turno no está disponible para esta mesa.
                  </div>
                )}
              </div>

              <div className="editar-mesa-slots-wrap">
                {esNoAgrupada ? (
                  <div className="editar-mesa-slots-card editar-mesa-no-agrupada-card">
                    <h3>Mesa no agrupada (individual)</h3>
                    <div className="editar-mesa-section-line" />

                    <p className="editar-mesa-no-agrupada-texto">
                      Esta mesa todavía no forma parte de mesas <strong>agrupadas</strong>. Podés mantenerla así
                      o crear un grupo nuevo donde será una <strong>mesa única</strong> (un solo número en el grupo).
                    </p>

                    {numeros[0] && (
                      <article className="editar-mesa-no-agrupada-numero">
                        <div>
                          <span className="editar-mesa-numero-chip">N° {texto(numeros[0]?.numero_mesa)}</span>
                          <strong>{texto(numeros[0]?.materia || grupo?.materia, "Sin materia")}</strong>
                        </div>
                        <p>Docentes: {texto(numeros[0]?.docente || grupo?.docente, "Sin docente")}</p>
                      </article>
                    )}

                    <button
                      type="button"
                      className="editar-mesa-btn-crear-grupo-unico"
                      onClick={handleCrearGrupoUnico}
                      disabled={guardando || cargandoSlots || !fechaMesa || !idTurno || !slotSeleccionadoValido}
                    >
                      <FontAwesomeIcon icon={guardando ? faSpinner : faPlus} spin={guardando} />
                      Mover a mesa única en mesas agrupadas
                    </button>

                    <div className="editar-mesa-no-agrupada-nota">
                      El sistema valida antes de crear: disponibilidad docente, bloqueos, choque de alumnos,
                      choque docente y correlativas.
                    </div>
                  </div>
                ) : (
                  <div className="editar-mesa-slots-card">
                    <div className="editar-mesa-slots-head">
                      <div>
                        <h3>Slots del grupo ({numeros.length}/{capacidadSlots})</h3>
                        <small>{grupoTieneTaller ? "Mesa especial/taller: arranca solo con su slot real." : "Capacidad base: 4 números de mesa."}</small>
                      </div>

                      <button
                        type="button"
                        className="editar-mesa-btn-slot-extra"
                        onClick={handleHabilitarSlotExtra}
                        disabled={guardando || agregarNumero.habilitandoSlotExtra || typeof agregarNumero.habilitarSlotExtra !== "function"}
                        title="Habilitar un nuevo slot para poder agregar otro número a esta mesa"
                      >
                        <FontAwesomeIcon icon={agregarNumero.habilitandoSlotExtra ? faSpinner : faPlus} spin={agregarNumero.habilitandoSlotExtra} />
                        Agregar slot
                      </button>
                    </div>
                    <div className="editar-mesa-section-line" />

                    {slotsLibres <= 0 && (
                      <div className="editar-mesa-slot-note">
                        No hay slots libres. Presioná <strong>Agregar slot</strong> para habilitar uno nuevo.
                      </div>
                    )}

                    <div className="editar-mesa-slots-grid">
                      {slots.map((slot, index) => (
                        slot ? (
                          <SlotNumero
                            key={slot.numero_mesa || index}
                            numero={slot}
                            onVerPrevias={persona.abrirPreviasNumero}
                            onAgregarPrevia={mas.abrirAgregarNumero}
                            onMoverNumero={flechas.abrirMoverNumero}
                            onEliminarNumero={eliminar.abrirEliminarNumeroGrupo}
                          />
                        ) : (
                          <SlotVacio
                            key={`vacio-${index}`}
                            esExtraLibre={slotsExtraLibres > 0 && index >= capacidadSlots - slotsExtraLibres}
                            eliminando={!!agregarNumero.eliminandoSlotExtra}
                            onEliminarSlot={handleEliminarSlotExtra}
                            onClick={() => agregarNumero.abrirAgregarNumeroGrupo && agregarNumero.abrirAgregarNumeroGrupo(grupo)}
                          />
                        )
                      ))}
                    </div>
                  </div>
                )}

              </div>
            </>
          )}
        </section>

        {!cargando && (
          <footer className="editar-mesa-footer">
            <button type="button" className="editar-mesa-btn eliminar" onClick={handleDelete} disabled={guardando}>
              <FontAwesomeIcon icon={guardando ? faSpinner : faTrash} spin={guardando} />
              Eliminar
            </button>

            <button type="button" className="editar-mesa-btn guardar" onClick={handleSave} disabled={guardando || cargandoSlots || !fechaMesa || !idTurno || !slotSeleccionadoValido}>
              <FontAwesomeIcon icon={guardando ? faSpinner : faSave} spin={guardando} />
              Guardar Cambios
            </button>
          </footer>
        )}
      </div>

      <ModalPreviasMesa
        abierto={persona.modalPreviasAbierto}
        numero={persona.numeroPersona}
        data={persona.previasPersona}
        cargando={persona.cargandoPrevias}
        error={persona.errorPersona}
        onClose={persona.cerrarPrevias}
        onMover={persona.abrirMover}
        onEliminar={persona.abrirEliminar}
      />

      <ModalMoverPreviaMesa
        abierto={persona.modalMoverAbierto}
        previa={persona.previaMover}
        destinosData={persona.destinosMover}
        cargando={persona.cargandoDestinos}
        moviendo={persona.moviendo}
        error={persona.errorMover}
        onClose={persona.cerrarMover}
        onConfirm={persona.confirmarMover}
      />

      <ModalEliminarGlobal
        open={!!persona.modalEliminarAbierto}
        operacion="eliminar"
        loading={!!persona.eliminando}
        title="Quitar alumno de la mesa"
        message={`¿Quitar a ${texto(persona.previaEliminar?.alumno)} de la mesa N° ${texto(persona.previaEliminar?.numero_mesa)}?`}
        warning="El alumno se quita solamente de este número de mesa. La previa no se elimina del sistema."
        confirmLabel="Quitar"
        loadingLabel="Quitando..."
        successMessage="Alumno quitado correctamente."
        errorMessage="No se pudo quitar el alumno de la mesa."
        details={[
          { label: "Mesa", value: `N° ${texto(persona.previaEliminar?.numero_mesa)}` },
          { label: "Alumno", value: texto(persona.previaEliminar?.alumno) },
          { label: "DNI", value: texto(persona.previaEliminar?.dni) },
          { label: "Curso", value: texto(persona.previaEliminar?.curso) },
        ]}
        onClose={persona.cerrarEliminar}
        onConfirm={persona.confirmarEliminar}
        hideLocalError
      />

      <ModalAgregarPreviaMesa
        abierto={mas.modalAbierto}
        numero={mas.numeroMas}
        data={mas.previasMas}
        cargando={mas.cargando}
        agregando={mas.agregando}
        error={mas.error}
        onClose={mas.cerrar}
        onConfirm={mas.confirmarAgregar}
      />

      <ModalMoverNumeroMesa
        abierto={flechas.modalAbierto}
        numero={flechas.numeroFlechas}
        destinosData={flechas.destinosFlechas}
        cargando={flechas.cargando}
        moviendo={flechas.moviendo}
        error={flechas.error}
        onClose={flechas.cerrar}
        onConfirm={flechas.confirmarMover}
      />

      <ModalAgregarNumeroGrupo
        abierto={agregarNumero.modalAbierto}
        data={agregarNumero.opciones}
        cargando={agregarNumero.cargando}
        agregando={agregarNumero.agregando}
        error={agregarNumero.error}
        onClose={agregarNumero.cerrar}
        onAgregar={agregarNumero.confirmarAgregar}
      />
    </div>
  ), portalTarget);
};

export default ModalEditarMesa;
