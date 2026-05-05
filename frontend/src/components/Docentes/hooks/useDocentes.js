import { useCallback, useEffect, useMemo, useState } from 'react';
import { docentesApi } from '../api/docentesApi.js';

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function idsDesdeItem(item) {
  if (Array.isArray(item?.ids_docentes)) return item.ids_docentes.map(Number).filter(Boolean);
  if (item?.ids_docentes_texto) {
    return String(item.ids_docentes_texto).split(',').map(Number).filter(Boolean);
  }
  return item?.id_docente ? [Number(item.id_docente)] : [];
}

export function useDocentes() {
  const [docentesBase, setDocentesBase] = useState([]);
  const [catalogos, setCatalogos] = useState({ cargos: [], turnos: [], dias_semana: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [vista, setVista] = useState('activos');

  const mostrarMensaje = useCallback((tipo, texto) => {
    setMensaje({ tipo, texto });
    window.clearTimeout(window.__docentesMsgTimer);
    window.__docentesMsgTimer = window.setTimeout(() => setMensaje(null), 3800);
  }, []);

  const cargarCatalogos = useCallback(async () => {
    try {
      const res = await docentesApi.catalogos();
      setCatalogos(res.data || { cargos: [], turnos: [], dias_semana: [] });
    } catch (e) {
      console.error('Error cargando catálogos de docentes:', e);
    }
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const activo = vista === 'bajas' ? 0 : 1;

      // Importante: no se envía busqueda al backend.
      // La API solo trae todos los docentes de la vista actual y el buscador filtra en frontend.
      const res = await docentesApi.listarTodos(activo);

      setDocentesBase(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setError(e.message || 'No se pudieron cargar los docentes.');
      setDocentesBase([]);
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

  const docentesFiltrados = useMemo(() => {
    const q = normalizar(busqueda);
    if (!q) return docentesBase;

    return docentesBase.filter((item) => (
      normalizar(item.docente).includes(q) ||
      normalizar(item.cargo).includes(q) ||
      normalizar(item.observacion).includes(q) ||
      normalizar(item.disponibilidad_resumen).includes(q) ||
      normalizar(item.ids_docentes_texto).includes(q)
    ));
  }, [docentesBase, busqueda]);

  const conteo = useMemo(() => ({
    totalRegistros: docentesBase.length,
    totalFiltrados: docentesFiltrados.length,
  }), [docentesBase.length, docentesFiltrados.length]);

  function cambiarVista(nuevaVista) {
    setVista(nuevaVista);
    setBusqueda('');
  }

  function actualizarBusqueda(valor) {
    setBusqueda(valor);
  }

  async function obtener(idDocente) {
    try {
      const res = await docentesApi.obtener(idDocente);
      return { ok: true, data: res.data };
    } catch (e) {
      const msg = e.message || 'No se pudo obtener el docente.';
      mostrarMensaje('error', msg);
      return { ok: false, mensaje: msg };
    }
  }

  async function guardar(payload) {
    try {
      await docentesApi.guardar(payload);
      await cargar();
      mostrarMensaje('success', 'Docente guardado correctamente.');
      return { ok: true };
    } catch (e) {
      const msg = e.message || 'No se pudo guardar el docente.';
      mostrarMensaje('error', msg);
      return { ok: false, mensaje: msg };
    }
  }

  async function darBaja(item, motivo = '') {
    try {
      await docentesApi.cambiarEstado(idsDesdeItem(item), 0, motivo);
      await cargar();
      mostrarMensaje('success', 'Docente dado de baja correctamente.');
      return { ok: true };
    } catch (e) {
      const msg = e.message || 'No se pudo dar de baja el docente.';
      mostrarMensaje('error', msg);
      return { ok: false, mensaje: msg };
    }
  }

  async function darAlta(item) {
    try {
      await docentesApi.cambiarEstado(idsDesdeItem(item), 1);
      await cargar();
      mostrarMensaje('success', 'Docente dado de alta correctamente.');
      return { ok: true };
    } catch (e) {
      const msg = e.message || 'No se pudo dar de alta el docente.';
      mostrarMensaje('error', msg);
      return { ok: false, mensaje: msg };
    }
  }

  async function eliminar(item) {
    try {
      await docentesApi.eliminar(idsDesdeItem(item));
      await cargar();
      mostrarMensaje('success', 'Docente eliminado correctamente.');
      return { ok: true };
    } catch (e) {
      const msg = e.message || 'No se pudo eliminar el docente.';
      mostrarMensaje('error', msg);
      return { ok: false, mensaje: msg };
    }
  }

  return {
    docentes: docentesFiltrados,
    docentesBase,
    conteo,
    catalogos,
    loading,
    error,
    mensaje,
    busqueda,
    setBusqueda: actualizarBusqueda,
    vista,
    cambiarVista,
    reload: cargar,
    obtener,
    guardar,
    darBaja,
    darAlta,
    eliminar,
  };
}
