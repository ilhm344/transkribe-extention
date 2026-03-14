# Plan: Project Scaffold

**Branch:** `chore/project-scaffold`
**Created:** 2026-03-14
**Feature:** Bootstrap the Transkribe Chrome Extension — package.json, Vite + CRXJS, TypeScript, React 18, Tailwind CSS, manifest.json, full folder structure, and stub files for all MV3 execution contexts.

## Settings

- **Testing:** no
- **Logging:** verbose (console.log/debug in all stubs, silenced in prod via `import.meta.env.DEV`)
- **Docs:** no mandatory checkpoint (warn-only)

## Roadmap Linkage

- **Milestone:** "Project Scaffold"
- **Rationale:** This plan directly implements the first roadmap milestone — setting up the full project skeleton so all subsequent milestones can build on it.

---

## Tasks

### Phase 1 — npm project + dependencies

#### Task 1: Initialize npm project
**File:** `package.json`

Create `package.json` for the Chrome extension project:
- `name: "transkribe"`, `version: "0.1.0"`, `private: true`
- Scripts: `"dev": "vite"`, `"build": "vite build"`, `"preview": "vite preview"`
- No test runner (per settings)

Log: none needed for config file.

#### Task 2: Install all dependencies
**Files:** `package.json`, `node_modules/` (generated)

Install in a single batch:

**Dev dependencies:**
```
vite @crxjs/vite-plugin typescript
@types/chrome @types/node
react react-dom
@types/react @types/react-dom
tailwindcss postcss autoprefixer
```

Run:
```
npm install --save-dev vite @crxjs/vite-plugin typescript @types/chrome @types/node
npm install react react-dom
npm install --save-dev @types/react @types/react-dom
npm install --save-dev tailwindcss postcss autoprefixer
```

**Commit checkpoint 1** after Task 2:
```
chore: initialize npm project with vite + crxjs + react + tailwind
```

---

### Phase 2 — Build configuration

#### Task 3: TypeScript configuration
**File:** `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["chrome", "vite/client"]
  },
  "include": ["src"]
}
```

#### Task 4: Vite configuration with CRXJS
**File:** `vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
  ],
  build: {
    minify: false,  // keep readable for dev
  },
});
```

Also install `@vitejs/plugin-react`:
```
npm install --save-dev @vitejs/plugin-react
```

#### Task 5: manifest.json (MV3)
**File:** `manifest.json` (project root)

Full MV3 manifest:
```json
{
  "manifest_version": 3,
  "name": "Transkribe",
  "version": "0.1.0",
  "description": "Post-meeting transcription with speaker diarization and AI summary",
  "permissions": [
    "tabCapture",
    "offscreen",
    "storage",
    "activeTab",
    "sidePanel"
  ],
  "host_permissions": [
    "https://meet.google.com/*",
    "https://telemost.yandex.ru/*"
  ],
  "background": {
    "service_worker": "src/background/background.ts",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": [
        "https://meet.google.com/*",
        "https://telemost.yandex.ru/*"
      ],
      "js": ["src/content/content.ts"]
    }
  ],
  "action": {
    "default_popup": "src/popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "side_panel": {
    "default_path": "src/sidepanel/index.html"
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

Also create `icons/` directory with placeholder icon files (simple 1×1 PNG stubs — real icons in later milestone).

#### Task 6: Tailwind CSS setup
**Files:** `tailwind.config.js`, `postcss.config.js`, `src/styles/globals.css`

`tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: { extend: {} },
  plugins: [],
};
```

`postcss.config.js`:
```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

`src/styles/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**Commit checkpoint 2** after Task 6:
```
chore: add tsconfig, vite config, manifest.json, tailwind setup
```

---

### Phase 3 — Shared layer

#### Task 7: shared/types.ts — all shared TypeScript types
**File:** `src/shared/types.ts`

Define all types used across contexts:
```typescript
/** Single speaker segment from DOM observer */
export interface SpeakerLogEntry {
  name: string;
  startMs: number;
  endMs: number;
}

/** Speaker log saved after meeting */
export interface SpeakerLog {
  recordingStartMs: number;
  log: SpeakerLogEntry[];
}

