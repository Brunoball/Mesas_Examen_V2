param(
  [string[]]$Archivos = @(),
  [switch]$Visible,
  [int]$Workers = 1
)

. "$PSScriptRoot\_lerna-playwright-common.ps1"

if ($Archivos.Count -eq 0) {
  $working = @(git diff --name-only 2>$null)
  $staged = @(git diff --cached --name-only 2>$null)
  $Archivos = Get-UniqueOrderedItems (@($working) + @($staged))
}

if ($Archivos.Count -eq 0) {
  Write-Host 'No se detectaron cambios. Se ejecutara preflight.' -ForegroundColor Yellow
  & "$PSScriptRoot\test-lote.ps1" preflight -Visible:$Visible -Workers $Workers
  exit $LASTEXITCODE
}

$batches = Get-LernaTestBatches
$selected = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
$futureModules = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)

foreach ($rawPath in $Archivos) {
  $path = ($rawPath -replace '\\', '/').ToLowerInvariant()

  if ($path -match 'routes/api\.php|backend/config/|frontend/src/config/|components/global/|context/') {
    [void]$selected.Add('lote1')
    continue
  }
  if ($path -match 'login|sesion|session|auth|recuperar|contrasena|contraseña') { [void]$selected.Add('login') }
  if ($path -match 'docentes') { [void]$selected.Add('docentes') }
  if ($path -match 'catedras|cátedras') { [void]$selected.Add('catedras') }
  if ($path -match 'configuracion|configuración|mesas_config|usuarios_master') { [void]$selected.Add('configuracion') }

  if ($path -match 'materias') { [void]$futureModules.Add('materias') }
  if ($path -match 'previas') { [void]$futureModules.Add('previas') }
  if ($path -match 'mesas_examen|mesas/examen|mesas') { [void]$futureModules.Add('mesas') }
}

if ($futureModules.Count -gt 0) {
  Write-Warning "Cambios detectados en modulos todavia no incorporados a la matriz automatica: $([string]::Join(', ', $futureModules))."
}

if ($selected.Count -eq 0) {
  [void]$selected.Add('preflight')
}

if ($selected.Contains('lote1')) {
  $files = Get-LernaAllCurrentTests
  $labels = @('lote1')
} else {
  $files = @()
  $labels = @('login', 'docentes', 'catedras', 'configuracion') | Where-Object { $selected.Contains($_) }
  $files += $batches['preflight']
  foreach ($name in $labels) { $files += $batches[$name] }
  $files = Get-UniqueOrderedItems $files
}

Write-Host 'Archivos analizados:' -ForegroundColor Cyan
$Archivos | ForEach-Object { Write-Host "  - $_" }
Write-Host ''
Write-Host "Lotes elegidos: $($labels -join ', ')" -ForegroundColor Green

Invoke-LernaPlaywright -Files $files -Visible:$Visible -Workers $Workers
