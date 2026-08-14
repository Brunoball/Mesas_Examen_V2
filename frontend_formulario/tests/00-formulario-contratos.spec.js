const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { env } = require('./helpers/env.helper');

function read(...parts) {
  const file = path.join(...parts);
  expect(fs.existsSync(file), `Falta archivo requerido: ${file}`).toBe(true);
  return fs.readFileSync(file, 'utf8');
}

test.describe('00 · Formulario · contratos estáticos', () => {
  test('frontend conserva las tres acciones públicas, tenant explícito y almacenamiento Recordarme', () => {
    const source = read(env.root, 'src', 'components', 'formulario', 'Formulario.jsx');
    for (const action of [
      'form_obtener_config_inscripcion',
      'form_buscar_previas',
      'form_registrar_inscripcion',
    ]) expect(source).toContain(action);

    expect(source).toContain('params.set("idTenant", idTenant)');
    expect(source).toContain('form_previas_recordarme');
    expect(source).toContain('form_previas_gmail');
    expect(source).toContain('form_previas_dni');
    expect(source).toContain('form_previas_aviso_permiso_pendiente');
    expect(source).toContain('mountedRef.current = true;');
    expect(source).toMatch(/@gmail\\\.com/);
    expect(source).toContain('/^[0-9]{7,9}$/');
    expect(source).toContain('replace(/\\D+/g, "")');
  });

  test('backend publica acciones y aliases, pero mantiene la configuración reservada al admin', () => {
    const router = read(env.backendDir, 'routes', 'api.php');
    const route = read(env.backendDir, 'modules', 'formulario', 'route.php');
    const controller = read(env.backendDir, 'modules', 'formulario', 'formulario_controller.php');

    for (const action of [
      'form_obtener_config_inscripcion', 'form_buscar_previas', 'form_registrar_inscripcion',
      'obtener_config_inscripcion', 'buscar_previas', 'registrar_inscripcion',
      'formulario_obtener_config_inscripcion', 'formulario_buscar_previas', 'formulario_registrar_inscripcion',
    ]) {
      expect(router, `acción pública faltante: ${action}`).toContain(`'${action}'`);
      expect(route, `alias sin despacho: ${action}`).toContain(`case '${action}'`);
    }

    expect(router).not.toMatch(/accionesPublicas[\s\S]{0,1500}'form_guardar_config_inscripcion'/);
    expect(controller).toContain("require_roles(['admin'])");
    expect(controller).toContain('validar_csrf()');
  });

  test('backend valida DNI, email, materias reales, duplicados y correlativas antes de persistir', () => {
    const search = read(env.backendDir, 'modules', 'formulario', 'buscar_previas.php');
    const register = read(env.backendDir, 'modules', 'formulario', 'registrar_inscripcion.php');

    expect(search).toContain("p.id_condicion IN (3, 5, 6)");
    expect(search).toContain('p.activo = 1');
    expect(search).toContain('formulario_aplicar_correlativas');
    expect(register).toContain('FILTER_VALIDATE_EMAIL');
    expect(register).toContain('Algunas materias no corresponden a previas activas para ese DNI.');
    expect(register).toContain('correlativas_bloqueadas');
    expect(register).toContain('Este alumno ya fue inscripto en las materias seleccionadas.');
    expect(register).toContain('UPDATE previas');
    expect(register).toContain('formulario_inscripciones_detalle');
  });
});
