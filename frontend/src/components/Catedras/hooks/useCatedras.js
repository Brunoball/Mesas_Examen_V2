import { useCallback, useEffect, useState } from 'react';
import { catedrasApi } from '../api/catedrasApi';
import { usePaginacion } from '../../_shared/hooks/usePaginacion';

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
  const [busqueda, setBusquedaState] = useState('');
  const [busquedaDebounced, setBusquedaDebounced] = useState('');
  const [filtros, setFiltros] = useState({
    id_curso: '',
    id_division: '',
    id_docente: '',
    sin_docente: '',
  });

  // Igual que Previas: se cargan 100 registros por página.
  const paginacion = usePaginacion(100);

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
      const filtrosBackend = limpiarFiltros({ ...filtros });
      const busquedaLimpia = busquedaDebounced.trim();

      if (busquedaLimpia !== '') {
        filtrosBackend.busqueda = busquedaLimpia;
      }

      const res = await catedrasApi.listar(
        paginacion.pagina,
        paginacion.porPagina,
        filtrosBackend
      );

      setCatedras(Array.isArray(res.data) ? res.data : []);
      paginacion.actualizarPaginacion(res.paginacion || {});
    } catch (e) {
      const msg = e.message || 'No se pudieron cargar las cátedras.';
      setError(msg);
      setCatedras([]);
      paginacion.actualizarPaginacion({ pagina: 1, total: 0, paginas: 1 });
    } finally {
      setLoading(false);
    }
  }, [busquedaDebounced, filtros, paginacion.pagina, paginacion.porPagina]);

  useEffect(() => {
    cargarCatalogos();
  }, [cargarCatalogos]);

  // Igual que Previas: evita llamar al backend por cada tecla exacta.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setBusquedaDebounced(busqueda.trim());
    }, 320);

    return () => window.clearTimeout(timer);
  }, [busqueda]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function setBusqueda(value) {
    paginacion.setPagina(1);
    setBusquedaState(value);
  }

  function actualizarFiltro(nombre, valor) {
    paginacion.setPagina(1);
    setFiltros((prev) => ({ ...prev, [nombre]: valor }));
  }

  function limpiarTodosFiltros() {
    paginacion.setPagina(1);
    setBusquedaState('');
    setBusquedaDebounced('');
    setFiltros({ id_curso: '', id_division: '', id_docente: '', sin_docente: '' });
  }

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
    catedras,
    catalogos,
    loading,
    error,
    mensaje,
    busqueda,
    setBusqueda,
    filtros,
    actualizarFiltro,
    limpiarTodosFiltros,
    paginacion,
    reload: cargar,
    asignarDocente,
  };
}
