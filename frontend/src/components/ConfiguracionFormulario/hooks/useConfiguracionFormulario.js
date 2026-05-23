// src/components/ConfiguracionFormulario/hooks/useConfiguracionFormulario.js
import { useCallback, useEffect, useMemo, useState } from "react";
import { configuracionFormularioApi } from "../api/configuracionFormularioApi";

export const HORAS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
export const MINUTOS = ["00", "15", "30", "45"];

const TITULO_DEFAULT = "Mesas Examen Abril 2026";
const MENSAJE_CERRADO_DEFAULT = "La inscripción está cerrada. Consultá Secretaría.";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function safeText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

export function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function sumarDiasISO(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function normalizarFecha(fecha, fallbackFecha) {
  const texto = safeText(fecha);
  const match = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);

  if (!match) return fallbackFecha;

  return `${match[1]}-${pad2(Number(match[2]))}-${pad2(Number(match[3]))}`;
}

export function separarFechaHora(valor, fallbackFecha = hoyISO(), fallbackHora = "08", fallbackMinuto = "00") {
  if (!valor) {
    return { fecha: fallbackFecha, hora: fallbackHora, minuto: fallbackMinuto };
  }

  const limpio = String(valor).replace("T", " ").trim();
  const [fechaRaw = fallbackFecha, horaCompleta = `${fallbackHora}:${fallbackMinuto}:00`] = limpio.split(" ");
  const [horaRaw = fallbackHora, minutoRaw = fallbackMinuto] = horaCompleta.split(":");

  const hora = pad2(Number(horaRaw));
  const minuto = pad2(Number(minutoRaw));

  return {
    fecha: normalizarFecha(fechaRaw, fallbackFecha),
    hora: HORAS.includes(hora) ? hora : fallbackHora,
    minuto: MINUTOS.includes(minuto) ? minuto : "00",
  };
}

export function fechaMysql(fecha, hora, minuto) {
  return `${fecha} ${hora}:${minuto}:00`;
}

export function formatoFechaLarga(fecha, hora, minuto) {
  if (!fecha) return "-";

  const d = new Date(`${fecha}T${hora}:${minuto}:00`);
  if (Number.isNaN(d.getTime())) return "-";

  const texto = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);

  return `${texto}, ${hora}:${minuto} hs`;
}

export function calcularEstado(activo, inicioMysql, finMysql) {
  if (!activo) return false;

  const inicio = new Date(String(inicioMysql || "").replace(" ", "T"));
  const fin = new Date(String(finMysql || "").replace(" ", "T"));

  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) return false;
  return new Date() >= inicio && new Date() <= fin;
}

function obtenerObjetoConfig(respuesta) {
  if (!respuesta || typeof respuesta !== "object") return null;

  const config =
    respuesta.config ||
    respuesta.configuracion ||
    respuesta.formulario ||
    respuesta.data?.config ||
    respuesta.data?.configuracion ||
    respuesta.data?.formulario ||
    respuesta.data;

  if (config && typeof config === "object" && !Array.isArray(config)) return config;

  return respuesta;
}

function hayConfig(respuesta, config) {
  if (!respuesta || typeof respuesta !== "object") return false;

  if (respuesta.hay_config === false || respuesta.hayConfig === false) return false;
  if (respuesta.data?.hay_config === false || respuesta.data?.hayConfig === false) return false;

  return Boolean(
    respuesta.hay_config ||
    respuesta.hayConfig ||
    respuesta.data?.hay_config ||
    respuesta.data?.hayConfig ||
    config?.id_config ||
    config?.id ||
    config?.titulo ||
    config?.nombre ||
    config?.inicio ||
    config?.insc_inicio ||
    config?.fecha_inicio
  );
}

function extraerConfigNormalizada(respuesta) {
  const config = obtenerObjetoConfig(respuesta);

  if (!hayConfig(respuesta, config)) {
    return null;
  }

  return {
    idConfig: Number(firstDefined(config?.id_config, config?.id, config?.idConfig, 0) || 0),
    titulo: safeText(firstDefined(config?.titulo, config?.nombre, config?.nombre_formulario), TITULO_DEFAULT),
    inicio: firstDefined(config?.inicio, config?.insc_inicio, config?.fecha_inicio, config?.apertura),
    fin: firstDefined(config?.fin, config?.insc_fin, config?.fecha_fin, config?.cierre),
    mensajeCerrado: safeText(
      firstDefined(config?.mensaje_cerrado, config?.mensajeCerrado, config?.mensaje, config?.texto_cerrado),
      MENSAJE_CERRADO_DEFAULT
    ),
    activo: Number(firstDefined(config?.activo, config?.habilitado, 1) ?? 1),
  };
}

