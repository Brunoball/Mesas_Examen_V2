import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBoxOpen,
  faCheckCircle,
  faEdit,
  faSpinner,
  faPlus,
  faSearch,
  faTimes,
  faTrash,
  faUserCheck,
  faUserSlash,
} from '@fortawesome/free-solid-svg-icons';
import { previasApi } from './api/previasApi';
import { usePaginacion } from '../_shared/hooks/usePaginacion';
import ModalPrevia from './modales/ModalPrevia.jsx';
import ModalImportarPrevias from './modales/ModalImportarPrevias.jsx';
import ModalInscribirPrevia from './modales/ModalInscribirPrevia.jsx';
import ModalEliminarGlobal from '../Global/Modales/ModalEliminarGlobal.jsx';
import ModalExportarGlobal from '../Global/Modales/ModalExportarGlobal.jsx';
import BotonExportarHistorialGlobal from '../Global/Botones/BotonExportarHistorialGlobal.jsx';
import Toast from '../Global/Toast.jsx';
import '../Global/Global_css/roots.css';
import '../Global/Global_css/Global_Section.css';
import '../Global/Global_css/Global_DivTable.css';
import './Previas.css';
import '../Global/Global_css/Global_PreviasResponsive.css';
import Principal, { MesasShellContext } from '../Principal/Principal';


// Hook integrado en este mismo archivo para evitar problemas de resolución de ruta en Windows/Webpack.
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

