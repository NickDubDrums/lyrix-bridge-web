import { routerInit } from './router.js';
import { initShell } from './ui/shell.js';
import { initRealtime } from './state/ws.js';


const root = document.getElementById('app-root');

initShell();
initRealtime();
routerInit(root);
