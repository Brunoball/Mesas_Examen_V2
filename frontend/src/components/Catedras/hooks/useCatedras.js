import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [catalogos, setCatalogos] = useState({ docentes: [], cargos: [], cursos: [], divisiones: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState(null);
  const mensajeTimerRef = useRef(null);
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

  const cerrarError = useCallback(() => {
    setError('');
  }, []);

  const cerrarMensaje = useCallback(() => {
    if (mensajeTimerRef.current) {
      window.clearTimeout(mensajeTimerRef.current);
      mensajeTimerRef.current = null;
    }
    setMensaje(null);
  }, []);

  const mostrarMensaje = useCallback((tipo, texto) => {
    const tipoOriginal = String(tipo || '').toLowerCase();
    const tipoNormalizado = tipoOriginal === 'success' || tipoOriginal === 'ok' ? 'exito' : tipoOriginal || 'info';
    const esPersistente = ['error', 'cargando'].includes(tipoNormalizado);

    if (mensajeTimerRef.current) {
      window.clearTimeout(mensajeTimerRef.current);
      mensajeTimerRef.current = null;
    }

    setMensaje({ tipo: tipoNormalizado, texto, id: Date.now() });

    if (!esPersistente) {
      mensajeTimerRef.current = window.setTimeout(() => setMensaje(null), 3600);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (mensajeTimerRef.current) window.clearTimeout(mensajeTimerRef.current);
    };
  }, []);

  const cargarCatalogos = useCallback(async () => {
    try {
      const res = await catedrasApi.catalogos();
      setCatalogos(res.data || { docentes: [], cargos: [], cursos: [], divisiones: [] });
    } catch (e) {
      console.error('Error cargando catálogos de cátedras:', e);
    }
  }, []);

  const construirFiltrosBackend = useCallback(() => {
    const filtrosBackend = limpiarFiltros({ ...filtros });
    const busquedaLimpia = busquedaDebounced.trim();

    if (busquedaLimpia !== '') {
      filtrosBackend.busqueda = busquedaLimpia;
    }

    return filtrosBackend;
  }, [busquedaDebounced, filtros]);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const res = await catedrasApi.listar(
        paginacion.pagina,
        paginacion.porPagina,
        construirFiltrosBackend()
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
  }, [construirFiltrosBackend, paginacion.pagina, paginacion.porPagina]);

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

  async function asignarDocente(idCatedra, idDocente, idCargo) {
    const hayDocente = Number(idDocente || 0) > 0;

    if (hayDocente && Number(idCargo || 0) <= 0) {
      const msg = 'Seleccioná el cargo de esa cátedra.';
      mostrarMensaje('error', msg);
      return { ok: false, mensaje: msg };
    }

    try {
      mostrarMensaje('cargando', hayDocente ? 'Guardando docente y cargo...' : 'Quitando docente...');
      const res = await catedrasApi.asignarDocente(idCatedra, idDocente || 0, idCargo || 0);
      await cargar();
      mostrarMensaje('ok', res?.mensaje || (hayDocente ? 'Docente y cargo asignados correctamente.' : 'Docente quitado correctamente.'));
      return { ok: true };
    } catch (e) {
      const msg = e.message || 'No se pudo asignar el docente y cargo.';
      mostrarMensaje('error', msg);
      return { ok: false, mensaje: msg };
    }
  }

  async function obtenerTodasParaExportar() {
    const res = await catedrasApi.listarTodos(construirFiltrosBackend());
    return Array.isArray(res.data) ? res.data : [];
  }

  return {
    catedras,
    catalogos,
    loading,
    error,
    cerrarError,
    mensaje,
    mostrarMensaje,
    cerrarMensaje,
    busqueda,
    setBusqueda,
    filtros,
    actualizarFiltro,
    limpiarTodosFiltros,
    paginacion,
    reload: cargar,
    obtenerTodasParaExportar,
    asignarDocente,
  };
}
