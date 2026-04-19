# Plan: Streaming Audio Chunks + Structured Speaker Events

> **Refined v2** — углублён после deep codebase analysis. Добавлены критичные fixes: отложенное закрытие offscreen, payload в `RECORDING_STARTED`, финальный `end`-event, permission UI flow, CORS, IDB quota, session retry, Runpod handling. Добавлена секция Tasks с чекбоксами для `/aif-implement`.

## Context

Transkribe — Chrome MV3 extension для транскрипции встреч Google Meet / Yandex Telemost. Сейчас аудио встречи собирается в один `MediaRecorder` на всю встречу, блоб отправляется в OpenAI Whisper **только после окончания**. Это хрупко: закрытие вкладки, краш браузера, пропавшая сеть — и всё теряется. Параллельно, `SpeakerTracker` определяет активного спикера, но события start/end существуют только как `console.log` — их нельзя потреблять программно (ни UI, ни backend, ни для recovery).

Две цели:
1. **Стримить аудио кусками по 30s** на новый backend сразу во время записи — чтобы (a) не потерять запись при сбое, (b) дать backend возможность делать realtime-транскрипцию (опционально, см. §MVP scope). При пропаже сети — буфер в IndexedDB + ретраи.
2. **Структурированные speaker-события** `{kind: 'start'|'end', name, offsetMs}` с порогом паузы 1000ms: >1000ms тишины = конец сегмента, следующая активность того же спикера = новый сегмент.

## Зафиксированные решения

| Вопрос | Решение |
|---|---|
| Backend stack | Node.js + Fastify (тонкий прокси к OpenAI Whisper + storage) |
| Auth | Shared secret в `X-API-Key` header (из `chrome.storage.local`) |
| Финальный webm | Extension склеивает (через `new Blob(allChunks)`) + backend склеивает параллельно (ffmpeg concat) |
| Пауза → новый сегмент | 1000ms (унифицированный `PAUSE_THRESHOLD_MS`) |
| Chunking стратегия | Двойной буфер MediaRecorder с 200ms overlap |
| Uploader | В offscreen document: прямой `fetch(body: blob)` без base64 |
| Persistence queue | IndexedDB (чанки 200-500 KB) |
| SW keep-alive | Long-lived Port от offscreen в SW + `chrome.alarms` для recovery |
| Speaker event destination | b (source of truth) + c (live UI) + d (backend stream) |
| **Per-chunk STT на backend** | **Feature flag, по умолчанию OFF в MVP**. Backend = storage + /complete с финальной транскрипцией |
| **Runpod provider** | Backend — OpenAI only. Существующий post-meeting pipeline в sidepanel остаётся мульти-провайдером |

## MVP scope — что В, что ОТЛОЖЕНО

**В MVP:**
- Rotating dual MediaRecorder в offscreen
- IDB-persistence очередь с ретраями
- POST /sessions, /chunks, /events, /complete
- Финальный webm: extension собирает + backend ffmpeg concat
- Speaker events в UI (live) + IDB + backend
- Recovery после browser restart
- Options page: backend URL + API secret + Enable streaming toggle

**Отложено до V2:**
- Per-chunk realtime STT на backend (feature flag, default off)
- Поддержка Runpod per-chunk (backend only OpenAI)
- Multi-tab одновременные записи
- UI с progress-bar upload queue в sidepanel

## Speaker Event Destination — оценка

| Вариант | Оценка | Обоснование |
|---|---|---|
| (a) console.log only | **2/10** | Невидимо для UI, backend, recovery |
| (b) `speakerEvents[]` + IDB | **9/10** | Source of truth, replay-able, не ломает diarize.ts |
| (c) Live-message в sidepanel | **7/10** | Отличный UX, но только когда sidepanel открыт |
| (d) Стрим на backend | **8/10** | Идеальная корреляция с chunks, переживает краш |

**Итог: b + c + d композитно = 9.5/10.**

## Архитектура

