# Architecture: Layered Architecture (Chrome MV3 Adapted)

## Overview
Transkribe uses a Layered Architecture adapted to Chrome Manifest V3 constraints.
The MV3 model itself imposes the top-level structure: four isolated execution contexts
(service worker, offscreen document, content scripts, sidepanel/popup) communicate
exclusively via `chrome.runtime.sendMessage`. Within each context — especially the React
sidepanel — a classic layered approach organizes code into presentation, application, and
infrastructure layers flowing in one direction.

The sidepanel hosts the most logic-dense code: it drives the post-meeting pipeline
(STT → diarize → summarize) and renders results. This is where the layered model matters most.

## Decision Rationale
- **Project type:** Chrome MV3 browser extension, small team
- **Tech stack:** TypeScript, React 18, Vite/CRXJS
- **Key factor:** MV3 defines primary structural boundaries (bg/offscreen/content/ui);
  layered architecture organizes code *within* those boundaries without unnecessary overhead

## Execution Contexts (MV3 Boundaries)

These are hard boundaries enforced by Chrome — not architecture choices:

```
┌─────────────────────────────────────────────────────────┐
│  background.ts (Service Worker)                         │
│  — orchestration only: tabCapture, message routing,     │
│    storage writes, sidepanel open                       │
├─────────────────────────────────────────────────────────┤
│  offscreen.ts (Offscreen Document)                      │
│  — audio capture only: MediaRecorder + Web Audio API    │
├─────────────────────────────────────────────────────────┤
│  content.ts (Content Script)                            │
│  — DOM observation only: speaker tracker, meeting-end   │
├─────────────────────────────────────────────────────────┤
│  sidepanel/ (React App)  ←  main layered zone           │
│  popup/ (minimal UI)                                    │
└─────────────────────────────────────────────────────────┘
         ↕ chrome.runtime.sendMessage only ↕
```

## Folder Structure

```
src/
├── background/
│   └── background.ts          # Orchestration: tabCapture, offscreen, storage, sidepanel
│
├── offscreen/
│   ├── offscreen.html
│   └── offscreen.ts           # Infrastructure: MediaRecorder, Web Audio API mix
│
├── content/
│   ├── content.ts             # Entry: initializes tracker based on platform
│   ├── speakerTracker.ts      # Core: MutationObserver + speaker log builder
│   ├── platforms/
│   │   ├── meet.ts            # Meet-specific DOM selectors
│   │   └── telemost.ts        # Telemost-specific DOM selectors
│   └── meetingEnd.ts          # Meeting-end DOM detection
│
├── sidepanel/                 # ← Layered Architecture within React app
│   ├── index.tsx              # React root, providers
│   │
│   ├── presentation/          # Layer 1 — UI components (React)
│   │   ├── SidePanel.tsx      # Root layout + orchestrates pipeline state
│   │   ├── RecordingBanner.tsx
│   │   ├── TranscriptView.tsx
│   │   ├── SummaryView.tsx
│   │   └── ExportButton.tsx
│   │
│   ├── application/           # Layer 2 — pipeline orchestration (pure TypeScript)
│   │   ├── pipeline.ts        # runPipeline(): calls stt → merge → summarize in sequence
│   │   └── diarize.ts         # Merge STT segments + speaker log → DiarizedSegment[]
│   │
│   └── infrastructure/        # Layer 3 — external API clients
│       ├── stt.ts             # OpenAI Whisper API (verbose_json)
│       └── claude.ts          # Claude API (summary + action items)
│
├── popup/
│   ├── popup.html
│   └── popup.ts               # Start/stop button only — minimal logic
│
├── options/
│   ├── options.html
│   └── options.tsx            # API key configuration → chrome.storage.local
│
└── shared/
    ├── types.ts               # SpeakerLogEntry, SttSegment, DiarizedSegment, MeetingData
    ├── messages.ts            # Message type constants (RECORDING_STARTED, etc.)
    └── storage.ts             # chrome.storage.local typed helpers
```

## Dependency Rules

### Across MV3 contexts
- ✅ Any context may import from `shared/` (types, constants, storage helpers)
- ✅ Contexts communicate via `chrome.runtime.sendMessage` only
- ❌ Never import directly from another context's files (e.g., sidepanel importing from background)
- ❌ Content scripts must never import from sidepanel or background

### Within the sidepanel (layers)
- ✅ `presentation/` → `application/` (components call pipeline functions)
- ✅ `application/` → `infrastructure/` (pipeline calls API clients)
- ✅ Any layer → `shared/` (types and constants)
- ❌ `application/` must NOT import from `presentation/` (no React in pipeline)
- ❌ `infrastructure/` must NOT import from `application/` or `presentation/`
- ❌ `presentation/` must NOT call `infrastructure/` directly (must go through `application/`)

```
presentation  →  application  →  infrastructure
     ↓               ↓                ↓
                  shared/
```