export function useConfiguracionFormulario() {
  const [idConfig, setIdConfig] = useState(0);
  const [titulo, setTitulo] = useState(TITULO_DEFAULT);
  const [inicioFecha, setInicioFecha] = useState(hoyISO());
  const [inicioHora, setInicioHora] = useState("12");
  const [inicioMinuto, setInicioMinuto] = useState("00");
  const [finFecha, setFinFecha] = useState(sumarDiasISO(6));
  const [finHora, setFinHora] = useState("07");
  const [finMinuto, setFinMinuto] = useState("30");
  const [mensajeCerrado, setMensajeCerrado] = useState(MENSAJE_CERRADO_DEFAULT);
  const [activo, setActivo] = useState(1);

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [toast, setToast] = useState(null);

  const mostrarToast = useCallback((tipo, texto, duracion = undefined) => {
    setToast({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      tipo,
      texto,
      duracion,
    });
  }, []);

  const inicioMysql = useMemo(
    () => fechaMysql(inicioFecha, inicioHora, inicioMinuto),
    [inicioFecha, inicioHora, inicioMinuto]
  );

  const finMysql = useMemo(
    () => fechaMysql(finFecha, finHora, finMinuto),
    [finFecha, finHora, finMinuto]
  );

  const estaAbierta = useMemo(
    () => calcularEstado(Number(activo) === 1, inicioMysql, finMysql),
    [activo, inicioMysql, finMysql]
  );

  const aplicarConfig = useCallback((config) => {
    if (!config) return;

    const ini = separarFechaHora(config.inicio, hoyISO(), "12", "00");
    const fin = separarFechaHora(config.fin, sumarDiasISO(6), "07", "30");

    setIdConfig(Number(config.idConfig || 0));
    setTitulo(config.titulo || TITULO_DEFAULT);
    setInicioFecha(ini.fecha);
    setInicioHora(ini.hora);
    setInicioMinuto(ini.minuto);
    setFinFecha(fin.fecha);
    setFinHora(fin.hora);
    setFinMinuto(fin.minuto);
    setMensajeCerrado(config.mensajeCerrado || MENSAJE_CERRADO_DEFAULT);
    setActivo(Number(config.activo ?? 1));
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);

    try {
      const respuesta = await configuracionFormularioApi.obtener();
      const config = extraerConfigNormalizada(respuesta);
      aplicarConfig(config);
    } catch (error) {
      mostrarToast("error", error?.message || "No se pudo cargar la configuración.");
    } finally {
      setCargando(false);
    }
  }, [aplicarConfig, mostrarToast]);

  useEffect(() => {
    let vivo = true;

    async function cargarSeguro() {
      setCargando(true);

      try {
        const respuesta = await configuracionFormularioApi.obtener();
        if (!vivo) return;

        const config = extraerConfigNormalizada(respuesta);
        aplicarConfig(config);
      } catch (error) {
        if (vivo) {
          mostrarToast("error", error?.message || "No se pudo cargar la configuración.");
        }
      } finally {
        if (vivo) setCargando(false);
      }
    }

    cargarSeguro();

    return () => {
      vivo = false;
    };
  }, [aplicarConfig, mostrarToast]);

  const validar = useCallback(() => {
    if (!titulo.trim()) {
      return "Ingresá un título para el formulario.";
    }

    const inicioDate = new Date(inicioMysql.replace(" ", "T"));
    const finDate = new Date(finMysql.replace(" ", "T"));

    if (Number.isNaN(inicioDate.getTime()) || Number.isNaN(finDate.getTime())) {
      return "Revisá las fechas ingresadas.";
    }

    if (inicioDate >= finDate) {
      return "La fecha de inicio debe ser anterior a la fecha de fin.";
    }

    return "";
  }, [titulo, inicioMysql, finMysql]);

  const guardar = useCallback(async () => {
    const errorValidacion = validar();

    if (errorValidacion) {
      mostrarToast("error", errorValidacion);
      return false;
    }

    setGuardando(true);

    try {
      const payload = {
        id_config: idConfig,
        titulo: titulo.trim(),
        nombre: titulo.trim(),
        inicio: inicioMysql,
        fin: finMysql,
        insc_inicio: inicioMysql,
        insc_fin: finMysql,
        mensaje_cerrado: mensajeCerrado.trim() || MENSAJE_CERRADO_DEFAULT,
        activo: 1,
      };

      const respuesta = await configuracionFormularioApi.guardar(payload);
      const config = extraerConfigNormalizada(respuesta);

      if (config) aplicarConfig(config);
      else setIdConfig(Number(respuesta?.id_config || respuesta?.id || respuesta?.data?.id_config || idConfig || 0));

      setActivo(1);
      mostrarToast("exito", respuesta?.mensaje || respuesta?.message || "Configuración guardada correctamente.", 2800);
      return true;
    } catch (error) {
      mostrarToast("error", error?.message || "No se pudo guardar la configuración.");
      return false;
    } finally {
      setGuardando(false);
    }
  }, [validar, idConfig, titulo, inicioMysql, finMysql, mensajeCerrado, mostrarToast, aplicarConfig]);

  return {
    idConfig,
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
    activo,
    setActivo,
    cargando,
    guardando,
    toast,
    setToast,
    inicioMysql,
    finMysql,
    estaAbierta,
    cargar,
    guardar,
  };
}
