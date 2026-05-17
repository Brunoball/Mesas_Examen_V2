// src/components/Mesas_examen/hooks/useMesasExamen.js
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  agregarPreviaMas,
  crearArmadoInicialMesas,
  crearGruposFinalesMesas,
  eliminarBorradorMesas,
  eliminarMesaEdicion,
  eliminarPreviaMesa,
  guardarProgramacionMesa,
  listarMesasGruposFinales,
  listarMesasNoAgrupadas,
  moverNumeroMesaGrupo,
  moverPreviaMesa,
  obtenerDestinosMoverNumero,
  obtenerDestinosMoverPrevia,
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

      setModalMoverPersonaAbierto(false);
      setPreviaPersonaSeleccionada(null);
      setDestinosPersona(null);
      await cargarPreviasPersona(numeroOrigen);
      await recargarGrupoEdicion();
      return response;
    } catch (err) {
      setErrorMoverPersona(err.message || "No se pudo mover la previa.");
      throw err;
    } finally {
      setMoviendoPersona(false);
    }
  }, [previaPersonaSeleccionada, numeroPersona, cargarPreviasPersona, recargarGrupoEdicion]);

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
      setModalEliminarPersonaAbierto(false);
      setPreviaPersonaEliminar(null);
      await cargarPreviasPersona(numeroMesa);
      await recargarGrupoEdicion();
      return response;
    } catch (err) {
      setErrorPersona(err.message || "No se pudo quitar la previa del número de mesa.");
      throw err;
    } finally {
      setEliminandoPersona(false);
    }
  }, [previaPersonaEliminar, numeroPersona, cargarPreviasPersona, recargarGrupoEdicion]);


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

  const confirmarAgregarMas = useCallback(async (previa) => {
    const numeroMesa = Number(numeroMas?.numero_mesa || numeroMas);
    const idPrevia = Number(previa?.id_previa);

    if (!numeroMesa || !idPrevia) return;

    setAgregandoMas(true);
    setErrorMas("");

    try {
      const response = await agregarPreviaMas({ numero_mesa: numeroMesa, id_previa: idPrevia });
      await cargarPreviasMas(numeroMesa);
      await recargarGrupoEdicion();
      return response;
    } catch (err) {
      setErrorMas(err.message || "No se pudo agregar la previa a la mesa.");
      throw err;
    } finally {
      setAgregandoMas(false);
    }
  }, [numeroMas, cargarPreviasMas, recargarGrupoEdicion]);

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

    if (!numeroMesa || !numeroGrupoDestino) return;

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

      const grupoActualizado = await recargarGrupoEdicion();
      if (!grupoActualizado) {
        setModalEditarAbierto(false);
        setGrupoEdicion(null);
      }

      return response;
    } catch (err) {
      setErrorFlechas(err.message || "No se pudo mover el número de mesa.");
      throw err;
    } finally {
      setMoviendoFlechas(false);
    }
  }, [numeroFlechas, recargarGrupoEdicion]);


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