/** Single segment from OpenAI Whisper verbose_json */
export interface SttSegment {
  id: number;
  seek: number;
  start: number;  // seconds from recording start
  end: number;
  text: string;
  speaker?: string;  // "Speaker 1", "Speaker 2", etc. (if Whisper returns it)
}

/** OpenAI Whisper verbose_json response */
export interface WhisperResponse {
  task: string;
  language: string;
  duration: number;
  text: string;
  segments: SttSegment[];
}

/** Segment after merging STT + speaker log */
export interface DiarizedSegment {
  start: number;   // seconds
  end: number;
  speaker: string; // real name from DOM
  text: string;
}

/** Full meeting data stored in chrome.storage.local */
export interface MeetingData {
  audioBlob: Blob;
  speakerLog: SpeakerLog;
  recordingStartMs: number;
  meetingId: string;
  platform: 'meet' | 'telemost';
}

/** Result from post-meeting pipeline */
export interface PipelineResult {
  diarized: DiarizedSegment[];
  summary: string;
  actionItems: string[];
}

/** API keys stored in chrome.storage.local */
export interface ApiKeys {
  openaiKey: string;
  anthropicKey: string;
}
```

Log: type file — no runtime logging needed.

#### Task 8: shared/messages.ts — typed message constants
**File:** `src/shared/messages.ts`

```typescript
/** All chrome.runtime.sendMessage type constants.
 *  ALWAYS use these — never raw strings.
 */
export const MSG = {
  // popup → background
  RECORDING_START:   'RECORDING_START',
  RECORDING_STOP:    'RECORDING_STOP',
  // background → offscreen
  START_OFFSCREEN:   'START_OFFSCREEN',
  STOP_OFFSCREEN:    'STOP_OFFSCREEN',
  // background → content
  RECORDING_STARTED: 'RECORDING_STARTED',
  RECORDING_STOPPED: 'RECORDING_STOPPED',
  // offscreen → background
  AUDIO_BLOB_READY:  'AUDIO_BLOB_READY',
  // content → background
  SPEAKER_LOG_READY: 'SPEAKER_LOG_READY',
  MEETING_ENDED:     'MEETING_ENDED',
} as const;

export type MsgType = typeof MSG[keyof typeof MSG];

export interface Message {
  type: MsgType;
  payload?: unknown;
}

export interface AudioBlobReadyMessage extends Message {
  type: typeof MSG.AUDIO_BLOB_READY;
  payload: { blob: Blob; recordingStartMs: number };
}

export interface SpeakerLogReadyMessage extends Message {
  type: typeof MSG.SPEAKER_LOG_READY;
  payload: { log: import('./types').SpeakerLog };
}
```

#### Task 9: shared/storage.ts — typed chrome.storage helpers
**File:** `src/shared/storage.ts`

```typescript
import type { MeetingData, ApiKeys } from './types';

const KEYS = {
  MEETING_DATA: 'meetingData',
  API_KEYS: 'apiKeys',
} as const;

export async function saveMeetingData(data: MeetingData): Promise<void> {
  if (import.meta.env.DEV) console.debug('[storage] saveMeetingData', { platform: data.platform, duration: data.speakerLog.log.length });
  await chrome.storage.local.set({ [KEYS.MEETING_DATA]: data });
}

export async function loadMeetingData(): Promise<MeetingData | null> {
  const result = await chrome.storage.local.get(KEYS.MEETING_DATA);
  const data = result[KEYS.MEETING_DATA] ?? null;
  if (import.meta.env.DEV) console.debug('[storage] loadMeetingData', data ? 'found' : 'empty');
  return data;
}

export async function clearMeetingData(): Promise<void> {
  await chrome.storage.local.remove(KEYS.MEETING_DATA);
  if (import.meta.env.DEV) console.debug('[storage] clearMeetingData');
}

export async function saveApiKeys(keys: ApiKeys): Promise<void> {
  await chrome.storage.local.set({ [KEYS.API_KEYS]: keys });
  if (import.meta.env.DEV) console.debug('[storage] saveApiKeys');
}

