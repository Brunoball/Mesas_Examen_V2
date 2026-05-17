// src/components/Mesas_examen/hooks/useMesasExamen.js
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  crearArmadoInicialMesas,
  crearGruposFinalesMesas,
  eliminarBorradorMesas,
  eliminarMesaEdicion,
  guardarProgramacionMesa,
  listarMesasGruposFinales,
  listarMesasNoAgrupadas,
  moverPreviaMesa,
  eliminarPreviaMesa,
  obtenerDestinosMoverPrevia,
  obtenerMesaEdicion,
  obtenerParametrosArmadoMesas,
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

const normalizar = (valor) => String(valor || "").toLowerCase().trim();

const grupoCoincideConBusqueda = (grupo, texto) => {
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

  if (valoresGrupo.some((valor) => normalizar(valor).includes(texto))) {
    return true;
  }

  const docentes = Array.isArray(grupo.docentes) ? grupo.docentes : [];
  const materias = Array.isArray(grupo.materias) ? grupo.materias : [];

  if (docentes.some((item) => normalizar(item?.nombre).includes(texto))) {
    return true;
  }

  if (materias.some((item) => normalizar(item?.nombre).includes(texto))) {
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

    if (valoresNumero.some((valor) => normalizar(valor).includes(texto))) {
      return true;
    }

    const alumnos = Array.isArray(numero.alumnos) ? numero.alumnos : [];

    return alumnos.some((alumno) => {
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
        alumno.condicion,
        alumno.estado,
        alumno.observacion,
        alumno.tipo_mesa,
        alumno.numero_mesa,
      ];

      return valoresAlumno.some((valor) => normalizar(valor).includes(texto));
    });
  });
};

