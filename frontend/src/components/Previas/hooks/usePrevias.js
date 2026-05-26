import { useCallback, useEffect, useMemo, useState } from 'react';
import { previasApi } from '../api/previasApi';
import { usePaginacion } from '../../_shared/hooks/usePaginacion';

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

function leerArchivoComoBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const resultado = String(reader.result || '');
      const base64 = resultado.includes(',') ? resultado.split(',').pop() : resultado;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
    reader.readAsDataURL(file);
  });
}

function descargarBase64ComoArchivo(base64, nombreArchivo, mime) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i += 1) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: mime || 'application/octet-stream' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nombreArchivo || 'archivo.xlsx';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}


function mensajeErrorUsuario(error, fallback) {
  const raw = String(error?.data?.mensaje || error?.message || fallback || '').trim();
  const tecnico = /La API no devolvió JSON válido|Undefined array key|<br\s*\/?>|<b>|Warning|Notice|Fatal error|\.php|SQLSTATE|Stack trace/i.test(raw);

  if (tecnico) {
    return fallback || 'No se pudo procesar la operación. Revisá los datos ingresados y volvé a intentar.';
  }

  return raw || fallback || 'No se pudo procesar la operación.';
}

function tipoToast(tipo) {
  if (tipo === 'success') return 'exito';
  if (tipo === 'warning') return 'advertencia';
  return tipo || 'info';
}

function esToastPersistente(tipo) {
  return ['error', 'advertencia', 'alerta'].includes(tipoToast(tipo));
}

