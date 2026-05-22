import { useEffect, useMemo, useState } from 'react';
import { perfilApi } from '../api/perfilApi';

const leerJsonLocal = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const normalizarPerfilLocal = (usuarioLocal = null, tenantLocal = null) => {
  if (!usuarioLocal && !tenantLocal) return null;

  const tenant = usuarioLocal?.tenant || tenantLocal || null;

  return {
    idUsuarioMaster: usuarioLocal?.idUsuarioMaster || usuarioLocal?.idUsuario || null,
    usuario: usuarioLocal?.usuario || usuarioLocal?.Nombre_Completo || usuarioLocal?.nombre || 'Usuario',
    email_recuperacion: usuarioLocal?.email_recuperacion || usuarioLocal?.email || null,
    rol: usuarioLocal?.rol || 'vista',
    tema: usuarioLocal?.tema || 'claro',
    fecha_creacion: usuarioLocal?.fecha_creacion || null,
    plan: usuarioLocal?.plan || tenant?.plan || null,
    tenant: tenant
      ? {
          idTenant: tenant.idTenant || usuarioLocal?.idTenant || null,
          nombre: tenant.nombre || usuarioLocal?.tenant_nombre || 'Institución',
          slug: tenant.slug || null,
          logo_url: tenant.logo_url || usuarioLocal?.logo_url || null,
          logo_icono_url: tenant.logo_icono_url || usuarioLocal?.logo_icono_url || tenant.logo_url || null,
          db_name: tenant.db_name || null,
          activo: tenant.activo ?? 1,
        }
      : {
          idTenant: usuarioLocal?.idTenant || null,
          nombre: usuarioLocal?.tenant_nombre || 'Institución',
          logo_url: usuarioLocal?.logo_url || null,
          logo_icono_url: usuarioLocal?.logo_icono_url || usuarioLocal?.logo_url || null,
          activo: 1,
        },
  };
};

export function usePerfil(open, usuarioInicial = null) {
  const [perfil, setPerfil] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const perfilLocal = useMemo(() => {
    const usuarioLocal = usuarioInicial || leerJsonLocal('usuario');
    const tenantLocal = leerJsonLocal('tenant');
    return normalizarPerfilLocal(usuarioLocal, tenantLocal);
  }, [usuarioInicial]);

  useEffect(() => {
    if (!open) return undefined;

    let cancelado = false;
    setError('');

    if (perfilLocal) {
      setPerfil(perfilLocal);
    }

    const cargar = async () => {
      try {
        setCargando(true);
        const data = await perfilApi.obtener();

        if (cancelado) return;

        if (!data?.exito) {
          setError(data?.mensaje || 'No se pudo cargar el perfil.');
          return;
        }

        const perfilApiData = data.perfil || data.usuario || null;
        if (!perfilApiData) {
          setError('El backend no devolvió información del perfil.');
          return;
        }

        setPerfil(perfilApiData);

        if (data.usuario) {
          const usuarioParaStorage = {
            ...data.usuario,
            tenant: data.tenant || data.perfil?.tenant || data.usuario?.tenant || null,
            plan: data.perfil?.plan || data.usuario?.plan || null,
          };
          localStorage.setItem('usuario', JSON.stringify(usuarioParaStorage));
        }

        if (data.tenant || data.perfil?.tenant) {
          localStorage.setItem('tenant', JSON.stringify(data.tenant || data.perfil.tenant));
        }
      } catch (e) {
        if (!cancelado) {
          setError(e?.data?.mensaje || e?.message || 'No se pudo cargar el perfil.');
        }
      } finally {
        if (!cancelado) setCargando(false);
      }
    };

    cargar();

    return () => {
      cancelado = true;
    };
  }, [open, perfilLocal]);

  return { perfil, cargando, error };
}
