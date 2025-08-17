module.exports = {
  apps: [{
    name: "lyrix-bridge",
    script: "server.js",
    cwd: "C:/Users/DUB STUDIO/Documents/GitHub/lyrix-bridge-web",
    env: {
      HTTP_PORT: 5173,   // porta HTTP+WS
      OSC_PORT: 9000     // porta OSC in
    },
    watch: false,        // niente watch in produzione
    autorestart: true,   // riavvia se crasha
    max_restarts: 10
  }]
}
