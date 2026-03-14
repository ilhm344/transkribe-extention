# Project: Transkribe Extension

## Overview
A Chrome Extension (Manifest V3) for post-meeting transcription of Google Meet and Yandex Telemost sessions.
The extension captures meeting audio via `chrome.tabCapture`, tracks active speakers from the DOM in real-time
via `MutationObserver`, and after the meeting sends audio to OpenAI Whisper (MVP) for transcription,
merges the STT segments with the speaker log for diarization, and calls Claude API for a meeting summary.

## Core Features
- **Audio capture** — Records meeting audio using `chrome.tabCapture` API inside an MV3 Offscreen Document
- **Speaker tracking** — Monitors DOM with `MutationObserver` to log who speaks and when (absolute timestamps)
- **Transcription** — Sends `.webm` audio to OpenAI Whisper API (`verbose_json`), receives segments with timestamps and speaker labels
- **Diarization** — Merges STT `Speaker N` segments with the DOM speaker log by timestamp overlap → real participant names
- **AI Summary** — Sends diarized transcript to Claude API (claude-sonnet-4-6) for summary + action items
- **Results UI** — React sidepanel shows transcript, diarization, and summary; export to `.txt` / `.srt` / Telegram

## Tech Stack
- **Language:** TypeScript
- **UI Framework:** React 18 + TypeScript (sidepanel, popup, options page)
- **Browser Extension:** Chrome Manifest V3
- **Build Tool:** Vite + CRXJS (or WXT)
- **STT API (MVP):** OpenAI Whisper API (via OpenAI key, `verbose_json` mode for speaker segments + timestamps)
- **AI API:** Anthropic Claude API (claude-sonnet-4-6) for meeting summary and action items
- **Styling:** Tailwind CSS

## Architecture

```
background.js (service worker)
  ├── listens for user click → chrome.tabCapture.getMediaStreamId() → streamId
  ├── creates offscreen document, passes streamId
  ├── sends RECORDING_STARTED to content.js → starts speaker tracker
  └── receives AUDIO_BLOB_READY + SPEAKER_LOG_READY → saves to chrome.storage.local → opens sidepanel

offscreen.html + offscreen.js
  ├── getUserMedia({ chromeMediaSource: "tab", chromeMediaSourceId: streamId })
  ├── getUserMedia(microphone)
  ├── Web Audio API: mixes tab + mic → AudioContext.destination (user hears meeting)
  ├── MediaRecorder → chunks → Blob(.webm)
  └── saves recordingStartMs = Date.now() at start

content.js (injected into meet.google.com and telemost.yandex.ru)
  ├── on RECORDING_STARTED → starts MutationObserver → logs {name, startMs, endMs}
  ├── detects active speaker via aria-label="Name, speaking" (primary),
  │   data-is-speaking="true" (fallback), .participant--speaking class (Telemost fallback)
  ├── on RECORDING_STOPPED → flushes last segment → sends SPEAKER_LOG_READY
  └── detects meeting end (DOM "You left the call") → signals background.js

popup.html / popup.js
  └── start/stop button, recording status indicator

sidepanel.html / sidepanel.js (React)
  ├── reads meetingAudio + speakerLog + recordingStartMs from chrome.storage.local
  ├── POST audio → OpenAI Whisper (verbose_json) → STT segments
  ├── merges STT segments with speaker log by timestamp overlap
  ├── POST diarized transcript → Claude API → summary + action items
  └── displays result; export buttons (.txt / .srt)
```

## Post-Meeting Pipeline

```
[Meeting ends]
      ↓
[.webm Blob → chrome.storage.local]    [Speaker log JSON → chrome.storage.local]
          ↘                                         ↙
       [Both available → open sidepanel]
                      ↓
         [multipart POST → OpenAI Whisper API]
                      ↓
         [verbose_json: text + Speaker N + timestamps]
                      ↓
         [merge: STT segments + speaker log]  ← by timestamp → real names
                      ↓
         [POST → Claude API (claude-sonnet-4-6)]
                      ↓
         [summary + action items with real names]
                      ↓
         [sidepanel: show result]
                      ↓
         [export: .txt / .srt / Telegram]
```

