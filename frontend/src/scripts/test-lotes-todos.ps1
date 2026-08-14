param(
  [switch]$Visible,
  [int]$Workers = 1
)

. "$PSScriptRoot\_lerna-playwright-common.ps1"
$files = Get-LernaAllCurrentTests
Invoke-LernaPlaywright -Files $files -Visible:$Visible -Workers $Workers
Write-Host ''
Write-Host 'Todos los lotes implementados de Lerna finalizaron correctamente.' -ForegroundColor Green