export function usePrevias() {
  const [previasBase, setPreviasBase] = useState([]);
  const [catalogos, setCatalogos] = useState({ cursos: [], divisiones: [], condiciones: [] });
  const [materiasPorCursoCache, setMateriasPorCursoCache] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState(null);
  const [busqueda, setBusquedaState] = useState('');
  const [busquedaDebounced, setBusquedaDebounced] = useState('');
  const [vista, setVista] = useState('activas');
  const [filtrosPrevias, setFiltrosPrevias] = useState({
    idCondicion: '',
    idCurso: '',
    idDivision: '',
  });

  const paginacion = usePaginacion(100);

  const cerrarMensaje = useCallback(() => {
    window.clearTimeout(window.__previasMsgTimer);
    setMensaje(null);
    setError('');
  }, []);

  const cerrarError = useCallback(() => {
    setError('');
  }, []);

  const mostrarMensaje = useCallback((tipo, texto, duracion = 3800) => {
    if (!texto) return;

    const tipoNormalizado = tipoToast(tipo);
    window.clearTimeout(window.__previasMsgTimer);
    setMensaje({ tipo: tipoNormalizado, texto, duracion });

    if (esToastPersistente(tipoNormalizado)) return;

    window.__previasMsgTimer = window.setTimeout(() => setMensaje(null), duracion);
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
      const filtros = { activo };
      const busquedaLimpia = busquedaDebounced.trim();
      const idCondicion = Number(filtrosPrevias.idCondicion || 0);
      const idCurso = Number(filtrosPrevias.idCurso || 0);
      const idDivision = Number(filtrosPrevias.idDivision || 0);

      if (busquedaLimpia !== '') {
        filtros.busqueda = busquedaLimpia;
      }

      if (idCondicion > 0) filtros.id_condicion = idCondicion;
      if (idCurso > 0) filtros.materia_id_curso = idCurso;
      if (idDivision > 0) filtros.materia_id_division = idDivision;

      const res = await previasApi.listar(
        paginacion.pagina,
        paginacion.porPagina,
        filtros
      );

      setPreviasBase(Array.isArray(res.data) ? res.data : []);
      paginacion.actualizarPaginacion(res.paginacion || {});
    } catch (e) {
      const msg = mensajeErrorUsuario(e, 'No se pudieron cargar las previas.');
      setError(msg);
      mostrarMensaje('error', msg);
      setPreviasBase([]);
      paginacion.actualizarPaginacion({ pagina: 1, total: 0, paginas: 1 });
    } finally {
      setLoading(false);
    }
  }, [vista, busquedaDebounced, filtrosPrevias, paginacion.pagina, paginacion.porPagina, mostrarMensaje]);

  useEffect(() => {
    cargarCatalogos();
  }, [cargarCatalogos]);

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

  function setFiltroPrevia(campo, valor) {
    paginacion.setPagina(1);
    setFiltrosPrevias((prev) => ({
      ...prev,
      [campo]: valor,
    }));
  }

  function limpiarFiltrosPrevias() {
    paginacion.setPagina(1);
    setFiltrosPrevias({
      idCondicion: '',
      idCurso: '',
      idDivision: '',
    });
  }

  function cambiarVista(nuevaVista) {
    paginacion.setPagina(1);
    setVista(nuevaVista);
    setBusquedaState('');
    setBusquedaDebounced('');
    limpiarFiltrosPrevias();
  }

  const hayFiltrosPrevias = useMemo(() => (
    Number(filtrosPrevias.idCondicion || 0) > 0 ||
    Number(filtrosPrevias.idCurso || 0) > 0 ||
    Number(filtrosPrevias.idDivision || 0) > 0
  ), [filtrosPrevias]);

  const conteo = useMemo(() => ({
    totalRegistros: Number(paginacion.totalRegistros || 0),
    totalPagina: previasBase.length,
    totalFiltrados: (busquedaDebounced.trim() !== '' || hayFiltrosPrevias) ? Number(paginacion.totalRegistros || 0) : previasBase.length,
  }), [paginacion.totalRegistros, previasBase.length, busquedaDebounced, hayFiltrosPrevias]);

  async function obtener(idPrevia) {
    try {
      const res = await previasApi.obtener(idPrevia);
      return { ok: true, data: res.data };
    } catch (e) {
      const msg = mensajeErrorUsuario(e, 'No se pudo obtener la previa.');
      mostrarMensaje('error', msg);
      return { ok: false, mensaje: msg };
    }
  }

  async function guardar(payload) {
    try {
      await previasApi.guardar(payload);
      await cargar();
      mostrarMensaje('exito', payload?.id_previa ? 'Previa actualizada correctamente.' : 'Previa guardada correctamente.');
      return { ok: true };
    } catch (e) {
      const msg = mensajeErrorUsuario(e, 'No se pudo guardar la previa.');
      mostrarMensaje('error', msg);
      return { ok: false, mensaje: msg };
    }
  }

  async function darBaja(item, motivo = '') {
    try {
      await previasApi.cambiarEstado(item.id_previa, 0, motivo);
      await cargar();
      mostrarMensaje('exito', 'Previa dada de baja correctamente.');
      return { ok: true };
    } catch (e) {
      const msg = mensajeErrorUsuario(e, 'No se pudo dar de baja la previa.');
      mostrarMensaje('error', msg);
      return { ok: false, mensaje: msg };
    }
  }

  async function darAlta(item) {
    try {
      await previasApi.cambiarEstado(item.id_previa, 1);
      await cargar();
      mostrarMensaje('exito', 'Previa dada de alta correctamente.');
      return { ok: true };
    } catch (e) {
      const msg = mensajeErrorUsuario(e, 'No se pudo dar de alta la previa.');
      mostrarMensaje('error', msg);
      return { ok: false, mensaje: msg };
    }
  }

  async function verificarEliminacion(item) {
    try {
      const res = await previasApi.verificarEliminacion(item.id_previa);
      return { ok: true, data: res?.data || res || {} };
    } catch (e) {
      const msg = mensajeErrorUsuario(e, 'No se pudo verificar si la previa tiene mesas o historial.');
      mostrarMensaje('error', msg);
      return { ok: false, mensaje: msg, data: null };
    }
  }

  async function eliminar(item, opciones = {}) {
    try {
      await previasApi.eliminar(item.id_previa, { forzar: Boolean(opciones?.forzar) });
      await cargar();
      mostrarMensaje('exito', 'Previa eliminada correctamente.');
      return { ok: true };
    } catch (e) {
      const msg = mensajeErrorUsuario(e, 'No se pudo eliminar la previa.');
      mostrarMensaje('error', msg, 5200);
      return {
        ok: false,
        mensaje: msg,
        data: e?.data?.data || e?.data || null,
      };
    }
  }

  async function descargarPlantillaImportacion() {
    try {
      const res = await previasApi.plantillaImportacion();
      const base64 = res?.archivo_base64 || res?.data?.archivo_base64;
      const nombre = res?.nombre_archivo || res?.data?.nombre_archivo || 'plantilla_importacion_previas.xlsx';
      const mime = res?.mime || res?.data?.mime || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

      if (!base64) throw new Error('El backend no devolvió la plantilla.');

      descargarBase64ComoArchivo(base64, nombre, mime);
      mostrarMensaje('exito', 'Plantilla descargada correctamente.');
      return { ok: true };
    } catch (e) {
      const msg = mensajeErrorUsuario(e, 'No se pudo descargar la plantilla de importación.');
      mostrarMensaje('error', msg);
      return { ok: false, mensaje: msg };
    }
  }

  async function previsualizarPreviasExcel(file) {
    try {
      if (!file) {
        return { ok: false, mensaje: 'Seleccioná un archivo Excel .xlsx.' };
      }

      if (!String(file.name || '').toLowerCase().endsWith('.xlsx')) {
        return { ok: false, mensaje: 'La previsualización acepta únicamente archivos .xlsx.' };
      }

      if (Number(file.size || 0) > 8 * 1024 * 1024) {
        return { ok: false, mensaje: 'El Excel es demasiado pesado. Dividí la carga en archivos más chicos.' };
      }

      const archivoBase64 = await leerArchivoComoBase64(file);
      const res = await previasApi.previsualizarExcel({
        nombreArchivo: file.name,
        archivoBase64,
      });

      return {
        ok: true,
        mensaje: res?.mensaje || 'Vista previa generada correctamente.',
        data: res?.data || {},
      };
    } catch (e) {
      const msg = mensajeErrorUsuario(e, 'No se pudo previsualizar el Excel. Corregí el archivo y volvé a intentar.');
      return {
        ok: false,
        mensaje: msg,
        errores: Array.isArray(e?.data?.errores) ? e.data.errores : [],
        totalErrores: Number(e?.data?.total_errores || 0),
      };
    }
  }

  async function importarPreviasExcel(file) {
    try {
      if (!file) {
        return { ok: false, mensaje: 'Seleccioná un archivo Excel .xlsx.' };
      }

      if (!String(file.name || '').toLowerCase().endsWith('.xlsx')) {
        return { ok: false, mensaje: 'La importación acepta únicamente archivos .xlsx.' };
      }

      if (Number(file.size || 0) > 8 * 1024 * 1024) {
        return { ok: false, mensaje: 'El Excel es demasiado pesado. Dividí la carga en archivos más chicos.' };
      }

      const archivoBase64 = await leerArchivoComoBase64(file);
      const res = await previasApi.importarExcel({
        nombreArchivo: file.name,
        archivoBase64,
      });

      await cargar();
      const msg = res?.mensaje || 'Importación completada correctamente.';
      mostrarMensaje('exito', msg, 4600);

      return {
        ok: true,
        mensaje: msg,
        data: res?.data || {},
      };
    } catch (e) {
      const msg = mensajeErrorUsuario(e, 'No se pudo importar el Excel. Corregí el archivo y volvé a intentar.');
      return {
        ok: false,
        mensaje: msg,
        errores: Array.isArray(e?.data?.errores) ? e.data.errores : [],
        totalErrores: Number(e?.data?.total_errores || 0),
      };
    }
  }

  async function obtenerTodasParaExportar() {
    const activo = vista === 'bajas' ? 0 : 1;
    const filtros = {};
    const busquedaLimpia = busquedaDebounced.trim();
    const idCondicion = Number(filtrosPrevias.idCondicion || 0);
    const idCurso = Number(filtrosPrevias.idCurso || 0);
    const idDivision = Number(filtrosPrevias.idDivision || 0);

    if (busquedaLimpia !== '') filtros.busqueda = busquedaLimpia;
    if (idCondicion > 0) filtros.id_condicion = idCondicion;
    if (idCurso > 0) filtros.materia_id_curso = idCurso;
    if (idDivision > 0) filtros.materia_id_division = idDivision;

    const res = await previasApi.listarTodos(activo, filtros);
    return Array.isArray(res.data) ? res.data : [];
  }

  return {
    previas: previasBase,
    previasBase,
    catalogos,
    materiasPorCursoCache,
    loading,
    error,
    mensaje,
    cerrarMensaje,
    cerrarError,
    mostrarMensaje,
    busqueda,
    setBusqueda,
    filtrosPrevias,
    setFiltroPrevia,
    limpiarFiltrosPrevias,
    hayFiltrosPrevias,
    vista,
    cambiarVista,
    conteo,
    paginacion,
    reload: cargar,
    obtener,
    obtenerMateriasPorCurso,
    guardar,
    darBaja,
    darAlta,
    verificarEliminacion,
    eliminar,
    descargarPlantillaImportacion,
    previsualizarPreviasExcel,
    importarPreviasExcel,
    obtenerTodasParaExportar,
  };
}
