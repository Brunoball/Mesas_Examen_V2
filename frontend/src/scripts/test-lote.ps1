param(
  [Parameter(Position = 0)]
  [string]$Lote = 'preflight',
  [switch]$Visible,
  [switch]$Ui,
  [switch]$ListOnly,
  [switch]$PWDebug,
  [int]$Workers = 1,
  [string]$Reporter = 'list'
)

. "$PSScriptRoot\_lerna-playwright-common.ps1"

$batches = Get-LernaTestBatches
$normalized = $Lote.Trim().ToLowerInvariant()

if ($normalized -eq 'todo' -or $normalized -eq 'all') {
  $files = Get-LernaAllCurrentTests
} elseif ($batches.Contains($normalized)) {
  $files = $batches[$normalized]
} else {
  $valid = @($batches.Keys) + @('todo')
  throw "Lote desconocido '$Lote'. Opciones: $($valid -join ', ')."
}

Invoke-LernaPlaywright -Files $files -Visible:$Visible -Ui:$Ui -ListOnly:$ListOnly -PWDebug:$PWDebug -Workers $Workers -Reporter $Reporter
