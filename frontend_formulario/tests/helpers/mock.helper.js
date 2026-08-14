const { env } = require('./env.helper');

const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function openConfig(overrides = {}) {
  return {
    exito: true,
    hay_config: true,
    abierta: true,
    titulo: 'Mesas de Examen PWFORM',
    mensaje_bienvenida: 'Consultá tus materias e inscribite.',
    inicio: '2026-01-01 08:00:00',
    fin: '2099-12-31 23:59:00',
    mensaje_cerrado: 'Inscripción cerrada por Secretaría.',
    color_principal: '#13579b',
    logo_url: '/uploads/formulario/logo.png',
    fondo_url: '/uploads/formulario/fondo.png',
    tenant: { resuelto: true, idTenant: 1, nombre: 'IPET 50' },
    ...overrides,
  };
}

function materia({ id, nombre, curso, division = 1, inscripcion = 0, anteriores = [], correlativa = false }) {
  return {
    id_previa: id,
    id_materia: id + 100,
    materia: nombre,
    curso_id: curso,
    division_id: division,
    curso: `${curso}°`,
    division: String(division),
    id_condicion: 3,
    condicion: 'PREVIA',
    anio: 2026,
    inscripcion,
    clave_unica: `${id + 100}_${curso}_${division}`,
    es_correlativa: correlativa,
    correlativas_anteriores: anteriores,
  };
}

function studentResponse(overrides = {}) {
  const anterior = materia({ id: 11, nombre: 'MATEMÁTICA ANTERIOR', curso: 4, correlativa: true });
  const posterior = materia({
    id: 12,
    nombre: 'ANÁLISIS POSTERIOR',
    curso: 5,
    correlativa: true,
    anteriores: [anterior.clave_unica],
  });
  const libre = materia({ id: 13, nombre: 'LENGUA', curso: 3 });
  const inscripta = materia({ id: 14, nombre: 'HISTORIA', curso: 6, inscripcion: 1 });
  return {
    exito: true,
    gmail: 'alumno@gmail.com',
    ya_inscripto: false,
    alumno: {
      dni: '40111222',
      nombre: 'ALUMNO DE PRUEBA',
      anio_actual: 2026,
      cursando: { curso_id: 6, division_id: 1, curso: '6°', division: '1' },
      materias: [posterior, inscripta, libre, anterior],
      materias_cond5: [{ ...materia({ id: 21, nombre: 'TERCERA MATERIA', curso: 2 }), id_condicion: 5 }],
      materias_cond6: [{ ...materia({ id: 22, nombre: 'MATERIA PENDIENTE', curso: 1 }), id_condicion: 6 }],
      correlativas: [{ correlativa: 1, materias: [anterior, posterior] }],
    },
    ...overrides,
  };
}

async function installMockApi(page, options = {}) {
  const calls = { config: [], search: [], register: [] };
  let configIndex = 0;
  const configResponses = options.configResponses || [options.config || openConfig()];

  await page.route('**/uploads/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: transparentPng }));
  await page.route('**/api.php?**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const action = url.searchParams.get('action');
    let body = {};
    try { body = request.postDataJSON() || {}; } catch {}

    if (action === 'form_obtener_config_inscripcion') {
      calls.config.push({ url: request.url(), method: request.method() });
      let response = configResponses[Math.min(configIndex, configResponses.length - 1)];
      configIndex += 1;
      if (typeof response === 'function') response = await response(calls);
      if (response === 'NETWORK_ERROR') return route.abort('failed');
      return route.fulfill({ status: response?.__status || 200, contentType: 'application/json', body: JSON.stringify(response) });
    }
    if (action === 'form_buscar_previas') {
      calls.search.push({ url: request.url(), method: request.method(), body });
      if (options.search === 'NETWORK_ERROR') return route.abort('failed');
      const response = typeof options.search === 'function' ? await options.search(body, calls) : (options.search || studentResponse());
      return route.fulfill({ status: response?.__status || 200, contentType: 'application/json', body: JSON.stringify(response) });
    }
    if (action === 'form_registrar_inscripcion') {
      calls.register.push({ url: request.url(), method: request.method(), body });
      if (options.register === 'NETWORK_ERROR') return route.abort('failed');
      if (options.registrationDelayMs) await new Promise((resolve) => setTimeout(resolve, options.registrationDelayMs));
      const response = typeof options.register === 'function'
        ? await options.register(body, calls)
        : (options.register || { exito: true, mensaje: 'Inscripción registrada.', id_inscripcion: 99 });
      if (response === 'NETWORK_ERROR') return route.abort('failed');
      return route.fulfill({ status: response?.__status || 200, contentType: 'application/json', body: JSON.stringify(response) });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ exito: false, mensaje: `Mock sin acción: ${action}` }) });
  });

  return calls;
}

async function openForm(page, tenantId = 1) {
  await page.goto(`/?idTenant=${tenantId}`);
  return page;
}

async function loginForm(page, gmail = 'alumno@gmail.com', dni = '40111222') {
  await page.locator('#gmail').fill(gmail);
  await page.locator('#dni').fill(dni);
  await page.locator('.auth-form button[type="submit"]').click();
}

module.exports = { env, openConfig, studentResponse, materia, installMockApi, openForm, loginForm };