## Layer Communication

### MV3 message bus (across contexts)
All inter-context communication uses typed messages defined in `shared/messages.ts`:

```typescript
// shared/messages.ts
export const MSG = {
  RECORDING_START:      'RECORDING_START',
  RECORDING_STARTED:    'RECORDING_STARTED',
  RECORDING_STOP:       'RECORDING_STOP',
  RECORDING_STOPPED:    'RECORDING_STOPPED',
  AUDIO_BLOB_READY:     'AUDIO_BLOB_READY',
  SPEAKER_LOG_READY:    'SPEAKER_LOG_READY',
} as const;

export type MsgType = typeof MSG[keyof typeof MSG];
```

### Sidepanel pipeline call flow
Presentation triggers the pipeline; application orchestrates; infrastructure executes:

```typescript
// application/pipeline.ts
export async function runPipeline(data: MeetingData): Promise<PipelineResult> {
  const segments = await transcribeAudio(data.audioBlob);    // infrastructure
  const diarized = diarize(segments, data.speakerLog);       // application/diarize.ts
  const summary  = await summarize(diarized);                // infrastructure
  return { diarized, summary };
}
```

## Key Principles

1. **Single responsibility per context** — background orchestrates, offscreen captures, content observes, sidepanel processes and displays. Never mix these concerns.
2. **No logic in background.ts** — background only routes messages and coordinates chrome APIs. All business logic lives in sidepanel/application/.
3. **Pipeline is pure** — `diarize.ts` in application layer takes inputs and returns output with no side effects. Easily testable in isolation.
4. **API keys never in code** — always read from `chrome.storage.local` at call time; never cached in module scope.
5. **Typed messages** — every `chrome.runtime.sendMessage` call uses a constant from `shared/messages.ts`, never a raw string.
6. **Platform selectors are isolated** — Meet and Telemost DOM selectors live in `content/platforms/`, never inline in the observer logic.

## Code Examples

### Typed chrome.storage helper
```typescript
// shared/storage.ts
import type { MeetingData } from './types';

export async function saveMeetingData(data: MeetingData): Promise<void> {
  await chrome.storage.local.set({ meetingData: data });
}

export async function loadMeetingData(): Promise<MeetingData | null> {
  const result = await chrome.storage.local.get('meetingData');
  return result.meetingData ?? null;
}
```

### Application layer pipeline (no React, no chrome API)
```typescript
// sidepanel/application/pipeline.ts
import { transcribeAudio } from '../infrastructure/stt';
import { summarize }       from '../infrastructure/claude';
import { diarize }         from './diarize';
import type { MeetingData, PipelineResult } from '../../shared/types';

export async function runPipeline(data: MeetingData): Promise<PipelineResult> {
  const segments = await transcribeAudio(data.audioBlob);
  const diarized = diarize(segments, data.speakerLog, data.recordingStartMs);
  const summary  = await summarize(diarized);
  return { diarized, summary };
}
```

### Presentation calls application (not infrastructure directly)
```typescript
// sidepanel/presentation/SidePanel.tsx
import { runPipeline } from '../application/pipeline';

export function SidePanel() {
  const [result, setResult] = useState<PipelineResult | null>(null);

  useEffect(() => {
    loadMeetingData().then(data => {
      if (data) runPipeline(data).then(setResult);
    });
  }, []);

  // render result...
}
```

### Platform selector isolation
```typescript
// content/platforms/meet.ts
export function getActiveSpeaker(): string | null {
  // Strategy 1: aria-label (most stable)
  for (const el of document.querySelectorAll('[aria-label]')) {
    const label = el.getAttribute('aria-label') ?? '';
    if (label.includes(', speaking') || label.includes(', говорит')) {
      return label.replace(/, (speaking|говорит).*/, '').trim();
    }
  }
  // Strategy 2: data-is-speaking fallback
  const el = document.querySelector('[data-is-speaking="true"]');
  return el?.closest('[data-participant-id]')
           ?.querySelector('[data-participant-name]')
           ?.textContent?.trim() ?? null;
}
```

## Anti-Patterns

- ❌ **Logic in background.ts** — background is a router, not a business logic layer
- ❌ **Direct cross-context imports** — never `import { foo } from '../sidepanel/...'` in content.ts
- ❌ **`presentation/` calling `infrastructure/` directly** — always go through `application/`
- ❌ **Hardcoded API keys** — read from `chrome.storage.local` on every call
- ❌ **Raw message strings** — always use `MSG.RECORDING_STARTED`, never `'RECORDING_STARTED'`
- ❌ **Inline DOM selectors** — platform-specific selectors belong in `content/platforms/`, not in `speakerTracker.ts`
- ❌ **Storing large blobs in chrome.storage.sync** — audio blobs go in `chrome.storage.local` only
- ❌ **Awaiting in offscreen without error handling** — MediaRecorder errors must be caught and sent to background via message
