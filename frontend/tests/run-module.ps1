param(
  [Parameter(Position = 0)]
  [ValidateSet('all', 'preflight', 'login', 'roles', 'dashboard', 'docentes', 'catedras', 'materias', 'estadisticas', 'previas', 'mesas', 'configuracion', 'release')]
  [string]$Module = 'all',

  [switch]$Headed,
  [switch]$Ui
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$frontendRoot = Split-Path -Parent $PSScriptRoot
Set-Location $frontendRoot

$specs = @{
  preflight     = @('tests/00-cobertura-total.spec.js')
  login         = @('tests/01-login.spec.js', 'tests/15-roles.spec.js')
  roles         = @('tests/15-roles.spec.js')
  dashboard     = @('tests/02-dashboard.spec.js')
  docentes      = @('tests/03-docentes.spec.js')
  catedras      = @('tests/04-catedras.spec.js')
  materias      = @('tests/05-materias.spec.js')
  estadisticas  = @('tests/06-estadisticas.spec.js')
  previas       = @('tests/07-previas.spec.js')
  mesas         = @(
    'tests/08-mesas-armado.spec.js',
    'tests/09-mesas-edicion-choques.spec.js',
    'tests/10-mesas-alumnos-resultados.spec.js',
    'tests/11-mesas-historial-cierre.spec.js',
    'tests/12-mesas-ui.spec.js',
    'tests/13-mesas-edicion-profunda.spec.js',
    'tests/13-mesas-contratos.spec.js'
  )
  configuracion = @('tests/14-configuracion.spec.js')
  release       = @('tests/99-release-gate.spec.js')
}

$argsList = @('playwright', 'test')
if ($Module -ne 'all') {
  $argsList += $specs[$Module]
}
$argsList += @('--project=chromium', '--workers=1')
if ($Headed) { $argsList += '--headed' }
if ($Ui) { $argsList += '--ui' }

Write-Host "Ejecutando módulo: $Module" -ForegroundColor Cyan
Write-Host "Directorio: $frontendRoot" -ForegroundColor DarkGray
& npx @argsList
exit $LASTEXITCODE
