@echo off
REM === Sempre partire dalla cartella di questo .bat ===
cd /d %~dp0

REM === 0) Controllo Node ===
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo ERRORE: Node non trovato. Installa Node.js LTS da https://nodejs.org/
  pause
  exit /b 1
)

REM === 1) Installa deps solo la prima volta ===
if not exist node_modules (
  echo Primo avvio: eseguo npm install...
  npm install
  if %ERRORLEVEL% NEQ 0 (
    echo ERRORE durante npm install. Vedi messaggi sopra.
    pause
    exit /b 1
  )
)

REM === 2) Avvio in background (minimizzato) nella cartella giusta ===
REM Nota: il server usa 5173 di default, quindi non servo passare PORT.
REM Se vuoi cambiarla, aggiungi: cmd /c "set PORT=5174 && node server.js"
echo Avvio in background su http://localhost:5173 ...
start "" /MIN /D "%~dp0" cmd /c "node server.js"

echo Avviato. Apri http://localhost:5173
