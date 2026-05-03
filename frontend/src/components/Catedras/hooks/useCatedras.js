import { useCallback, useEffect, useMemo, useState } from 'react';
import { catedrasApi } from '../api/catedrasApi';
import { usePaginacion } from '../../_shared/hooks/usePaginacion';

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function limpiarFiltros(filtros) {
  const result = {};

  Object.entries(filtros || {}).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) {
      result[key] = value;
    }
  });

  return result;
}

export function useCatedras() {
  const [catedras, setCatedras] = useState([]);
  const [catalogos, setCatalogos] = useState({ docentes: [], cursos: [], divisiones: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtros, setFiltros] = useState({
    id_curso: '',
    id_division: '',
    id_docente: '',
    sin_docente: '',
  });

  const paginacion = usePaginacion(20);

  const mostrarMensaje = useCallback((tipo, texto) => {
    setMensaje({ tipo, texto });
    window.clearTimeout(window.__catedrasMsgTimer);
    window.__catedrasMsgTimer = window.setTimeout(() => setMensaje(null), 3600);
  }, []);

  const cargarCatalogos = useCallback(async () => {
    try {
      const res = await catedrasApi.catalogos();
      setCatalogos(res.data || { docentes: [], cursos: [], divisiones: [] });
    } catch (e) {
      console.error('Error cargando catálogos de cátedras:', e);
    }
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const res = await catedrasApi.listar(
        paginacion.pagina,
        paginacion.porPagina,
        limpiarFiltros({ ...filtros, busqueda })
      );

      setCatedras(res.data || []);
      paginacion.actualizarPaginacion(res.paginacion || {});
    } catch (e) {
      const msg = e.message || 'No se pudieron cargar las cátedras.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [busqueda, filtros, paginacion.pagina, paginacion.porPagina]);

  useEffect(() => {
    cargarCatalogos();
  }, [cargarCatalogos]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function actualizarFiltro(nombre, valor) {
    paginacion.setPagina(1);
    setFiltros((prev) => ({ ...prev, [nombre]: valor }));
  }

  function limpiarTodosFiltros() {
    paginacion.setPagina(1);
    setBusqueda('');
    setFiltros({ id_curso: '', id_division: '', id_docente: '', sin_docente: '' });
  }

  const catedrasFiltradas = useMemo(() => {
    const q = normalizar(busqueda);
    if (!q) return catedras;

    return catedras.filter((item) => (
      normalizar(item.nombre_curso).includes(q) ||
      normalizar(item.nombre_division).includes(q) ||
      normalizar(item.materia).includes(q) ||
      normalizar(item.docente).includes(q) ||
      normalizar(item.cargo_docente).includes(q)
    ));
  }, [catedras, busqueda]);

  async function asignarDocente(idCatedra, idDocente) {
    try {
      await catedrasApi.asignarDocente(idCatedra, idDocente || 0);
      await cargar();
      mostrarMensaje('success', 'Docente asignado correctamente.');
      return { ok: true };
    } catch (e) {
      const msg = e.message || 'No se pudo asignar el docente.';
      mostrarMensaje('error', msg);
      return { ok: false, mensaje: msg };
    }
  }

  return {
    catedras: catedrasFiltradas,
    catalogos,
    loading,
    error,
    mensaje,
    busqueda,
    setBusqueda: (value) => {
      paginacion.setPagina(1);
      setBusqueda(value);
    },
    filtros,
    actualizarFiltro,
    limpiarTodosFiltros,
    paginacion,
    reload: cargar,
    asignarDocente,
  };
}
