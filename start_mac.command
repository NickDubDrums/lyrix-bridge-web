#!/bin/bash
cd "$(dirname "$0")"

# Se mancano i moduli, installa
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies (first run)..."
  npm install
fi

echo "Starting Lyrix Mini Server on http://localhost:5173"
nohup node server.js >/tmp/lyrix-mini-server.log 2>&1 &
echo "Running in background. To stop: pkill -f 'node server.js'"
