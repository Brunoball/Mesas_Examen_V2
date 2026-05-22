// src/components/Configuracion/Usuarios/hooks/useConfiguracionUsuarios.js
import { useCallback, useEffect, useMemo, useState } from 'react';
import { configuracionUsuariosApi } from '../api/configuracionUsuariosApi';

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizarBooleano(valor) {
  return valor === true || Number(valor) === 1 || String(valor).toLowerCase() === 'true';
}

function obtenerUsuarioSesionLocal() {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage?.getItem('usuario');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function obtenerIdUsuario(usuario = {}) {
  return Number(
    usuario?.id_usuario ||
    usuario?.idUsuario ||
    usuario?.idUsuarioMaster ||
    usuario?.id_usuario_master ||
    usuario?.id ||
    0
  );
}

export function esUsuarioSesionActual(usuario = {}) {
  if (normalizarBooleano(usuario?.es_usuario_actual)) return true;

  const usuarioSesion = obtenerUsuarioSesionLocal();
  if (!usuarioSesion) return false;

  const idFila = obtenerIdUsuario(usuario);
  const idSesion = obtenerIdUsuario(usuarioSesion);

  if (idFila > 0 && idSesion > 0) return idFila === idSesion;

  const nombreFila = normalizar(usuario?.usuario || usuario?.username || usuario?.nombre_usuario);
  const nombreSesion = normalizar(usuarioSesion?.usuario || usuarioSesion?.username || usuarioSesion?.nombre_usuario);

  return Boolean(nombreFila && nombreSesion && nombreFila === nombreSesion);
}

export const USUARIO_FORM_INICIAL = {
  id_usuario: 0,
  usuario: '',
  email_recuperacion: '',
  rol: 'vista',
  contrasena: '',
  repetir_contrasena: '',
  activo: 1,
};

export function useConfiguracionUsuarios() {
  const [usuariosBase, setUsuariosBase] = useState([]);
  const [resumen, setResumen] = useState({ total: 0, activos: 0, bajas: 0, admins: 0, vista: 0 });
  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [vista, setVista] = useState('activos');
  const [modalAbierto, setModalAbierto] = useState(false);
  const [form, setForm] = useState(USUARIO_FORM_INICIAL);

  const mostrarMensaje = useCallback((tipo, texto, duracion = undefined) => {
    const tipoNormalizado = tipo === 'success' || tipo === 'ok' ? 'exito' : tipo;
    setMensaje({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      tipo: tipoNormalizado,
      texto,
      duracion,
    });
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const activo = vista === 'activos' ? 1 : vista === 'bajas' ? 0 : 'todos';
      const res = await configuracionUsuariosApi.listar({ activo });
      setUsuariosBase(Array.isArray(res.data) ? res.data : []);
      setResumen(res.resumen || { total: 0, activos: 0, bajas: 0, admins: 0, vista: 0 });
    } catch (e) {
      const msg = e.message || 'No se pudieron cargar los usuarios.';
      setError(msg);
      mostrarMensaje('error', msg);
      setUsuariosBase([]);
    } finally {
      setLoading(false);
    }
  }, [vista, mostrarMensaje]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const usuariosFiltrados = useMemo(() => {
    const q = normalizar(busqueda);
    if (!q) return usuariosBase;

    return usuariosBase.filter((item) => (
      normalizar(item.usuario).includes(q) ||
      normalizar(item.email_recuperacion).includes(q) ||
      normalizar(item.rol).includes(q) ||
      normalizar(item.rol_label).includes(q) ||
      normalizar(item.id_usuario).includes(q)
    ));
  }, [usuariosBase, busqueda]);

  function cambiarVista(nuevaVista) {
    setVista(nuevaVista);
    setBusqueda('');
  }

  function abrirCrear() {
    setForm({ ...USUARIO_FORM_INICIAL });
    setModalAbierto(true);
  }

  function abrirEditar(usuario) {
    setForm({
      id_usuario: obtenerIdUsuario(usuario),
      usuario: usuario?.usuario || '',
      email_recuperacion: usuario?.email_recuperacion || '',
      rol: usuario?.rol || 'vista',
      contrasena: '',
      repetir_contrasena: '',
      activo: Number(usuario?.activo ?? 1),
    });
    setModalAbierto(true);
  }

  function cerrarModal() {
    if (guardando) return;
    setModalAbierto(false);
    setForm({ ...USUARIO_FORM_INICIAL });
  }

  function actualizarCampo(campo, valor) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  function validarForm() {
    const usuario = String(form.usuario || '').trim();
    const contrasena = String(form.contrasena || '');
    const repetir = String(form.repetir_contrasena || '');
    const esEdicion = Number(form.id_usuario || 0) > 0;

    if (!usuario) return 'Ingresá el nombre de usuario.';
    if (usuario.length < 3) return 'El usuario debe tener al menos 3 caracteres.';
    if (!['admin', 'vista'].includes(String(form.rol || ''))) return 'Seleccioná un rol válido.';

    if (!esEdicion && !contrasena) return 'Ingresá una contraseña para el usuario nuevo.';

    if (contrasena || repetir) {
      if (contrasena.length < 6) return 'La contraseña debe tener al menos 6 caracteres.';
      if (contrasena !== repetir) return 'Las contraseñas no coinciden.';
    }

    return '';
  }

  async function guardar() {
    const errorValidacion = validarForm();
    if (errorValidacion) {
      mostrarMensaje('error', errorValidacion);
      return { ok: false, mensaje: errorValidacion };
    }

    setGuardando(true);
    try {
      const payload = {
        id_usuario: Number(form.id_usuario || 0),
        usuario: String(form.usuario || '').trim(),
        email_recuperacion: String(form.email_recuperacion || '').trim(),
        rol: String(form.rol || 'vista'),
        activo: Number(form.activo ?? 1),
      };

      if (String(form.contrasena || '').trim()) {
        payload.contrasena = String(form.contrasena);
      }

      const res = await configuracionUsuariosApi.guardar(payload);
      await cargar();
      setModalAbierto(false);
      setForm({ ...USUARIO_FORM_INICIAL });
      mostrarMensaje('exito', res?.mensaje || 'Usuario guardado correctamente.', 2800);
      return { ok: true };
    } catch (e) {
      const msg = e.message || 'No se pudo guardar el usuario.';
      mostrarMensaje('error', msg);
      return { ok: false, mensaje: msg };
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarEstado(usuario, activo) {
    if (esUsuarioSesionActual(usuario)) {
      const msg = 'No podés cambiar el estado del usuario con la sesión actual.';
      mostrarMensaje('error', msg);
      return { ok: false, mensaje: msg };
    }

    try {
      const id = obtenerIdUsuario(usuario);
      const res = await configuracionUsuariosApi.cambiarEstado(id, activo);
      await cargar();
      mostrarMensaje('exito', res?.mensaje || (activo ? 'Usuario dado de alta.' : 'Usuario dado de baja.'), 2800);
      return { ok: true };
    } catch (e) {
      const msg = e.message || 'No se pudo cambiar el estado del usuario.';
      mostrarMensaje('error', msg);
      return { ok: false, mensaje: msg };
    }
  }

  async function eliminar(usuario) {
    if (esUsuarioSesionActual(usuario)) {
      const msg = 'No podés eliminar el usuario con la sesión actual.';
      mostrarMensaje('error', msg);
      return { ok: false, mensaje: msg };
    }

    try {
      const id = obtenerIdUsuario(usuario);
      const res = await configuracionUsuariosApi.eliminar(id);
      await cargar();
      mostrarMensaje('exito', res?.mensaje || 'Usuario eliminado correctamente.', 2800);
      return { ok: true };
    } catch (e) {
      const msg = e.message || 'No se pudo eliminar el usuario.';
      mostrarMensaje('error', msg);
      return { ok: false, mensaje: msg };
    }
  }

  return {
    usuarios: usuariosFiltrados,
    usuariosBase,
    resumen,
    loading,
    guardando,
    error,
    mensaje,
    setMensaje,
    busqueda,
    setBusqueda,
    vista,
    cambiarVista,
    modalAbierto,
    form,
    abrirCrear,
    abrirEditar,
    cerrarModal,
    actualizarCampo,
    guardar,
    cambiarEstado,
    eliminar,
    reload: cargar,
  };
}
