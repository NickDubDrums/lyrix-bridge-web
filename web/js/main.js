import { routerInit } from './router.js';
import { initShell } from './ui/shell.js';

const root = document.getElementById('app-root');

initShell();
routerInit(root);