export const useMesasExamen = () => {
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

  const [modalPreviasAbierto, setModalPreviasAbierto] = useState(false);
  const [numeroPersona, setNumeroPersona] = useState(null);
  const [previasPersona, setPreviasPersona] = useState(null);
  const [cargandoPrevias, setCargandoPrevias] = useState(false);
  const [errorPersona, setErrorPersona] = useState("");

  const [modalMoverAbierto, setModalMoverAbierto] = useState(false);
  const [previaMover, setPreviaMover] = useState(null);
  const [destinosMover, setDestinosMover] = useState(null);
  const [cargandoDestinos, setCargandoDestinos] = useState(false);
  const [errorMover, setErrorMover] = useState("");
  const [moviendo, setMoviendo] = useState(false);

  const [modalEliminarAbierto, setModalEliminarAbierto] = useState(false);
  const [previaEliminar, setPreviaEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);

  const [cargando, setCargando] = useState(false);
  const [armando, setArmando] = useState(false);
  const [agrupando, setAgrupando] = useState(false);
  const [error, setError] = useState("");

  const cargarMesas = useCallback(async () => {
    setCargando(true);
    setError("");

    try {
      const [responseGrupos, responseNoAgrupadas] = await Promise.all([
        listarMesasGruposFinales({ busqueda: "" }),
        listarMesasNoAgrupadas({ busqueda: "" }),
      ]);

      setGruposFinales(responseGrupos.data || []);
      setNoAgrupadas(responseNoAgrupadas.data || []);
    } catch (err) {
      setError(err.message || "Error al cargar las mesas finales.");
      setGruposFinales([]);
      setNoAgrupadas([]);
    } finally {
      setCargando(false);
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

      await cargarMesas();
      setTab("grupos-finales");

      return response;
    } catch (err) {
      setError(err.message || "Error al generar los grupos finales.");
      throw err;
    } finally {
      setAgrupando(false);
    }
  }, [cargarMesas]);

  const crearMesas = useCallback(
    async (payload) => {
      setArmando(true);
      setError("");
      setResumenArmado(null);

      try {
        const tipoArmado = payload?.tipo_armado || "area";
        const response = await crearArmadoInicialMesas(payload);
        const responseGrupos = await crearGruposFinalesMesas({
          limpiar_grupos: true,
          min_numeros: 2,
          max_numeros: 4,
          tipo_armado: tipoArmado,
        });

        setResumenArmado({
          ...(response.data || {}),
          grupos_finales: responseGrupos.data || null,
        });
        setModalCrearAbierto(false);
        setTab("grupos-finales");

        await cargarMesas();

        return response;
      } catch (err) {
        setError(err.message || "Error al crear el armado de mesas.");
        throw err;
      } finally {
        setArmando(false);
      }
    },
    [cargarMesas]
  );

  const eliminarBorrador = useCallback(async () => {
    const confirmar = window.confirm(
      "¿Seguro que querés eliminar el armado actual? Esta acción borra mesas, grupos finales y no agrupadas."
    );

    if (!confirmar) {
      return;
    }

    setArmando(true);
    setError("");
    setResumenArmado(null);

    try {
      const response = await eliminarBorradorMesas();

      setResumenArmado({
        eliminadas: response?.data?.eliminadas || 0,
        grupos_eliminados: response?.data?.grupos_eliminados || 0,
        no_agrupadas_eliminadas: response?.data?.no_agrupadas_eliminadas || 0,
      });

      await cargarMesas();
    } catch (err) {
      setError(err.message || "Error al eliminar el armado actual.");
    } finally {
      setArmando(false);
    }
  }, [cargarMesas]);


  const cargarSlotsEdicion = useCallback(async ({ item = grupoEdicion, tipo = tipoEdicion, anio, mes, fecha_inicio, fecha_fin } = {}) => {
    if (!item) return null;

    const tipoReal = tipo === "no_agrupada" ? "no_agrupada" : "grupo";
    const mesBase = obtenerMesBaseEdicion(item, anio, mes);
    const fechaInicioValida = normalizarFechaEdicion(fecha_inicio);
    const fechaFinValida = normalizarFechaEdicion(fecha_fin);

    setCargandoSlotsEdicion(true);

    try {
      const response = await obtenerSlotsValidosMesa({
        tipo: tipoReal,
        id_grupo: item?.id_grupo || item?.numero_grupo || null,
        numero_grupo: item?.numero_grupo || item?.id_grupo || null,
        id_no_agrupada: item?.id_no_agrupada || null,
        numero_mesa: item?.numero_mesa || item?.numeros?.[0]?.numero_mesa || null,
        anio: mesBase.anio,
        mes: mesBase.mes,
        fecha_inicio: fechaInicioValida || undefined,
        fecha_fin: fechaFinValida || undefined,
      });

      const data = response?.data || null;
      setSlotsEdicion(data);
      return data;
    } catch (err) {
      setSlotsEdicion(null);
      setErrorEdicion(err.message || "Error al obtener fechas y turnos disponibles.");
      return null;
    } finally {
      setCargandoSlotsEdicion(false);
    }
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
      await cargarSlotsEdicion({ item: grupoRecibido, tipo: tipoRecibido });
    } catch (err) {
      setErrorEdicion(err.message || "Error al abrir la mesa para edición.");
    } finally {
      setCargandoEdicion(false);
    }
  }, [cargarSlotsEdicion]);

  const cerrarModalEditar = useCallback(() => {
    if (guardandoEdicion) return;
    setModalEditarAbierto(false);
    setGrupoEdicion(null);
    setErrorEdicion("");
    setSlotsEdicion(null);
    setModalPreviasAbierto(false);
    setNumeroPersona(null);
    setPreviasPersona(null);
    setModalMoverAbierto(false);
    setPreviaMover(null);
    setDestinosMover(null);
    setModalEliminarAbierto(false);
    setPreviaEliminar(null);
  }, [guardandoEdicion]);

  const refrescarGrupoEdicionActual = useCallback(async ({ item = grupoEdicion, tipo = tipoEdicion } = {}) => {
    if (!item) return null;

    const tipoReal = tipo === "no_agrupada" ? "no_agrupada" : "grupo";
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

    if (grupoRecibido) {
      await cargarSlotsEdicion({ item: grupoRecibido, tipo: tipoRecibido });
    }

    return grupoRecibido;
  }, [grupoEdicion, tipoEdicion, cargarSlotsEdicion]);

  const cargarPreviasNumero = useCallback(async (numero) => {
    const numeroMesa = Number(numero?.numero_mesa || numero);
    if (!numeroMesa) {
      setErrorPersona("No se pudo identificar el número de mesa.");
      return null;
    }

    setCargandoPrevias(true);
    setErrorPersona("");

    try {
      const response = await obtenerPreviasNumeroMesa({ numero_mesa: numeroMesa });
      const data = response?.data || null;
      setPreviasPersona(data);
      return data;
    } catch (err) {
      setPreviasPersona(null);
      setErrorPersona(err.message || "Error al obtener las previas de la mesa.");
      return null;
    } finally {
      setCargandoPrevias(false);
    }
  }, []);

  const abrirPreviasNumero = useCallback(async (numero) => {
    setNumeroPersona(numero || null);
    setPreviasPersona(null);
    setErrorPersona("");
    setModalPreviasAbierto(true);
    await cargarPreviasNumero(numero);
  }, [cargarPreviasNumero]);

  const cerrarPrevias = useCallback(() => {
    if (moviendo || eliminando) return;
    setModalPreviasAbierto(false);
    setNumeroPersona(null);
    setPreviasPersona(null);
    setErrorPersona("");
    setModalMoverAbierto(false);
    setPreviaMover(null);
    setDestinosMover(null);
    setModalEliminarAbierto(false);
    setPreviaEliminar(null);
  }, [moviendo, eliminando]);

  const abrirMover = useCallback(async (previa) => {
    const numeroMesa = Number(previa?.numero_mesa || numeroPersona?.numero_mesa || 0);
    const idPrevia = Number(previa?.id_previa || 0);

    setPreviaMover(previa || null);
    setDestinosMover(null);
    setErrorMover("");
    setModalMoverAbierto(true);

    if (!numeroMesa || !idPrevia) {
      setErrorMover("No se pudo identificar la previa a mover.");
      return;
    }

    setCargandoDestinos(true);
    try {
      const response = await obtenerDestinosMoverPrevia({
        numero_mesa: numeroMesa,
        id_previa: idPrevia,
      });
      setDestinosMover(response?.data || null);
    } catch (err) {
      setDestinosMover(null);
      setErrorMover(err.message || "Error al obtener los destinos disponibles.");
    } finally {
      setCargandoDestinos(false);
    }
  }, [numeroPersona]);

  const cerrarMover = useCallback(() => {
    if (moviendo) return;
    setModalMoverAbierto(false);
    setPreviaMover(null);
    setDestinosMover(null);
    setErrorMover("");
  }, [moviendo]);

  const confirmarMover = useCallback(async (destino) => {
    const numeroOrigen = Number(previaMover?.numero_mesa || numeroPersona?.numero_mesa || 0);
    const idPrevia = Number(previaMover?.id_previa || 0);
    const numeroDestino = Number(destino?.numero_mesa || 0);

    if (!numeroOrigen || !idPrevia || !numeroDestino) {
      setErrorMover("No se pudo identificar el movimiento solicitado.");
      return;
    }

    setMoviendo(true);
    setErrorMover("");

    try {
      await moverPreviaMesa({
        numero_origen: numeroOrigen,
        numero_mesa: numeroOrigen,
        id_previa: idPrevia,
        numero_destino: numeroDestino,
      });

      setModalMoverAbierto(false);
      setPreviaMover(null);
      setDestinosMover(null);

      await cargarPreviasNumero(numeroOrigen);
      await refrescarGrupoEdicionActual();
      await cargarMesas();
    } catch (err) {
      const errores = Array.isArray(err?.errores) ? err.errores.join(" ") : "";
      setErrorMover(errores || err.message || "No se pudo mover la previa.");
    } finally {
      setMoviendo(false);
    }
  }, [previaMover, numeroPersona, cargarPreviasNumero, refrescarGrupoEdicionActual, cargarMesas]);

  const abrirEliminar = useCallback((previa) => {
    setPreviaEliminar(previa || null);
    setModalEliminarAbierto(true);
  }, []);

  const cerrarEliminar = useCallback(() => {
    if (eliminando) return;
    setModalEliminarAbierto(false);
    setPreviaEliminar(null);
  }, [eliminando]);

  const confirmarEliminar = useCallback(async () => {
    const numeroMesa = Number(previaEliminar?.numero_mesa || numeroPersona?.numero_mesa || 0);
    const idPrevia = Number(previaEliminar?.id_previa || 0);

    if (!numeroMesa || !idPrevia) {
      setErrorPersona("No se pudo identificar la previa a eliminar.");
      return;
    }

    setEliminando(true);
    setErrorPersona("");

    try {
      await eliminarPreviaMesa({ numero_mesa: numeroMesa, id_previa: idPrevia });
      setModalEliminarAbierto(false);
      setPreviaEliminar(null);

      await cargarPreviasNumero(numeroMesa);
      await refrescarGrupoEdicionActual();
      await cargarMesas();
    } catch (err) {
      setErrorPersona(err.message || "No se pudo eliminar la previa de la mesa.");
    } finally {
      setEliminando(false);
    }
  }, [previaEliminar, numeroPersona, cargarPreviasNumero, refrescarGrupoEdicionActual, cargarMesas]);

  const personaEdicion = useMemo(() => ({
    modalPreviasAbierto,
    numeroPersona,
    previasPersona,
    cargandoPrevias,
    errorPersona,
    abrirPreviasNumero,
    cerrarPrevias,

    modalMoverAbierto,
    previaMover,
    destinosMover,
    cargandoDestinos,
    errorMover,
    moviendo,
    abrirMover,
    cerrarMover,
    confirmarMover,

    modalEliminarAbierto,
    previaEliminar,
    eliminando,
    abrirEliminar,
    cerrarEliminar,
    confirmarEliminar,
  }), [
    modalPreviasAbierto, numeroPersona, previasPersona, cargandoPrevias, errorPersona, abrirPreviasNumero, cerrarPrevias,
    modalMoverAbierto, previaMover, destinosMover, cargandoDestinos, errorMover, moviendo, abrirMover, cerrarMover, confirmarMover,
    modalEliminarAbierto, previaEliminar, eliminando, abrirEliminar, cerrarEliminar, confirmarEliminar,
  ]);

  const guardarEdicionProgramacion = useCallback(async (payload) => {
    setGuardandoEdicion(true);
    setErrorEdicion("");

    try {
      const response = await guardarProgramacionMesa(payload);
      setGrupoEdicion(response?.data?.grupo || null);
      await cargarMesas();
      setModalEditarAbierto(false);
      return response;
    } catch (err) {
      setErrorEdicion(err.message || "Error al guardar los cambios de la mesa.");
      throw err;
    } finally {
      setGuardandoEdicion(false);
    }
  }, [cargarMesas]);

  const eliminarMesaDesdeEdicion = useCallback(async (payload) => {
    const tipoTexto = payload?.tipo === "no_agrupada" ? "este número sin agrupar" : "este grupo final";
    const confirmar = window.confirm(`¿Seguro que querés eliminar ${tipoTexto}?`);

    if (!confirmar) return;

    setGuardandoEdicion(true);
    setErrorEdicion("");

    try {
      const response = await eliminarMesaEdicion(payload);
      await cargarMesas();
      setModalEditarAbierto(false);
      setGrupoEdicion(null);
      return response;
    } catch (err) {
      setErrorEdicion(err.message || "Error al eliminar la mesa.");
      throw err;
    } finally {
      setGuardandoEdicion(false);
    }
  }, [cargarMesas]);

  useEffect(() => {
    cargarMesas();
    cargarParametrosArmado();
  }, [cargarMesas, cargarParametrosArmado]);

  const gruposFiltrados = useMemo(() => {
    const texto = normalizar(busqueda);
    const base = tab === "no-agrupadas" ? [...noAgrupadas] : [...gruposFinales];

    if (!texto) {
      return base;
    }

    return base.filter((item) => grupoCoincideConBusqueda(item, texto));
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
    eliminarMesaDesdeEdicion,
    personaEdicion,

    crearMesas,
    eliminarBorrador,
    generarGruposFinales,

    cargarMesas,

    cargando,
    armando,
    agrupando,
    error,
  };
};
