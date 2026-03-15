/**
 * Post-build script: replaces CRXJS dev-mode stubs with proper standalone HTML/JS.
 * Run after `vite build` to produce a self-contained extension (no dev server needed).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(__dirname, '../dist');

// ─── 1. Fix service-worker-loader.js ─────────────────────────────────────────
// CRXJS generates: import 'http://localhost:5173/...'
// We replace with: import './assets/background.ts-xxx.js'

const swLoader = path.join(dist, 'service-worker-loader.js');
const manifest = JSON.parse(fs.readFileSync(path.join(dist, '.vite/manifest.json'), 'utf8'));

const bgFile = manifest['src/background/background.ts'].file;
fs.writeFileSync(swLoader, `import './${bgFile}';\n`);
console.log('✓ service-worker-loader.js →', bgFile);

// ─── 2. Fix HTML entry points ─────────────────────────────────────────────────

function makeHtml(title, cssFile, jsFiles, bodyContent = '<div id="root"></div>') {
  const links = cssFile ? `  <link rel="stylesheet" href="/${cssFile}">\n` : '';
  const scripts = jsFiles.map(f => `  <script type="module" src="/${f}"></script>`).join('\n');
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
${links}</head>
<body>
  ${bodyContent}
${scripts}
</body>
</html>
`;
}

// Options page
const optionsEntry = manifest['src/options/options.html'];
fs.writeFileSync(
  path.join(dist, 'src/options/options.html'),
  makeHtml('Transkribe — Настройки', optionsEntry.css?.[0], [
    manifest['_modulepreload-polyfill-B5Qt9EMX.js']?.file ?? 'assets/modulepreload-polyfill-B5Qt9EMX.js',
    optionsEntry.file,
  ])
);
console.log('✓ options.html');

// Sidepanel
const sidepanelEntry = manifest['src/sidepanel/index.html'];
fs.writeFileSync(
  path.join(dist, 'src/sidepanel/index.html'),
  makeHtml('Transkribe', sidepanelEntry.css?.[0], [
    manifest['_modulepreload-polyfill-B5Qt9EMX.js']?.file ?? 'assets/modulepreload-polyfill-B5Qt9EMX.js',
    sidepanelEntry.file,
  ])
);
console.log('✓ sidepanel/index.html');

// Popup — has its own body structure (vanilla JS, not React)
const popupEntry = manifest['src/popup/popup.html'];
const popupBody = `<div class="w-64 p-4 font-sans bg-white">
  <h1 class="text-lg font-bold mb-3">Transkribe</h1>
  <button id="startBtn" class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded w-full transition-colors">
    Начать запись
  </button>
  <p id="status" class="text-sm text-gray-500 mt-3 text-center">Готов к записи</p>
  <span id="timer" class="block text-xs text-red-500 font-mono mt-1 text-center hidden">00:00</span>
  <button id="settingsBtn" class="text-xs text-gray-400 hover:text-gray-600 mt-3 w-full text-center">⚙ Настройки</button>
</div>`;
fs.writeFileSync(
  path.join(dist, 'src/popup/popup.html'),
  makeHtml('Transkribe', popupEntry.css?.[0], [
    manifest['_modulepreload-polyfill-B5Qt9EMX.js']?.file ?? 'assets/modulepreload-polyfill-B5Qt9EMX.js',
    popupEntry.file,
  ], popupBody)
);
console.log('✓ popup.html');

// Offscreen
const offscreenEntry = manifest['src/offscreen/offscreen.html'];
fs.writeFileSync(
  path.join(dist, 'src/offscreen/offscreen.html'),
  makeHtml('offscreen', null, [
    manifest['_modulepreload-polyfill-B5Qt9EMX.js']?.file ?? 'assets/modulepreload-polyfill-B5Qt9EMX.js',
    offscreenEntry.file,
  ])
);
console.log('✓ offscreen.html');

console.log('\n✅ Production build ready — no dev server needed.');
