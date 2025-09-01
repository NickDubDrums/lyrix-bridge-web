async function refresh() {
  const info = await window.lyrixHost.getInfo();
  document.getElementById('url').textContent = info.url;
  document.getElementById('qr').src = info.qr || '';
  document.getElementById('state').textContent = info.running ? 'Running' : 'Stopped';
  document.getElementById('state').style.color = info.running ? '#7ef57e' : '#f57e7e';
  document.getElementById('extra').textContent = `IP: ${info.ip || '—'} • mDNS: ${info.mdns}`;
  document.getElementById('btnToggle').textContent = info.running ? 'Stop Server' : 'Start Server';
}

document.getElementById('btnOpen').addEventListener('click', () => window.lyrixHost.openBrowser());
document.getElementById('btnToggle').addEventListener('click', () => window.lyrixHost.toggleServer());

window.lyrixHost.onServerState(() => refresh());
refresh();
