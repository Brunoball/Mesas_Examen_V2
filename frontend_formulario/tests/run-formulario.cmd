@echo off
setlocal
cd /d "%~dp0\.."
npx playwright test --project=chromium --workers=1 --reporter=list
set EXIT_CODE=%ERRORLEVEL%
exit /b %EXIT_CODE%