```
┌─────────────────────────────────────────────────────────────────┐
│ content.ts (Meet / Telemost tab)                                │
│   ├─ SpeakerTracker (принимает recordingStartMs + onEvent)      │
│   │    commitSpeaker() ──► emit SPEAKER_EVENT {kind, name, off} │
│   └─ forwards MIC_ACTIVITY / TAB_ACTIVITY                       │
│   [speaker-detector.js — main-world, НЕ ТРОГАЕМ]                │
└──────────────────────────────┬──────────────────────────────────┘
                               │ chrome.runtime.sendMessage
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ background.ts (Service Worker)                                  │
│   ├─ генерирует sessionId + recordingStartMs ПЕРЕД START        │
│   ├─ RECORDING_STARTED({recordingStartMs, sessionId}) → content │
│   ├─ fan-out SPEAKER_EVENT → offscreen + sidepanel              │
│   ├─ long-lived Port receiver (keep-alive от offscreen)         │
│   ├─ alarms 'retry-upload' (recovery после restart)             │
│   └─ ЖДЁТ OFFSCREEN_DONE перед closeDocument() ❗               │
└───────┬─────────────────────────────────────────┬───────────────┘
        │                                         │
        ▼                                         ▼
┌─────────────────────────┐         ┌───────────────────────────┐
│ offscreen.ts            │         │ sidepanel (React)         │
│   ├─ Dual MediaRecorder │         │   ├─ LiveSpeakerIndicator │
│   │    30s rotation     │         │   └─ post-meeting pipeline│
│   │    200ms overlap    │         │      (Whisper → diarize → │
│   ├─ ChunkUploader      │         │       Claude) UNCHANGED   │
│   │  (IDB + retry)      │         │                           │
│   ├─ batchEventsUploader│         └───────────────────────────┘
│   ├─ at STOP:           │
│   │   1. flush chunks   │
│   │   2. POST /complete │
│   │   3. OFFSCREEN_DONE │
│   └─ keep-alive Port    │
└─────────┬───────────────┘
          │ fetch (CORS: chrome-extension://*)
          ▼
┌─────────────────────────────────────────────────────────────────┐
│ backend (Node.js + Fastify + @fastify/cors + @fastify/multipart)│
│   POST /sessions                → { sessionId }                 │
│   POST /sessions/:id/chunks     → data/<id>/chunks/<idx>.webm   │
│   POST /sessions/:id/events     → append data/<id>/events.jsonl │
│   POST /sessions/:id/complete   → ffmpeg concat → final.webm    │
│                                 → (optional flag) Whisper       │
│   GET  /sessions/:id            → metadata                      │
│   X-API-Key header required everywhere                          │
└─────────────────────────────────────────────────────────────────┘
```

## Track A — 30-секундный стриминг чанков

### A1. Rotating dual MediaRecorder

**Файл:** `src/offscreen/offscreen.ts`

Два рекордера с 200ms оверлапом:

```
time:    0s     29.8s  30s    59.8s  60s    89.8s  90s
         │─────────────│      │─────────────│      │──
         │   Recorder A │      │  Recorder A  │      │
                │─────────────│      │─────────────│
                │   Recorder B │      │   Recorder B │
```

