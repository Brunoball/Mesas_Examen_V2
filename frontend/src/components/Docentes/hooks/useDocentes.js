import { useCallback, useEffect, useMemo, useState } from 'react';
import { docentesApi } from '../api/docentesApi.js';
import { usePaginacion } from '../../_shared/hooks/usePaginacion';

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

  // Igual que Cátedras: se muestran 100 registros por página.
  const paginacion = usePaginacion(100);

  const limpiarMensaje = useCallback(() => {
    setMensaje(null);
  }, []);

  const mostrarMensaje = useCallback((tipo, texto, duracion) => {
    if (!texto) return;

    const tipoNormalizado = tipo === 'success' || tipo === 'ok' ? 'exito' : tipo;

    setMensaje({
      tipo: tipoNormalizado,
      texto,
      duracion,
      id: Date.now(),
    });
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
      const msg = e.message || 'No se pudieron cargar los docentes.';
      setError(msg);
      mostrarMensaje('error', msg);
      setDocentesBase([]);
    } finally {
      setLoading(false);
    }
  }, [vista, mostrarMensaje]);

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

  useEffect(() => {
    const totalFiltrados = docentesFiltrados.length;
    const totalPaginas = Math.max(1, Math.ceil(totalFiltrados / paginacion.porPagina));

    if (paginacion.pagina > totalPaginas) {
      paginacion.setPagina(totalPaginas);
      return;
    }

    paginacion.actualizarPaginacion({
      pagina: paginacion.pagina,
      total: totalFiltrados,
      paginas: totalPaginas,
    });
  }, [docentesFiltrados.length, paginacion.pagina, paginacion.porPagina]);

  const docentesPaginados = useMemo(() => {
    const inicio = (paginacion.pagina - 1) * paginacion.porPagina;
    const fin = inicio + paginacion.porPagina;

    return docentesFiltrados.slice(inicio, fin);
  }, [docentesFiltrados, paginacion.pagina, paginacion.porPagina]);

  const conteo = useMemo(() => ({
    totalRegistros: docentesBase.length,
    totalFiltrados: docentesFiltrados.length,
    totalMostrados: docentesPaginados.length,
  }), [docentesBase.length, docentesFiltrados.length, docentesPaginados.length]);

  function cambiarVista(nuevaVista) {
    setVista(nuevaVista);
    setBusqueda('');
    paginacion.setPagina(1);
  }

  function actualizarBusqueda(valor) {
    setBusqueda(valor);
    paginacion.setPagina(1);
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

  async function guardar(payload, opciones = {}) {
    try {
      await docentesApi.guardar(payload);
      await cargar();
      if (!opciones?.silent) mostrarMensaje('exito', 'Docente guardado correctamente.');
      return { ok: true };
    } catch (e) {
      const msg = e.message || 'No se pudo guardar el docente.';
      if (!opciones?.silent) mostrarMensaje('error', msg);
      return { ok: false, mensaje: msg };
    }
  }

  async function darBaja(item, motivo = '', opciones = {}) {
    try {
      await docentesApi.cambiarEstado(idsDesdeItem(item), 0, motivo);
      await cargar();
      if (!opciones?.silent) mostrarMensaje('exito', 'Docente dado de baja correctamente.');
      return { ok: true };
    } catch (e) {
      const msg = e.message || 'No se pudo dar de baja el docente.';
      if (!opciones?.silent) mostrarMensaje('error', msg);
      return { ok: false, mensaje: msg };
    }
  }

  async function darAlta(item, opciones = {}) {
    try {
      await docentesApi.cambiarEstado(idsDesdeItem(item), 1);
      await cargar();
      if (!opciones?.silent) mostrarMensaje('exito', 'Docente dado de alta correctamente.');
      return { ok: true };
    } catch (e) {
      const msg = e.message || 'No se pudo dar de alta el docente.';
      if (!opciones?.silent) mostrarMensaje('error', msg);
      return { ok: false, mensaje: msg };
    }
  }

  async function eliminar(item, opciones = {}) {
    try {
      await docentesApi.eliminar(idsDesdeItem(item));
      await cargar();
      if (!opciones?.silent) mostrarMensaje('exito', 'Docente eliminado correctamente.');
      return { ok: true };
    } catch (e) {
      const msg = e.message || 'No se pudo eliminar el docente.';
      if (!opciones?.silent) mostrarMensaje('error', msg);
      return { ok: false, mensaje: msg };
    }
  }

  return {
    docentes: docentesPaginados,
    docentesBase,
    docentesFiltrados,
    conteo,
    paginacion,
    catalogos,
    loading,
    error,
    mensaje,
    mostrarMensaje,
    limpiarMensaje,
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
