import { apiGet, apiPost } from '../../_shared/api/apiClient';

const POR_PAGINA_MAXIMO = 100;
const LIMITE_PAGINAS_SEGURIDAD = 150;

/*
  Fallback defensivo: el sistema igual intenta obtener condiciones desde DB.
  El flujo principal usa un solo endpoint liviano: previas_catalogos.
*/
const CONDICIONES_BASE = [
  { id_condicion: 1, condicion: 'COLOQUIO' },
  { id_condicion: 2, condicion: 'REGULAR' },
  { id_condicion: 3, condicion: 'PREVIA' },
  { id_condicion: 4, condicion: 'P.LIB.' },
  { id_condicion: 5, condicion: 'TER.MAT.' },
  { id_condicion: 6, condicion: 'PENDIENTE' },
];

function obtenerDataCatalogo(respuesta) {
  if (!respuesta || typeof respuesta !== 'object') return {};

  if (respuesta.data && typeof respuesta.data === 'object' && !Array.isArray(respuesta.data)) {
    return respuesta.data;
  }

  return respuesta;
}

function obtenerArrayDesdeVariantes(data, claves = []) {
  if (!data || typeof data !== 'object') return [];

  for (const clave of claves) {
    if (Array.isArray(data?.[clave])) return data[clave];
    if (Array.isArray(data?.data?.[clave])) return data.data[clave];
  }

  return [];
}

function obtenerArrayMateriasPorCurso(respuesta) {
  if (Array.isArray(respuesta?.materias)) return respuesta.materias;
  if (Array.isArray(respuesta?.data)) return respuesta.data;
  if (Array.isArray(respuesta?.data?.materias)) return respuesta.data.materias;
  return [];
}

function normalizarCurso(item) {
  const id = item?.id_curso ?? item?.id ?? item?.curso_id;
  const nombre = item?.nombre_curso ?? item?.curso ?? item?.nombre;

  return {
    ...item,
    id_curso: Number(id || 0),
    nombre_curso: String(nombre || '').trim(),
  };
}

function normalizarDivision(item) {
  const id = item?.id_division ?? item?.id ?? item?.division_id;
  const nombre = item?.nombre_division ?? item?.division ?? item?.nombre;

  return {
    ...item,
    id_division: Number(id || 0),
    nombre_division: String(nombre || '').trim(),
  };
}

function normalizarCondicion(item) {
  const id = item?.id_condicion ?? item?.id ?? item?.condicion_id;
  const condicion = item?.condicion ?? item?.nombre_condicion ?? item?.nombre;

  return {
    ...item,
    id_condicion: Number(id || 0),
    condicion: String(condicion || '').trim(),
  };
}

function normalizarLista(lista = [], normalizador, campoId) {
  const mapa = new Map();

  (Array.isArray(lista) ? lista : []).forEach((item) => {
    const normalizado = normalizador(item);
    const id = String(normalizado?.[campoId] || '').trim();
    if (!id || id === '0') return;
    mapa.set(id, normalizado);
  });

  return Array.from(mapa.values());
}

function limpiarFiltros(filtros = {}) {
  const result = {};

  Object.entries(filtros || {}).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) {
      result[key] = value;
    }
  });

  return result;
}

