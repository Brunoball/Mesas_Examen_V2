import { useCallback, useEffect, useMemo, useState } from 'react';
import { materiasApi } from '../api/materiasApi';

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function obtenerArrayMateriasPorCurso(respuesta) {
  if (Array.isArray(respuesta?.materias)) return respuesta.materias;
  if (Array.isArray(respuesta?.data)) return respuesta.data;
  if (Array.isArray(respuesta?.data?.materias)) return respuesta.data.materias;
  return [];
}

function unificarMateriasPorCurso(actuales = [], nuevas = []) {
  const mapa = new Map();

  [...actuales, ...nuevas].forEach((m) => {
    const idCurso = Number(m?.id_curso || 0);
    const idDivision = Number(m?.id_division || 0);
    const idMateria = Number(m?.id_materia || 0);
    if (idCurso <= 0 || idMateria <= 0) return;
    mapa.set(`${idCurso}-${idDivision}-${idMateria}`, m);
  });

  return Array.from(mapa.values()).sort((a, b) => {
    const cursoA = Number(a.id_curso || 0);
    const cursoB = Number(b.id_curso || 0);
    if (cursoA !== cursoB) return cursoA - cursoB;

    const divA = Number(a.id_division || 0);
    const divB = Number(b.id_division || 0);
    if (divA !== divB) return divA - divB;

    return String(a.materia || '').localeCompare(String(b.materia || ''), 'es');
  });
}