## Speaker Log Format

```json
{
  "recordingStartMs": 1749123456000,
  "log": [
    { "name": "Sergey Rog",  "startMs": 1749123458500, "endMs": 1749123465200 },
    { "name": "Oleg Mifle",  "startMs": 1749123465200, "endMs": 1749123478900 }
  ]
}
```

## Supported Platforms

| Platform | Domain | Meeting-end detection |
|----------|--------|-----------------------|
| Google Meet | `https://meet.google.com/*` | DOM: "You left the call" screen |
| Yandex Telemost | `https://telemost.yandex.ru/*` | DOM state change |

## manifest.json (MVP)

```json
{
  "manifest_version": 3,
  "name": "Transkribe",
  "version": "0.1.0",
  "permissions": ["tabCapture", "offscreen", "storage", "activeTab", "microphone", "sidePanel"],
  "host_permissions": ["https://meet.google.com/*", "https://telemost.yandex.ru/*"],
  "background": { "service_worker": "background.js" },
  "content_scripts": [{
    "matches": ["https://meet.google.com/*", "https://telemost.yandex.ru/*"],
    "js": ["content.js"]
  }],
  "action": { "default_popup": "popup.html" },
  "side_panel": { "default_path": "sidepanel.html" }
}
```

## Project Structure (MVP)

```
extension/
├── manifest.json
├── background.ts          ← service worker, coordinates tabCapture + offscreen + content
├── offscreen.html
├── offscreen.ts           ← MediaRecorder + Web Audio API mix (tab + mic)
├── content.ts             ← meeting-end detection + speaker tracker (MutationObserver)
├── popup.html / popup.ts  ← start/stop, status indicator
├── sidepanel/             ← React app
│   ├── SidePanel.tsx      ← main UI: transcript + summary
│   ├── api/
│   │   ├── stt.ts         ← OpenAI Whisper API call
│   │   ├── merge.ts       ← STT segments ↔ speaker log merge / diarization
│   │   └── claude.ts      ← Claude API call (summary + action items)
│   └── components/        ← TranscriptView, SummaryView, ExportButton
└── shared/
    └── types.ts           ← SpeakerLogEntry, SttSegment, DiarizedSegment, etc.
```

## Known Technical Constraints & Solutions

| Problem | Solution |
|---------|----------|
| Recording requires user gesture | Mandatory "Start recording" button in popup |
| Tab reload interrupts stream | content.js intercepts navigation, saves partial blob |
| Large `.webm` files (2h+ meetings) | Convert to mono mp3 128kbps via AudioContext (~115 MB/hr) |
| `chrome.tabCapture` is Chromium-only | Chrome + Yandex Browser supported; Firefox not supported |
| aria-label selectors change on platform updates | aria-label primary; `data-is-speaking`, class-based as fallbacks |
| Speaker selectors obfuscated in Meet/Telemost DOM | `aria-label="Name, speaking"` is accessibility standard — most stable |

## API Keys Storage
All API keys stored in `chrome.storage.local` — never hardcoded. Entered by user in options page.

## Non-Functional Requirements
- **Privacy:** Audio processed externally (Whisper API); not stored permanently after transcription
- **MV3 Compliance:** Service worker + offscreen document; no persistent background pages
- **Error handling:** Structured errors surfaced in sidepanel UI; graceful degradation if APIs unavailable
- **Logging:** `console.log` in dev build; silenced in production via Vite env flag

## Architecture
See `.ai-factory/ARCHITECTURE.md` for detailed architecture guidelines.
Pattern: Layered Architecture (Chrome MV3 Adapted)

## Reference Resources
- [chrome.tabCapture API](https://developer.chrome.com/docs/extensions/reference/api/tabCapture)
- [Audio recording guide MV3](https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture)
- [Recall.ai open-source extension](https://github.com/recallai/chrome-recording-transcription-extension) — `scrapingScript.ts` for Google Meet DOM parsing
- [OpenAI Whisper API docs](https://platform.openai.com/docs/guides/speech-to-text)
- [Nexara STT docs](https://docs.nexara.ru/ru/quickstart)
- [Anthropic Claude API](https://docs.anthropic.com/en/api/getting-started)
