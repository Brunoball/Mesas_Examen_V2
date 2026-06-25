// src/components/Mesas_examen/hooks/useMesasExamen.js
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  agregarPreviaMas,
  aplicarCambioDocenteMesa,
  confirmarAgregarNumeroGrupo,
  crearArmadoInicialMesas,
  crearGruposFinalesMesas,
  crearGrupoUnicoNoAgrupada,
  eliminarBorradorMesas,
  eliminarMesaEdicion,
  eliminarNumeroGrupoEdicion,
  eliminarPreviaMesa,
  eliminarSlotExtraGrupo,
  eliminarTodosHistorialesMesas,
  guardarNotaPreviaMesa,
  guardarProgramacionMesa,
  ignorarCambioDocenteMesa,
  habilitarSlotExtraGrupo,
  listarHistorialMesas,
  listarCambiosDocenteMesasPendientes,
  obtenerDetalleHistorialArmado,
  obtenerExportacionHistorialMesas,
  listarMesasGruposFinales,
  listarMesasNoAgrupadas,
  moverNumeroMesaGrupo,
  moverPreviaMesa,
  obtenerDestinosMoverNumero,
  obtenerDestinosMoverPrevia,
  obtenerOpcionesAgregarNumeroGrupo,
  obtenerMesaEdicion,
  obtenerParametrosArmadoMesas,
  obtenerPreviasDisponiblesMas,
  obtenerPreviasNumeroMesa,
  obtenerSlotsValidosMesa,
} from "../api/mesasExamenApi";

const normalizarFechaEdicion = (valor) => {
  const texto = String(valor || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) return texto.slice(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(texto)) {
    const [dia, mes, anio] = texto.split("/");
    return `${anio}-${mes}-${dia}`;
  }
  return "";
};

const obtenerMesBaseEdicion = (item, anio, mes) => {
  const anioNum = Number(anio);
  const mesNum = Number(mes);

  if (anioNum > 1900 && mesNum >= 1 && mesNum <= 12) {
    return { anio: anioNum, mes: mesNum };
  }

  const fechaItem = normalizarFechaEdicion(item?.fecha_mesa || item?.fecha);
  if (fechaItem) {
    const [anioFecha, mesFecha] = fechaItem.split("-").map(Number);
    if (anioFecha > 1900 && mesFecha >= 1 && mesFecha <= 12) {
      return { anio: anioFecha, mes: mesFecha };
    }
  }

  const ahora = new Date();
  return { anio: ahora.getFullYear(), mes: ahora.getMonth() + 1 };
};

const normalizar = (valor) =>
  String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const normalizarBusquedaFlexible = (valor) =>
  normalizar(valor)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const obtenerFiltroBusqueda = (valor) => {
  const texto = normalizarBusquedaFlexible(valor);
  if (!texto) return { modo: "vacio", texto: "", palabras: [] };

  const palabras = texto.split(" ").filter(Boolean);
  return {
    modo: palabras.length > 1 ? "frase" : "palabra",
    texto: palabras.join(" "),
    palabras,
  };
};

const crearClaveSlotsEdicion = ({ tipo, item, anio, mes, fecha_inicio, fecha_fin } = {}) => {
  const tipoReal = tipo === "no_agrupada" ? "no_agrupada" : "grupo";
  const idGrupo = item?.id_grupo || item?.numero_grupo || "";
  const idNoAgrupada = item?.id_no_agrupada || "";
  const numeroMesa = item?.numero_mesa || item?.numeros?.[0]?.numero_mesa || "";
  return [tipoReal, idGrupo, idNoAgrupada, numeroMesa, anio || "", mes || "", fecha_inicio || "", fecha_fin || ""].join("|");
};


const esNumeroTallerEdicion = (numero) => {
  const tipo = String(numero?.tipo_mesa || numero?.tipo_numero || numero?.tipo || "").toLowerCase();
  return tipo.includes("taller") || Number(numero?.prioridad || numero?.prioridad_numero || 0) === 1;
};

const recalcularGrupoConSlotsExtra = (grupo, slotsExtraForzado) => {
  if (!grupo) return grupo;

  const numeros = Array.isArray(grupo.numeros) ? grupo.numeros : [];
  const cantidadNumeros = numeros.length || Number(grupo.cantidad_numeros || 0) || 0;
  const slotsExtra = Math.max(0, Number(slotsExtraForzado ?? grupo.slots_extra ?? 0));
  const baseBackend = Number(grupo.capacidad_base_slots || 0);
  const tiposTexto = String(grupo.tipos_mesa_texto || grupo.tipo_mesa || "").toLowerCase();
  const esTaller = !!grupo.es_grupo_taller || tiposTexto.includes("taller") || numeros.some(esNumeroTallerEdicion);
  const capacidadBase = baseBackend > 0 ? baseBackend : (esTaller ? 1 : 4);
  const capacidadSlots = Math.max(cantidadNumeros, capacidadBase + slotsExtra);

  return {
    ...grupo,
    slots_extra: slotsExtra,
    capacidad_base_slots: capacidadBase,
    capacidad_slots: capacidadSlots,
    slots_libres: Math.max(0, capacidadSlots - cantidadNumeros),
  };
};

const coincideValorBusqueda = (valor, filtro) => {
  if (!filtro?.texto) return true;
  return normalizarBusquedaFlexible(valor).includes(filtro.texto);
};

const grupoCoincideConBusqueda = (grupo, filtro) => {
  if (!filtro?.texto) return true;

  const valoresGrupo = [
    grupo.id_grupo,
    grupo.id_no_agrupada,
    grupo.mesa_final_texto,
    grupo.fecha,
    grupo.fecha_mesa,
    grupo.turno,
    grupo.area,
    grupo.estado,
    grupo.observacion,
    grupo.motivo,
    grupo.numeros_mesa_texto,
    grupo.tipos_mesa_texto,
    grupo.cantidad_numeros,
    grupo.cantidad_alumnos,
    grupo.cantidad_previas,
    grupo.docente,
    grupo.materia,
  ];

  if (valoresGrupo.some((valor) => coincideValorBusqueda(valor, filtro))) {
    return true;
  }

  const docentes = Array.isArray(grupo.docentes) ? grupo.docentes : [];
  const materias = Array.isArray(grupo.materias) ? grupo.materias : [];

  if (docentes.some((item) => coincideValorBusqueda(item?.nombre, filtro))) {
    return true;
  }

  if (materias.some((item) => coincideValorBusqueda(item?.nombre, filtro))) {
    return true;
  }

  const numeros = Array.isArray(grupo.numeros) ? grupo.numeros : [];

  return numeros.some((numero) => {
    const valoresNumero = [
      numero.numero_mesa,
      numero.numero_mesa_texto,
      numero.tipo_mesa,
      numero.prioridad,
      numero.cantidad_alumnos,
      numero.docente,
      numero.materia,
      numero.observacion,
    ];

    if (valoresNumero.some((valor) => coincideValorBusqueda(valor, filtro))) {
      return true;
    }

    const alumnos = Array.isArray(numero.alumnos) ? numero.alumnos : [];

    return alumnos.some((alumno) => {
      const cursoAlumno = [alumno.curso, alumno.division_alumno].filter(Boolean).join(" ");
      const cursoMateria = [alumno.curso_materia, alumno.division_materia].filter(Boolean).join(" ");
      const valoresAlumno = [
        alumno.estudiante,
        alumno.alumno,
        alumno.dni,
        alumno.materia,
        alumno.docente,
        alumno.curso,
        alumno.curso_alumno,
        alumno.division_alumno,
        alumno.curso_materia,
        alumno.division_materia,
        cursoAlumno,
        cursoMateria,
        alumno.condicion,
        alumno.estado,
        alumno.observacion,
        alumno.tipo_mesa,
        alumno.numero_mesa,
      ];

      return valoresAlumno.some((valor) => coincideValorBusqueda(valor, filtro));
    });
  });
};

