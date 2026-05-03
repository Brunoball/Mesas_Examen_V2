import { useCallback, useEffect, useMemo, useState } from 'react';
import { previasApi } from '../api/previasApi.js';

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const CONDICIONES_BASE = [
  { id_condicion: 1, condicion: 'COLOQUIO' },
  { id_condicion: 2, condicion: 'REGULAR' },
  { id_condicion: 3, condicion: 'PREVIA' },
  { id_condicion: 4, condicion: 'P.LIB.' },
  { id_condicion: 5, condicion: 'TER.MAT.' },
  { id_condicion: 6, condicion: 'PENDIENTE' },
];

function normalizarCurso(item = {}) {
  return {
    ...item,
    id_curso: Number(item.id_curso ?? item.id ?? 0),
    nombre_curso: String(item.nombre_curso ?? item.curso ?? item.nombre ?? '').trim(),
  };
}

function normalizarDivision(item = {}) {
  return {
    ...item,
    id_division: Number(item.id_division ?? item.id ?? 0),
    nombre_division: String(item.nombre_division ?? item.division ?? item.nombre ?? '').trim(),
  };
}

function normalizarCondicion(item = {}) {
  return {
    ...item,
    id_condicion: Number(item.id_condicion ?? item.id ?? 0),
    condicion: String(item.condicion ?? item.nombre_condicion ?? item.nombre ?? '').trim(),
  };
}

function normalizarCatalogos(data = {}) {
  const cursos = (Array.isArray(data.cursos) ? data.cursos : [])
    .map(normalizarCurso)
    .filter((c) => c.id_curso > 0 && c.nombre_curso);

  const divisiones = (Array.isArray(data.divisiones) ? data.divisiones : [])
    .map(normalizarDivision)
    .filter((d) => d.id_division > 0 && d.nombre_division);

  const condicionesDb = (Array.isArray(data.condiciones) ? data.condiciones : [])
    .map(normalizarCondicion)
    .filter((c) => c.id_condicion > 0 && c.condicion);

  return {
    cursos,
    divisiones,
    condiciones: condicionesDb.length > 0 ? condicionesDb : CONDICIONES_BASE,
  };
}

function claveMaterias(idCurso, idDivision) {
  return `${Number(idCurso || 0)}-${Number(idDivision || 0)}`;
}

