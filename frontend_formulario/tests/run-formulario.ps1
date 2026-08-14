$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
npx playwright test --project=chromium --workers=1 --reporter=list
exit $LASTEXITCODE
