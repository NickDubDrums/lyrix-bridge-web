@echo off
cd /d %~dp0

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo ERRORE: Node non trovato. Installa Node.js LTS da https://nodejs.org/
  pause
  exit /b 1
)

if not exist node_modules (
  echo Primo avvio: eseguo npm install...
  npm install
  if %ERRORLEVEL% NEQ 0 (
    echo ERRORE durante npm install. Vedi messaggi sopra.
    pause
    exit /b 1
  )
)

echo Avvio in primo piano (debug). URL: http://localhost:5173
node server.js
echo (Se vedi errori sopra, inviameli)
pause
