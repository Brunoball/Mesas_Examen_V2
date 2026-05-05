import { useCallback, useEffect, useMemo, useState } from 'react';
import { disponibilidadDocentesApi } from '../api/disponibilidadDocentesApi.js';

const DIAS_DEFAULT = [
  { dia_semana: 1, nombre: 'Lunes' },
  { dia_semana: 2, nombre: 'Martes' },
  { dia_semana: 3, nombre: 'Miércoles' },
  { dia_semana: 4, nombre: 'Jueves' },
  { dia_semana: 5, nombre: 'Viernes' },
];

function normalizarDisponibilidades(disponibilidades = []) {
  return new Set(
    disponibilidades
      .filter((item) => item && Number(item.dia_semana) > 0 && Number(item.id_turno) > 0 && !item.fecha)
      .map((item) => `${Number(item.dia_semana)}-${Number(item.id_turno)}`)
  );
}

export function useDisponibilidadDocentes() {
  const [docentes, setDocentes] = useState([]);
  const [turnos, setTurnos] = useState([]);
  const [dias, setDias] = useState(DIAS_DEFAULT);
  const [estadisticas, setEstadisticas] = useState(null);
  const [docenteSeleccionado, setDocenteSeleccionado] = useState(null);
  const [detalleDocente, setDetalleDocente] = useState(null);
  const [seleccion, setSeleccion] = useState(new Set());
  const [busqueda, setBusqueda] = useState('');
  const [soloConCarga, setSoloConCarga] = useState(false);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const cargar = useCallback(async (preservarSeleccion = true) => {
    setLoading(true);
    setError('');
    try {
      const [catalogosRes, listadoRes] = await Promise.all([
        disponibilidadDocentesApi.catalogos(),
        disponibilidadDocentesApi.listar({}, 1),
      ]);

      const catalogos = catalogosRes?.data || {};
      const lista = Array.isArray(listadoRes?.data) ? listadoRes.data : [];

      setTurnos(Array.isArray(catalogos.turnos) ? catalogos.turnos : []);
      setDias(Array.isArray(catalogos.dias) && catalogos.dias.length ? catalogos.dias : DIAS_DEFAULT);
      setEstadisticas(catalogos.estadisticas || null);
      setDocentes(lista);

      const idActual = preservarSeleccion ? docenteSeleccionado?.id_docente : null;
      const siguiente = idActual
        ? lista.find((doc) => Number(doc.id_docente) === Number(idActual))
        : lista[0];

      if (siguiente) {
        setDocenteSeleccionado(siguiente);
      }
    } catch (err) {
      setError(err?.data?.mensaje || err?.message || 'No se pudo cargar la disponibilidad docente.');
    } finally {
      setLoading(false);
    }
  }, [docenteSeleccionado?.id_docente]);

  const cargarDetalle = useCallback(async (idDocente) => {
    if (!idDocente) return;
    setError('');
    try {
      const res = await disponibilidadDocentesApi.obtenerDocente(idDocente);
      const data = res?.data || null;
      setDetalleDocente(data);
      setSeleccion(normalizarDisponibilidades(data?.disponibilidades || []));
    } catch (err) {
      setError(err?.data?.mensaje || err?.message || 'No se pudo obtener el detalle del docente.');
    }
  }, []);

  useEffect(() => {
    cargar(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (docenteSeleccionado?.id_docente) {
      cargarDetalle(docenteSeleccionado.id_docente);
    } else {
      setDetalleDocente(null);
      setSeleccion(new Set());
    }
  }, [docenteSeleccionado?.id_docente, cargarDetalle]);

  const docentesFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return docentes.filter((doc) => {
      const coincideTexto = !q || [doc.docente, doc.cargo, doc.resumen]
        .join(' ')
        .toLowerCase()
        .includes(q);
      const coincideCarga = !soloConCarga || Number(doc.total_disponibilidades || 0) > 0;
      return coincideTexto && coincideCarga;
    });
  }, [docentes, busqueda, soloConCarga]);

  const seleccionarDocente = useCallback((docente) => {
    setMensaje('');
    setError('');
    setDocenteSeleccionado(docente);
  }, []);

  const toggleBloque = useCallback((diaSemana, idTurno) => {
    const key = `${Number(diaSemana)}-${Number(idTurno)}`;
    setSeleccion((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(key)) siguiente.delete(key);
      else siguiente.add(key);
      return siguiente;
    });
  }, []);

  const marcarTodos = useCallback(() => {
    const siguiente = new Set();
    dias.forEach((dia) => {
      turnos.forEach((turno) => {
        siguiente.add(`${Number(dia.dia_semana)}-${Number(turno.id_turno)}`);
      });
    });
    setSeleccion(siguiente);
  }, [dias, turnos]);

  const desmarcarTodos = useCallback(() => {
    setSeleccion(new Set());
  }, []);

  const guardar = useCallback(async () => {
    if (!docenteSeleccionado?.id_docente) {
      setError('Seleccioná un docente antes de guardar.');
      return false;
    }

    const disponibilidades = Array.from(seleccion).map((key) => {
      const [dia_semana, id_turno] = key.split('-').map(Number);
      return { dia_semana, id_turno };
    });

    setGuardando(true);
    setMensaje('');
    setError('');
    try {
      const res = await disponibilidadDocentesApi.guardarMatriz({
        id_docente: docenteSeleccionado.id_docente,
        disponibilidades,
      });
      setMensaje(res?.mensaje || 'Disponibilidad guardada correctamente.');
      await cargar(true);
      await cargarDetalle(docenteSeleccionado.id_docente);
      return true;
    } catch (err) {
      setError(err?.data?.mensaje || err?.message || 'No se pudo guardar la disponibilidad.');
      return false;
    } finally {
      setGuardando(false);
    }
  }, [docenteSeleccionado?.id_docente, seleccion, cargar, cargarDetalle]);

  const limpiarDocente = useCallback(async () => {
    if (!docenteSeleccionado?.id_docente) return false;
    setGuardando(true);
    setMensaje('');
    setError('');
    try {
      const res = await disponibilidadDocentesApi.limpiarDocente(docenteSeleccionado.id_docente);
      setMensaje(res?.mensaje || 'Disponibilidad limpiada correctamente.');
      setSeleccion(new Set());
      await cargar(true);
      await cargarDetalle(docenteSeleccionado.id_docente);
      return true;
    } catch (err) {
      setError(err?.data?.mensaje || err?.message || 'No se pudo limpiar la disponibilidad.');
      return false;
    } finally {
      setGuardando(false);
    }
  }, [docenteSeleccionado?.id_docente, cargar, cargarDetalle]);

  return {
    docentes,
    docentesFiltrados,
    turnos,
    dias,
    estadisticas,
    docenteSeleccionado,
    detalleDocente,
    seleccion,
    busqueda,
    soloConCarga,
    loading,
    guardando,
    error,
    mensaje,
    setBusqueda,
    setSoloConCarga,
    seleccionarDocente,
    toggleBloque,
    marcarTodos,
    desmarcarTodos,
    guardar,
    limpiarDocente,
    recargar: cargar,
  };
}
