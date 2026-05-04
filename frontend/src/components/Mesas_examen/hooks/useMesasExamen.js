// src/components/Mesas_examen/hooks/useMesasExamen.js
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  crearArmadoInicialMesas,
  eliminarBorradorMesas,
  listarMesasExamen,
  obtenerParametrosArmadoMesas,
} from "../api/mesasExamenApi";

const normalizar = (valor) => String(valor || "").toLowerCase().trim();

const mesaCoincideConBusqueda = (mesa, texto) => {
  const valoresMesa = [
    mesa.numero_mesa,
    mesa.numero_mesa_texto,
    mesa.fecha,
    mesa.fecha_mesa,
    mesa.turno,
    mesa.materia,
    mesa.curso,
    mesa.docente,
    mesa.estado,
    mesa.observacion,
    mesa.tipo_mesa,
    mesa.cantidad_alumnos,
    mesa.cantidad_alumnos_distintos,
    mesa.cantidad_previas,
  ];

  const coincideMesa = valoresMesa.some((valor) => normalizar(valor).includes(texto));

  if (coincideMesa) {
    return true;
  }

  const materias = Array.isArray(mesa.materias) ? mesa.materias : [];
  const docentes = Array.isArray(mesa.docentes) ? mesa.docentes : [];
  const alumnos = Array.isArray(mesa.alumnos) ? mesa.alumnos : [];

  const coincideMateria = materias.some((item) => normalizar(item?.nombre).includes(texto));
  const coincideDocente = docentes.some((item) => normalizar(item?.nombre).includes(texto));

  if (coincideMateria || coincideDocente) {
    return true;
  }

  return alumnos.some((alumno) => {
    const valoresAlumno = [
      alumno.estudiante,
      alumno.alumno,
      alumno.dni,
      alumno.materia,
      alumno.curso,
      alumno.curso_materia,
      alumno.division_materia,
      alumno.condicion,
      alumno.docente,
      alumno.estado,
      alumno.observacion,
      alumno.tipo_mesa,
    ];

    return valoresAlumno.some((valor) => normalizar(valor).includes(texto));
  });
};

export const useMesasExamen = () => {
  const [busqueda, setBusqueda] = useState("");
  const [tab, setTab] = useState("contador");

  const [mesas, setMesas] = useState([]);
  const [paginacion, setPaginacion] = useState(null);

  const [parametrosArmado, setParametrosArmado] = useState(null);
  const [resumenArmado, setResumenArmado] = useState(null);

  const [modalCrearAbierto, setModalCrearAbierto] = useState(false);

  const [cargando, setCargando] = useState(false);
  const [armando, setArmando] = useState(false);
  const [error, setError] = useState("");

  const cargarMesas = useCallback(async () => {
    setCargando(true);
    setError("");

    try {
      const response = await listarMesasExamen({
        pagina: 1,
        porPagina: 500,
        busqueda: "",
      });

      setMesas(response.data || []);
      setPaginacion(response.paginacion || null);
    } catch (err) {
      setError(err.message || "Error al cargar las mesas.");
      setMesas([]);
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

  const crearMesas = useCallback(
    async (payload) => {
      setArmando(true);
      setError("");
      setResumenArmado(null);

      try {
        const response = await crearArmadoInicialMesas(payload);

        setResumenArmado(response.data || null);
        setModalCrearAbierto(false);

        await cargarMesas();

        return response;
      } catch (err) {
        setError(err.message || "Error al crear el armado inicial.");
        throw err;
      } finally {
        setArmando(false);
      }
    },
    [cargarMesas]
  );

  const eliminarBorrador = useCallback(async () => {
    const confirmar = window.confirm(
      "¿Seguro que querés eliminar las mesas generadas? Esta acción borra las filas actuales de la tabla mesas."
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
      });

      await cargarMesas();
    } catch (err) {
      setError(err.message || "Error al eliminar las mesas borrador.");
    } finally {
      setArmando(false);
    }
  }, [cargarMesas]);

  useEffect(() => {
    cargarMesas();
    cargarParametrosArmado();
  }, [cargarMesas, cargarParametrosArmado]);

  const mesasFiltradas = useMemo(() => {
    const texto = normalizar(busqueda);

    let base = [...mesas];

    if (tab === "grupos") {
      base = base.filter((item) => item.estado !== "observada");
    }

    if (tab === "no-agrupadas") {
      base = base.filter((item) => item.estado === "observada");
    }

    if (!texto) {
      return base;
    }

    return base.filter((item) => mesaCoincideConBusqueda(item, texto));
  }, [busqueda, mesas, tab]);

  const totalObservadas = useMemo(() => {
    return mesas.filter((item) => item.estado === "observada").length;
  }, [mesas]);

  const totalArmadas = useMemo(() => {
    return mesas.filter((item) => item.estado !== "observada").length;
  }, [mesas]);

  const totalAlumnos = useMemo(() => {
    return mesas.reduce((total, item) => total + Number(item.cantidad_alumnos || 0), 0);
  }, [mesas]);

  return {
    busqueda,
    setBusqueda,

    tab,
    setTab,

    mesas,
    mesasFiltradas,
    paginacion,

    totalObservadas,
    totalArmadas,
    totalAlumnos,

    parametrosArmado,
    resumenArmado,

    modalCrearAbierto,
    abrirModalCrear,
    cerrarModalCrear,

    crearMesas,
    eliminarBorrador,

    cargarMesas,

    cargando,
    armando,
    error,
  };
};