export const previasApi = {
  async catalogos() {
    const normalizarRespuestaCatalogos = (respuesta) => {
      const data = obtenerDataCatalogo(respuesta);

      const cursos = normalizarLista(
        obtenerArrayDesdeVariantes(data, ['cursos', 'curso']),
        normalizarCurso,
        'id_curso'
      ).sort((a, b) => Number(a.id_curso || 0) - Number(b.id_curso || 0));

      const divisiones = normalizarLista(
        obtenerArrayDesdeVariantes(data, ['divisiones', 'division']),
        normalizarDivision,
        'id_division'
      ).sort((a, b) => String(a.nombre_division || '').localeCompare(String(b.nombre_division || ''), 'es'));

      let condiciones = normalizarLista(
        obtenerArrayDesdeVariantes(data, ['condiciones', 'condicion']),
        normalizarCondicion,
        'id_condicion'
      ).sort((a, b) => Number(a.id_condicion || 0) - Number(b.id_condicion || 0));

      if (condiciones.length === 0) {
        condiciones = normalizarLista(CONDICIONES_BASE, normalizarCondicion, 'id_condicion');
      }

      return {
        exito: true,
        data: {
          cursos,
          divisiones,
          condiciones,
          catedras: obtenerArrayDesdeVariantes(data, ['catedras', 'catedra']),
        },
      };
    };

    try {
      // Fuente principal: catálogo global compartido por todo el sistema.
      return normalizarRespuestaCatalogos(await apiGet('global_obtener_listas'));
    } catch (errorGlobal) {
      try {
        // Fallback defensivo para instalaciones viejas donde todavía exista el endpoint específico de previas.
        return normalizarRespuestaCatalogos(await apiGet('previas_catalogos'));
      } catch (errorPrevias) {
        const condiciones = await previasApi.condiciones().catch(() => CONDICIONES_BASE);

        return {
          exito: true,
          data: {
            cursos: [],
            divisiones: [],
            condiciones,
            catedras: [],
          },
        };
      }
    }
  },

  condiciones: async () => {
    const respuesta = await apiGet('previas_condiciones');
    const data = obtenerDataCatalogo(respuesta);
    const condiciones = obtenerArrayDesdeVariantes(data, ['condiciones', 'condicion']).map(normalizarCondicion);
    return condiciones.length > 0 ? condiciones : CONDICIONES_BASE;
  },

  materiasPorCurso: async (idCurso, idDivision = null) => {
    const params = { id_curso: idCurso };
    if (idDivision) params.id_division = idDivision;

    const respuesta = await apiGet('global_obtener_materias_por_curso', params);
    return obtenerArrayMateriasPorCurso(respuesta);
  },

  listar: (pagina = 1, porPagina = POR_PAGINA_MAXIMO, filtros = {}) => apiGet('previas_listar', limpiarFiltros({
    pagina,
    por_pagina: Math.min(POR_PAGINA_MAXIMO, Number(porPagina || POR_PAGINA_MAXIMO)),
    ...filtros,
  })),

  // Se mantiene por compatibilidad con otros llamados antiguos, pero la pantalla ya no lo usa.
  async listarTodos(activo = 1, filtros = {}) {
    let pagina = 1;
    let previas = [];
    let totalPaginas = 1;

    do {
      const res = await previasApi.listar(pagina, POR_PAGINA_MAXIMO, { activo, ...filtros });
      const data = Array.isArray(res.data) ? res.data : [];

      previas = previas.concat(data);

      const paginasBackend = Number(
        res?.paginacion?.paginas ||
        res?.paginacion?.total_paginas ||
        res?.paginacion?.totalPaginas ||
        1
      );

      totalPaginas = Number.isFinite(paginasBackend) && paginasBackend > 0
        ? paginasBackend
        : 1;

      if (data.length === 0) break;
      pagina += 1;
    } while (pagina <= totalPaginas && pagina <= LIMITE_PAGINAS_SEGURIDAD);

    return {
      exito: true,
      data: previas,
      paginacion: {
        pagina: 1,
        por_pagina: previas.length,
        total: previas.length,
        paginas: 1,
      },
    };
  },

  obtener: (idPrevia) => apiGet('previas_obtener', { id_previa: idPrevia }),

  guardar: (payload) => apiPost('previas_guardar', payload),

  cambiarEstado: (idPrevia, activo, motivo = '') =>
    apiPost('previas_cambiar_estado', {
      id_previa: idPrevia,
      activo,
      motivo,
    }),

  verificarEliminacion: (idPrevia) =>
    apiPost('previas_verificar_eliminacion', {
      id_previa: idPrevia,
    }),

  eliminar: (idPrevia, opciones = {}) =>
    apiPost('previas_eliminar', {
      id_previa: idPrevia,
      forzar: opciones.forzar ? 1 : 0,
      confirmar_eliminacion_vinculada: opciones.forzar ? 1 : 0,
    }),

  plantillaImportacion: () => apiGet('previas_plantilla_importacion'),

  previsualizarExcel: ({ nombreArchivo, archivoBase64 }) => apiPost('previas_previsualizar_excel', {
    nombre_archivo: nombreArchivo,
    archivo_base64: archivoBase64,
  }),

  importarExcel: ({ nombreArchivo, archivoBase64 }) => apiPost('previas_importar_excel', {
    nombre_archivo: nombreArchivo,
    archivo_base64: archivoBase64,
  }),
};
