// src/components/Mesas_examen/hooks/useMesasExamen.js
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  crearArmadoInicialMesas,
  crearGruposFinalesMesas,
  eliminarBorradorMesas,
  listarMesasGruposFinales,
  listarMesasNoAgrupadas,
  obtenerParametrosArmadoMesas,
} from "../api/mesasExamenApi";

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
        const response = await crearArmadoInicialMesas(payload);
        const responseGrupos = await crearGruposFinalesMesas({
          limpiar_grupos: true,
          min_numeros: 2,
          max_numeros: 4,
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
