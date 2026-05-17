// src/components/Configuracion/Formulario/hooks/useConfiguracionFormulario.js
import { useCallback, useEffect, useMemo, useState } from "react";
import { configuracionFormularioApi } from "../api/configuracionFormularioApi";

export const HORAS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
export const MINUTOS = ["00", "15", "30", "45"];

function pad2(n) {
  return String(n).padStart(2, "0");
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

export function separarFechaHora(valor, fallbackFecha = hoyISO(), fallbackHora = "08", fallbackMinuto = "00") {
  if (!valor) {
    return { fecha: fallbackFecha, hora: fallbackHora, minuto: fallbackMinuto };
  }

  const limpio = String(valor).replace("T", " ").trim();
  const [fecha = fallbackFecha, horaCompleta = `${fallbackHora}:${fallbackMinuto}:00`] = limpio.split(" ");
  const [hora = fallbackHora, minuto = fallbackMinuto] = horaCompleta.split(":");

  return {
    fecha,
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

  const inicio = new Date(String(inicioMysql).replace(" ", "T"));
  const fin = new Date(String(finMysql).replace(" ", "T"));

  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) return false;
  return new Date() >= inicio && new Date() <= fin;
}

export function useConfiguracionFormulario() {
  const [idConfig, setIdConfig] = useState(0);
  const [titulo, setTitulo] = useState("Mesas Examen Abril 2026");
  const [inicioFecha, setInicioFecha] = useState(hoyISO());
  const [inicioHora, setInicioHora] = useState("12");
  const [inicioMinuto, setInicioMinuto] = useState("00");
  const [finFecha, setFinFecha] = useState(sumarDiasISO(6));
  const [finHora, setFinHora] = useState("07");
  const [finMinuto, setFinMinuto] = useState("30");
  const [mensajeCerrado, setMensajeCerrado] = useState("La inscripción está cerrada. Consultá Secretaría.");
  const [activo, setActivo] = useState(1);

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [toast, setToast] = useState(null);

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

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const data = await configuracionFormularioApi.obtener();

      if (data?.hay_config) {
        const ini = separarFechaHora(data.inicio, hoyISO(), "12", "00");
        const fin = separarFechaHora(data.fin, sumarDiasISO(6), "07", "30");

        setIdConfig(Number(data.id_config || 0));
        setTitulo(data.titulo || "Mesas Examen");
        setInicioFecha(ini.fecha);
        setInicioHora(ini.hora);
        setInicioMinuto(ini.minuto);
        setFinFecha(fin.fecha);
        setFinHora(fin.hora);
        setFinMinuto(fin.minuto);
        setMensajeCerrado(data.mensaje_cerrado || "La inscripción está cerrada. Consultá Secretaría.");
        setActivo(Number(data.activo ?? 1));
      }
    } catch (error) {
      setToast({ tipo: "error", texto: error.message || "No se pudo cargar la configuración." });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    let vivo = true;

    async function cargarSeguro() {
      setCargando(true);
      try {
        const data = await configuracionFormularioApi.obtener();
        if (!vivo) return;

        if (data?.hay_config) {
          const ini = separarFechaHora(data.inicio, hoyISO(), "12", "00");
          const fin = separarFechaHora(data.fin, sumarDiasISO(6), "07", "30");

          setIdConfig(Number(data.id_config || 0));
          setTitulo(data.titulo || "Mesas Examen");
          setInicioFecha(ini.fecha);
          setInicioHora(ini.hora);
          setInicioMinuto(ini.minuto);
          setFinFecha(fin.fecha);
          setFinHora(fin.hora);
          setFinMinuto(fin.minuto);
          setMensajeCerrado(data.mensaje_cerrado || "La inscripción está cerrada. Consultá Secretaría.");
          setActivo(Number(data.activo ?? 1));
        }
      } catch (error) {
        if (vivo) {
          setToast({ tipo: "error", texto: error.message || "No se pudo cargar la configuración." });
        }
      } finally {
        if (vivo) setCargando(false);
      }
    }

    cargarSeguro();
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

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
      setToast({ tipo: "error", texto: errorValidacion });
      return false;
    }

    setGuardando(true);
    try {
      const data = await configuracionFormularioApi.guardar({
        id_config: idConfig,
        nombre: titulo.trim(),
        insc_inicio: inicioMysql,
        insc_fin: finMysql,
        mensaje_cerrado: mensajeCerrado.trim() || "La inscripción está cerrada. Consultá Secretaría.",
        activo: 1,
      });

      setIdConfig(Number(data?.id_config || idConfig || 0));
      setActivo(1);
      setToast({ tipo: "ok", texto: data?.mensaje || "Configuración guardada correctamente." });
      return true;
    } catch (error) {
      setToast({ tipo: "error", texto: error.message || "No se pudo guardar la configuración." });
      return false;
    } finally {
      setGuardando(false);
    }
  }, [validar, idConfig, titulo, inicioMysql, finMysql, mensajeCerrado]);

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