export function usePrevias() {
  const [previasBase, setPreviasBase] = useState([]);
  const [catalogos, setCatalogos] = useState({ cursos: [], divisiones: [], condiciones: [] });
  const [materiasPorCursoCache, setMateriasPorCursoCache] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [vista, setVista] = useState('activas');

  const mostrarMensaje = useCallback((tipo, texto) => {
    setMensaje({ tipo, texto });
    window.clearTimeout(window.__previasMsgTimer);
    window.__previasMsgTimer = window.setTimeout(() => setMensaje(null), 3800);
  }, []);

  const cargarCatalogos = useCallback(async () => {
    try {
      const res = await previasApi.catalogos();
      const data = res?.data && typeof res.data === 'object' ? res.data : res;
      setCatalogos(normalizarCatalogos(data));
    } catch (e) {
      console.error('Error cargando catálogos de previas:', e);
      setCatalogos({ cursos: [], divisiones: [], condiciones: CONDICIONES_BASE });
      mostrarMensaje('error', e?.message || 'No se pudieron cargar los catálogos de previas.');
    }
  }, [mostrarMensaje]);

  const obtenerMateriasPorCurso = useCallback(
    async (idCurso, idDivision = null, opciones = {}) => {
      const curso = Number(idCurso || 0);
      const division = Number(idDivision || 0);

      if (curso <= 0 || division <= 0) return [];

      const clave = claveMaterias(curso, division);
      const forzar = Boolean(opciones?.forzar);

      if (!forzar && Array.isArray(materiasPorCursoCache[clave])) {
        return materiasPorCursoCache[clave];
      }

      const materiasCurso = await previasApi.materiasPorCurso(curso, division);

      setMateriasPorCursoCache((prev) => ({
        ...prev,
        [clave]: Array.isArray(materiasCurso) ? materiasCurso : [],
      }));

      return Array.isArray(materiasCurso) ? materiasCurso : [];
    },
    [materiasPorCursoCache]
  );

  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const activo = vista === 'bajas' ? 0 : 1;
      const res = await previasApi.listarTodos(activo);
      setPreviasBase(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setError(e.message || 'No se pudieron cargar las previas.');
      setPreviasBase([]);
    } finally {
      setLoading(false);
    }
  }, [vista]);

  useEffect(() => {
    cargarCatalogos();
  }, [cargarCatalogos]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const previasFiltradas = useMemo(() => {
    const q = normalizar(busqueda);
    if (!q) return previasBase;

    return previasBase.filter((item) => (
      normalizar(item.alumno).includes(q) ||
      normalizar(item.dni).includes(q) ||
      normalizar(item.materia).includes(q) ||
      normalizar(item.condicion).includes(q) ||
      normalizar(item.curso_materia).includes(q) ||
      normalizar(item.inscripcion_texto).includes(q) ||
      normalizar(item.anio).includes(q)
    ));
  }, [previasBase, busqueda]);

  const conteo = useMemo(() => ({
    totalRegistros: previasBase.length,
    totalFiltrados: previasFiltradas.length,
  }), [previasBase.length, previasFiltradas.length]);

  function cambiarVista(nuevaVista) {
    setVista(nuevaVista);
    setBusqueda('');
  }

  async function obtener(idPrevia) {
    try {
      const res = await previasApi.obtener(idPrevia);
      return { ok: true, data: res.data };
    } catch (e) {
      const msg = e.message || 'No se pudo obtener la previa.';
      mostrarMensaje('error', msg);
      return { ok: false, mensaje: msg };
    }
  }

  async function guardar(payload) {
    try {
      await previasApi.guardar(payload);
      await cargar();
      mostrarMensaje('success', payload?.id_previa ? 'Previa actualizada correctamente.' : 'Previa guardada correctamente.');
      return { ok: true };
    } catch (e) {
      const msg = e?.data?.mensaje || e.message || 'No se pudo guardar la previa.';
      mostrarMensaje('error', msg);
      return { ok: false, mensaje: msg };
    }
  }

  async function darBaja(item, motivo = '') {
    try {
      await previasApi.cambiarEstado(item.id_previa, 0, motivo);
      await cargar();
      mostrarMensaje('success', 'Previa dada de baja correctamente.');
      return { ok: true };
    } catch (e) {
      const msg = e?.data?.mensaje || e.message || 'No se pudo dar de baja la previa.';
      mostrarMensaje('error', msg);
      return { ok: false, mensaje: msg };
    }
  }

  async function darAlta(item) {
    try {
      await previasApi.cambiarEstado(item.id_previa, 1);
      await cargar();
      mostrarMensaje('success', 'Previa dada de alta correctamente.');
      return { ok: true };
    } catch (e) {
      const msg = e?.data?.mensaje || e.message || 'No se pudo dar de alta la previa.';
      mostrarMensaje('error', msg);
      return { ok: false, mensaje: msg };
    }
  }

  async function eliminar(item) {
    try {
      await previasApi.eliminar(item.id_previa);
      await cargar();
      mostrarMensaje('success', 'Previa eliminada correctamente.');
      return { ok: true };
    } catch (e) {
      const msg = e?.data?.mensaje || e.message || 'No se pudo eliminar la previa.';
      mostrarMensaje('error', msg);
      return { ok: false, mensaje: msg };
    }
  }

  return {
    previas: previasFiltradas,
    previasBase,
    catalogos,
    materiasPorCursoCache,
    loading,
    error,
    mensaje,
    busqueda,
    setBusqueda,
    vista,
    cambiarVista,
    conteo,
    reload: cargar,
    obtener,
    obtenerMateriasPorCurso,
    guardar,
    darBaja,
    darAlta,
    eliminar,
  };
}
