# AGENTS.md

> Project map for AI agents. Keep this file up-to-date as the project evolves.

## Project Overview
Transkribe is a Chrome Extension (Manifest V3) that records meeting audio via `chrome.tabCapture`,
tracks active speakers from the DOM, and after the meeting produces a diarized transcript and
AI-generated summary using OpenAI Whisper and Claude API.

## Tech Stack
- **Language:** TypeScript
- **UI Framework:** React 18 (sidepanel, popup)
- **Browser Extension:** Chrome Manifest V3
- **Build Tool:** Vite + CRXJS (or WXT)
- **STT API:** OpenAI Whisper (`verbose_json`)
- **AI API:** Anthropic Claude API (claude-sonnet-4-6)
- **Styling:** Tailwind CSS
- **Supported platforms:** Google Meet, Yandex Telemost

## Project Structure
```
transkribe-extention/
├── manifest.json              # MV3 manifest — permissions, content_scripts, service worker
├── src/
│   ├── background/
│   │   └── background.ts      # Service worker — tabCapture, offscreen lifecycle, storage coordination
│   ├── offscreen/
│   │   ├── offscreen.html     # Required by MV3 for audio capture
│   │   └── offscreen.ts      # MediaRecorder + Web Audio API (tab+mic mix)
│   ├── content/
│   │   ├── content.ts         # Injected into Meet/Telemost — meeting-end detection + speaker tracker
│   │   ├── meet.ts            # Google Meet specific DOM selectors
│   │   └── telemost.ts        # Yandex Telemost specific DOM selectors
│   ├── popup/
│   │   ├── popup.html
│   │   └── popup.ts           # Start/stop button, recording status indicator
│   ├── sidepanel/             # React app — shown after meeting ends
│   │   ├── index.tsx          # React root
│   │   ├── SidePanel.tsx      # Main UI: transcript + diarization + summary
│   │   ├── api/
│   │   │   ├── stt.ts         # OpenAI Whisper API call (verbose_json)
│   │   │   ├── merge.ts       # Merge STT segments + speaker log → diarized transcript
│   │   │   └── claude.ts      # Claude API call → summary + action items
│   │   └── components/
│   │       ├── TranscriptView.tsx
│   │       ├── SummaryView.tsx
│   │       └── ExportButton.tsx
│   ├── options/               # Settings page — API key configuration
│   │   ├── options.html
│   │   └── options.tsx
│   └── shared/
│       ├── types.ts           # SpeakerLogEntry, SttSegment, DiarizedSegment, Message types
│       ├── messages.ts        # Chrome runtime message type constants
│       └── storage.ts         # chrome.storage.local helpers
├── .ai-factory/
│   ├── DESCRIPTION.md         # Full project specification
│   └── ARCHITECTURE.md        # Architecture decisions and guidelines
├── AGENTS.md                  # This file
└── .mcp.json                  # MCP server configuration
```

## Key Entry Points
| File | Purpose |
|------|---------|
| `src/background/background.ts` | Service worker — orchestrates the entire recording lifecycle |
| `src/offscreen/offscreen.ts` | Audio capture — `chrome.tabCapture` → `MediaRecorder` |
| `src/content/content.ts` | Speaker tracking — `MutationObserver` on Meet/Telemost DOM |
| `src/sidepanel/SidePanel.tsx` | Main React UI — post-meeting pipeline and results display |
| `src/sidepanel/api/merge.ts` | Core diarization logic — timestamp-based STT ↔ speaker log merge |
| `manifest.json` | Extension entry point — all permissions and script declarations |

## Message Flow
```
popup.ts
  → RECORDING_START → background.ts
      → chrome.tabCapture.getMediaStreamId()
      → creates offscreen document
      → sends streamId to offscreen.ts
      → sends RECORDING_STARTED to content.ts

content.ts
  → MutationObserver runs → builds speakerLog
  → RECORDING_STOPPED → sends SPEAKER_LOG_READY to background.ts

offscreen.ts
  → MediaRecorder stops → sends AUDIO_BLOB_READY to background.ts

background.ts
  → receives both AUDIO_BLOB_READY + SPEAKER_LOG_READY
  → saves to chrome.storage.local
  → opens sidepanel

sidepanel/SidePanel.tsx
  → reads from chrome.storage.local
  → stt.ts → Whisper API
  → merge.ts → diarization
  → claude.ts → Claude API
  → renders result
```

## MCP Servers (configured in .mcp.json)
| Server | Purpose |
|--------|---------|
| `github` | GitHub repo management, PR creation |
| `filesystem` | Advanced file operations |
| `chromeDevtools` | Chrome extension debugging, console inspection |
| `playwright` | Browser automation for E2E testing |

## AI Context Files
| File | Purpose |
|------|---------|
| `AGENTS.md` | This file — project structure map |
| `.ai-factory/DESCRIPTION.md` | Full project spec, architecture, tech stack, constraints |
| `.ai-factory/ARCHITECTURE.md` | Architecture pattern, folder rules, coding conventions |

## Agent Rules
- Never combine shell commands with `&&`, `||`, or `;` — execute each as a separate Bash tool call
  - ❌ Wrong: `git checkout main && git pull`
  - ✅ Right: two separate Bash calls
- API keys are NEVER hardcoded — always read from `chrome.storage.local` (set via options page)
- All Chrome API calls are async — always `await` them, never assume synchronous behavior
- MV3 constraint: no persistent background pages — all long-running work goes in offscreen document
- Speaker selector strategies by priority: `aria-label="Name, speaking"` → `data-is-speaking="true"` → class-based fallbacks