export async function loadApiKeys(): Promise<ApiKeys | null> {
  const result = await chrome.storage.local.get(KEYS.API_KEYS);
  return result[KEYS.API_KEYS] ?? null;
}
```

**Commit checkpoint 3** after Task 9:
```
feat(shared): add types, message constants, and storage helpers
```

---

### Phase 4 — MV3 context stubs

#### Task 10: background/background.ts stub
**File:** `src/background/background.ts`

Service worker stub — message router skeleton:
```typescript
import { MSG } from '../shared/messages';

if (import.meta.env.DEV) console.log('[background] service worker started');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (import.meta.env.DEV) console.debug('[background] message received', message.type, { sender: sender.tab?.id });

  switch (message.type) {
    case MSG.RECORDING_START:
      if (import.meta.env.DEV) console.log('[background] RECORDING_START received');
      // TODO: implement in Audio Recording milestone
      break;
    case MSG.RECORDING_STOP:
      if (import.meta.env.DEV) console.log('[background] RECORDING_STOP received');
      // TODO: implement in Audio Recording milestone
      break;
    case MSG.AUDIO_BLOB_READY:
      if (import.meta.env.DEV) console.log('[background] AUDIO_BLOB_READY received');
      // TODO: implement in Audio Recording milestone
      break;
    case MSG.SPEAKER_LOG_READY:
      if (import.meta.env.DEV) console.log('[background] SPEAKER_LOG_READY received');
      // TODO: implement in Speaker Tracker milestone
      break;
    default:
      console.warn('[background] unknown message type', message.type);
  }
  return true; // keep sendResponse channel open
});

chrome.runtime.onInstalled.addListener(() => {
  if (import.meta.env.DEV) console.log('[background] extension installed/updated');
});
```

#### Task 11: offscreen/offscreen.html and offscreen.ts stubs
**Files:** `src/offscreen/offscreen.html`, `src/offscreen/offscreen.ts`

`offscreen.html`:
```html
<!DOCTYPE html>
<html>
<head><title>Transkribe Offscreen</title></head>
<body><script type="module" src="./offscreen.ts"></script></body>
</html>
```

`offscreen.ts` stub:
```typescript
import { MSG } from '../shared/messages';

if (import.meta.env.DEV) console.log('[offscreen] document loaded');

chrome.runtime.onMessage.addListener((message) => {
  if (import.meta.env.DEV) console.debug('[offscreen] message received', message.type);

  switch (message.type) {
    case MSG.START_OFFSCREEN:
      if (import.meta.env.DEV) console.log('[offscreen] START_OFFSCREEN received — TODO: implement tabCapture');
      // TODO: implement in Audio Recording milestone
      break;
    case MSG.STOP_OFFSCREEN:
      if (import.meta.env.DEV) console.log('[offscreen] STOP_OFFSCREEN received — TODO: stop MediaRecorder');
      // TODO: implement in Audio Recording milestone
      break;
    default:
      console.warn('[offscreen] unknown message type', message.type);
  }
});
```

#### Task 12: content script stubs
**Files:**
- `src/content/content.ts`
- `src/content/speakerTracker.ts`
- `src/content/meetingEnd.ts`
- `src/content/platforms/meet.ts`
- `src/content/platforms/telemost.ts`

`content.ts` stub:
```typescript
import { MSG } from '../shared/messages';

const platform = location.hostname.includes('telemost') ? 'telemost' : 'meet';
if (import.meta.env.DEV) console.log(`[content] loaded on platform: ${platform}`);

chrome.runtime.onMessage.addListener((message) => {
  if (import.meta.env.DEV) console.debug('[content] message received', message.type);

  if (message.type === MSG.RECORDING_STARTED) {
    if (import.meta.env.DEV) console.log('[content] recording started — TODO: start speaker tracker');
    // TODO: implement in Speaker Tracker milestone
  }
  if (message.type === MSG.RECORDING_STOPPED) {
    if (import.meta.env.DEV) console.log('[content] recording stopped — TODO: flush speaker log');
    // TODO: implement in Speaker Tracker milestone
  }
});
```

`platforms/meet.ts` stub:
```typescript
/** Returns the name of the currently speaking participant, or null if silence. */
export function getActiveSpeaker(): string | null {
  // TODO: implement selectors in Speaker Tracker milestone
  return null;
}
```

`platforms/telemost.ts` stub — same shape as meet.ts.

`speakerTracker.ts` and `meetingEnd.ts` — empty stubs with TODO comments and file-level console.log.

#### Task 13: popup stubs
**Files:** `src/popup/popup.html`, `src/popup/popup.ts`

`popup.html`:
```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Transkribe</title>
  <link rel="stylesheet" href="../styles/globals.css">
