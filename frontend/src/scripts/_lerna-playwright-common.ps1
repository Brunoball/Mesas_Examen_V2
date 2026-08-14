Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-LernaTestBatches {
  return [ordered]@{
    'preflight' = @(
      'tests/00-preflight.spec.js'
    )
    'login' = @(
      'tests/00-preflight.spec.js',
      'tests/01-login.spec.js'
    )
    'docentes' = @(
      'tests/00-preflight.spec.js',
      'tests/03-docentes.spec.js'
    )
    'catedras' = @(
      'tests/00-preflight.spec.js',
      'tests/04-catedras.spec.js'
    )
    'configuracion' = @(
      'tests/00-preflight.spec.js',
      'tests/14-configuracion.spec.js'
    )
    'lote1' = @(
      'tests/00-preflight.spec.js',
      'tests/01-login.spec.js',
      'tests/03-docentes.spec.js',
      'tests/04-catedras.spec.js',
      'tests/14-configuracion.spec.js'
    )
  }
}

function Get-UniqueOrderedItems([string[]]$Items) {
  $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
  $result = New-Object 'System.Collections.Generic.List[string]'
  foreach ($item in $Items) {
    if ($seen.Add($item)) { [void]$result.Add($item) }
  }
  return $result.ToArray()
}

function Get-LernaAllCurrentTests {
  $batches = Get-LernaTestBatches
  return Get-UniqueOrderedItems $batches['lote1']
}

function Invoke-LernaFinalCleanup {
  Write-Host ''
  Write-Host '[PW] Cleanup final local...' -ForegroundColor Yellow
  & node -e "require('./tests/support/cleanup').cleanupAll({includeSessions:true})"
  if ($LASTEXITCODE -ne 0) {
    throw "El cleanup final termino con codigo $LASTEXITCODE. No vuelvas a correr pruebas mutables hasta limpiarlo."
  }
}

function Invoke-LernaPlaywright {
  param(
    [Parameter(Mandatory = $true)][string[]]$Files,
    [switch]$Visible,
    [switch]$Ui,
    [switch]$ListOnly,
    [switch]$PWDebug,
    [int]$Workers = 1,
    [string]$Reporter = 'list'
  )

  if (-not (Test-Path '.\package.json')) {
    throw 'Ejecuta el script desde frontend, donde esta package.json.'
  }
  if (-not (Test-Path '.\.env.test')) {
    throw 'Falta frontend/.env.test.'
  }

  $npx = if ($env:OS -eq 'Windows_NT') { 'npx.cmd' } else { 'npx' }
  $argsPw = @('playwright', 'test')
  $argsPw += $Files
  $argsPw += '--project=chromium'
  $argsPw += "--workers=$Workers"
  $argsPw += "--reporter=$Reporter"
  if ($Visible) { $argsPw += '--headed' }
  if ($Ui) { $argsPw += '--ui' }
  if ($ListOnly) { $argsPw += '--list' }
  if ($PWDebug) { $argsPw += '--debug' }

  Write-Host ''
  Write-Host '============================================================' -ForegroundColor Cyan
  Write-Host ' LERNA PLAYWRIGHT' -ForegroundColor Cyan
  Write-Host '============================================================' -ForegroundColor Cyan
  Write-Host 'Archivos:' -ForegroundColor Cyan
  $Files | ForEach-Object { Write-Host "  - $_" }
  Write-Host ''

  $exitCode = 1
  try {
    & $npx @argsPw
    $exitCode = $LASTEXITCODE
  }
  finally {
    if (-not $ListOnly) {
      try {
        Invoke-LernaFinalCleanup
      }
      catch {
        Write-Warning $_.Exception.Message
        if ($exitCode -eq 0) { $exitCode = 1 }
      }
    }
  }

  if ($exitCode -ne 0) {
    throw "Playwright termino con codigo $exitCode."
  }
}