export const useMesasExamen = ({ onToast } = {}) => {
  const [busqueda, setBusqueda] = useState("");
  const [tab, setTab] = useState("grupos-finales");

  const [gruposFinales, setGruposFinales] = useState([]);
  const [noAgrupadas, setNoAgrupadas] = useState([]);

  const [parametrosArmado, setParametrosArmado] = useState(null);
  const [resumenArmado, setResumenArmado] = useState(null);

  const [modalCrearAbierto, setModalCrearAbierto] = useState(false);
  const [modalEditarAbierto, setModalEditarAbierto] = useState(false);
  const [grupoEdicion, setGrupoEdicion] = useState(null);
  const [tipoEdicion, setTipoEdicion] = useState("grupo");
  const [cargandoEdicion, setCargandoEdicion] = useState(false);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState("");
  const [slotsEdicion, setSlotsEdicion] = useState(null);
  const [cargandoSlotsEdicion, setCargandoSlotsEdicion] = useState(false);
  const [habilitandoSlotExtra, setHabilitandoSlotExtra] = useState(false);
  const [eliminandoSlotExtra, setEliminandoSlotExtra] = useState(false);
  const slotsInflightKeyRef = useRef("");
  const slotsInflightPromiseRef = useRef(null);

  const [modalPreviasPersonaAbierto, setModalPreviasPersonaAbierto] = useState(false);
  const [numeroPersona, setNumeroPersona] = useState(null);
  const [previasPersona, setPreviasPersona] = useState(null);
  const [cargandoPreviasPersona, setCargandoPreviasPersona] = useState(false);
  const [errorPersona, setErrorPersona] = useState("");

  const [modalMoverPersonaAbierto, setModalMoverPersonaAbierto] = useState(false);
  const [previaPersonaSeleccionada, setPreviaPersonaSeleccionada] = useState(null);
  const [destinosPersona, setDestinosPersona] = useState(null);
  const [cargandoDestinosPersona, setCargandoDestinosPersona] = useState(false);
  const [moviendoPersona, setMoviendoPersona] = useState(false);
  const [errorMoverPersona, setErrorMoverPersona] = useState("");

  const [modalEliminarPersonaAbierto, setModalEliminarPersonaAbierto] = useState(false);
  const [previaPersonaEliminar, setPreviaPersonaEliminar] = useState(null);
  const [eliminandoPersona, setEliminandoPersona] = useState(false);

  const [modalMasAbierto, setModalMasAbierto] = useState(false);
  const [numeroMas, setNumeroMas] = useState(null);
  const [previasMas, setPreviasMas] = useState(null);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [agregandoMas, setAgregandoMas] = useState(false);
  const [errorMas, setErrorMas] = useState("");

  const [modalFlechasAbierto, setModalFlechasAbierto] = useState(false);
  const [numeroFlechas, setNumeroFlechas] = useState(null);
  const [destinosFlechas, setDestinosFlechas] = useState(null);
  const [cargandoDestinosFlechas, setCargandoDestinosFlechas] = useState(false);
  const [moviendoFlechas, setMoviendoFlechas] = useState(false);
  const [errorFlechas, setErrorFlechas] = useState("");
  const moviendoFlechasRef = useRef(false);

  const [modalEliminarEdicionAbierto, setModalEliminarEdicionAbierto] = useState(false);
  const [targetEliminarEdicion, setTargetEliminarEdicion] = useState(null);
  const [eliminandoEdicion, setEliminandoEdicion] = useState(false);

  const [modalAgregarNumeroAbierto, setModalAgregarNumeroAbierto] = useState(false);
  const [grupoAgregarNumero, setGrupoAgregarNumero] = useState(null);
  const [opcionesAgregarNumero, setOpcionesAgregarNumero] = useState(null);
  const [cargandoAgregarNumero, setCargandoAgregarNumero] = useState(false);
  const [agregandoNumero, setAgregandoNumero] = useState(false);
  const [errorAgregarNumero, setErrorAgregarNumero] = useState("");

  const [cargando, setCargando] = useState(false);
  const [armando, setArmando] = useState(false);
  const [agrupando, setAgrupando] = useState(false);
  const [error, setError] = useState("");

  const [modalEliminarArmadoAbierto, setModalEliminarArmadoAbierto] = useState(false);
  const [eliminandoArmado, setEliminandoArmado] = useState(false);
  const [guardandoNotas, setGuardandoNotas] = useState({});

  const [cambiosDocentePendientes, setCambiosDocentePendientes] = useState([]);
  const [modalCambiosDocenteAbierto, setModalCambiosDocenteAbierto] = useState(false);
  const [cargandoCambiosDocente, setCargandoCambiosDocente] = useState(false);
  const [resolviendoCambioDocenteId, setResolviendoCambioDocenteId] = useState(null);
  const [ignorandoCambioDocenteId, setIgnorandoCambioDocenteId] = useState(null);

  const [historialResultados, setHistorialResultados] = useState([]);
  const [historialArmados, setHistorialArmados] = useState([]);
  const [historialResumen, setHistorialResumen] = useState(null);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [historialPrimeraCargaPendiente, setHistorialPrimeraCargaPendiente] = useState(true);
  const [errorHistorial, setErrorHistorial] = useState("");
  const [historialDetalleArmado, setHistorialDetalleArmado] = useState(null);
  const [cargandoDetalleHistorial, setCargandoDetalleHistorial] = useState(false);
  const [eliminandoTodosHistoriales, setEliminandoTodosHistoriales] = useState(false);
  const historialCargadoRef = useRef(false);
  const historialPrimeraCargaPendienteRef = useRef(true);

  const resumenArmadoTimerRef = useRef(null);

  const mostrarToast = useCallback((tipo = "exito", mensaje = "Operación realizada con éxito.", duracion = 2800) => {
    if (typeof onToast === "function") {
      onToast(tipo, mensaje, duracion);
    }
  }, [onToast]);

  const limpiarTimerResumenArmado = useCallback(() => {
    if (resumenArmadoTimerRef.current) {
      clearTimeout(resumenArmadoTimerRef.current);
      resumenArmadoTimerRef.current = null;
    }
  }, []);

  const ocultarResumenArmadoLuego = useCallback((duracion = 6500) => {
    limpiarTimerResumenArmado();
    resumenArmadoTimerRef.current = window.setTimeout(() => {
      setResumenArmado(null);
      resumenArmadoTimerRef.current = null;
    }, duracion);
  }, [limpiarTimerResumenArmado]);

  useEffect(() => limpiarTimerResumenArmado, [limpiarTimerResumenArmado]);

  const cerrarModalesInternosEdicion = useCallback(() => {
    setModalPreviasPersonaAbierto(false);
    setNumeroPersona(null);
    setPreviasPersona(null);
    setErrorPersona("");

    setModalMoverPersonaAbierto(false);
    setPreviaPersonaSeleccionada(null);
    setDestinosPersona(null);
    setErrorMoverPersona("");

    setModalEliminarPersonaAbierto(false);
    setPreviaPersonaEliminar(null);

    setModalMasAbierto(false);
    setNumeroMas(null);
    setPreviasMas(null);
    setErrorMas("");

    setModalFlechasAbierto(false);
    setNumeroFlechas(null);
    setDestinosFlechas(null);
    setErrorFlechas("");

    setModalAgregarNumeroAbierto(false);
    setGrupoAgregarNumero(null);
    setOpcionesAgregarNumero(null);
    setErrorAgregarNumero("");
  }, []);

  const cargarCambiosDocentePendientes = useCallback(async ({ abrirModal = true } = {}) => {
    setCargandoCambiosDocente(true);

    try {
      const response = await listarCambiosDocenteMesasPendientes();
      const data = Array.isArray(response?.data) ? response.data : [];
      setCambiosDocentePendientes(data);

      if (abrirModal && data.length > 0) {
        setModalCambiosDocenteAbierto(true);
      }

      return data;
    } catch (err) {
      setCambiosDocentePendientes([]);
      return [];
    } finally {
      setCargandoCambiosDocente(false);
    }
  }, []);

  const cargarMesas = useCallback(async ({ silencioso = false } = {}) => {
    if (!silencioso) {
      setCargando(true);
    }
    setError("");

    try {
      const [responseGrupos, responseNoAgrupadas, responseCambiosDocente] = await Promise.all([
        listarMesasGruposFinales({ busqueda: "" }),
        listarMesasNoAgrupadas({ busqueda: "" }),
        listarCambiosDocenteMesasPendientes().catch(() => ({ data: [] })),
      ]);

      setGruposFinales(responseGrupos.data || []);
      setNoAgrupadas(responseNoAgrupadas.data || []);

      const cambios = Array.isArray(responseCambiosDocente?.data) ? responseCambiosDocente.data : [];
      setCambiosDocentePendientes(cambios);
      if (cambios.length > 0 && !silencioso) {
        setModalCambiosDocenteAbierto(true);
      }
    } catch (err) {
      setError(err.message || "Error al cargar las mesas finales.");
      setGruposFinales([]);
      setNoAgrupadas([]);
    } finally {
      if (!silencioso) {
        setCargando(false);
      }
    }
  }, []);

  const cargarParametrosArmado = useCallback(async () => {
    setError("");

    try {
      const response = await obtenerParametrosArmadoMesas();
      setParametrosArmado(response.data || null);
      return response.data || null;
    } catch (err) {
      setError(err.message || "Error al obtener los parámetros de armado.");
      return null;
    }
  }, []);

  const cargarHistorial = useCallback(async (busquedaHistorial = "", { mostrarSkeleton = true } = {}) => {
    const debeMostrarSkeleton = mostrarSkeleton && !historialCargadoRef.current && historialPrimeraCargaPendienteRef.current;

    if (debeMostrarSkeleton) {
      setCargandoHistorial(true);
    }

    setErrorHistorial("");

    try {
      const response = await listarHistorialMesas({ busqueda: busquedaHistorial });
      const data = response?.data || {};
      setHistorialResultados(Array.isArray(data.resultados) ? data.resultados : []);
      setHistorialArmados(Array.isArray(data.armados) ? data.armados : []);
      setHistorialResumen(data.resumen || null);
      historialCargadoRef.current = true;
      return data;
    } catch (err) {
      setErrorHistorial(err.message || "Error al cargar el historial de mesas.");

      if (!historialCargadoRef.current) {
        setHistorialResultados([]);
        setHistorialArmados([]);
        setHistorialResumen(null);
      }

      return null;
    } finally {
      if (historialPrimeraCargaPendienteRef.current) {
        historialPrimeraCargaPendienteRef.current = false;
        setHistorialPrimeraCargaPendiente(false);
      }

      if (debeMostrarSkeleton) {
        setCargandoHistorial(false);
      }
    }
  }, []);

  const verDetalleHistorialArmado = useCallback(async (idArmadoHistorial) => {
    const id = Number(idArmadoHistorial || 0);
    if (!id) return null;

    setCargandoDetalleHistorial(true);
    setErrorHistorial("");

    try {
      const response = await obtenerDetalleHistorialArmado({ id_armado_historial: id });
      setHistorialDetalleArmado(response?.data || null);
      return response?.data || null;
    } catch (err) {
      setErrorHistorial(err.message || "Error al cargar el detalle del historial.");
      return null;
    } finally {
      setCargandoDetalleHistorial(false);
    }
  }, []);

  const cerrarDetalleHistorialArmado = useCallback(() => {
    setHistorialDetalleArmado(null);
  }, []);

  const obtenerExportacionHistorial = useCallback(async () => {
    setErrorHistorial("");

    try {
      const response = await obtenerExportacionHistorialMesas({ busqueda });
      return response?.data || { armados: [], detalle: [] };
    } catch (err) {
      setErrorHistorial(err.message || "Error al preparar la exportación del historial.");
      throw err;
    }
  }, [busqueda]);

  const eliminarTodosHistoriales = useCallback(async () => {
    if (eliminandoTodosHistoriales) return null;

    setEliminandoTodosHistoriales(true);
    setErrorHistorial("");

    try {
      const response = await eliminarTodosHistorialesMesas();
      setHistorialResultados([]);
      setHistorialArmados([]);
      setHistorialResumen({
        total_resultados: 0,
        total_aprobadas: 0,
        total_desaprobadas: 0,
        total_armados: 0,
      });
      setHistorialDetalleArmado(null);
      historialCargadoRef.current = true;
      historialPrimeraCargaPendienteRef.current = false;
      setHistorialPrimeraCargaPendiente(false);
      return response?.data || null;
    } catch (err) {
      setErrorHistorial(err.message || "Error al eliminar el historial de mesas.");
      throw err;
    } finally {
      setEliminandoTodosHistoriales(false);
    }
  }, [eliminandoTodosHistoriales]);

  const abrirModalCrear = useCallback(async () => {
    const data = await cargarParametrosArmado();

    if (data) {
      setModalCrearAbierto(true);
    }
  }, [cargarParametrosArmado]);

  const cerrarModalCrear = useCallback(() => {
    if (!armando) {
      setModalCrearAbierto(false);
    }
  }, [armando]);

  const generarGruposFinales = useCallback(async () => {
    setAgrupando(true);
    setError("");

    try {
      const response = await crearGruposFinalesMesas({
        limpiar_grupos: true,
        min_numeros: 2,
        max_numeros: 4,
      });

      setResumenArmado((actual) => ({
        ...(actual || {}),
        grupos_finales: response.data || null,
      }));
      ocultarResumenArmadoLuego();

      await cargarMesas();
      setTab("grupos-finales");
      mostrarToast("exito", "Grupos finales generados con éxito.");

      return response;
    } catch (err) {
      setError(err.message || "Error al generar los grupos finales.");
      throw err;
    } finally {
      setAgrupando(false);
    }
  }, [cargarMesas, mostrarToast, ocultarResumenArmadoLuego]);

  const crearMesas = useCallback(
    async (payload) => {
      setArmando(true);
      setError("");
      limpiarTimerResumenArmado();
      setResumenArmado(null);

      try {
        const response = await crearArmadoInicialMesas(payload);
        const datosArmado = response.data || {};

        setResumenArmado({
          ...datosArmado,
          grupos_finales: datosArmado.fase_6_grupos_finales || datosArmado.grupos_finales || null,
        });
        ocultarResumenArmadoLuego();
        setModalCrearAbierto(false);
        setTab("grupos-finales");

        await cargarMesas();
        mostrarToast("exito", "Armado de mesas creado con éxito.");

        return response;
      } catch (err) {
        setError(err.message || "Error al crear el armado de mesas.");
        throw err;
      } finally {
        setArmando(false);
      }
    },
    [cargarMesas, mostrarToast, ocultarResumenArmadoLuego, limpiarTimerResumenArmado]
  );

  const abrirConfirmarEliminarArmado = useCallback(() => {
    if (armando || agrupando || eliminandoArmado) return;
    setModalEliminarArmadoAbierto(true);
  }, [armando, agrupando, eliminandoArmado]);

  const cerrarConfirmarEliminarArmado = useCallback(() => {
    if (eliminandoArmado) return;
    setModalEliminarArmadoAbierto(false);
  }, [eliminandoArmado]);

  const confirmarEliminarArmado = useCallback(async ({ guardarHistorial = true, guardar_historial } = {}) => {
    if (eliminandoArmado) return null;

    const debeGuardarHistorial = guardar_historial !== undefined
      ? !!guardar_historial
      : !!guardarHistorial;

    setArmando(true);
    setEliminandoArmado(true);
    setError("");
    limpiarTimerResumenArmado();
    setResumenArmado(null);

    try {
      const response = await eliminarBorradorMesas({
        guardar_historial: debeGuardarHistorial,
      });

      await cargarMesas();
      setModalEliminarArmadoAbierto(false);
      mostrarToast(
        "exito",
        debeGuardarHistorial
          ? "Mesas eliminadas con éxito. El historial del armado fue guardado."
          : "Mesas eliminadas con éxito. No se guardó historial del armado."
      );
      return response;
    } catch (err) {
      const mensaje = err.message || "Error al eliminar las mesas.";
      setError(mensaje);
      throw err;
    } finally {
      setArmando(false);
      setEliminandoArmado(false);
    }
  }, [cargarMesas, mostrarToast, eliminandoArmado, limpiarTimerResumenArmado]);

  const eliminarBorrador = abrirConfirmarEliminarArmado;


  const cargarSlotsEdicion = useCallback(async ({ item = grupoEdicion, tipo = tipoEdicion, anio, mes, fecha_inicio, fecha_fin } = {}) => {
    if (!item) return null;

    const tipoReal = tipo === "no_agrupada" ? "no_agrupada" : "grupo";
    const mesBase = obtenerMesBaseEdicion(item, anio, mes);
    const fechaInicioValida = normalizarFechaEdicion(fecha_inicio);
    const fechaFinValida = normalizarFechaEdicion(fecha_fin);
    const claveRequest = crearClaveSlotsEdicion({
      tipo: tipoReal,
      item,
      anio: mesBase.anio,
      mes: mesBase.mes,
      fecha_inicio: fechaInicioValida,
      fecha_fin: fechaFinValida,
    });

    // Evita duplicar la misma validación cuando React ejecuta efectos dos veces en desarrollo
    // o cuando el calendario vuelve a pedir el mismo mes antes de que termine la consulta anterior.
    if (slotsInflightKeyRef.current === claveRequest && slotsInflightPromiseRef.current) {
      return slotsInflightPromiseRef.current;
    }

    setCargandoSlotsEdicion(true);

    const requestPromise = obtenerSlotsValidosMesa({
      tipo: tipoReal,
      id_grupo: item?.id_grupo || item?.numero_grupo || null,
      numero_grupo: item?.numero_grupo || item?.id_grupo || null,
      id_no_agrupada: item?.id_no_agrupada || null,
      numero_mesa: item?.numero_mesa || item?.numeros?.[0]?.numero_mesa || null,
      anio: mesBase.anio,
      mes: mesBase.mes,
      fecha_inicio: fechaInicioValida || undefined,
      fecha_fin: fechaFinValida || undefined,
    })
      .then((response) => {
        const data = response?.data || null;
        if (slotsInflightKeyRef.current === claveRequest) {
          setSlotsEdicion(data);
        }
        return data;
      })
      .catch((err) => {
        if (slotsInflightKeyRef.current === claveRequest) {
          setSlotsEdicion(null);
          setErrorEdicion(err.message || "Error al obtener fechas y turnos disponibles.");
        }
        return null;
      })
      .finally(() => {
        if (slotsInflightKeyRef.current === claveRequest) {
          slotsInflightKeyRef.current = "";
          slotsInflightPromiseRef.current = null;
          setCargandoSlotsEdicion(false);
        }
      });

    slotsInflightKeyRef.current = claveRequest;
    slotsInflightPromiseRef.current = requestPromise;

    return requestPromise;
  }, [grupoEdicion, tipoEdicion]);

  const abrirModalEditar = useCallback(async (item, tipo = "grupo") => {
    const tipoReal = tipo === "no_agrupada" ? "no_agrupada" : "grupo";
    setModalEditarAbierto(true);
    setGrupoEdicion(item || null);
    setTipoEdicion(tipoReal);
    setCargandoEdicion(true);
    setErrorEdicion("");
    setSlotsEdicion(null);

    try {
      const response = await obtenerMesaEdicion({
        tipo: tipoReal,
        id_grupo: item?.id_grupo || item?.numero_grupo || null,
        numero_grupo: item?.numero_grupo || item?.id_grupo || null,
        id_no_agrupada: item?.id_no_agrupada || null,
        numero_mesa: item?.numero_mesa || item?.numeros?.[0]?.numero_mesa || null,
      });

      const grupoRecibido = response?.data?.grupo || item || null;
      const tipoRecibido = response?.data?.tipo || tipoReal;
      setGrupoEdicion(grupoRecibido);
      setTipoEdicion(tipoRecibido);
      // No se cargan los slots acá para evitar dos validaciones iguales.
      // El calendario los pide una sola vez al montarse y muestra el análisis en segundo plano.
    } catch (err) {
      setErrorEdicion(err.message || "Error al abrir la mesa para edición.");
    } finally {
      setCargandoEdicion(false);
    }
  }, []);

  const cerrarModalEditar = useCallback(() => {
    if (guardandoEdicion) return;
    setModalEditarAbierto(false);
    setGrupoEdicion(null);
    setErrorEdicion("");
    setSlotsEdicion(null);
    setHabilitandoSlotExtra(false);
    slotsInflightKeyRef.current = "";
    slotsInflightPromiseRef.current = null;
    setModalPreviasPersonaAbierto(false);
    setModalMoverPersonaAbierto(false);
    setModalEliminarPersonaAbierto(false);
    setModalMasAbierto(false);
    setNumeroPersona(null);
    setPreviasPersona(null);
    setPreviaPersonaSeleccionada(null);
    setPreviaPersonaEliminar(null);
    setNumeroMas(null);
    setPreviasMas(null);
    setErrorMas("");
    setModalFlechasAbierto(false);
    setNumeroFlechas(null);
    setDestinosFlechas(null);
    setErrorFlechas("");
    setModalAgregarNumeroAbierto(false);
    setGrupoAgregarNumero(null);
    setOpcionesAgregarNumero(null);
    setErrorAgregarNumero("");
  }, [guardandoEdicion]);


  const recargarGrupoEdicion = useCallback(async () => {
    if (!grupoEdicion) return null;

    const tipoReal = tipoEdicion === "no_agrupada" ? "no_agrupada" : "grupo";

    try {
      const response = await obtenerMesaEdicion({
        tipo: tipoReal,
        id_grupo: grupoEdicion?.id_grupo || grupoEdicion?.numero_grupo || null,
        numero_grupo: grupoEdicion?.numero_grupo || grupoEdicion?.id_grupo || null,
        id_no_agrupada: grupoEdicion?.id_no_agrupada || null,
        numero_mesa: grupoEdicion?.numero_mesa || grupoEdicion?.numeros?.[0]?.numero_mesa || null,
      });

      const grupoActualizado = response?.data?.grupo || grupoEdicion;
      const tipoActualizado = response?.data?.tipo || tipoReal;
      setGrupoEdicion(grupoActualizado);
      setTipoEdicion(tipoActualizado);
      await cargarSlotsEdicion({ item: grupoActualizado, tipo: tipoActualizado });
      await cargarMesas();
      return grupoActualizado;
    } catch (_) {
      await cargarMesas();
      return null;
    }
  }, [grupoEdicion, tipoEdicion, cargarSlotsEdicion, cargarMesas]);

  const cargarPreviasPersona = useCallback(async (numeroMesa) => {
    const numero = Number(numeroMesa || numeroPersona?.numero_mesa || numeroPersona);
    if (!numero) return null;

    setCargandoPreviasPersona(true);
    setErrorPersona("");

    try {
      const response = await obtenerPreviasNumeroMesa({ numero_mesa: numero });
      const data = response?.data || null;
      setPreviasPersona(data);
      setNumeroPersona(data?.meta || { numero_mesa: numero });
      return data;
    } catch (err) {
      setPreviasPersona(null);
      setErrorPersona(err.message || "Error al obtener las previas de la mesa.");
      return null;
    } finally {
      setCargandoPreviasPersona(false);
    }
  }, [numeroPersona]);

  const abrirPreviasPersona = useCallback(async (numero) => {
    const numeroMesa = Number(numero?.numero_mesa || numero);
    if (!numeroMesa) return;

    setModalPreviasPersonaAbierto(true);
    setNumeroPersona({ ...(numero || {}), numero_mesa: numeroMesa });
    setPreviasPersona(null);
    setErrorPersona("");
    await cargarPreviasPersona(numeroMesa);
  }, [cargarPreviasPersona]);

  const cerrarPreviasPersona = useCallback(() => {
    if (moviendoPersona || eliminandoPersona) return;
    setModalPreviasPersonaAbierto(false);
    setNumeroPersona(null);
    setPreviasPersona(null);
    setErrorPersona("");
  }, [moviendoPersona, eliminandoPersona]);

  const abrirMoverPersona = useCallback(async (previa) => {
    const numeroMesa = Number(previa?.numero_mesa || numeroPersona?.numero_mesa || numeroPersona);
    const idPrevia = Number(previa?.id_previa);
    if (!numeroMesa || !idPrevia) return;

    setModalMoverPersonaAbierto(true);
    setPreviaPersonaSeleccionada({ ...previa, numero_mesa: numeroMesa });
    setDestinosPersona(null);
    setErrorMoverPersona("");
    setCargandoDestinosPersona(true);

    try {
      const response = await obtenerDestinosMoverPrevia({ numero_mesa: numeroMesa, id_previa: idPrevia });
      setDestinosPersona(response?.data || null);
    } catch (err) {
      setErrorMoverPersona(err.message || "Error al obtener destinos disponibles.");
    } finally {
      setCargandoDestinosPersona(false);
    }
  }, [numeroPersona]);

  const cerrarMoverPersona = useCallback(() => {
    if (moviendoPersona) return;
    setModalMoverPersonaAbierto(false);
    setPreviaPersonaSeleccionada(null);
    setDestinosPersona(null);
    setErrorMoverPersona("");
  }, [moviendoPersona]);

  const confirmarMoverPersona = useCallback(async (destino) => {
    const numeroOrigen = Number(previaPersonaSeleccionada?.numero_mesa || numeroPersona?.numero_mesa || numeroPersona);
    const idPrevia = Number(previaPersonaSeleccionada?.id_previa);
    const numeroDestino = Number(destino?.numero_mesa || destino);

    if (!numeroOrigen || !idPrevia || !numeroDestino) return;

    setMoviendoPersona(true);
    setErrorMoverPersona("");

    try {
      const response = await moverPreviaMesa({
        numero_origen: numeroOrigen,
        id_previa: idPrevia,
        numero_destino: numeroDestino,
      });

      cerrarModalesInternosEdicion();
      await recargarGrupoEdicion();
      mostrarToast("exito", "Previa movida con éxito.");
      return response;
    } catch (err) {
      setErrorMoverPersona(err.message || "No se pudo mover la previa.");
      return null;
    } finally {
      setMoviendoPersona(false);
    }
  }, [previaPersonaSeleccionada, numeroPersona, recargarGrupoEdicion, cerrarModalesInternosEdicion, mostrarToast]);

  const abrirEliminarPersona = useCallback((previa) => {
    const numeroMesa = Number(previa?.numero_mesa || numeroPersona?.numero_mesa || numeroPersona);
    if (!numeroMesa || !previa?.id_previa) return;

    setPreviaPersonaEliminar({ ...previa, numero_mesa: numeroMesa });
    setModalEliminarPersonaAbierto(true);
  }, [numeroPersona]);

  const cerrarEliminarPersona = useCallback(() => {
    if (eliminandoPersona) return;
    setModalEliminarPersonaAbierto(false);
    setPreviaPersonaEliminar(null);
  }, [eliminandoPersona]);

  const confirmarEliminarPersona = useCallback(async () => {
    const numeroMesa = Number(previaPersonaEliminar?.numero_mesa || numeroPersona?.numero_mesa || numeroPersona);
    const idPrevia = Number(previaPersonaEliminar?.id_previa);

    if (!numeroMesa || !idPrevia) return;

    setEliminandoPersona(true);
    setErrorPersona("");

    try {
      const response = await eliminarPreviaMesa({ numero_mesa: numeroMesa, id_previa: idPrevia });
      cerrarModalesInternosEdicion();
      await recargarGrupoEdicion();
      mostrarToast("exito", "Estudiante quitado de la mesa con éxito.");
      return response;
    } catch (err) {
      setErrorPersona(err.message || "No se pudo quitar la previa del número de mesa.");
      throw err;
    } finally {
      setEliminandoPersona(false);
    }
  }, [previaPersonaEliminar, numeroPersona, recargarGrupoEdicion, cerrarModalesInternosEdicion, mostrarToast]);


  const cargarPreviasMas = useCallback(async (numeroMesa) => {
    const numero = Number(numeroMesa?.numero_mesa || numeroMesa || numeroMas?.numero_mesa || numeroMas);
    if (!numero) return null;

    setCargandoMas(true);
    setErrorMas("");

    try {
      const response = await obtenerPreviasDisponiblesMas({ numero_mesa: numero });
      const data = response?.data || null;
      setPreviasMas(data);
      setNumeroMas(data?.meta || { numero_mesa: numero });
      return data;
    } catch (err) {
      setPreviasMas(null);
      setErrorMas(err.message || "Error al obtener previas disponibles para agregar.");
      return null;
    } finally {
      setCargandoMas(false);
    }
  }, [numeroMas]);

  const abrirMasNumero = useCallback(async (numero) => {
    const numeroMesa = Number(numero?.numero_mesa || numero);
    if (!numeroMesa) return;

    setModalMasAbierto(true);
    setNumeroMas({ ...(typeof numero === "object" ? numero : {}), numero_mesa: numeroMesa });
    setPreviasMas(null);
    setErrorMas("");
    await cargarPreviasMas(numeroMesa);
  }, [cargarPreviasMas]);

  const cerrarMasNumero = useCallback(() => {
    if (agregandoMas) return;
    setModalMasAbierto(false);
    setNumeroMas(null);
    setPreviasMas(null);
    setErrorMas("");
  }, [agregandoMas]);

  const confirmarAgregarMas = useCallback(async (previasSeleccionadas) => {
    const numeroMesa = Number(numeroMas?.numero_mesa || numeroMas);
    const previas = Array.isArray(previasSeleccionadas) ? previasSeleccionadas : [previasSeleccionadas];
    const idsPrevias = Array.from(new Set(
      previas
        .map((previa) => Number(previa?.id_previa || previa))
        .filter((id) => Number.isFinite(id) && id > 0)
    ));

    if (!numeroMesa || idsPrevias.length === 0) return null;

    setAgregandoMas(true);
    setErrorMas("");

    try {
      const response = await agregarPreviaMas({ numero_mesa: numeroMesa, id_previas: idsPrevias });
      cerrarModalesInternosEdicion();
      await recargarGrupoEdicion();
      mostrarToast(
        "exito",
        idsPrevias.length === 1
          ? "Estudiante agregado a la mesa con éxito."
          : `${idsPrevias.length} estudiantes agregados a la mesa con éxito.`
      );
      return response;
    } catch (err) {
      setErrorMas(err.message || "No se pudieron agregar las previas a la mesa.");
      return null;
    } finally {
      setAgregandoMas(false);
    }
  }, [numeroMas, recargarGrupoEdicion, cerrarModalesInternosEdicion, mostrarToast]);

  const abrirMoverNumeroFlechas = useCallback(async (numero) => {
    const numeroMesa = Number(numero?.numero_mesa || numero);
    if (!numeroMesa) return;

    setModalFlechasAbierto(true);
    setNumeroFlechas({ ...(typeof numero === "object" ? numero : {}), numero_mesa: numeroMesa });
    setDestinosFlechas(null);
    setErrorFlechas("");
    setCargandoDestinosFlechas(true);

    try {
      const response = await obtenerDestinosMoverNumero({ numero_mesa: numeroMesa });
      setDestinosFlechas(response?.data || null);
      setNumeroFlechas(response?.data?.meta || { ...(typeof numero === "object" ? numero : {}), numero_mesa: numeroMesa });
    } catch (err) {
      setErrorFlechas(err.message || "Error al obtener grupos destino disponibles.");
    } finally {
      setCargandoDestinosFlechas(false);
    }
  }, []);

  const cerrarMoverNumeroFlechas = useCallback(() => {
    if (moviendoFlechas) return;
    setModalFlechasAbierto(false);
    setNumeroFlechas(null);
    setDestinosFlechas(null);
    setErrorFlechas("");
  }, [moviendoFlechas]);

  const confirmarMoverNumeroFlechas = useCallback(async (destino) => {
    const numeroMesa = Number(numeroFlechas?.numero_mesa || numeroFlechas);
    const numeroGrupoDestino = Number(destino?.numero_grupo || destino?.id_grupo || destino);

    if (!numeroMesa || !numeroGrupoDestino) return null;

    // El setState no bloquea instantaneamente un doble click. Este ref evita que
    // salgan dos POST iguales y que el segundo vuelva con 422 aunque el primero
    // ya haya movido correctamente la mesa.
    if (moviendoFlechasRef.current) return null;
    moviendoFlechasRef.current = true;

    setMoviendoFlechas(true);
    setErrorFlechas("");

    try {
      const response = await moverNumeroMesaGrupo({
        numero_mesa: numeroMesa,
        numero_grupo_destino: numeroGrupoDestino,
      });

      setModalFlechasAbierto(false);
      setNumeroFlechas(null);
      setDestinosFlechas(null);

      const grupoDestino = response?.data?.grupo_destino || null;
      if (grupoDestino) {
        setModalEditarAbierto(true);
        setGrupoEdicion(grupoDestino);
        setTipoEdicion("grupo");
        await cargarSlotsEdicion({ item: grupoDestino, tipo: "grupo" });
        await cargarMesas();
      } else {
        const grupoActualizado = await recargarGrupoEdicion();
        if (!grupoActualizado) {
          setModalEditarAbierto(false);
          setGrupoEdicion(null);
        }
      }

      mostrarToast("exito", response?.data?.sin_cambios ? "La mesa ya estaba en ese grupo." : "Mesa movida con éxito.");
      return response;
    } catch (err) {
      // Recuperación defensiva: en este flujo el backend viejo podía mover la mesa
      // y aun así devolver 422 por una segunda validación. Antes de mostrar error,
      // verificamos si el número ya quedó dentro del grupo destino.
      try {
        const verificacion = await obtenerMesaEdicion({
          tipo: "grupo",
          id_grupo: numeroGrupoDestino,
          numero_grupo: numeroGrupoDestino,
          numero_mesa: numeroMesa,
        });

        const grupoVerificado = verificacion?.data?.grupo || null;
        const numeros = Array.isArray(grupoVerificado?.numeros) ? grupoVerificado.numeros : [];
        const yaEstaMovido = numeros.some((num) => Number(num?.numero_mesa) === numeroMesa);

        if (yaEstaMovido) {
          setModalFlechasAbierto(false);
          setNumeroFlechas(null);
          setDestinosFlechas(null);
          setErrorFlechas("");
          setModalEditarAbierto(true);
          setGrupoEdicion(grupoVerificado);
          setTipoEdicion("grupo");
          await cargarSlotsEdicion({ item: grupoVerificado, tipo: "grupo" });
          await cargarMesas();
          mostrarToast("exito", "Mesa movida con éxito.");
          return { exito: true, recuperado: true, data: { grupo_destino: grupoVerificado } };
        }
      } catch (_) {
        // Si la verificación también falla, ahí sí mostramos el error original abajo.
      }

      const erroresBackend = Array.isArray(err?.data?.errores) ? err.data.errores : [];
      const detalle = erroresBackend.length ? ` ${erroresBackend.join(" ")}` : "";
      setErrorFlechas((err.message || "No se pudo mover el número de mesa.") + detalle);
      return null;
    } finally {
      moviendoFlechasRef.current = false;
      setMoviendoFlechas(false);
    }
  }, [numeroFlechas, recargarGrupoEdicion, cargarSlotsEdicion, cargarMesas, mostrarToast]);


  const cargarOpcionesAgregarNumero = useCallback(async (grupoDestino = grupoAgregarNumero) => {
    const numeroGrupo = Number(grupoDestino?.numero_grupo || grupoDestino?.id_grupo || 0);
    if (!numeroGrupo) return null;

    setCargandoAgregarNumero(true);
    setErrorAgregarNumero("");

    try {
      const response = await obtenerOpcionesAgregarNumeroGrupo({
        numero_grupo: numeroGrupo,
        id_grupo: numeroGrupo,
      });
      const data = response?.data || null;
      setOpcionesAgregarNumero(data);
      setGrupoAgregarNumero(data?.meta || { ...(grupoDestino || {}), numero_grupo: numeroGrupo, id_grupo: numeroGrupo });
      return data;
    } catch (err) {
      setOpcionesAgregarNumero(null);
      setErrorAgregarNumero(err.message || "Error al obtener opciones para agregar un número.");
      return null;
    } finally {
      setCargandoAgregarNumero(false);
    }
  }, [grupoAgregarNumero]);

  const abrirAgregarNumeroGrupo = useCallback(async (grupoDestino = grupoEdicion) => {
    const numeroGrupo = Number(grupoDestino?.numero_grupo || grupoDestino?.id_grupo || grupoEdicion?.numero_grupo || grupoEdicion?.id_grupo || 0);
    if (!numeroGrupo) return;

    const base = { ...(grupoDestino || grupoEdicion || {}), numero_grupo: numeroGrupo, id_grupo: numeroGrupo };
    setModalAgregarNumeroAbierto(true);
    setGrupoAgregarNumero(base);
    setOpcionesAgregarNumero(null);
    setErrorAgregarNumero("");
    await cargarOpcionesAgregarNumero(base);
  }, [grupoEdicion, cargarOpcionesAgregarNumero]);

  const cerrarAgregarNumeroGrupo = useCallback(() => {
    if (agregandoNumero) return;
    setModalAgregarNumeroAbierto(false);
    setGrupoAgregarNumero(null);
    setOpcionesAgregarNumero(null);
    setErrorAgregarNumero("");
  }, [agregandoNumero]);

  const confirmarAgregarNumero = useCallback(async (item, tipo = "no_agrupada") => {
    const numeroGrupo = Number(grupoAgregarNumero?.numero_grupo || grupoAgregarNumero?.id_grupo || grupoEdicion?.numero_grupo || grupoEdicion?.id_grupo || 0);
    if (!numeroGrupo) return;

    setAgregandoNumero(true);
    setErrorAgregarNumero("");

    try {
      const response = await confirmarAgregarNumeroGrupo({
        numero_grupo: numeroGrupo,
        id_grupo: numeroGrupo,
        tipo,
        numero_mesa: tipo === "no_agrupada" ? Number(item?.numero_mesa || item) : undefined,
        id_previa: tipo !== "no_agrupada" ? Number(item?.id_previa || item) : undefined,
      });

      await cargarMesas();
      await recargarGrupoEdicion();

      setModalAgregarNumeroAbierto(false);
      setGrupoAgregarNumero(null);
      setOpcionesAgregarNumero(null);
      setErrorAgregarNumero("");

      mostrarToast("exito", tipo === "no_agrupada" ? "Número de mesa agregado al grupo con éxito." : "Previa agregada al grupo con éxito.");
      return response;
    } catch (err) {
      setErrorAgregarNumero(err.message || "No se pudo agregar el número al grupo.");
      throw err;
    } finally {
      setAgregandoNumero(false);
    }
  }, [grupoAgregarNumero, grupoEdicion, cargarMesas, recargarGrupoEdicion, mostrarToast]);


  const habilitarSlotExtraEdicion = useCallback(async (grupoDestino = grupoEdicion) => {
    const numeroGrupo = Number(grupoDestino?.numero_grupo || grupoDestino?.id_grupo || grupoEdicion?.numero_grupo || grupoEdicion?.id_grupo || 0);
    if (!numeroGrupo || habilitandoSlotExtra) return null;

    const grupoBase = grupoDestino || grupoEdicion;
    const slotsExtraAnterior = Math.max(0, Number(grupoBase?.slots_extra || 0));
    const grupoOptimista = recalcularGrupoConSlotsExtra(grupoBase, slotsExtraAnterior + 1);

    // El slot se pinta al instante en el modal. No se espera la recarga de la tabla principal.
    setGrupoEdicion(grupoOptimista);
    setTipoEdicion("grupo");
    setHabilitandoSlotExtra(true);
    setErrorEdicion("");

    try {
      const response = await habilitarSlotExtraGrupo({
        numero_grupo: numeroGrupo,
        id_grupo: numeroGrupo,
      });

      const grupoActualizado = response?.data?.grupo || null;
      const slotsExtraConfirmado = Number(response?.data?.slots_extra ?? grupoActualizado?.slots_extra ?? grupoOptimista?.slots_extra ?? slotsExtraAnterior + 1);

      if (grupoActualizado) {
        setGrupoEdicion(recalcularGrupoConSlotsExtra(grupoActualizado, slotsExtraConfirmado));
      } else {
        setGrupoEdicion((actual) => recalcularGrupoConSlotsExtra(actual, slotsExtraConfirmado));
      }
      setTipoEdicion("grupo");

      // Refresca validaciones y tabla en segundo plano, sin bloquear la aparición del slot.
      cargarSlotsEdicion({ item: recalcularGrupoConSlotsExtra(grupoActualizado || grupoOptimista, slotsExtraConfirmado), tipo: "grupo" });
      cargarMesas();

      mostrarToast("exito", "Nuevo slot habilitado para esta mesa.");
      return response;
    } catch (err) {
      setGrupoEdicion(recalcularGrupoConSlotsExtra(grupoBase, slotsExtraAnterior));
      setErrorEdicion(err.message || "No se pudo habilitar un nuevo slot para esta mesa.");
      throw err;
    } finally {
      setHabilitandoSlotExtra(false);
    }
  }, [grupoEdicion, habilitandoSlotExtra, cargarSlotsEdicion, cargarMesas, mostrarToast]);


  const eliminarSlotExtraEdicion = useCallback(async (grupoDestino = grupoEdicion) => {
    const numeroGrupo = Number(grupoDestino?.numero_grupo || grupoDestino?.id_grupo || grupoEdicion?.numero_grupo || grupoEdicion?.id_grupo || 0);
    if (!numeroGrupo || eliminandoSlotExtra) return null;

    const grupoBase = grupoDestino || grupoEdicion;
    const slotsExtraAnterior = Math.max(0, Number(grupoBase?.slots_extra || 0));
    if (slotsExtraAnterior <= 0) return null;

    const grupoOptimista = recalcularGrupoConSlotsExtra(grupoBase, slotsExtraAnterior - 1);

    // El slot libre se quita al instante del modal. La tabla se refresca en segundo plano.
    setGrupoEdicion(grupoOptimista);
    setTipoEdicion("grupo");
    setEliminandoSlotExtra(true);
    setErrorEdicion("");

    try {
      const response = await eliminarSlotExtraGrupo({
        numero_grupo: numeroGrupo,
        id_grupo: numeroGrupo,
      });

      const grupoActualizado = response?.data?.grupo || null;
      const slotsExtraConfirmado = Number(response?.data?.slots_extra ?? grupoActualizado?.slots_extra ?? grupoOptimista?.slots_extra ?? Math.max(0, slotsExtraAnterior - 1));

      if (grupoActualizado) {
        setGrupoEdicion(recalcularGrupoConSlotsExtra(grupoActualizado, slotsExtraConfirmado));
      } else {
        setGrupoEdicion((actual) => recalcularGrupoConSlotsExtra(actual, slotsExtraConfirmado));
      }
      setTipoEdicion("grupo");

      cargarSlotsEdicion({ item: recalcularGrupoConSlotsExtra(grupoActualizado || grupoOptimista, slotsExtraConfirmado), tipo: "grupo" });
      cargarMesas();

      mostrarToast("exito", "Slot libre eliminado correctamente.");
      return response;
    } catch (err) {
      setGrupoEdicion(recalcularGrupoConSlotsExtra(grupoBase, slotsExtraAnterior));
      setErrorEdicion(err.message || "No se pudo eliminar el slot libre de esta mesa.");
      throw err;
    } finally {
      setEliminandoSlotExtra(false);
    }
  }, [grupoEdicion, eliminandoSlotExtra, cargarSlotsEdicion, cargarMesas, mostrarToast]);


  const guardarEdicionProgramacion = useCallback(async (payload) => {
    setGuardandoEdicion(true);
    setErrorEdicion("");

    try {
      const response = await guardarProgramacionMesa(payload);
      setGrupoEdicion(response?.data?.grupo || null);
      await cargarMesas();
      setModalEditarAbierto(false);
      setGrupoEdicion(null);
      setSlotsEdicion(null);
      mostrarToast("exito", "Mesa editada con éxito.");
      return response;
    } catch (err) {
      setErrorEdicion(err.message || "Error al guardar los cambios de la mesa.");
      throw err;
    } finally {
      setGuardandoEdicion(false);
    }
  }, [cargarMesas, mostrarToast]);


  const crearGrupoUnicoDesdeNoAgrupada = useCallback(async (payload) => {
    setGuardandoEdicion(true);
    setErrorEdicion("");

    try {
      const response = await crearGrupoUnicoNoAgrupada(payload);
      await cargarMesas();
      setGrupoEdicion(response?.data?.grupo || null);
      setTipoEdicion("grupo");
      setTab("grupos-finales");
      setModalEditarAbierto(false);
      setSlotsEdicion(null);
      mostrarToast("exito", "Mesa movida a mesas agrupadas con éxito.");
      return response;
    } catch (err) {
      setErrorEdicion(err.message || "Error al crear el grupo único desde la mesa no agrupada.");
      throw err;
    } finally {
      setGuardandoEdicion(false);
    }
  }, [cargarMesas, mostrarToast]);

  const abrirConfirmarEliminarMesa = useCallback((payload = {}) => {
    const esNoAgrupada = payload?.tipo === "no_agrupada";
    const numeroGrupo = payload?.numero_grupo || payload?.id_grupo || null;
    const numeroMesa = payload?.numero_mesa || null;

    setTargetEliminarEdicion({
      modo: esNoAgrupada ? "no_agrupada" : "grupo",
      tipo: esNoAgrupada ? "no_agrupada" : "grupo",
      id_grupo: payload?.id_grupo || numeroGrupo,
      numero_grupo: numeroGrupo,
      id_no_agrupada: payload?.id_no_agrupada || null,
      numero_mesa: numeroMesa,
      titulo: esNoAgrupada ? `Eliminar mesa N° ${numeroMesa || ""}` : `Eliminar grupo ${numeroGrupo || ""}`,
      mensaje: esNoAgrupada
        ? `¿Eliminar completamente el número de mesa N° ${numeroMesa || ""} del armado?`
        : `¿Eliminar completamente el grupo ${numeroGrupo || ""} de mesas?`,
      advertencia: esNoAgrupada
        ? "Se quitará este número del armado actual."
        : "Los números del grupo no se borran de mesas: pasarán a no agrupadas para poder reubicarlos.",
      details: [
        { label: "Acción", value: esNoAgrupada ? "Eliminar número sin agrupar" : "Eliminar grupo completo" },
        { label: "Grupo", value: esNoAgrupada ? "Sin agrupar" : numeroGrupo },
        { label: "Número de mesa", value: numeroMesa || payload?.numeros_mesa_texto || "Todos los números del grupo" },
      ],
    });
    setModalEliminarEdicionAbierto(true);
  }, []);

  const abrirConfirmarEliminarNumeroGrupo = useCallback((numero) => {
    const numeroMesa = Number(numero?.numero_mesa || numero);
    const numeroGrupo = Number(grupoEdicion?.numero_grupo || grupoEdicion?.id_grupo || 0);

    if (!numeroMesa || !numeroGrupo) return;

    setTargetEliminarEdicion({
      modo: "numero_grupo",
      tipo: "grupo",
      numero_grupo: numeroGrupo,
      id_grupo: numeroGrupo,
      numero_mesa: numeroMesa,
      numero,
      grupo: grupoEdicion,
      titulo: `Quitar mesa N° ${numeroMesa}`,
      mensaje: `¿Quitar el número de mesa N° ${numeroMesa} de este grupo?`,
      advertencia: "Los registros de la tabla mesas quedan intactos. El número pasará a no agrupadas para poder reubicarlo.",
      details: [
        { label: "Acción", value: "Quitar número del grupo" },
        { label: "Grupo actual", value: numeroGrupo },
        { label: "Número de mesa", value: numeroMesa },
        { label: "Materia", value: numero?.materia || "-" },
        { label: "Docente", value: numero?.docente || "-" },
      ],
    });
    setModalEliminarEdicionAbierto(true);
  }, [grupoEdicion]);

  const cerrarConfirmarEliminarEdicion = useCallback(() => {
    if (eliminandoEdicion) return;
    setModalEliminarEdicionAbierto(false);
    setTargetEliminarEdicion(null);
  }, [eliminandoEdicion]);

  const confirmarEliminarEdicion = useCallback(async () => {
    if (!targetEliminarEdicion) return;

    setEliminandoEdicion(true);
    setGuardandoEdicion(true);
    setErrorEdicion("");

    try {
      let response;

      if (targetEliminarEdicion.modo === "numero_grupo") {
        response = await eliminarNumeroGrupoEdicion({
          numero_grupo: targetEliminarEdicion.numero_grupo,
          id_grupo: targetEliminarEdicion.id_grupo,
          numero_mesa: targetEliminarEdicion.numero_mesa,
        });

        await cargarMesas();

        const grupoRespuesta = response?.data?.grupo || null;
        const grupoEliminado = !!response?.data?.grupo_eliminado;

        if (grupoEliminado || !grupoRespuesta) {
          setModalEditarAbierto(false);
          setGrupoEdicion(null);
        } else {
          setGrupoEdicion(grupoRespuesta);
        }
      } else {
        response = await eliminarMesaEdicion(targetEliminarEdicion);
        await cargarMesas();
        setModalEditarAbierto(false);
        setGrupoEdicion(null);
      }

      setModalEliminarEdicionAbierto(false);
      setTargetEliminarEdicion(null);
      mostrarToast(
        "exito",
        targetEliminarEdicion.modo === "numero_grupo"
          ? "Número de mesa quitado del grupo con éxito."
          : targetEliminarEdicion.modo === "no_agrupada"
            ? "Mesa no agrupada eliminada con éxito."
            : "Grupo de mesas eliminado con éxito."
      );
      return response;
    } catch (err) {
      setErrorEdicion(err.message || "Error al eliminar la mesa.");
      throw err;
    } finally {
      setEliminandoEdicion(false);
      setGuardandoEdicion(false);
    }
  }, [targetEliminarEdicion, cargarMesas, mostrarToast]);

  const guardarNotaAlumno = useCallback(async ({ alumno, nota } = {}) => {
    const idPrevia = Number(alumno?.id_previa || 0);
    const idMesa = Number(alumno?.id_mesa || 0);
    const numeroMesa = Number(alumno?.numero_mesa || 0);
    const notaNum = Number(nota || 0);

    if (!idPrevia || notaNum < 1 || notaNum > 10) {
      mostrarToast("error", "Seleccioná una nota válida del 1 al 10.", 3200);
      return null;
    }

    const key = `${idPrevia}-${idMesa || numeroMesa || "mesa"}`;
    setGuardandoNotas((actual) => ({ ...actual, [key]: true }));

    try {
      const response = await guardarNotaPreviaMesa({
        id_previa: idPrevia,
        id_mesa: idMesa || undefined,
        numero_mesa: numeroMesa || undefined,
        nota: notaNum,
      });

      const idsAfectadas = Array.isArray(response?.data?.ids_previas_afectadas)
        ? response.data.ids_previas_afectadas.map((id) => Number(id))
        : [idPrevia];

      const aplicarNotaLocal = (lista = []) => lista.map((grupo) => ({
        ...grupo,
        numeros: Array.isArray(grupo.numeros) ? grupo.numeros.map((numero) => ({
          ...numero,
          alumnos: Array.isArray(numero.alumnos) ? numero.alumnos.map((item) => (
            idsAfectadas.includes(Number(item?.id_previa || 0)) ? { ...item, nota: notaNum } : item
          )) : numero.alumnos,
        })) : grupo.numeros,
        alumnos: Array.isArray(grupo.alumnos) ? grupo.alumnos.map((item) => (
          idsAfectadas.includes(Number(item?.id_previa || 0)) ? { ...item, nota: notaNum } : item
        )) : grupo.alumnos,
      }));

      if (!response?.data?.aprobado) {
        setGruposFinales((actual) => aplicarNotaLocal(actual));
        setNoAgrupadas((actual) => aplicarNotaLocal(actual));
      }

      await cargarMesas({ silencioso: true });

      if (modalEditarAbierto && grupoEdicion) {
        await recargarGrupoEdicion();
      }

      const aprobado = !!response?.data?.aprobado;
      mostrarToast(
        "exito",
        aprobado
          ? "Nota guardada: previa aprobada y dada de baja."
          : "Nota guardada en historial. La previa sigue pendiente."
      );

      return response;
    } catch (err) {
      mostrarToast("error", err.message || "No se pudo guardar la nota.", 3800);
      throw err;
    } finally {
      setGuardandoNotas((actual) => {
        const nuevo = { ...actual };
        delete nuevo[key];
        return nuevo;
      });
    }
  }, [cargarMesas, grupoEdicion, modalEditarAbierto, recargarGrupoEdicion, mostrarToast]);

  const cerrarModalCambiosDocente = useCallback(() => {
    setModalCambiosDocenteAbierto(false);
  }, []);

  const abrirModalCambiosDocente = useCallback(async () => {
    // Siempre vuelve a consultar la tabla temporal para no mostrar datos viejos.
    return cargarCambiosDocentePendientes({ abrirModal: true });
  }, [cargarCambiosDocentePendientes]);

  const abrirMesaDesdeCambioDocente = useCallback(async (cambio = {}) => {
    const numeroMesa = Number(cambio?.numero_mesa || 0);
    if (!numeroMesa) return null;

    const numeroGrupo = Number(cambio?.numero_grupo || 0);
    const item = numeroGrupo > 0
      ? gruposFinales.find((grupo) => Number(grupo?.numero_grupo || grupo?.id_grupo || 0) === numeroGrupo)
      : noAgrupadas.find((mesa) => Number(mesa?.numero_mesa || mesa?.numeros?.[0]?.numero_mesa || 0) === numeroMesa);

    if (numeroGrupo > 0) {
      setTab("grupos-finales");
      await abrirModalEditar(item || { numero_grupo: numeroGrupo, id_grupo: numeroGrupo }, "grupo");
    } else {
      setTab("no-agrupadas");
      await abrirModalEditar(item || { numero_mesa: numeroMesa }, "no_agrupada");
    }

    setModalCambiosDocenteAbierto(false);
    return item || null;
  }, [abrirModalEditar, gruposFinales, noAgrupadas]);

  const aplicarCambioDocentePendiente = useCallback(async (cambio = {}) => {
    const idCambio = Number(cambio?.id_cambio || 0);
    if (!idCambio) return null;

    setResolviendoCambioDocenteId(idCambio);

    try {
      const response = await aplicarCambioDocenteMesa({ id_cambio: idCambio });
      await cargarMesas({ silencioso: true });
      await cargarCambiosDocentePendientes({ abrirModal: false });

      const data = response?.data || {};
      const tipo = data?.tipo === "no_agrupada" ? "no_agrupada" : "grupo";
      const grupo = data?.grupo || null;
      const target = data?.target || {};

      if (tipo === "no_agrupada") {
        setTab("no-agrupadas");
        await abrirModalEditar(grupo || { id_no_agrupada: target?.id_no_agrupada, numero_mesa: target?.numero_mesa || cambio?.numero_mesa }, "no_agrupada");
      } else {
        setTab("grupos-finales");
        await abrirModalEditar(grupo || { id_grupo: target?.id_grupo || target?.numero_grupo || cambio?.numero_grupo, numero_grupo: target?.numero_grupo || cambio?.numero_grupo }, "grupo");
      }

      setModalCambiosDocenteAbierto(false);
      mostrarToast("exito", "Cambio de docente aplicado. Revisá si la mesa debe reubicarse.", 3600);
      return response;
    } catch (err) {
      mostrarToast("error", err.message || "No se pudo aplicar el cambio de docente.", 4200);
      throw err;
    } finally {
      setResolviendoCambioDocenteId(null);
    }
  }, [abrirModalEditar, cargarCambiosDocentePendientes, cargarMesas, mostrarToast]);

  const ignorarCambioDocentePendiente = useCallback(async (cambio = {}) => {
    const idCambio = Number(cambio?.id_cambio || 0);
    if (!idCambio) return null;

    setIgnorandoCambioDocenteId(idCambio);

    try {
      const response = await ignorarCambioDocenteMesa({ id_cambio: idCambio });
      const pendientes = await cargarCambiosDocentePendientes({ abrirModal: false });
      if (pendientes.length === 0) {
        setModalCambiosDocenteAbierto(false);
      }
      mostrarToast("exito", "Aviso de cambio de docente ignorado.", 2800);
      return response;
    } catch (err) {
      mostrarToast("error", err.message || "No se pudo ignorar el aviso.", 3800);
      throw err;
    } finally {
      setIgnorandoCambioDocenteId(null);
    }
  }, [cargarCambiosDocentePendientes, mostrarToast]);

  const eliminarMesaDesdeEdicion = abrirConfirmarEliminarMesa;

  useEffect(() => {
    cargarMesas();
    cargarParametrosArmado();
    cargarCambiosDocentePendientes({ abrirModal: true });
  }, [cargarMesas, cargarParametrosArmado, cargarCambiosDocentePendientes]);

  useEffect(() => {
    if (tab !== "historial") return;

    const esPrimeraCargaHistorial = !historialCargadoRef.current && historialPrimeraCargaPendienteRef.current;

    if (esPrimeraCargaHistorial) {
      cargarHistorial(busqueda, { mostrarSkeleton: true });
      return;
    }

    const timer = window.setTimeout(() => {
      cargarHistorial(busqueda, { mostrarSkeleton: false });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [tab, busqueda, cargarHistorial]);

  const gruposFiltrados = useMemo(() => {
    const filtro = obtenerFiltroBusqueda(busqueda);
    const base = tab === "no-agrupadas" ? [...noAgrupadas] : tab === "historial" ? [] : [...gruposFinales];

    if (!filtro.texto) {
      return base;
    }

    return base.filter((item) => grupoCoincideConBusqueda(item, filtro));
  }, [busqueda, gruposFinales, noAgrupadas, tab]);

  const totalGrupos = gruposFinales.length;
  const totalNoAgrupadas = noAgrupadas.length;

  const totalNumerosAgrupados = useMemo(() => {
    return gruposFinales.reduce(
      (total, item) => total + (Array.isArray(item.numeros) ? item.numeros.length : Number(item.cantidad_numeros || 0)),
      0
    );
  }, [gruposFinales]);

  const totalAlumnos = useMemo(() => {
    return gruposFinales.reduce((total, item) => total + Number(item.cantidad_previas || item.cantidad_alumnos || 0), 0);
  }, [gruposFinales]);

  return {
    busqueda,
    setBusqueda,

    tab,
    setTab,

    gruposFinales,
    noAgrupadas,
    mesas: gruposFinales,
    mesasFiltradas: gruposFiltrados,

    totalGrupos,
    totalNoAgrupadas,
    totalNumerosAgrupados,
    totalAlumnos,

    parametrosArmado,
    resumenArmado,

    modalCrearAbierto,
    abrirModalCrear,
    cerrarModalCrear,

    modalEditarAbierto,
    grupoEdicion,
    tipoEdicion,
    cargandoEdicion,
    guardandoEdicion,
    errorEdicion,
    slotsEdicion,
    cargandoSlotsEdicion,
    cargarSlotsEdicion,
    abrirModalEditar,
    cerrarModalEditar,
    guardarEdicionProgramacion,
    crearGrupoUnicoDesdeNoAgrupada,
    eliminarMesaDesdeEdicion,

    eliminarArmado: {
      modalAbierto: modalEliminarArmadoAbierto,
      eliminando: eliminandoArmado,
      abrir: abrirConfirmarEliminarArmado,
      cerrar: cerrarConfirmarEliminarArmado,
      confirmar: confirmarEliminarArmado,
    },

    eliminarEdicion: {
      modalAbierto: modalEliminarEdicionAbierto,
      target: targetEliminarEdicion,
      eliminando: eliminandoEdicion,
      abrirEliminarNumeroGrupo: abrirConfirmarEliminarNumeroGrupo,
      cerrar: cerrarConfirmarEliminarEdicion,
      confirmar: confirmarEliminarEdicion,
    },

    personaEdicion: {
      modalPreviasAbierto: modalPreviasPersonaAbierto,
      numeroPersona,
      previasPersona,
      cargandoPrevias: cargandoPreviasPersona,
      errorPersona,
      abrirPreviasNumero: abrirPreviasPersona,
      cerrarPrevias: cerrarPreviasPersona,

      modalMoverAbierto: modalMoverPersonaAbierto,
      previaMover: previaPersonaSeleccionada,
      destinosMover: destinosPersona,
      cargandoDestinos: cargandoDestinosPersona,
      moviendo: moviendoPersona,
      errorMover: errorMoverPersona,
      abrirMover: abrirMoverPersona,
      cerrarMover: cerrarMoverPersona,
      confirmarMover: confirmarMoverPersona,

      modalEliminarAbierto: modalEliminarPersonaAbierto,
      previaEliminar: previaPersonaEliminar,
      eliminando: eliminandoPersona,
      abrirEliminar: abrirEliminarPersona,
      cerrarEliminar: cerrarEliminarPersona,
      confirmarEliminar: confirmarEliminarPersona,
    },

    masEdicion: {
      modalAbierto: modalMasAbierto,
      numeroMas,
      previasMas,
      cargando: cargandoMas,
      agregando: agregandoMas,
      error: errorMas,
      abrirAgregarNumero: abrirMasNumero,
      cerrar: cerrarMasNumero,
      confirmarAgregar: confirmarAgregarMas,
    },

    flechasEdicion: {
      modalAbierto: modalFlechasAbierto,
      numeroFlechas,
      destinosFlechas,
      cargando: cargandoDestinosFlechas,
      moviendo: moviendoFlechas,
      error: errorFlechas,
      abrirMoverNumero: abrirMoverNumeroFlechas,
      cerrar: cerrarMoverNumeroFlechas,
      confirmarMover: confirmarMoverNumeroFlechas,
    },

    agregarNumeroEdicion: {
      modalAbierto: modalAgregarNumeroAbierto,
      grupo: grupoAgregarNumero,
      opciones: opcionesAgregarNumero,
      cargando: cargandoAgregarNumero,
      agregando: agregandoNumero,
      error: errorAgregarNumero,
      abrirAgregarNumeroGrupo,
      cerrar: cerrarAgregarNumeroGrupo,
      confirmarAgregar: confirmarAgregarNumero,
      recargar: cargarOpcionesAgregarNumero,
      habilitarSlotExtra: habilitarSlotExtraEdicion,
      eliminarSlotExtra: eliminarSlotExtraEdicion,
      habilitandoSlotExtra,
      eliminandoSlotExtra,
    },

    historial: {
      resultados: historialResultados,
      armados: historialArmados,
      resumen: historialResumen,
      detalleArmado: historialDetalleArmado,
      cargando: cargandoHistorial || (tab === "historial" && historialPrimeraCargaPendiente),
      cargandoDetalle: cargandoDetalleHistorial,
      eliminandoTodos: eliminandoTodosHistoriales,
      error: errorHistorial,
      cargar: () => cargarHistorial(busqueda),
      obtenerExportacion: obtenerExportacionHistorial,
      eliminarTodos: eliminarTodosHistoriales,
      verDetalleArmado: verDetalleHistorialArmado,
      cerrarDetalleArmado: cerrarDetalleHistorialArmado,
    },

    cambiosDocente: {
      pendientes: cambiosDocentePendientes,
      modalAbierto: modalCambiosDocenteAbierto,
      cargando: cargandoCambiosDocente,
      resolviendoId: resolviendoCambioDocenteId,
      ignorandoId: ignorandoCambioDocenteId,
      recargar: cargarCambiosDocentePendientes,
      cerrar: cerrarModalCambiosDocente,
      abrir: abrirModalCambiosDocente,
      abrirMesa: abrirMesaDesdeCambioDocente,
      aplicar: aplicarCambioDocentePendiente,
      ignorar: ignorarCambioDocentePendiente,
    },

    crearMesas,
    eliminarBorrador,
    generarGruposFinales,

    cargarMesas,

    cargando,
    armando,
    agrupando,
    error,

    guardandoNotas,
    guardarNotaAlumno,
  };
};