</head>
<body class="w-64 p-4">
  <h1 class="text-lg font-bold mb-2">Transkribe</h1>
  <button id="startBtn" class="bg-blue-500 text-white px-4 py-2 rounded w-full">
    Начать запись
  </button>
  <p id="status" class="text-sm text-gray-500 mt-2">Готов к записи</p>
  <script type="module" src="./popup.ts"></script>
</body>
</html>
```

`popup.ts` stub:
```typescript
import { MSG } from '../shared/messages';

if (import.meta.env.DEV) console.log('[popup] loaded');

const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLParagraphElement;

startBtn.addEventListener('click', () => {
  if (import.meta.env.DEV) console.log('[popup] start button clicked');
  // TODO: implement recording toggle in Audio Recording milestone
  statusEl.textContent = 'TODO: запись не реализована';
});
```

#### Task 14: sidepanel React app stub
**Files:** `src/sidepanel/index.html`, `src/sidepanel/index.tsx`, `src/sidepanel/presentation/SidePanel.tsx`

`index.html`:
```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Transkribe — Результаты</title>
  <link rel="stylesheet" href="../styles/globals.css">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./index.tsx"></script>
</body>
</html>
```

`index.tsx`:
```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { SidePanel } from './presentation/SidePanel';

if (import.meta.env.DEV) console.log('[sidepanel] React app mounting');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SidePanel />
  </React.StrictMode>
);
```

`presentation/SidePanel.tsx` stub:
```typescript
import React from 'react';

export function SidePanel() {
  if (import.meta.env.DEV) console.log('[SidePanel] rendered');

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Transkribe</h1>
      <p className="text-gray-500">
        Запись митинга завершена. Здесь появится транскрипт и резюме.
      </p>
      {/* TODO: implement in Transcription / Sidepanel UI milestones */}
    </div>
  );
}
```

Also create empty stub files (with TODO comments):
- `src/sidepanel/application/pipeline.ts`
- `src/sidepanel/application/diarize.ts`
- `src/sidepanel/infrastructure/stt.ts`
- `src/sidepanel/infrastructure/claude.ts`

#### Task 15: options page stub
**Files:** `src/options/options.html`, `src/options/options.tsx`

`options.html` — standard HTML shell linking to `options.tsx` React root.

`options.tsx` stub — React component with two password inputs (OpenAI key, Anthropic key) and a Save button. Inputs read from and write to `chrome.storage.local` via `shared/storage.ts`. Log: `[options] keys saved`.

**Commit checkpoint 4** after Task 15:
```
feat(scaffold): add all MV3 context stubs — background, offscreen, content, popup, sidepanel, options
```

---

### Phase 5 — Verify build

#### Task 16: Verify build compiles successfully
**Command:** `npm run build`

Run `npm run build`. Expected output: CRXJS bundles all entry points into `dist/`. No TypeScript errors.

If build fails:
- Fix TypeScript errors (likely missing type imports or config issues)
- Do NOT add `@ts-ignore` to suppress errors — fix the root cause

Log: build output itself serves as verification.

**Commit checkpoint 5** (final) after Task 16:
```
chore: verify scaffold build passes — all entry points compile
```

---

## Commit Plan

| After Task | Commit Message |
|------------|---------------|
| Task 2  | `chore: initialize npm project with vite + crxjs + react + tailwind` |
| Task 6  | `chore: add tsconfig, vite config, manifest.json, tailwind setup` |
| Task 9  | `feat(shared): add types, message constants, and storage helpers` |
| Task 15 | `feat(scaffold): add all MV3 context stubs — background, offscreen, content, popup, sidepanel, options` |
| Task 16 | `chore: verify scaffold build passes — all entry points compile` |
