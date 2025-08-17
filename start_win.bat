@echo off
REM Vai nella cartella di questo .bat
cd /d %~dp0

echo === Check Node ===
where node
if %ERRORLEVEL% NEQ 0 (
  echo ERRORE: Node non trovato. Installa Node.js LTS da https://nodejs.org/
  pause
  exit /b 1
)

echo === Install deps se mancano ===
if not exist node_modules (
  echo Primo avvio: eseguo npm install...
  npm install
  if %ERRORLEVEL% NEQ 0 (
    echo ERRORE durante npm install. Vedi messaggi sopra.
    pause
    exit /b 1
  )
)

echo === Avvio server in primo piano (per vedere log) ===
set PORT=5173
node server.js
echo (Se vedi errori sopra, inviameli)
pause