- `CHUNK_DURATION_MS = 30_000`, `OVERLAP_MS = 200`
- `setInterval(30000)`: A стопает (→ chunk #0), B уже пишет; затем B стартует новый B' через 29.8s; A стартует заново на 30s границе
- Каждый `onstop` → `new Blob(chunks)` → samодостаточный webm → `chunkUploader.enqueue()`
- При очень короткой встрече (<30s) STOP до первой ротации → отправить частичный chunk с `isFinal: true`

### A2. Прямая отправка Blob (без base64)

Для чанков — `fetch(url, {method:'POST', body: blob, headers: {'X-API-Key': secret}})`. Base64 через FileReader остаётся **только** для legacy финального `AUDIO_BLOB_READY` (совместимость с существующим pipeline).

### A3. ChunkUploader с IDB

**Новый файл:** `src/offscreen/chunkUploader.ts`

```typescript
interface ChunkRecord {
  sessionId: string | null;  // null если /sessions ещё не создан
  index: number;
  blob: Blob;
  offsetMs: number;
  durationMs: number;
  isFinal: boolean;
  attempts: number;
}

class ChunkUploader {
  async enqueue(chunk: ChunkRecord): Promise<void>
  async retryPending(): Promise<void>
  async drainAndComplete(sessionId: string, expectedChunks: number): Promise<void>
}
```

- IDB `transkribe.chunks`, keyPath `[sessionId, index]` (при null sessionId — pending bucket)
- Retry: exponential backoff 1s → 2s → 4s → 8s → 16s, max 5, jitter ±20%
- Session retry: если `POST /sessions` падает, чанки буферизируются с `sessionId: null`, каждые 10s попытка re-create → backfill

### A4. Отложенное закрытие offscreen ❗

**Файл:** `src/background/background.ts` (модификация)

Текущее поведение: [background.ts:283](src/background/background.ts#L283) закрывает offscreen **сразу** после AUDIO_BLOB_READY. Это убьёт uploader.

**Новое:** offscreen после `STOP_OFFSCREEN`:
1. Стопает MediaRecorder → последний chunk в очередь
2. `chunkUploader.drainAndComplete(sessionId)` → ждёт все чанки + POST /complete
3. Шлёт `AUDIO_BLOB_READY` (финальный blob в base64)
4. Шлёт новый `OFFSCREEN_DONE`

Background закрывает offscreen **только** на `OFFSCREEN_DONE`. Таймаут 30s safety — если drain не завершается, force close.

### A5. Service Worker keep-alive через Port

Offscreen: `chrome.runtime.connect({name: 'keepalive'})` держит SW живым всё время записи. Background: listener на `chrome.runtime.onConnect`, тривиально.

### A6. Recovery после browser restart

При старте SW:
1. `chrome.storage.local.get('activeSession')` → если `{status: 'active'|'completing'}` и нет offscreen → установить `status: 'abandoned'`
2. Прочитать IDB pending chunks по sessionId → создать offscreen → `retryPending()` → `drainAndComplete()`
3. `chrome.alarms.create('retry-upload', {periodInMinutes: 5})` — periodic wake для pending chunks

### A7. Session schema в chrome.storage.local

```typescript
interface ActiveSession {
  sessionId: string | null;          // null если /sessions не создан
  recordingStartMs: number;
  status: 'active' | 'completing' | 'done' | 'abandoned';
  expectedChunks?: number;
  lastChunkIndex: number;
  startedAt: number;
}
```

Очищается при нормальном завершении. Проверяется при SW старте для recovery.

### A8. IDB quota warning

При `enqueue` с `attempts > 0` — `navigator.storage.estimate()`. Если `usage / quota > 0.8` → emit `STORAGE_WARNING` message → UI показывает баннер "Storage filling up, consider stopping recording". При >0.95 — отбрасывать новые чанки (не блокировать запись).

### A9. Графичный fallback при disabled streaming

Если в options `Enable streaming = false` ИЛИ `Backend URL` пуст:
- Offscreen не создаёт session, не отправляет chunks
- Работает как сейчас: финальный AUDIO_BLOB_READY → post-meeting Whisper
- Speaker events всё равно эмитятся (локально в live-UI + финальный log)

## Track B — структурированные Speaker Events

### B1. Emit событий из SpeakerTracker

**Файл:** `src/content/speakerTracker.ts`

Модификация конструктора:

```typescript
constructor(
  private readonly getActiveSpeaker: GetActiveSpeakerFn,
  private readonly getSelfName: GetSelfNameFn,
  private readonly recordingStartMs: number,          // НОВОЕ
  private readonly onEvent?: (ev: SpeakerEvent) => void, // НОВОЕ
) {}
```

`commitSpeaker()` эмитит `end` для старого + `start` для нового:

```typescript
private commitSpeaker(name: string | null): void {
  if (name === this.currentSpeaker) return;
  const now = Date.now();
  const offsetMs = now - this.recordingStartMs;
  if (this.currentSpeaker !== null) {
    this.onEvent?.({ kind: 'end',   name: this.currentSpeaker, offsetMs });
  }
  this.flushCurrentSpeaker(now);
  if (name !== null) {
    this.onEvent?.({ kind: 'start', name, offsetMs });
  }
  this.currentSpeaker = name;
  this.speakerStartMs = name ? now : null;
}
```

### B2. Финальный end-event в stop()

**Файл:** `src/content/speakerTracker.ts:88`

Сейчас `stop()` зовёт `flushCurrentSpeaker()` но НЕ эмитит event. **Fix:** вызвать `commitSpeaker(null)` перед флашем — это единообразно закроет последний сегмент и пошлёт `end`.

### B3. Унификация порога паузы

```typescript
const PAUSE_THRESHOLD_MS = 1000; // из chrome.storage.local.speakerSettings, default 1000
```

Убрать разницу между `HOLD_MS=800` и `SILENCE_MS=1000` — оба заменить на `PAUSE_THRESHOLD_MS`.

**Проверка:** пауза > 1000ms → `commitSpeaker(null)` → `end`. Затем активность того же спикера → `commitSpeaker(name)` → `start` → новый сегмент. ✅

### B4. RECORDING_STARTED payload ❗

**Файл:** `src/background/background.ts:222`

Сейчас шлёт пустое сообщение. **Fix:** генерировать `sessionId` и `recordingStartMs` в background ДО broadcast:

```typescript
const recordingStartMs = Date.now();
const sessionId = crypto.randomUUID();
await chrome.storage.local.set({ activeSession: { sessionId, recordingStartMs, status: 'active', lastChunkIndex: -1, startedAt: recordingStartMs } });
await chrome.tabs.sendMessage(activeTabId, { type: MSG.RECORDING_STARTED, payload: { recordingStartMs, sessionId } });
await chrome.runtime.sendMessage({ type: MSG.START_OFFSCREEN, payload: { streamId, recordingStartMs, sessionId } });
```

Offscreen использует этот `recordingStartMs` вместо `Date.now()` в [offscreen.ts:67](src/offscreen/offscreen.ts#L67). Content.ts передаёт `recordingStartMs` в `new SpeakerTracker(...)`.

### B5. Event propagation chain

```
SpeakerTracker.commitSpeaker()
    │ onEvent callback
    ▼
content.ts: chrome.runtime.sendMessage(SPEAKER_EVENT)
    │
    ▼
background.ts: fan-out →
    ├─► offscreen (batching buffer → POST /events каждые 500ms)
    └─► sidepanel (для live UI, если открыт)
```

Batch flush: на `STOP_OFFSCREEN` принудительно flush pending events перед `/complete`.

### B6. Live UI в sidepanel

**Новый файл:** `src/sidepanel/presentation/LiveSpeakerIndicator.tsx`

Компонент читает `SPEAKER_EVENT` через `chrome.runtime.onMessage`:
- `kind: 'start'` → `setLiveSpeaker(name)`
- `kind: 'end'` & name совпадает → `setLiveSpeaker(null)`

**Ограничение:** indicator работает только когда sidepanel открыт. Если открыт после начала речи — индикатор подхватывает следующий `start`. Persistent state отложен до V2.

## Backend — Node.js + Fastify

**Новая папка:** `backend/` в корне repo

### Структура

```
backend/
├── package.json         (fastify, @fastify/multipart, @fastify/cors, ffmpeg-static)
├── tsconfig.json
├── .gitignore           (data/, .env, node_modules/, dist/)
├── .env.example         (PORT=3000, OPENAI_API_KEY=, API_SECRET=, ENABLE_PER_CHUNK_STT=false)
├── README.md            (setup, endpoints, security notes)
├── src/
│   ├── server.ts
│   ├── routes/
│   │   ├── sessions.ts
│   │   ├── chunks.ts
│   │   ├── events.ts
│   │   └── complete.ts
│   ├── storage/
│   │   ├── fs.ts
│   │   └── ffmpeg.ts
│   ├── stt/
│   │   └── whisper.ts   (OpenAI proxy)
│   └── auth/
│       └── apiKey.ts
└── data/                (gitignore)
    └── sessions/<uuid>/
        ├── meta.json
        ├── chunks/
        │   └── 00000.webm
        ├── events.jsonl
        └── final.webm
```

### Endpoints

| Method | Path | Payload | Response |
|---|---|---|---|
| POST | `/sessions` | `{recordingStartMs, platform}` | `{sessionId}` |
| POST | `/sessions/:id/chunks` | multipart: `file`, `index`, `offsetMs`, `isFinal` | `{ok, transcript?}` (transcript только если `ENABLE_PER_CHUNK_STT=true`) |
| POST | `/sessions/:id/events` | `{events: SpeakerEvent[]}` | `{ok}` |
| POST | `/sessions/:id/complete` | `{expectedChunks}` | `{ok, finalUrl, transcript?}` |
| GET | `/sessions/:id` | — | `{meta, chunks[], eventsCount}` |

### CORS

`@fastify/cors` с разрешённым origin `chrome-extension://*` (или `*` для dev с warning в README).

### ffmpeg concat

`ffmpeg-static` npm + `execFile`. list.txt генерируется из имён файлов.

### Auth

Middleware `preHandler` сверяет `req.headers['x-api-key'] === process.env.API_SECRET`, иначе 401.

## Extension — изменения

### Новые файлы

- `src/offscreen/chunkUploader.ts` — IDB queue + retry
- `src/offscreen/eventBatcher.ts` — 500ms batching для /events
- `src/shared/backend.ts` — fetch helpers: `createSession`, `postChunk`, `postEvents`, `completeSession`
- `src/shared/idb.ts` — минимальный IDB wrapper
- `src/sidepanel/presentation/LiveSpeakerIndicator.tsx`

### Модифицированные файлы

- `src/offscreen/offscreen.ts` — dual recorder, uploader, keep-alive port, OFFSCREEN_DONE emit
- `src/content/speakerTracker.ts` — onEvent callback, unified PAUSE_THRESHOLD_MS, final end-event в stop()
- `src/content/content.ts` — принимает recordingStartMs из RECORDING_STARTED, передаёт в tracker, форвардит SPEAKER_EVENT
- `src/background/background.ts` — генерация sessionId+recordingStartMs, fan-out SPEAKER_EVENT, onConnect для keep-alive, alarms, отложенный offscreen close
- `src/shared/messages.ts` — добавить: SPEAKER_EVENT, SESSION_CREATED, OFFSCREEN_DONE, STORAGE_WARNING
- `src/shared/types.ts` — SpeakerEvent, ChunkRecord, SessionMeta, BackendConfig, ActiveSession
- `src/shared/storage.ts` — getBackendConfig, setActiveSession, getActiveSession, clearActiveSession
- `src/sidepanel/presentation/SidePanel.tsx` — рендер LiveSpeakerIndicator во время записи
- `src/options/options.tsx` — новая секция "Backend (Streaming)": URL, secret, enable toggle, pause threshold; permission request в click handler
- `manifest.json` — `alarms` permission, `optional_host_permissions: ["http://*/*", "https://*/*"]`

### НЕ меняются

- `src/sidepanel/application/pipeline.ts`
- `src/sidepanel/application/diarize.ts`
- `src/sidepanel/infrastructure/stt.ts`
- `src/sidepanel/infrastructure/claude.ts`
- `speaker-detector.js` (main-world)

## Verification

1. **Backend smoke:**
   - `cd backend && cp .env.example .env && npm install && npm run dev`
   - `curl -X POST localhost:3000/sessions -H 'X-API-Key: test-secret' -H 'Content-Type: application/json' -d '{"recordingStartMs":0,"platform":"meet"}'` → `{sessionId}`
   - `curl -X POST localhost:3000/sessions/<id>/chunks -H 'X-API-Key: test-secret' -F 'file=@test.webm' -F 'index=0' -F 'offsetMs=0' -F 'isFinal=false'` → 200
   - Проверить `data/sessions/<id>/chunks/00000.webm` играется

2. **Extension build & load:**
   - `npm run build && npm run dev`
   - Load unpacked, Options → Backend URL `http://localhost:3000`, secret `test-secret`, Enable streaming ON
   - Chrome permission prompt → Allow

3. **Live meeting test:**
   - `meet.google.com` → start в popup
   - 30s: backend логирует POST /chunks index=0
   - 60s: index=1
   - Отключить backend → chunks скапливаются в DevTools → Application → IndexedDB → transkribe
   - Включить обратно → flush ≤16s
   - Говорить → live indicator в sidepanel; пауза 1.1s → индикатор пропадает; снова говорить → новый start

4. **Speaker events:**
   - `data/sessions/<id>/events.jsonl` — JSON Lines с `{kind, name, offsetMs}`
   - Two consecutive `start` от одного person с паузой >1s → два сегмента в финальном speakerLog

5. **Recovery test:**
   - 1 минута записи → force-kill Chrome
   - Restart → SW просыпается → pending chunks досылаются → /complete
   - `final.webm` собран на backend

6. **Graceful fallback:**
   - Options → Enable streaming OFF → запись работает как раньше, без backend
   - Options → Backend URL указан, но сервер лежит → chunks копятся в IDB, финальный webm всё равно собирается и идёт в Whisper в sidepanel

7. **Совместимость:**
   - Post-meeting runPipeline() идентично старому: Whisper → diarize → Claude → sidepanel UI

## Tasks (для `/aif-implement`)

### Phase 0 — Shared foundations

- [x] 0.1 Добавить типы в `src/shared/types.ts`: `SpeakerEvent`, `ChunkRecord`, `SessionMeta`, `BackendConfig`, `ActiveSession`
- [x] 0.2 Добавить константы сообщений в `src/shared/messages.ts`: `SPEAKER_EVENT`, `SESSION_CREATED`, `OFFSCREEN_DONE`, `STORAGE_WARNING` + соответствующие message interfaces
- [x] 0.3 Расширить `src/shared/storage.ts`: `getBackendConfig`, `setBackendConfig`, `getActiveSession`, `setActiveSession`, `clearActiveSession`, `getSpeakerSettings`, `setSpeakerSettings`
- [x] 0.4 Создать `src/shared/idb.ts` — минимальный IDB wrapper (open, put, getAll, delete, deleteByIndex) без сторонних либ
- [x] 0.5 Создать `src/shared/backend.ts` — fetch helpers: `createSession(config, meta)`, `postChunk(config, sessionId, chunk)`, `postEvents(config, sessionId, events)`, `completeSession(config, sessionId, expectedChunks)`. Все с `X-API-Key` header и timeouts.

### Phase 1 — Manifest & Options UI

- [ ] 1.1 `manifest.json`: добавить `"alarms"` в permissions; добавить `optional_host_permissions: ["http://*/*", "https://*/*"]`
- [ ] 1.2 `src/options/options.tsx`: новая секция "Backend (Streaming)" с полями Backend URL, API Secret, Enable streaming (checkbox), Pause threshold (number input, default 1000)
- [ ] 1.3 В options.tsx: кнопка "Connect to backend" с синхронным `chrome.permissions.request({origins: [new URL(backendUrl).origin + '/*']})` внутри onClick
- [ ] 1.4 В options.tsx: сохранять в `chrome.storage.local.backendConfig` и `chrome.storage.local.speakerSettings`

### Phase 2 — SpeakerTracker рефактор

- [ ] 2.1 `src/content/speakerTracker.ts`: добавить параметры `recordingStartMs` и `onEvent` в конструктор
- [ ] 2.2 В `commitSpeaker()` эмитить `{kind: 'end', name, offsetMs}` для старого и `{kind: 'start', name, offsetMs}` для нового
- [ ] 2.3 Заменить `HOLD_MS` и `SILENCE_MS` на один `PAUSE_THRESHOLD_MS` (загружать из storage, default 1000)
- [ ] 2.4 В `stop()` вызвать `commitSpeaker(null)` перед `flushCurrentSpeaker()` — гарантирует финальный `end`
- [ ] 2.5 Unit-тест: pause > 1000ms между двумя активностями одного имени → два сегмента + events: start, end, start, end

### Phase 3 — Background: session lifecycle

- [ ] 3.1 `background.ts handleRecordingStart`: сгенерировать `sessionId = crypto.randomUUID()` и `recordingStartMs = Date.now()` ДО broadcast; сохранить в `activeSession`
- [ ] 3.2 Добавить payload `{recordingStartMs, sessionId}` в `RECORDING_STARTED` (для content) и в `START_OFFSCREEN` (для offscreen)
- [ ] 3.3 Добавить handler для `SPEAKER_EVENT`: fan-out в offscreen (через `chrome.runtime.sendMessage`) и в sidepanel
- [ ] 3.4 Добавить handler для `OFFSCREEN_DONE`: **только здесь** закрывать offscreen; убрать `closeDocument()` из `handleAudioBlobReady`
- [ ] 3.5 Добавить 30s safety timeout: если OFFSCREEN_DONE не пришёл — force close + лог warning
- [ ] 3.6 `chrome.runtime.onConnect` listener для port `keepalive` от offscreen (тривиально, просто держит SW живым)
- [ ] 3.7 На старте SW: проверить `activeSession`; если status `active`/`completing` и нет offscreen → пометить `abandoned` и запустить recovery flow (создать offscreen + uploader.retryPending + complete)
- [ ] 3.8 `chrome.alarms.create('retry-upload', {periodInMinutes: 5})` + listener на `alarms.onAlarm` для wake retry

### Phase 4 — Offscreen: dual recorder + uploader

- [ ] 4.1 `src/offscreen/chunkUploader.ts`: класс с `enqueue`, `retryPending`, `drainAndComplete`; exponential backoff 1→2→4→8→16s, max 5 attempts
- [ ] 4.2 В uploader: session retry — если sessionId null при enqueue, периодически создавать session и backfill queued chunks
- [ ] 4.3 В uploader: IDB quota check — при `attempts>0` проверять `navigator.storage.estimate()`, при >0.8 emit `STORAGE_WARNING`, >0.95 — reject new enqueue
- [ ] 4.4 `src/offscreen/eventBatcher.ts`: 500ms буфер speaker-events → `POST /events`; `flush()` для STOP
- [ ] 4.5 `offscreen.ts handleStartOffscreen`: принять `recordingStartMs` и `sessionId` из payload, использовать вместо `Date.now()`
- [ ] 4.6 `offscreen.ts`: установить long-lived Port `chrome.runtime.connect({name: 'keepalive'})` в handleStartOffscreen
- [ ] 4.7 `offscreen.ts`: запустить первый `createSession()` → записать sessionId в activeSession (через message в background)
- [ ] 4.8 `offscreen.ts`: dual MediaRecorder с 30s rotation и 200ms overlap. `setInterval` + tracking A/B active flag
- [ ] 4.9 Каждый `onstop` → `new Blob(chunks)` → `chunkUploader.enqueue({sessionId, index, blob, offsetMs, durationMs, isFinal: false, attempts: 0})`
- [ ] 4.10 Слушать `SPEAKER_EVENT` от background → `eventBatcher.push(event)`
- [ ] 4.11 `handleStopOffscreen`: stop оба рекордера; последний частичный chunk → enqueue с `isFinal: true`; `eventBatcher.flush()`; `chunkUploader.drainAndComplete(sessionId, expectedChunks)`; собрать финальный blob (base64) → `AUDIO_BLOB_READY`; затем `OFFSCREEN_DONE`
- [ ] 4.12 Обработка очень коротких встреч: если STOP до первой ротации → один `isFinal: true` chunk

### Phase 5 — Content script

- [ ] 5.1 `src/content/content.ts`: читать `recordingStartMs` и `sessionId` из payload `RECORDING_STARTED`
- [ ] 5.2 Передать `recordingStartMs` и `onEvent` callback в `new SpeakerTracker(...)`; callback шлёт `SPEAKER_EVENT` в background
- [ ] 5.3 Перед стартом tracker: прочитать `speakerSettings.pauseThresholdMs` из storage, передать

### Phase 6 — Sidepanel live UI

- [ ] 6.1 `src/sidepanel/presentation/LiveSpeakerIndicator.tsx`: компонент с `useState<string|null>`, listener на `chrome.runtime.onMessage` для `SPEAKER_EVENT`
- [ ] 6.2 `src/sidepanel/presentation/SidePanel.tsx`: подключить `<LiveSpeakerIndicator/>` в recording state

### Phase 7 — Backend

- [ ] 7.1 Создать `backend/package.json` с зависимостями: `fastify`, `@fastify/multipart`, `@fastify/cors`, `ffmpeg-static`, `dotenv`; devDeps: `typescript`, `tsx`, `@types/node`
- [ ] 7.2 `backend/tsconfig.json`, `backend/.gitignore` (data/, .env, node_modules/, dist/), `backend/.env.example` (PORT, OPENAI_API_KEY, API_SECRET, ENABLE_PER_CHUNK_STT)
- [ ] 7.3 `backend/src/server.ts`: Fastify app, регистрация cors (chrome-extension://*), multipart, routes
- [ ] 7.4 `backend/src/auth/apiKey.ts`: preHandler hook проверяющий X-API-Key == process.env.API_SECRET
- [ ] 7.5 `backend/src/storage/fs.ts`: `createSessionDir`, `saveChunk`, `appendEvents`, `readChunksList`, `saveMeta`, `updateMeta`
- [ ] 7.6 `backend/src/storage/ffmpeg.ts`: `concatChunks(sessionDir) → final.webm` через ffmpeg-static + execFile
- [ ] 7.7 `backend/src/routes/sessions.ts`: POST /sessions (генерит uuid + создаёт dir + meta.json), GET /sessions/:id
- [ ] 7.8 `backend/src/routes/chunks.ts`: POST /sessions/:id/chunks (multipart, валидация index/offsetMs, сохранение), опциональный per-chunk STT по feature flag
- [ ] 7.9 `backend/src/routes/events.ts`: POST /sessions/:id/events (append в events.jsonl)
- [ ] 7.10 `backend/src/routes/complete.ts`: POST /sessions/:id/complete → ffmpeg concat → (optional) final Whisper → return transcript
- [ ] 7.11 `backend/src/stt/whisper.ts`: прокси к OpenAI Whisper API (multipart forward)
- [ ] 7.12 `backend/README.md` с setup инструкцией и security warning про CORS `*`

### Phase 8 — Verification

- [ ] 8.1 Backend curl smoke-test всех endpoints
- [ ] 8.2 Extension: Meet встреча 2 минуты, 4 chunks в backend, final.webm собран
- [ ] 8.3 Отключить backend в середине записи, подключить обратно — pending chunks досылаются
- [ ] 8.4 Force-kill Chrome в середине записи — после restart chunks досылаются, /complete вызывается
- [ ] 8.5 Graceful fallback: Enable streaming OFF → запись работает без backend, post-meeting pipeline без изменений
- [ ] 8.6 Speaker events: пауза 1.2s между одним спикером → два сегмента в финальном `speakerLog`; events.jsonl содержит start/end/start/end
- [ ] 8.7 Live indicator в sidepanel реагирует на переключение спикеров с задержкой ≤300ms

## Критичные файлы (summary)

**Существующие для модификации:**
- `src/offscreen/offscreen.ts`
- `src/content/speakerTracker.ts`
- `src/content/content.ts`
- `src/background/background.ts`
- `src/shared/messages.ts`
- `src/shared/types.ts`
- `src/shared/storage.ts`
- `src/sidepanel/presentation/SidePanel.tsx`
- `src/options/options.tsx`
- `manifest.json`

**Новые в extension:**
- `src/offscreen/chunkUploader.ts`
- `src/offscreen/eventBatcher.ts`
- `src/shared/backend.ts`
- `src/shared/idb.ts`
- `src/sidepanel/presentation/LiveSpeakerIndicator.tsx`

**Новые в backend/ (monorepo):**
- `backend/package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `README.md`
- `backend/src/server.ts`
- `backend/src/routes/{sessions,chunks,events,complete}.ts`
- `backend/src/storage/{fs,ffmpeg}.ts`
- `backend/src/stt/whisper.ts`
- `backend/src/auth/apiKey.ts`

**НЕ трогаем:**
- `src/sidepanel/application/pipeline.ts`
- `src/sidepanel/application/diarize.ts`
- `src/sidepanel/infrastructure/stt.ts`
- `src/sidepanel/infrastructure/claude.ts`
- `speaker-detector.js` (main-world инжекция)