function esCursoEgresado(curso = {}) {
  return String(curso?.nombre_curso || '').trim().toUpperCase() === 'EGRESADO';
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

function usePrevias() {
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
      // La pestaña Previas debe mostrar TODAS las previas activas, estén inscriptas o no.
      // Solo la pestaña Inscriptos filtra por inscripción = 1.
      if (vista === 'inscriptos') filtros.inscripcion = 1;
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
    // El buscador debe conservar lo que escribe el usuario (mayúsculas/minúsculas).
    // Los demás campos siguen usando normalizarMayus cuando corresponde.
    setBusquedaState(String(value ?? ''));
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
    // No se limpia la búsqueda al cambiar de pestaña: el usuario debe conservar
    // lo que escribió en el buscador y ver el mismo filtro aplicado en la nueva vista.
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

  async function obtenerMateriasInscripcion(item) {
    try {
      const idPrevia = Number(item?.id_previa || item || 0);
      const res = await previasApi.obtenerMateriasInscripcion(idPrevia);
      return { ok: true, data: res?.data || res || {} };
    } catch (e) {
      const msg = mensajeErrorUsuario(e, 'No se pudieron obtener las materias para inscribir.');
      mostrarMensaje('error', msg);
      return { ok: false, mensaje: msg, data: null };
    }
  }

  async function inscribirManual(payload) {
    try {
      const res = await previasApi.inscribirManual(payload);
      await cargar();
      const emailEnviado = Boolean(res?.data?.email_enviado ?? res?.email_enviado);
      mostrarMensaje(
        emailEnviado ? 'exito' : 'advertencia',
        res?.mensaje || (emailEnviado
          ? 'Inscripción manual registrada y email enviado correctamente.'
          : 'Inscripción manual registrada, pero no se pudo enviar el email.')
      );
      return { ok: true, data: res?.data || res || {} };
    } catch (e) {
      const msg = mensajeErrorUsuario(e, 'No se pudo registrar la inscripción manual.');
      mostrarMensaje('error', msg);
      return { ok: false, mensaje: msg };
    }
  }

  async function quitarInscripcion(item) {
    try {
      await previasApi.quitarInscripcion(item.id_previa);
      await cargar();
      mostrarMensaje('exito', 'Inscripción dada de baja correctamente.');
      return { ok: true };
    } catch (e) {
      const msg = mensajeErrorUsuario(e, 'No se pudo dar de baja la inscripción.');
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
    // La exportación de Previas también debe traer todas las activas, sin filtrar por inscripción.
    if (vista === 'inscriptos') filtros.inscripcion = 1;
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
    obtenerMateriasInscripcion,
    inscribirManual,
    quitarInscripcion,
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

const PREVIAS_GRID_COLS = '1.35fr .5fr 2fr .5fr .5fr .5fr .9fr';
const PREVIAS_BAJAS_GRID_COLS = '1.22fr .7fr 1.65fr .48fr .48fr .58fr 1.12fr .84fr';
const SKELETON_ROWS = 8;

const PREVIAS_COLUMNS = [
  { key: 'alumno', label: 'Alumno', strong: true },
  { key: 'dni', label: 'DNI', align: 'center'},
  { key: 'materia', label: 'Materia' },
  { key: 'condicion', label: 'Condición', align: 'center' },
  { key: 'curso', label: 'Curso', align: 'center' },
  { key: 'inscripcion', label: 'Inscripción', align: 'center' },
  { key: 'acciones', label: 'Acciones', align: 'center', actions: true },
];

const PREVIAS_BAJAS_COLUMNS = [
  { key: 'alumno', label: 'Alumno', strong: true },
  { key: 'dni', label: 'DNI', align: 'center' },
  { key: 'materia', label: 'Materia' },
  { key: 'condicion', label: 'Condición', align: 'center' },
  { key: 'curso', label: 'Curso', align: 'center' },
  { key: 'fecha_baja', label: 'Fecha baja', align: 'center' },
  { key: 'motivo_baja', label: 'Motivo baja' },
  { key: 'acciones', label: 'Acciones', align: 'center', actions: true },
];

const SKELETON_WIDTHS = ['72%', '52%', '68%', '42%', '38%', '46%', '44%'];

const PREVIAS_EXPORT_COLUMNS = [
  { label: 'Alumno', value: (item) => safeText(item.alumno) },
  { label: 'DNI', value: (item) => safeText(item.dni) },
  { label: 'Materia', value: (item) => safeText(item.materia) },
  { label: 'Condición', value: (item) => safeText(item.condicion) },
  { label: 'Curso materia', value: (item) => safeText(item.curso_materia) },
  { label: 'Curso actual', value: (item) => safeText(item.curso_cursando) },
  { label: 'Año', value: (item) => safeText(item.anio) },
  { label: 'Inscripción', value: (item) => safeText(item.inscripcion_texto || (Number(item.inscripcion) === 1 ? 'Sí' : 'No')) },
];

const PREVIAS_BAJAS_EXPORT_COLUMNS = [
  { label: 'Alumno', value: (item) => safeText(item.alumno) },
  { label: 'DNI', value: (item) => safeText(item.dni) },
  { label: 'Materia', value: (item) => safeText(item.materia) },
  { label: 'Condición', value: (item) => safeText(item.condicion) },
  { label: 'Curso materia', value: (item) => safeText(item.curso_materia) },
  { label: 'Curso actual', value: (item) => safeText(item.curso_cursando) },
  { label: 'Año', value: (item) => safeText(item.anio) },
  { label: 'Fecha de baja', value: (item) => fechaBajaTexto(item.fecha_baja) },
  { label: 'Motivo de baja', value: (item) => safeText(item.motivo_baja) },
];

function safeText(value) {
  const text = String(value ?? '').trim();
  return text || '—';
}

function normalizarMayus(value) {
  return String(value ?? '').toLocaleUpperCase('es-AR');
}

function fechaBajaTexto(value) {
  const text = String(value ?? '').trim();
  if (!text) return '—';

  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return text;

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function separarMotivoBaja(value) {
  const original = String(value ?? '').trim();
  if (!original) return { motivo: '—', nota: '' };

  const notaMatch = original.match(/(?:^|[\s·•,;()\[\]_-])nota\b(?:\s+de)?\s*[:=]?\s*([0-9]+(?:[,.][0-9]+)?|[a-záéíóúñ]+)/i);
  const nota = notaMatch ? String(notaMatch[1]).trim().toLocaleUpperCase('es-AR') : '';
  const esAprobadoEnMesa = /aprob(?:ad[oa]|ó)\s+en\s+mesa/i.test(original);

  const motivo = notaMatch
    ? esAprobadoEnMesa
      ? 'Aprobado en mesa'
      : original
          .replace(/(?:^|[\s·•,;()\[\]_-])nota\b(?:\s+de)?\s*[:=]?\s*([0-9]+(?:[,.][0-9]+)?|[a-záéíóúñ]+)/i, ' ')
          .replace(/\b(?:con|de|con\s+la|con\s+el)\s*$/i, '')
          .replace(/[\s·•,;()\[\]_-]+$/g, '')
          .replace(/^[\s·•,;()\[\]_-]+/g, '')
          .replace(/\s{2,}/g, ' ')
          .trim()
    : original;

  return { motivo: motivo || original, nota };
}

function renderMotivoBaja(value) {
  const { motivo, nota } = separarMotivoBaja(value);

  return (
    <div className="previas-motivo-baja-cell" title={safeText(value)}>
      <strong>{safeText(motivo)}</strong>
      {nota ? <small>Nota: {nota}</small> : null}
    </div>
  );
}

function alignClass(align) {
  if (align === 'right') return 'is-right';
  if (align === 'center') return 'is-center';
  return '';
}

function renderSkeletonRow(index, columns = PREVIAS_COLUMNS, gridCols = PREVIAS_GRID_COLS) {
  return (
    <div
      key={`previa-skel-${index}`}
      className="mov-gridTable mov-gridTable--row mov-row--skeleton global-divTable__row previas-gridRow"
      style={{ gridTemplateColumns: gridCols }}
      role="row"
      aria-hidden="true"
    >
      {columns.map((column, columnIndex) => (
        <div
          key={column.key}
          className={[
            'mov-gridCell',
            alignClass(column.align),
            column.actions ? 'mov-gridCell--actions' : '',
          ].filter(Boolean).join(' ')}
          role="cell"
          data-label={column.label}
        >
          {column.actions ? (
            <div className="mov-skelActions">
              <span className="mov-skelIcon" />
              <span className="mov-skelIcon" />
              <span className="mov-skelIcon" />
            </div>
          ) : (
            <span className="mov-skeletonBar" style={{ width: SKELETON_WIDTHS[(index + columnIndex) % SKELETON_WIDTHS.length] }} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function Previas() {
  const dentroDeShell = useContext(MesasShellContext);

  const {
    previas,
    catalogos,
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
    obtener,
    obtenerMateriasInscripcion,
    inscribirManual,
    quitarInscripcion,
    guardar,
    darBaja,
    darAlta,
    verificarEliminacion,
    eliminar,
    descargarPlantillaImportacion,
    previsualizarPreviasExcel,
    importarPreviasExcel,
    obtenerTodasParaExportar,
    obtenerMateriasPorCurso,
  } = usePrevias();

  const [modalPrevia, setModalPrevia] = useState({ abierto: false, modo: 'crear', item: null, cargando: false });
  const [modalImportar, setModalImportar] = useState(false);
  const [modalConfirmar, setModalConfirmar] = useState({ abierto: false, tipo: '', item: null, riesgo: null, cargandoRiesgo: false });
  const [confirmacionRiesgo, setConfirmacionRiesgo] = useState(false);
  const [modalExportar, setModalExportar] = useState(false);
  const [modalInscripcion, setModalInscripcion] = useState({ abierto: false, item: null, data: null, cargando: false, guardando: false, error: '' });

  function abrirImportarDesdeExportar() {
    setModalExportar(false);
    setModalImportar(true);
  }

  function abrirCrear() {
    setModalPrevia({ abierto: true, modo: 'crear', item: null, cargando: false });
  }

  async function abrirEditar(item) {
    // No mostramos un modal intermedio de carga: se abre directamente cuando llega la previa completa.
    setModalPrevia({ abierto: false, modo: 'editar', item: null, cargando: true });
    const res = await obtener(item.id_previa);
    if (res.ok) {
      setModalPrevia({ abierto: true, modo: 'editar', item: res.data, cargando: false });
    } else {
      setModalPrevia({ abierto: false, modo: 'crear', item: null, cargando: false });
    }
  }

  async function abrirInscripcionManual(item) {
    setModalInscripcion({ abierto: true, item, data: null, cargando: true, guardando: false, error: '' });
    const res = await obtenerMateriasInscripcion(item);
    if (res.ok) {
      setModalInscripcion({ abierto: true, item, data: res.data, cargando: false, guardando: false, error: '' });
    } else {
      setModalInscripcion((prev) => ({ ...prev, cargando: false, error: '' }));
    }
  }

  async function confirmarInscripcionManual(payload) {
    setModalInscripcion((prev) => ({ ...prev, guardando: true, error: '' }));
    const res = await inscribirManual(payload);

    if (res.ok) {
      setModalInscripcion({ abierto: false, item: null, data: null, cargando: false, guardando: false, error: '' });
      return res;
    }

    setModalInscripcion((prev) => ({ ...prev, guardando: false, error: '' }));
    return res;
  }


  async function abrirConfirmar(tipo, item) {
    setConfirmacionRiesgo(false);

    if (tipo !== 'eliminar') {
      setModalConfirmar({ abierto: true, tipo, item, riesgo: null, cargandoRiesgo: false });
      return;
    }

    setModalConfirmar({ abierto: true, tipo, item, riesgo: null, cargandoRiesgo: true });
    const res = await verificarEliminacion(item);
    setModalConfirmar((prev) => {
      if (!prev.abierto || prev.tipo !== 'eliminar' || prev.item?.id_previa !== item.id_previa) return prev;
      return {
        ...prev,
        riesgo: res?.ok ? (res?.data || null) : {
          vinculada: true,
          requiere_doble_confirmacion: true,
          verificacion_error: true,
          mensaje_advertencia: res?.mensaje || 'No se pudo verificar la previa. Por seguridad se requiere doble confirmación.',
          resumen: { mesas_actuales: 0, historial_mesas: 0, historial_resultados: 0, total_vinculos: 0 },
        },
        cargandoRiesgo: false,
      };
    });
  }

  async function confirmarOperacion(payload = {}) {
    const motivo = typeof payload === 'string' ? payload : (payload?.motivo || payload?.reason || '');

    if (modalConfirmar.tipo === 'baja') return darBaja(modalConfirmar.item, motivo);
    if (modalConfirmar.tipo === 'alta') return darAlta(modalConfirmar.item);
    if (modalConfirmar.tipo === 'quitar_inscripcion') return quitarInscripcion(modalConfirmar.item);
    if (modalConfirmar.tipo === 'eliminar') {
      const vinculada = Boolean(modalConfirmar.riesgo?.vinculada || modalConfirmar.riesgo?.requiere_doble_confirmacion);
      return eliminar(modalConfirmar.item, { forzar: vinculada && confirmacionRiesgo });
    }
    return { ok: false, mensaje: 'Operación inválida.' };
  }

  const totalVisible = Array.isArray(previas) ? previas.length : 0;
  const hayBusqueda = busqueda.trim() !== '';
  const hayFiltrosAplicados = Boolean(hayBusqueda || hayFiltrosPrevias);
  const condicionesFiltro = Array.isArray(catalogos?.condiciones) ? catalogos.condiciones : [];
  const cursosFiltro = Array.isArray(catalogos?.cursos) ? catalogos.cursos.filter((curso) => !esCursoEgresado(curso)) : [];
  const divisionesFiltro = Array.isArray(catalogos?.divisiones) ? catalogos.divisiones : [];
  const riesgoEliminacion = modalConfirmar.tipo === 'eliminar' ? modalConfirmar.riesgo : null;
  const previaVinculada = Boolean(riesgoEliminacion?.vinculada || riesgoEliminacion?.requiere_doble_confirmacion);
  const nombreVista = vista === 'bajas' ? 'previas dadas de baja' : (vista === 'inscriptos' ? 'previas inscriptas' : 'previas activas');
  const columnasTabla = vista === 'bajas' ? PREVIAS_BAJAS_COLUMNS : PREVIAS_COLUMNS;
  const gridColsTabla = vista === 'bajas' ? PREVIAS_BAJAS_GRID_COLS : PREVIAS_GRID_COLS;
  const columnasExportacion = vista === 'bajas' ? PREVIAS_BAJAS_EXPORT_COLUMNS : PREVIAS_EXPORT_COLUMNS;

  function puedeInscribirManual(item) {
    const condicion = String(item?.condicion || '').trim().toUpperCase();
    const esPrevia = Number(item?.id_condicion || 0) === 3 || condicion === 'PREVIA';
    return vista === 'activas' && esPrevia && Number(item?.inscripcion || 0) !== 1 && Number(item?.activo ?? 1) === 1;
  }

  const extraEliminar = useMemo(() => {
    if (modalConfirmar.tipo !== 'eliminar') return null;

    if (modalConfirmar.cargandoRiesgo) {
      return (
        <div className="previas-delete-loading">
          <FontAwesomeIcon icon={faSpinner} spin /> Verificando si la previa está en mesas o historial...
        </div>
      );
    }

    if (!previaVinculada) return null;

    const resumen = riesgoEliminacion?.resumen || {};
    return (
      <div className="previas-delete-risk" aria-label="Indicadores de vinculación">
        <div className="previas-delete-risk__summary">
          <span>Mesas actuales: <b>{Number(resumen.mesas_actuales || 0)}</b></span>
          <span>Historial de mesas: <b>{Number(resumen.historial_mesas || 0)}</b></span>
          <span>Historial de resultados: <b>{Number(resumen.historial_resultados || 0)}</b></span>
        </div>
        <label className="previas-delete-risk__check">
          <input
            type="checkbox"
            checked={confirmacionRiesgo}
            onChange={(event) => setConfirmacionRiesgo(event.target.checked)}
          />
          <span>Confirmar eliminación de una previa vinculada.</span>
        </label>
      </div>
    );
  }, [modalConfirmar.tipo, modalConfirmar.cargandoRiesgo, previaVinculada, riesgoEliminacion, confirmacionRiesgo]);

  const modalGlobalConfig = {
    baja: {
      operacion: 'baja',
      title: 'Dar de baja previa',
      message: 'Confirmá el cambio de estado de la previa seleccionada.',
      warning: '',
      confirmLabel: 'Dar de baja',
      loadingLabel: 'Procesando...',
      successMessage: 'Previa dada de baja correctamente.',
      errorMessage: 'No se pudo dar de baja la previa.',
      tone: 'warning',
      showReason: true,
      reasonLabel: 'Motivo de baja',
      reasonPlaceholder: 'Ej: registro cargado por error, alumno regularizó, etc.',
    },
    alta: {
      operacion: 'alta',
      title: 'Dar de alta previa',
      message: 'Confirmá el alta de la previa seleccionada.',
      warning: '',
      confirmLabel: 'Dar de alta',
      loadingLabel: 'Procesando...',
      successMessage: 'Previa dada de alta correctamente.',
      errorMessage: 'No se pudo dar de alta la previa.',
      tone: 'success',
      showReason: false,
    },
    quitar_inscripcion: {
      operacion: 'eliminar',
      title: 'Borrar inscripción',
      message: 'Confirmá la baja de la inscripción seleccionada. La previa seguirá cargada, pero volverá a figurar como no inscripta.',
      confirmLabel: 'Borrar inscripción',
      loadingLabel: 'Procesando...',
      successMessage: 'Inscripción dada de baja correctamente.',
      errorMessage: 'No se pudo dar de baja la inscripción.',
      tone: 'danger',
      showReason: false,
    },
    eliminar: {
      operacion: 'eliminar',
      title: previaVinculada ? 'Eliminar previa vinculada' : 'Eliminar previa',
      message: 'Confirmá la eliminación de la previa seleccionada.',
      warning: '',
      confirmLabel: previaVinculada ? 'Eliminar vinculada' : 'Eliminar',
      loadingLabel: 'Eliminando...',
      successMessage: 'Previa eliminada correctamente.',
      errorMessage: 'No se pudo eliminar la previa.',
      tone: 'danger',
      showReason: false,
      extraContent: extraEliminar,
      confirmDisabled: Boolean(modalConfirmar.cargandoRiesgo || (previaVinculada && !confirmacionRiesgo)),
    },
  }[modalConfirmar.tipo] || {
    operacion: 'advertencia',
    title: 'Confirmar acción',
    message: 'Confirmá la operación seleccionada.',
    warning: '',
    confirmLabel: 'Confirmar',
    loadingLabel: 'Procesando...',
    successMessage: 'Operación realizada correctamente.',
    errorMessage: 'No se pudo completar la operación.',
    tone: 'primary',
    showReason: false,
  };

  const detallesModalGlobal = [
    { label: 'Alumno', value: safeText(modalConfirmar.item?.alumno) },
    { label: 'DNI', value: safeText(modalConfirmar.item?.dni) },
    { label: 'Materia', value: safeText(modalConfirmar.item?.materia) },
    { label: 'Curso', value: safeText(modalConfirmar.item?.curso_materia) },
  ];

  const contenido = (
    <div className="previas-page mov-page">
      {mensaje && (
        <Toast
          tipo={mensaje.tipo}
          mensaje={mensaje.texto}
          duracion={mensaje.duracion || 3800}
          onClose={cerrarMensaje}
        />
      )}

      {error && !mensaje && (
        <Toast
          tipo="error"
          mensaje={error}
          duracion={4200}
          onClose={cerrarError}
        />
      )}

      <section className="previas-card mov-card mov-card--table">
        <div className="mov-card__head previas-card__head">
          <div className="mov-card__headLeft previas-card__headLeft">
            <div className="title-mov previas-titleBox">
              <div className="mov-card__title previas-section-title">
                Mesas · Previas
              </div>

              <div className="previas-titleTabs" aria-label="Cambiar vista de previas">
                <button
                  type="button"
                  className={`mov-tab previas-titleTab ${vista === 'activas' ? 'is-active' : ''}`}
                  onClick={() => cambiarVista('activas')}
                >
                  Previas
                </button>
                <button
                  type="button"
                  className={`mov-tab previas-titleTab ${vista === 'inscriptos' ? 'is-active' : ''}`}
                  onClick={() => cambiarVista('inscriptos')}
                >
                  Inscriptos
                </button>
                <button
                  type="button"
                  className={`mov-tab previas-titleTab ${vista === 'bajas' ? 'is-active' : ''}`}
                  onClick={() => cambiarVista('bajas')}
                >
                  Dados de baja
                </button>
              </div>
            </div>

            <div className="mov-headFilters previas-headFilters">
              <div className="cc-filter previas-searchFilter">
                <div className={`cc-floatingField cc-floatingField--search ${hayBusqueda ? 'is-active' : ''}`}>
                  <div className="cc-searchInput">
                    <div className="cc-searchInput__fieldWrap">
                      <input
                        className="cc-input cc-input--floating previas-searchInput"
                        type="text"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        placeholder="Búsqueda"
                      />
                      <span className="previas-filterTabs__label">
                        <FontAwesomeIcon icon={faSearch} /> Búsqueda
                      </span>
                      {hayBusqueda && (
                        <button
                          type="button"
                          className="cc-clearSearch cc-clearSearch--inside previas-clearSearch"
                          title="Limpiar búsqueda"
                          onClick={() => setBusqueda('')}
                        >
                          <FontAwesomeIcon icon={faTimes} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="previas-filterSelects" aria-label="Filtros de previas">
                <label className={`previas-selectWrap previas-selecwit ${filtrosPrevias.idCondicion ? 'is-active' : ''}`}>
                  <select
                    className="previas-select"
                    value={filtrosPrevias.idCondicion}
                    onChange={(e) => setFiltroPrevia('idCondicion', e.target.value)}
                  >
                    <option value="">Todas</option>
                    {condicionesFiltro.map((condicion) => (
                      <option key={condicion.id_condicion} value={condicion.id_condicion}>
                        {safeText(condicion.condicion)}
                      </option>
                    ))}
                  </select>
                  <span className="previas-filterTabs__label">Condición</span>
                </label>

                <label className={`previas-selectWrap previas-selecwit ${filtrosPrevias.idCurso ? 'is-active' : ''}`}>
                  <select
                    className="previas-select"
                    value={filtrosPrevias.idCurso}
                    onChange={(e) => setFiltroPrevia('idCurso', e.target.value)}
                  >
                    <option value="">Todos</option>
                    {cursosFiltro.map((curso) => (
                      <option key={curso.id_curso} value={curso.id_curso}>
                        {safeText(curso.nombre_curso)}
                      </option>
                    ))}
                  </select>
                  <span className="previas-filterTabs__label">Curso</span>
                </label>

                <label className={`previas-selectWrap ${filtrosPrevias.idDivision ? 'is-active' : ''}`}>
                  <select
                    className="previas-select"
                    value={filtrosPrevias.idDivision}
                    onChange={(e) => setFiltroPrevia('idDivision', e.target.value)}
                  >
                    <option value="">Todas</option>
                    {divisionesFiltro.map((division) => (
                      <option key={division.id_division} value={division.id_division}>
                        {safeText(division.nombre_division)}
                      </option>
                    ))}
                  </select>
                  <span className="previas-filterTabs__label">División</span>
                </label>

                {hayFiltrosPrevias && (
                  <button
                    type="button"
                    className="previas-filterClearBtn"
                    onClick={limpiarFiltrosPrevias}
                    title="Limpiar filtros de condición, curso y división"
                  >
                    <FontAwesomeIcon icon={faTimes} /> 
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="mov-card__actions previas-actionsHead">
            <BotonExportarHistorialGlobal
              className="mov-btn mov-btn--secondary previas-headExportBtn"
              label="Exportar / importar"
              icon="excel"
              disabled={loading}
              onClick={() => setModalExportar(true)}
            />

            <button type="button" className="mov-btn mov-btn--primary" onClick={abrirCrear}>
              <FontAwesomeIcon icon={faPlus} /> Agregar previa
            </button>
          </div>
        </div>

        <div className="previas-divTable global-divTable" role="table" aria-label="Listado de previas">
          <div
            className="mov-gridTable mov-gridTable--head global-divTable__head previas-gridHead"
            style={{ gridTemplateColumns: gridColsTabla }}
            role="row"
          >
            {columnasTabla.map((column) => (
              <div
                key={column.key}
                className={[
                  'mov-gridCell',
                  'mov-gridCell--head',
                  alignClass(column.align),
                ].filter(Boolean).join(' ')}
                role="columnheader"
              >
                {column.label}
              </div>
            ))}
          </div>

          <div className="previas-table-wrap mov-tableWrap global-divTable__wrap" role="rowgroup">
            <div className={`mov-gridBody mov-gridBody--relative global-divTable__body previas-gridBody ${loading ? 'mov-softLoading' : ''}`}>
              {loading ? (
                <div className="mov-skeletonWrap" aria-busy="true" aria-label="Cargando previas">
                  {Array.from({ length: SKELETON_ROWS }).map((_, index) => renderSkeletonRow(index, columnasTabla, gridColsTabla))}
                </div>
              ) : (
                <>
                  {previas.map((item) => (
                    <div
                      key={item.id_previa}
                      className="mov-gridTable mov-gridTable--row global-divTable__row previas-gridRow"
                      style={{ gridTemplateColumns: gridColsTabla }}
                      role="row"
                    >
                      <div className="mov-gridCell is-strong" role="cell" data-label="Alumno">
                        <div className="previas-name-cell" title={safeText(item.alumno)}>
                          <strong>{safeText(item.alumno)}</strong>
                          <small>Actual: {safeText(item.curso_cursando)}</small>
                        </div>
                      </div>

                      <div className="mov-gridCell is-center" role="cell" data-label="DNI" title={safeText(item.dni)}>
                        <span className="mov-ellipsissss previas-dni-cell">{safeText(item.dni)}</span>
                      </div>

                      <div className="mov-gridCell" role="cell" data-label="Materia" title={safeText(item.materia)}>
                        <div className="previas-materia-cell">
                          <strong>{safeText(item.materia)}</strong>
                          <small>Año previa: {safeText(item.anio)}</small>
                        </div>
                      </div>

                      <div className="mov-gridCell is-center" role="cell" data-label="Condición">
                        <span className="mov-chip previas-badge">{safeText(item.condicion)}</span>
                      </div>

                      <div className="mov-gridCell is-center" role="cell" data-label="Curso">
                        <span className="mov-chip mov-chip--neutral previas-badge previas-badge-soft">
                          {safeText(item.curso_materia)}
                        </span>
                      </div>

                      {vista === 'bajas' ? (
                        <>
                          <div className="mov-gridCell is-center" role="cell" data-label="Fecha baja">
                            <span className="mov-chip mov-chip--neutral previas-pill previas-pill-muted">
                              {fechaBajaTexto(item.fecha_baja)}
                            </span>
                          </div>

                          <div className="mov-gridCell" role="cell" data-label="Motivo baja" title={safeText(item.motivo_baja)}>
                            {renderMotivoBaja(item.motivo_baja)}
                          </div>
                        </>
                      ) : (
                        <div className="mov-gridCell is-center" role="cell" data-label="Inscripción">
                          <span className={`mov-chip previas-pill ${Number(item.inscripcion) === 1 ? 'mov-chip--ok previas-pill-ok' : 'mov-chip--neutral previas-pill-muted'}`}>
                            {item.inscripcion_texto || (Number(item.inscripcion) === 1 ? 'Sí' : 'No')}
                          </span>
                        </div>
                      )}

                      <div className="mov-gridCell mov-gridCell--actions is-center" role="cell" data-label="Acciones">
                        <div className="mov-actionsInline">
                          {vista === 'activas' && (
                            <button type="button" className="mov-iconBtn previas-icon-btn" onClick={() => abrirEditar(item)} title="Editar previa">
                              <FontAwesomeIcon icon={faEdit} />
                            </button>
                          )}

                          {puedeInscribirManual(item) && (
                            <button type="button" className="mov-iconBtn previas-icon-btn previas-icon-inscribir" onClick={() => abrirInscripcionManual(item)} title="Inscribir manualmente">
                              <FontAwesomeIcon icon={faCheckCircle} />
                            </button>
                          )}

                          {vista === 'activas' && (
                            <button type="button" className="mov-iconBtn previas-icon-btn previas-icon-warning" onClick={() => abrirConfirmar('baja', item)} title="Dar de baja previa">
                              <FontAwesomeIcon icon={faUserSlash} />
                            </button>
                          )}

                          {vista === 'bajas' && (
                            <button type="button" className="mov-iconBtn previas-icon-btn previas-icon-success" onClick={() => abrirConfirmar('alta', item)} title="Dar de alta">
                              <FontAwesomeIcon icon={faUserCheck} />
                            </button>
                          )}

                          {vista === 'inscriptos' ? (
                            <button type="button" className="mov-iconBtn mov-iconBtn--danger previas-icon-btn previas-icon-danger" onClick={() => abrirConfirmar('quitar_inscripcion', item)} title="Borrar inscripción">
                              <FontAwesomeIcon icon={faTrash} />
                            </button>
                          ) : (
                            <button type="button" className="mov-iconBtn mov-iconBtn--danger previas-icon-btn previas-icon-danger" onClick={() => abrirConfirmar('eliminar', item)} title="Eliminar previa">
                              <FontAwesomeIcon icon={faTrash} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {previas.length === 0 && (
                    <div className="cc-emptyState previas-emptyState">
                      <FontAwesomeIcon icon={faBoxOpen} className="cc-emptyIcon" />
                      <div className="cc-emptyText">
                        {vista === 'bajas' ? 'No hay previas dadas de baja.' : (vista === 'inscriptos' ? 'No hay previas inscriptas.' : 'No se encontraron previas activas.')}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="previas-footer">
          <span>
            Registros únicos cargados: <strong>{conteo.totalRegistros}</strong>
          </span>

          {hayFiltrosAplicados && (
            <span>
              Coincidencias encontradas: <strong>{conteo.totalFiltrados}</strong>
            </span>
          )}

          <div className="previas-footerActions" aria-label="Acciones de exportación e importación">
            <BotonExportarHistorialGlobal
              className="mov-btn mov-btn--secondary previas-footExportBtn"
              label="Exportar / importar"
              icon="excel"
              disabled={loading}
              onClick={() => setModalExportar(true)}
            />
          </div>

          <div className="previas-pagination">
            <button
              type="button"
              className="previas-page-btn"
              disabled={paginacion.pagina <= 1 || loading}
              onClick={() => paginacion.setPagina((p) => Math.max(1, p - 1))}
            >
              Anterior
            </button>

            <span className="previas-page-info">
              Página <strong>{paginacion.pagina}</strong> / <strong>{paginacion.totalPaginas}</strong>
            </span>

            <button
              type="button"
              className="previas-page-btn"
              disabled={paginacion.pagina >= paginacion.totalPaginas || loading}
              onClick={() => paginacion.setPagina((p) => p + 1)}
            >
              Siguiente
            </button>
          </div>

        </div>
      </section>

      <ModalExportarGlobal
        abierto={modalExportar}
        title="Exportar previas"
        subtitle="Elegí cómo exportar las previas o abrí la importación desde este mismo modal."
        tituloArchivo="Mesas · Previas"
        nombreArchivo={`previas_${vista}`}
        columnas={columnasExportacion}
        registrosActuales={previas}
        obtenerRegistrosTodos={obtenerTodasParaExportar}
        cantidadActual={totalVisible}
        totalTodos={conteo.totalRegistros}
        totalLabelSingular="previa disponible"
        totalLabelPlural="previas disponibles"
        subtituloArchivoActual={`Vista: ${nombreVista} · Página actual: ${paginacion.pagina} de ${paginacion.totalPaginas} · Registros visibles: ${totalVisible}`}
        subtituloArchivoTodos={`Vista: ${nombreVista} · Todos los registros filtrados · Total: ${conteo.totalRegistros}`}
        alcanceActualLabel="Exportar solo actual"
        alcanceActualDescription="Descarga únicamente las previas visibles en esta página."
        alcanceTodosLabel="Exportar todos los registros"
        alcanceTodosDescription="Descarga todas las previas que coinciden con los filtros, la búsqueda y el estado actual."
        importLabel="Importar"
        importTitle="Abrir importación de previas"
        onImportarClick={abrirImportarDesdeExportar}
        onClose={() => setModalExportar(false)}
        onSuccess={(texto) => mostrarMensaje('exito', texto)}
        onError={(texto) => mostrarMensaje('error', texto)}
      />

      {modalPrevia.abierto && !modalPrevia.cargando && (
        <ModalPrevia
          modo={modalPrevia.modo}
          item={modalPrevia.item}
          catalogos={catalogos}
          onObtenerMateriasPorCurso={obtenerMateriasPorCurso}
          onGuardar={guardar}
          onToast={mostrarMensaje}
          onCerrar={() => setModalPrevia({ abierto: false, modo: 'crear', item: null, cargando: false })}
        />
      )}

      {modalImportar && (
        <ModalImportarPrevias
          open={modalImportar}
          onClose={() => setModalImportar(false)}
          onDescargarPlantilla={descargarPlantillaImportacion}
          onPrevisualizar={previsualizarPreviasExcel}
          onImportar={importarPreviasExcel}
          onToast={mostrarMensaje}
        />
      )}

      {modalInscripcion.abierto && (
        <ModalInscribirPrevia
          open={modalInscripcion.abierto}
          data={modalInscripcion.data}
          loading={modalInscripcion.cargando}
          saving={modalInscripcion.guardando}
          error={modalInscripcion.error}
          onToast={mostrarMensaje}
          onClose={() => setModalInscripcion({ abierto: false, item: null, data: null, cargando: false, guardando: false, error: '' })}
          onConfirm={confirmarInscripcionManual}
        />
      )}

      {modalConfirmar.abierto && (
        <ModalEliminarGlobal
          open={modalConfirmar.abierto}
          row={modalConfirmar.item}
          details={detallesModalGlobal}
          onClose={() => {
            setConfirmacionRiesgo(false);
            setModalConfirmar({ abierto: false, tipo: '', item: null, riesgo: null, cargandoRiesgo: false });
          }}
          onConfirm={confirmarOperacion}
          hideLocalError
          {...modalGlobalConfig}
        />
      )}
    </div>
  );

  return dentroDeShell ? contenido : <Principal>{contenido}</Principal>;
}
