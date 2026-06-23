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
  faTriangleExclamation,
  faClock,
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

const minutosAHora = (minutos) => {
  const horas = Math.floor(minutos / 60);
  const mins = minutos % 60;
  return `${String(horas).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

const generarOpcionesHoras = (rango) => {
  const min = horaAMinutos(rango?.min);
  const max = horaAMinutos(rango?.max);
  if (min === null || max === null || max < min) return [];

  const horaMin = Math.floor(min / 60);
  const horaMax = Math.floor(max / 60);

  const opciones = [];
  for (let hora = horaMin; hora <= horaMax; hora += 1) {
    opciones.push(String(hora).padStart(2, "0"));
  }
  return opciones;
};

const generarOpcionesMinutos = (rango, horaSeleccionada) => {
  const min = horaAMinutos(rango?.min);
  const max = horaAMinutos(rango?.max);
  const horaNumero = Number(horaSeleccionada);

  if (min === null || max === null || max < min || Number.isNaN(horaNumero)) return [];

  const opciones = [];
  for (let minuto = 0; minuto <= 59; minuto += 1) {
    const total = horaNumero * 60 + minuto;
    if (total >= min && total <= max) {
      opciones.push(String(minuto).padStart(2, "0"));
    }
  }
  return opciones;
};

const obtenerPartesHora = (valor, turno = "") => {
  const horaAjustada = ajustarHoraARango(valor, turno);
  return {
    hora: horaAjustada.slice(0, 2),
    minuto: horaAjustada.slice(3, 5),
  };
};

const obtenerMinutoMasCercano = (minutoActual, opciones = []) => {
  if (!opciones.length) return "00";
  if (opciones.includes(minutoActual)) return minutoActual;

  const actual = Number(minutoActual);
  if (Number.isNaN(actual)) return opciones[0];

  return opciones.reduce((mejor, opcion) => {
    const distanciaActual = Math.abs(Number(opcion) - actual);
    const distanciaMejor = Math.abs(Number(mejor) - actual);
    return distanciaActual < distanciaMejor ? opcion : mejor;
  }, opciones[0]);
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
      const fecha = normalizarFechaInput(slot?.fecha_mesa);
      if (!fecha) return;
      const actuales = mapa.get(fecha) || [];
      actuales.push(slot);
      mapa.set(fecha, actuales);
    });
    return mapa;
  }, [slotsDisponibles]);

  const slotsPorFechaTurno = useMemo(() => {
    const mapa = new Map();
    (Array.isArray(slotsDisponibles) ? slotsDisponibles : []).forEach((slot) => {
      mapa.set(claveSlot(slot.fecha_mesa, slot.id_turno), slot);
    });
    return mapa;
  }, [slotsDisponibles]);

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
          const slotsDelDia = slotsPorFecha.get(ymd) || [];
          const slotTurnoActual = slotsPorFechaTurno.get(claveSlot(ymd, idTurno));
          const slotDisponible = slotsDelDia.find((slot) => !!slot?.valido || !!slot?.es_actual) || null;
          const disponible = !!slotDisponible;
          const turnoActualDisponible = !!slotTurnoActual?.valido || !!slotTurnoActual?.es_actual;
          const bloqueado = weekend || cargandoSlots || !disponible;
          const erroresDia = slotsDelDia
            .flatMap((slot) => Array.isArray(slot?.errores) ? slot.errores : [])
            .filter(Boolean);
          const motivo = weekend
            ? "Sábados y domingos no disponibles"
            : cargandoSlots
              ? "Validando disponibilidad..."
              : disponible
                ? (turnoActualDisponible ? "Fecha y turno disponible" : "Fecha disponible en otro turno. Al seleccionarla se ajusta el turno automáticamente.")
                : (erroresDia.length > 0 ? erroresDia : ["Día sin turnos compatibles para esta mesa"]).join(" | ");

          return (
            <button
              key={ymd}
              type="button"
              className={`editar-mesa-day ${fueraMes ? "muted" : ""} ${activo ? "active" : ""} ${weekend ? "weekend" : ""} ${disponible ? "available" : "blocked"}`}
              onClick={() => !bloqueado && onChange(ymd, slotDisponible)}
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

const obtenerResumenCambioDocente = (cambios = []) => {
  const cambio = Array.isArray(cambios) ? cambios[0] : null;
  if (!cambio) return "Docente cambiado pendiente";

  const anterior = texto(cambio?.docente_anterior || cambio?.docente_anterior_nombre, "Sin docente anterior");
  const nuevo = texto(cambio?.docente_nuevo || cambio?.docente_nuevo_nombre, "Sin docente nuevo");
  return `${anterior} → ${nuevo}`;
};

const SlotNumero = ({
  numero,
  cambiosDocente = [],
  aplicandoCambioDocenteId = null,
  onAplicarCambioDocente,
  onVerPrevias,
  onAgregarPrevia,
  onMoverNumero,
  onEliminarNumero,
}) => {
  const tieneCambioDocente = Array.isArray(cambiosDocente) && cambiosDocente.length > 0;
  const cambioDocentePrincipal = tieneCambioDocente ? cambiosDocente[0] : null;
  const idCambioDocentePrincipal = Number(cambioDocentePrincipal?.id_cambio || 0);
  const aplicandoCambioDocente = idCambioDocentePrincipal > 0 && Number(aplicandoCambioDocenteId || 0) === idCambioDocentePrincipal;
  const puedeAplicarCambioDocente = tieneCambioDocente && typeof onAplicarCambioDocente === "function" && idCambioDocentePrincipal > 0;

  const handleAplicarCambioDocente = () => {
    if (!puedeAplicarCambioDocente || aplicandoCambioDocente) return;
    onAplicarCambioDocente(cambioDocentePrincipal);
  };

  return (
    <article className={`editar-mesa-slot-card ${tieneCambioDocente ? "editar-mesa-slot-card--docenteCambio" : ""}`}>
      <div className="editar-mesa-slot-actions">
        <span className={`editar-mesa-numero-chip ${tieneCambioDocente ? "editar-mesa-numero-chip--docenteCambio" : ""}`}>
          N° {texto(numero?.numero_mesa)}
        </span>
        <div className="buttons-accions">
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
      </div>

      {tieneCambioDocente && (
        <div className="editar-mesa-docenteCambioNotice">
          <FontAwesomeIcon icon={faTriangleExclamation} />
          <span>{obtenerResumenCambioDocente(cambiosDocente)}</span>
          {puedeAplicarCambioDocente && (
            <button
              type="button"
              className="editar-mesa-docenteCambioNotice__btn"
              onClick={handleAplicarCambioDocente}
              disabled={aplicandoCambioDocente}
              title="Aplicar el nuevo docente y recargar esta mesa"
            >
              {aplicandoCambioDocente && <FontAwesomeIcon icon={faSpinner} spin />}
              Aplicar cambio
            </button>
          )}
        </div>
      )}

      <div className="editar-mesa-slot-info">
        <h3>{texto(numero?.materia, "Sin materia")}</h3>
        <p>Docentes: {texto(numero?.docente, "Sin docente")}</p>
      </div>
    </article>
  );
};

const SlotVacio = ({ onClick, esExtraLibre = false, eliminando = false, onEliminarSlot, deshabilitado = false }) => (
  <div className={`editar-mesa-slot-empty ${esExtraLibre ? "editar-mesa-slot-empty-extra" : ""}`}>
    <button
      type="button"
      className="editar-mesa-slot-empty-main"
      onClick={() => !deshabilitado && onClick?.()}
      disabled={deshabilitado}
    >
      <FontAwesomeIcon icon={faPlus} />
      <span>{deshabilitado ? "Guardando slot..." : "Agregar número"}</span>
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


const EditarMesaSkeleton = () => (
  <>
    <div className="editar-mesa-programacion editar-mesa-skeleton-card" aria-hidden="true">
      <span className="editar-mesa-skeleton-line editar-mesa-skeleton-title" />
      <span className="editar-mesa-skeleton-line editar-mesa-skeleton-accent" />

      <div className="editar-mesa-skeleton-fields">
        <span className="editar-mesa-skeleton-line editar-mesa-skeleton-input" />
        <span className="editar-mesa-skeleton-line editar-mesa-skeleton-input" />
      </div>

      <div className="editar-mesa-skeleton-calendar">
        <div className="editar-mesa-skeleton-calendar-head">
          <span className="editar-mesa-skeleton-line editar-mesa-skeleton-circle" />
          <span className="editar-mesa-skeleton-line editar-mesa-skeleton-month" />
          <span className="editar-mesa-skeleton-line editar-mesa-skeleton-circle" />
        </div>
        <div className="editar-mesa-skeleton-calendar-grid">
          {Array.from({ length: 42 }).map((_, index) => (
            <span key={`editar-cal-skeleton-${index}`} className="editar-mesa-skeleton-line editar-mesa-skeleton-day" />
          ))}
        </div>
      </div>
    </div>

    <div className="editar-mesa-slots-wrap editar-mesa-skeleton-slots-wrap" aria-hidden="true">
      <div className="editar-mesa-slots-card editar-mesa-skeleton-card">
        <div className="editar-mesa-skeleton-slots-head">
          <div>
            <span className="editar-mesa-skeleton-line editar-mesa-skeleton-title editar-mesa-skeleton-title-wide" />
            <span className="editar-mesa-skeleton-line editar-mesa-skeleton-subtitle" />
          </div>
          <span className="editar-mesa-skeleton-line editar-mesa-skeleton-pill" />
        </div>
        <span className="editar-mesa-skeleton-line editar-mesa-skeleton-accent" />
        <div className="editar-mesa-skeleton-slots-grid">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={`editar-slot-skeleton-${index}`} className="editar-mesa-skeleton-slot">
              <span className="editar-mesa-skeleton-line editar-mesa-skeleton-chip" />
              <span className="editar-mesa-skeleton-line editar-mesa-skeleton-card-title" />
              <span className="editar-mesa-skeleton-line editar-mesa-skeleton-card-text" />
              <span className="editar-mesa-skeleton-line editar-mesa-skeleton-card-text editar-mesa-skeleton-card-text-short" />
              <div className="editar-mesa-skeleton-actions">
                <span className="editar-mesa-skeleton-line editar-mesa-skeleton-action" />
                <span className="editar-mesa-skeleton-line editar-mesa-skeleton-action" />
                <span className="editar-mesa-skeleton-line editar-mesa-skeleton-action" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </>
);

const ModalEditarMesa = ({
  abierto,
  grupo,
  tipo,
  turnos = [],
  cargando,
  guardando,
  slotsDisponibles,
  cargandoSlots = false,
  onClose,
  onSave,
  onCrearGrupoUnico,
  onDelete,
  onLoadSlots,
  persona = {},
  mas = {},
  flechas = {},
  eliminar = {},
  agregarNumero = {},
  cambiosDocentePendientes = [],
  aplicandoCambioDocenteId = null,
  onAplicarCambioDocente,
}) => {
  const [fechaMesa, setFechaMesa] = useState("");
  const [idTurno, setIdTurno] = useState("");
  const [hora, setHora] = useState("07:30");
  const overlayRef = useEscapeClose(abierto, onClose, guardando);
  const esNoAgrupada = tipo === "no_agrupada";

  const numeros = useMemo(() => {
    const base = Array.isArray(grupo?.numeros) ? grupo.numeros : [];
    return base;
  }, [grupo]);

  const cambiosDocentePorNumero = useMemo(() => {
    const mapa = new Map();
    (Array.isArray(cambiosDocentePendientes) ? cambiosDocentePendientes : []).forEach((cambio) => {
      const numeroMesa = Number(cambio?.numero_mesa || 0);
      if (!numeroMesa) return;
      const actuales = mapa.get(numeroMesa) || [];
      actuales.push(cambio);
      mapa.set(numeroMesa, actuales);
    });
    return mapa;
  }, [cambiosDocentePendientes]);

  const obtenerCambiosNumero = useCallback((numero) => {
    const numeroMesa = Number(numero?.numero_mesa || 0);
    if (!numeroMesa) return [];
    return cambiosDocentePorNumero.get(numeroMesa) || [];
  }, [cambiosDocentePorNumero]);

  const grupoTieneTaller = useMemo(() => esGrupoTaller(grupo, numeros), [grupo, numeros]);
  const capacidadSlots = useMemo(() => calcularCapacidadSlots(grupo, numeros), [grupo, numeros]);
  const slotsExtraLibres = useMemo(() => calcularSlotsExtraLibres(grupo, numeros), [grupo, numeros]);
  const slotsLibres = Math.max(0, capacidadSlots - numeros.length);

  const slotsValidos = useMemo(() => {
    const lista = Array.isArray(slotsDisponibles?.slots) ? slotsDisponibles.slots : [];
    return lista.filter((slot) => slot?.valido || slot?.es_actual);
  }, [slotsDisponibles]);

  const turnosValidosPorFecha = useMemo(() => {
    const mapa = new Map();
    slotsValidos.forEach((slot) => {
      const fecha = normalizarFechaInput(slot?.fecha_mesa);
      const id = String(slot?.id_turno || "");
      if (!fecha || !id) return;
      const setTurnos = mapa.get(fecha) || new Set();
      setTurnos.add(id);
      mapa.set(fecha, setTurnos);
    });
    return mapa;
  }, [slotsValidos]);

  const turnosDisponiblesFechaSeleccionada = useMemo(() => {
    return turnosValidosPorFecha.get(fechaMesa) || new Set();
  }, [turnosValidosPorFecha, fechaMesa]);

  const turnoSeleccionado = useMemo(
    () => turnos.find((item) => String(item.id_turno) === String(idTurno))?.turno || grupo?.turno || "",
    [turnos, idTurno, grupo]
  );

  const rangoHorario = useMemo(() => obtenerRangoHorarioPorTurno(turnoSeleccionado), [turnoSeleccionado]);
  const partesHora = useMemo(() => obtenerPartesHora(hora, turnoSeleccionado), [hora, turnoSeleccionado]);
  const opcionesHoras = useMemo(() => generarOpcionesHoras(rangoHorario), [rangoHorario]);
  const opcionesMinutos = useMemo(() => generarOpcionesMinutos(rangoHorario, partesHora.hora), [rangoHorario, partesHora.hora]);

  const slotSeleccionadoBackend = useMemo(() => {
    const lista = Array.isArray(slotsDisponibles?.slots) ? slotsDisponibles.slots : [];
    if (!fechaMesa || !idTurno) return null;
    return lista.find((slot) => normalizarFechaInput(slot.fecha_mesa) === fechaMesa && String(slot.id_turno) === String(idTurno)) || null;
  }, [slotsDisponibles, fechaMesa, idTurno]);

  const slotSeleccionadoValido = useMemo(() => {
    if (!fechaMesa || !idTurno) return false;
    return !!slotSeleccionadoBackend?.valido || !!slotSeleccionadoBackend?.es_actual;
  }, [slotSeleccionadoBackend, fechaMesa, idTurno]);

  const erroresSlotSeleccionado = useMemo(() => {
    const errores = Array.isArray(slotSeleccionadoBackend?.errores) ? slotSeleccionadoBackend.errores : [];
    return errores.filter(Boolean);
  }, [slotSeleccionadoBackend]);

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

    const primeroMismaFecha = slotsValidos.find((slot) => normalizarFechaInput(slot.fecha_mesa) === fechaMesa);
    const primeroMismoTurno = slotsValidos.find((slot) => String(slot.id_turno) === String(idTurno));
    const primero = primeroMismaFecha || primeroMismoTurno || slotsValidos[0];

    if (primero) {
      setFechaMesa(normalizarFechaInput(primero.fecha_mesa));
      setIdTurno(String(primero.id_turno));
      setHora(formatearHoraInput(primero.hora_sugerida, primero.turno));
    }
  }, [abierto, cargandoSlots, slotsDisponibles, slotsValidos, fechaMesa, idTurno]);

  const handleFechaChange = useCallback((fecha, slotDisponible = null) => {
    const fechaNormalizada = normalizarFechaInput(fecha);
    if (!fechaNormalizada) return;

    setFechaMesa(fechaNormalizada);

    if (slotDisponible?.id_turno && String(slotDisponible.id_turno) !== String(idTurno)) {
      setIdTurno(String(slotDisponible.id_turno));
      setHora(formatearHoraInput(slotDisponible.hora_sugerida, slotDisponible.turno));
    }
  }, [idTurno]);

  if (!abierto) return null;

  const portalTarget = typeof document !== "undefined" ? document.body : null;
  if (!portalTarget) return null;

  const slots = [...numeros];
  while (slots.length < capacidadSlots) slots.push(null);

  const slotsGridClassName = [
    "editar-mesa-slots-grid",
    slots.length <= 2 ? "editar-mesa-slots-grid--fila-unica" : "",
  ].filter(Boolean).join(" ");

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

  const handleHoraParteChange = (event) => {
    const nuevaHora = String(event.target.value).padStart(2, "0");
    const minutosValidos = generarOpcionesMinutos(rangoHorario, nuevaHora);
    const minutoSeguro = obtenerMinutoMasCercano(partesHora.minuto, minutosValidos);
    setHora(ajustarHoraARango(`${nuevaHora}:${minutoSeguro}`, turnoSeleccionado));
  };

  const handleMinutoParteChange = (event) => {
    const nuevoMinuto = String(event.target.value).padStart(2, "0");
    setHora(ajustarHoraARango(`${partesHora.hora}:${nuevoMinuto}`, turnoSeleccionado));
  };

  return createPortal((
    <div ref={overlayRef} className="editar-mesa-overlay" role="dialog" aria-modal="true" data-mesa-modal-root="true">
      <div className={`editar-mesa-panel ${cargando ? "is-loading" : ""}`}>
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
            <EditarMesaSkeleton />
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
                        const hayFechaSeleccionada = !!fechaMesa;
                        const turnoBloqueadoEnFecha = haySlotsCargados
                          && hayFechaSeleccionada
                          && slotsValidos.length > 0
                          && !turnosDisponiblesFechaSeleccionada.has(id);

                        return (
                          <option key={turno.id_turno} value={turno.id_turno} disabled={turnoBloqueadoEnFecha}>
                            {turno.turno}{turnoBloqueadoEnFecha ? " — bloqueado ese día" : ""}
                          </option>
                        );
                      })}
                    </select>
                  </label>

                  <label>
                    <span>Horario</span>
                    <div className="editar-mesa-time-input editar-mesa-time-split" title={`Permitido: ${rangoHorario.texto}`}>
                      <select
                        value={partesHora.hora}
                        onChange={handleHoraParteChange}
                        aria-label={`Hora permitida de ${rangoHorario.texto}`}
                      >
                        {opcionesHoras.map((opcion) => (
                          <option key={opcion} value={opcion}>{opcion}</option>
                        ))}
                      </select>
                      <span className="editar-mesa-time-separator">:</span>
                      <select
                        value={partesHora.minuto}
                        onChange={handleMinutoParteChange}
                        aria-label={`Minutos permitidos de ${rangoHorario.texto}`}
                      >
                        {opcionesMinutos.map((opcion) => (
                          <option key={opcion} value={opcion}>{opcion}</option>
                        ))}
                      </select>
                      <FontAwesomeIcon icon={faClock} className="editar-mesa-time-icon" />
                    </div>
                    <small className="editar-mesa-help">Permitido: {rangoHorario.texto}</small>
                  </label>
                </div>

                <CalendarMesa
                  fechaSeleccionada={fechaMesa}
                  idTurno={idTurno}
                  slotsDisponibles={slotsDisponibles?.slots || []}
                  cargandoSlots={cargandoSlots}
                  onChange={handleFechaChange}
                  onMesChange={cargarSlotsMes}
                />

                {!cargandoSlots && slotsDisponibles && slotsValidos.length === 0 && (
                  <div className="editar-mesa-disponibilidad-error">
                    {erroresSlotSeleccionado.length > 0
                      ? `El horario actual no está habilitado: ${erroresSlotSeleccionado.join(" | ")}`
                      : "No hay fechas/turnos válidos en este mes para esta mesa según las validaciones actuales."}
                  </div>
                )}

                {!cargandoSlots && fechaMesa && idTurno && !slotSeleccionadoValido && slotsValidos.length > 0 && (
                  <div className="editar-mesa-disponibilidad-error">
                    {erroresSlotSeleccionado.length > 0
                      ? `Esa fecha y turno no está disponible: ${erroresSlotSeleccionado.join(" | ")}`
                      : "Esa fecha y turno no está disponible para esta mesa."}
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

                    {numeros[0] && (() => {
                      const cambiosNumero = obtenerCambiosNumero(numeros[0]);
                      const tieneCambioDocente = cambiosNumero.length > 0;
                      const cambioDocentePrincipal = tieneCambioDocente ? cambiosNumero[0] : null;
                      const idCambioDocentePrincipal = Number(cambioDocentePrincipal?.id_cambio || 0);
                      const aplicandoCambioDocente = idCambioDocentePrincipal > 0 && Number(aplicandoCambioDocenteId || 0) === idCambioDocentePrincipal;
                      const puedeAplicarCambioDocente = tieneCambioDocente && typeof onAplicarCambioDocente === "function" && idCambioDocentePrincipal > 0;
                      return (
                        <article className={`editar-mesa-no-agrupada-numero ${tieneCambioDocente ? "editar-mesa-no-agrupada-numero--docenteCambio" : ""}`}>
                          <div>
                            <span className={`editar-mesa-numero-chip ${tieneCambioDocente ? "editar-mesa-numero-chip--docenteCambio" : ""}`}>N° {texto(numeros[0]?.numero_mesa)}</span>
                            <strong>{texto(numeros[0]?.materia || grupo?.materia, "Sin materia")}</strong>
                          </div>
                          {tieneCambioDocente && (
                            <div className="editar-mesa-docenteCambioNotice">
                              <FontAwesomeIcon icon={faTriangleExclamation} />
                              <span>{obtenerResumenCambioDocente(cambiosNumero)}</span>
                              {puedeAplicarCambioDocente && (
                                <button
                                  type="button"
                                  className="editar-mesa-docenteCambioNotice__btn"
                                  onClick={() => !aplicandoCambioDocente && onAplicarCambioDocente(cambioDocentePrincipal)}
                                  disabled={aplicandoCambioDocente}
                                  title="Aplicar el nuevo docente y recargar esta mesa"
                                >
                                  {aplicandoCambioDocente && <FontAwesomeIcon icon={faSpinner} spin />}
                                  Aplicar cambio
                                </button>
                              )}
                            </div>
                          )}
                          <p>Docentes: {texto(numeros[0]?.docente || grupo?.docente, "Sin docente")}</p>
                        </article>
                      );
                    })()}

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
                      El sistema valida antes de crear: indisponibilidades docentes, bloqueos, choques de alumnos,
                      conflictos docentes reales y correlativas.
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

                    <div className={slotsGridClassName}>
                      {slots.map((slot, index) => (
                        slot ? (
                          <SlotNumero
                            key={slot.numero_mesa || index}
                            numero={slot}
                            cambiosDocente={obtenerCambiosNumero(slot)}
                            aplicandoCambioDocenteId={aplicandoCambioDocenteId}
                            onAplicarCambioDocente={onAplicarCambioDocente}
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
                            deshabilitado={!!agregarNumero.habilitandoSlotExtra}
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

        {cargando ? (
          <footer className="editar-mesa-footer editar-mesa-footer-skeleton" aria-hidden="true">
            <span className="editar-mesa-skeleton-line editar-mesa-skeleton-footer-btn" />
            <span className="editar-mesa-skeleton-line editar-mesa-skeleton-footer-btn editar-mesa-skeleton-footer-btn-primary" />
          </footer>
        ) : (
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
