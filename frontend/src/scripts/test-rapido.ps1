param([switch]$Visible)
& "$PSScriptRoot\test-lote.ps1" preflight -Visible:$Visible -Workers 1
exit $LASTEXITCODE
