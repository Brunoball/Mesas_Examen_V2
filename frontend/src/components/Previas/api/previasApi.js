import { apiGet, apiPost } from '../../_shared/api/apiClient.js';

const POR_PAGINA_MAXIMO = 100;
const LIMITE_PAGINAS_SEGURIDAD = 150;

/*
  Fallback defensivo: el sistema igual intenta obtener condiciones desde DB
  por previas_catalogos / previas_condiciones / global_obtener_listas.
  Esto evita que el formulario quede bloqueado si algún catálogo viejo todavía
  no fue reemplazado en el backend local.
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

function unirPorId(listaA = [], listaB = [], campoId) {
  const mapa = new Map();

  [...listaA, ...listaB].forEach((item) => {
    const id = String(item?.[campoId] ?? item?.id ?? '').trim();
    if (!id || id === '0') return;
    mapa.set(id, item);
  });

  return Array.from(mapa.values());
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

export const previasApi = {
  async catalogos() {
    const [previasResult, catedrasResult, globalResult, condicionesResult] = await Promise.allSettled([
      apiGet('previas_catalogos'),
      apiGet('catedras_catalogos'),
      apiGet('global_obtener_listas'),
      apiGet('previas_condiciones'),
    ]);

    const previasData = previasResult.status === 'fulfilled' ? obtenerDataCatalogo(previasResult.value) : {};
    const catedrasData = catedrasResult.status === 'fulfilled' ? obtenerDataCatalogo(catedrasResult.value) : {};
    const globalData = globalResult.status === 'fulfilled' ? obtenerDataCatalogo(globalResult.value) : {};
    const condicionesData = condicionesResult.status === 'fulfilled' ? obtenerDataCatalogo(condicionesResult.value) : {};

    const cursosPrevias = obtenerArrayDesdeVariantes(previasData, ['cursos', 'curso']).map(normalizarCurso);
    const cursosCatedras = obtenerArrayDesdeVariantes(catedrasData, ['cursos', 'curso']).map(normalizarCurso);
    const cursosGlobal = obtenerArrayDesdeVariantes(globalData, ['cursos', 'curso']).map(normalizarCurso);

    const divisionesPrevias = obtenerArrayDesdeVariantes(previasData, ['divisiones', 'division']).map(normalizarDivision);
    const divisionesCatedras = obtenerArrayDesdeVariantes(catedrasData, ['divisiones', 'division']).map(normalizarDivision);
    const divisionesGlobal = obtenerArrayDesdeVariantes(globalData, ['divisiones', 'division']).map(normalizarDivision);

    const condicionesPrevias = obtenerArrayDesdeVariantes(previasData, ['condiciones', 'condicion']).map(normalizarCondicion);
    const condicionesGlobal = obtenerArrayDesdeVariantes(globalData, ['condiciones', 'condicion']).map(normalizarCondicion);
    const condicionesDirectas = obtenerArrayDesdeVariantes(condicionesData, ['condiciones', 'condicion']).map(normalizarCondicion);

    const cursos = unirPorId(
      unirPorId(cursosPrevias, cursosCatedras, 'id_curso'),
      cursosGlobal,
      'id_curso'
    ).sort((a, b) => Number(a.id_curso || 0) - Number(b.id_curso || 0));

    const divisiones = unirPorId(
      unirPorId(divisionesPrevias, divisionesCatedras, 'id_division'),
      divisionesGlobal,
      'id_division'
    ).sort((a, b) => String(a.nombre_division || '').localeCompare(String(b.nombre_division || ''), 'es'));

    let condiciones = unirPorId(
      unirPorId(condicionesPrevias, condicionesGlobal, 'id_condicion'),
      condicionesDirectas,
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
      },
    };
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

  listar: (pagina = 1, porPagina = POR_PAGINA_MAXIMO, filtros = {}) =>
    apiGet('previas_listar', {
      pagina,
      por_pagina: porPagina,
      ...filtros,
    }),

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

  eliminar: (idPrevia) =>
    apiPost('previas_eliminar', {
      id_previa: idPrevia,
    }),
};