export function useMaterias() {
  const [seccionActiva, setSeccionActiva] = useState('materias');
  const [busqueda, setBusqueda] = useState('');
  const [soloActivas, setSoloActivas] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  const [catalogos, setCatalogos] = useState({
    areas: [],
    cursos: [],
    divisiones: [],
    materias: [],
    materiasPorCurso: [],
    talleres: [],
  });

  const [materiasPorCursoCache, setMateriasPorCursoCache] = useState({});

  const [materias, setMaterias] = useState([]);
  const [correlativas, setCorrelativas] = useState([]);
  const [talleres, setTalleres] = useState([]);
  const [areas, setAreas] = useState([]);

  const [modalMateria, setModalMateria] = useState({ abierto: false, item: null });
  const [modalCorrelativa, setModalCorrelativa] = useState({ abierto: false, item: null });
  const [modalTaller, setModalTaller] = useState({ abierto: false, item: null });
  const [modalArea, setModalArea] = useState({ abierto: false, item: null });
  const [confirmacion, setConfirmacion] = useState({
    abierto: false,
    tipo: '',
    item: null,
    operacion: 'eliminar',
    nuevoEstado: null,
  });

  const mostrarMensaje = useCallback((tipo, texto) => {
    setMensaje({ tipo, texto });
    window.clearTimeout(window.__materiasMsgTimer);
    window.__materiasMsgTimer = window.setTimeout(() => setMensaje(null), 3800);
  }, []);

  const cerrarConfirmacion = useCallback(() => {
    setConfirmacion({
      abierto: false,
      tipo: '',
      item: null,
      operacion: 'eliminar',
      nuevoEstado: null,
    });
  }, []);

  const abrirConfirmacion = useCallback((config) => {
    setConfirmacion({
      abierto: true,
      tipo: config?.tipo || '',
      item: config?.item || null,
      operacion: config?.operacion || 'eliminar',
      nuevoEstado: config?.nuevoEstado ?? null,
    });
  }, []);

  const obtenerMateriasPorCurso = useCallback(
    async (idCurso, opciones = {}) => {
      const id = Number(idCurso || 0);
      const idDivision = Number(opciones?.idDivision || opciones?.id_division || 0);
      if (id <= 0) return [];

      const clave = idDivision > 0 ? `${id}-${idDivision}` : String(id);
      const forzar = Boolean(opciones?.forzar);

      if (!forzar && Array.isArray(materiasPorCursoCache[clave])) {
        return materiasPorCursoCache[clave];
      }

      const respuesta = await materiasApi.porCurso(id, idDivision > 0 ? idDivision : null);
      const materiasCurso = obtenerArrayMateriasPorCurso(respuesta);

      setMateriasPorCursoCache((prev) => ({
        ...prev,
        [clave]: materiasCurso,
      }));

      setCatalogos((prev) => ({
        ...prev,
        materiasPorCurso: unificarMateriasPorCurso(prev.materiasPorCurso, materiasCurso),
      }));

      return materiasCurso;
    },
    [materiasPorCursoCache]
  );

  const obtenerCatedrasTaller = useCallback(async (idCurso, divisiones = []) => {
    const id = Number(idCurso || 0);
    const idsDivisiones = Array.isArray(divisiones)
      ? divisiones.map(Number).filter((x) => x > 0)
      : String(divisiones || '')
          .split(',')
          .map((x) => Number(String(x).trim()))
          .filter((x) => x > 0);

    if (id <= 0 || idsDivisiones.length === 0) return [];

    const respuesta = await materiasApi.talleresCatedrasPorCursoDivisiones(id, idsDivisiones);
    if (Array.isArray(respuesta?.catedras)) return respuesta.catedras;
    if (Array.isArray(respuesta?.data?.catedras)) return respuesta.data.catedras;
    if (Array.isArray(respuesta?.data)) return respuesta.data;
    return [];
  }, []);

  const precargarMateriasDeCursos = useCallback(
    async (idsCursos = []) => {
      const ids = Array.from(new Set(idsCursos.map((id) => Number(id)).filter((id) => id > 0)));
      if (ids.length === 0) return [];

      const resultados = await Promise.all(
        ids.map(async (id) => {
          try {
            return await obtenerMateriasPorCurso(id);
          } catch (error) {
            console.error(`No se pudieron cargar materias del curso ${id}:`, error);
            return [];
          }
        })
      );

      return resultados.flat();
    },
    [obtenerMateriasPorCurso]
  );

  const cargarTodo = useCallback(async () => {
    setCargando(true);

    try {
      const [catResult, matResult, corrResult, tallResult, areasResult] = await Promise.allSettled([
        materiasApi.catalogos(),
        materiasApi.listar(),
        materiasApi.correlativasListar(),
        materiasApi.talleresListar(),
        materiasApi.areasListar(),
      ]);

      const errores = [];

      if (catResult.status === 'fulfilled') {
        setCatalogos((prev) => ({
          ...prev,
          areas: catResult.value.areas || catResult.value.data?.areas || [],
          cursos: catResult.value.cursos || catResult.value.data?.cursos || [],
          divisiones: catResult.value.divisiones || catResult.value.data?.divisiones || [],
          materias: catResult.value.materias || catResult.value.data?.materias || [],
          // Ya no se carga desde materias_catalogos. Se completa bajo demanda
          // llamando a global_obtener_materias_por_curso al seleccionar curso.
          talleres: catResult.value.talleres || catResult.value.data?.talleres || [],
        }));
      } else {
        errores.push(catResult.reason?.message || 'Error cargando catálogos.');
      }

      if (matResult.status === 'fulfilled') {
        setMaterias(matResult.value.materias || matResult.value.data || []);
      } else {
        errores.push(matResult.reason?.message || 'Error cargando materias.');
      }

      if (corrResult.status === 'fulfilled') {
        setCorrelativas(corrResult.value.correlativas || corrResult.value.data || []);
      } else {
        errores.push(corrResult.reason?.message || 'Error cargando correlatividades.');
      }

      if (tallResult.status === 'fulfilled') {
        setTalleres(tallResult.value.talleres || tallResult.value.data || []);
      } else {
        errores.push(tallResult.reason?.message || 'Error cargando talleres.');
      }

      if (areasResult.status === 'fulfilled') {
        setAreas(areasResult.value.areas || areasResult.value.data || []);
      } else {
        errores.push(areasResult.reason?.message || 'Error cargando áreas.');
      }

      if (errores.length > 0) {
        console.error('Errores al cargar módulo materias:', errores);
        mostrarMensaje('error', errores[0]);
      }
    } catch (error) {
      console.error('Error inesperado en módulo materias:', error);
      mostrarMensaje('error', 'No se pudo conectar con el backend del módulo materias.');
    } finally {
      setCargando(false);
    }
  }, [mostrarMensaje]);

  useEffect(() => {
    cargarTodo();
  }, [cargarTodo]);

  const materiasFiltradas = useMemo(() => {
    const q = normalizar(busqueda);

    return materias.filter((m) => {
      if (soloActivas && Number(m.activo) !== 1) return false;
      if (!q) return true;

      return (
        normalizar(m.materia).includes(q) ||
        normalizar(m.areas).includes(q) ||
        normalizar(m.cursos).includes(q) ||
        normalizar(m.talleres).includes(q)
      );
    });
  }, [materias, busqueda, soloActivas]);

  const correlativasFiltradas = useMemo(() => {
    const q = normalizar(busqueda);

    return correlativas.filter((c) => {
      if (soloActivas && Number(c.activo) !== 1) return false;
      if (!q) return true;

      return (
        normalizar(c.materia).includes(q) ||
        normalizar(c.curso).includes(q) ||
        normalizar(c.materia_relacionada).includes(q) ||
        normalizar(c.curso_relacionada).includes(q) ||
        normalizar(c.tipo).includes(q)
      );
    });
  }, [correlativas, busqueda, soloActivas]);

  const talleresFiltrados = useMemo(() => {
    const q = normalizar(busqueda);

    return talleres.filter((t) => {
      if (soloActivas && Number(t.activo) !== 1) return false;
      if (!q) return true;

      return (
        normalizar(t.taller).includes(q) ||
        normalizar(t.curso).includes(q) ||
        normalizar(t.division).includes(q) ||
        normalizar(t.materias).includes(q)
      );
    });
  }, [talleres, busqueda, soloActivas]);

  const areasFiltradas = useMemo(() => {
    const q = normalizar(busqueda);

    return areas.filter((a) => {
      if (soloActivas && Number(a.activo) !== 1) return false;
      if (!q) return true;

      return normalizar(a.area).includes(q) || normalizar(a.materias).includes(q);
    });
  }, [areas, busqueda, soloActivas]);

  const guardarMateria = async (payload) => {
    try {
      const res = await materiasApi.guardar(payload);
      mostrarMensaje(res.exito ? 'ok' : 'error', res.mensaje || 'Operación realizada.');

      if (res.exito) {
        setModalMateria({ abierto: false, item: null });
        await cargarTodo();
      }
    } catch (error) {
      console.error(error);
      mostrarMensaje('error', 'No se pudo guardar la materia.');
    }
  };

  const eliminarMateria = (item) => {
    abrirConfirmacion({
      tipo: 'eliminar_materia',
      operacion: 'eliminar',
      item,
    });
  };

  const cambiarEstadoMateria = (item) => {
    const nuevo = Number(item?.activo) === 1 ? 0 : 1;

    abrirConfirmacion({
      tipo: 'estado_materia',
      operacion: nuevo === 1 ? 'alta' : 'baja',
      item,
      nuevoEstado: nuevo,
    });
  };

  const guardarCorrelativa = async (payload) => {
    try {
      const res = payload?.modo === 'auto_por_materia'
        ? await materiasApi.correlativaAutoPorMateria(payload)
        : payload?.modo === 'masivo'
        ? await materiasApi.correlativaGuardarMasivo(payload)
        : await materiasApi.correlativaGuardar(payload);

      mostrarMensaje(res.exito ? 'ok' : 'error', res.mensaje || 'Operación realizada.');

      if (res.exito) {
        setModalCorrelativa({ abierto: false, item: null });
        await cargarTodo();
      }
    } catch (error) {
      console.error(error);
      mostrarMensaje('error', 'No se pudo guardar la correlatividad.');
    }
  };

  const eliminarCorrelativa = (item) => {
    abrirConfirmacion({
      tipo: 'eliminar_correlativa',
      operacion: 'eliminar',
      item,
    });
  };

  const guardarTaller = async (payload) => {
    try {
      const res = await materiasApi.tallerGuardar(payload);
      mostrarMensaje(res.exito ? 'ok' : 'error', res.mensaje || 'Operación realizada.');

      if (res.exito) {
        setModalTaller({ abierto: false, item: null });
        await cargarTodo();
      }

      return res;
    } catch (error) {
      console.error(error);
      mostrarMensaje('error', 'No se pudo guardar el taller.');
      return { exito: false, mensaje: 'No se pudo guardar el taller.' };
    }
  };

  const eliminarTaller = (item) => {
    abrirConfirmacion({
      tipo: 'eliminar_taller',
      operacion: 'eliminar',
      item,
    });
  };

  const agregarMateriaTaller = async (payload) => {
    try {
      const res = await materiasApi.tallerMateriaAgregar(payload);
      mostrarMensaje(res.exito ? 'ok' : 'error', res.mensaje || 'Operación realizada.');
      if (res.exito) await cargarTodo();
      return res;
    } catch (error) {
      console.error(error);
      mostrarMensaje('error', 'No se pudo agregar la materia al taller.');
      return { exito: false, mensaje: 'No se pudo agregar la materia al taller.' };
    }
  };

  const quitarMateriaTaller = async (payload) => {
    try {
      const res = await materiasApi.tallerMateriaEliminar(payload);
      mostrarMensaje(res.exito ? 'ok' : 'error', res.mensaje || 'Operación realizada.');
      if (res.exito) await cargarTodo();
      return res;
    } catch (error) {
      console.error(error);
      mostrarMensaje('error', 'No se pudo quitar la materia del taller.');
      return { exito: false, mensaje: 'No se pudo quitar la materia del taller.' };
    }
  };

  const guardarArea = async (payload) => {
    try {
      const res = await materiasApi.areaGuardar(payload);
      mostrarMensaje(res.exito ? 'ok' : 'error', res.mensaje || 'Operación realizada.');

      if (res.exito) {
        setModalArea({ abierto: false, item: null });
        await cargarTodo();
      }

      return res;
    } catch (error) {
      console.error(error);
      mostrarMensaje('error', 'No se pudo guardar el área.');
      return { exito: false, mensaje: 'No se pudo guardar el área.' };
    }
  };

  const eliminarArea = (item) => {
    abrirConfirmacion({
      tipo: 'eliminar_area',
      operacion: 'eliminar',
      item,
    });
  };


  const confirmarAccion = async () => {
    const { tipo, item, nuevoEstado } = confirmacion;

    if (!tipo || !item) {
      return { ok: false, mensaje: 'No hay una acción seleccionada.' };
    }

    try {
      let res = null;

      if (tipo === 'eliminar_materia') {
        res = await materiasApi.eliminar(item.id_materia);
      } else if (tipo === 'estado_materia') {
        const estado = Number(nuevoEstado ?? (Number(item.activo) === 1 ? 0 : 1));
        res = await materiasApi.cambiarEstado(item.id_materia, estado);
      } else if (tipo === 'eliminar_correlativa') {
        res = await materiasApi.correlativaEliminar(item.id_materia_correlativa);
      } else if (tipo === 'eliminar_taller') {
        res = await materiasApi.tallerEliminar(item.id_taller);
      } else if (tipo === 'eliminar_area') {
        res = await materiasApi.areaEliminar(item.id_area);
      } else {
        return { ok: false, mensaje: 'La acción no está configurada.' };
      }

      const ok = Boolean(res?.exito ?? res?.ok);
      const mensajeAccion = res?.mensaje || (ok ? 'Operación realizada.' : 'No se pudo completar la operación.');

      mostrarMensaje(ok ? 'ok' : 'error', mensajeAccion);

      if (ok) {
        cerrarConfirmacion();
        await cargarTodo();
      }

      return { ok, mensaje: mensajeAccion };
    } catch (error) {
      console.error(error);
      const mensajeError = 'No se pudo completar la operación.';
      mostrarMensaje('error', mensajeError);
      return { ok: false, mensaje: mensajeError };
    }
  };

  return {
    seccionActiva,
    setSeccionActiva,
    busqueda,
    setBusqueda,
    soloActivas,
    setSoloActivas,
    cargando,
    mensaje,
    catalogos,
    materiasPorCursoCache,
    materias,
    correlativas,
    talleres,
    areas,
    materiasFiltradas,
    correlativasFiltradas,
    talleresFiltrados,
    areasFiltradas,
    modalMateria,
    setModalMateria,
    modalCorrelativa,
    setModalCorrelativa,
    modalTaller,
    setModalTaller,
    modalArea,
    setModalArea,
    confirmacion,
    cerrarConfirmacion,
    confirmarAccion,
    cargarTodo,
    obtenerMateriasPorCurso,
    obtenerCatedrasTaller,
    precargarMateriasDeCursos,
    guardarMateria,
    eliminarMateria,
    cambiarEstadoMateria,
    guardarCorrelativa,
    eliminarCorrelativa,
    guardarTaller,
    eliminarTaller,
    agregarMateriaTaller,
    quitarMateriaTaller,
    guardarArea,
    eliminarArea,
  };
}
