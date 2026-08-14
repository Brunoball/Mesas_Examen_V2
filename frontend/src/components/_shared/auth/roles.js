export const ROL_ADMIN = "admin";
export const ROL_VISTA = "vista";

export function normalizarRol(valor) {
  const rol = String(valor ?? "").trim().toLowerCase();

  if (["1", "admin", "administrator", "administrador", "superadmin"].includes(rol)) {
    return ROL_ADMIN;
  }

  return ROL_VISTA;
}

export function obtenerUsuarioLocal() {
  try {
    const raw = localStorage.getItem("usuario");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function obtenerRolUsuarioLocal() {
  return normalizarRol(obtenerUsuarioLocal()?.rol);
}

export function esRolVista(valor) {
  return normalizarRol(valor) === ROL_VISTA;
}

export function usuarioLocalEsVista() {
  return obtenerRolUsuarioLocal() === ROL_VISTA;
}
