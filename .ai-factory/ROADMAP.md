# Project Roadmap

> Chrome MV3 extension: запись митинга → транскрипт + диаризация с реальными именами → AI-резюме

## Milestones

- [x] **Project Scaffold** — Vite + CRXJS + TypeScript + React 18 + Tailwind, manifest.json, структура папок по архитектуре
- [x] **Audio Recording** — background service worker + offscreen document, tabCapture + mic mix, MediaRecorder → .webm blob
- [x] **Popup UI** — кнопка старт/стоп, индикатор статуса записи
- [x] **Speaker Tracker** — content script, MutationObserver для Google Meet + Yandex Telemost, speaker log JSON
- [x] **Options Page** — ввод API-ключей (OpenAI + Anthropic), сохранение в chrome.storage.local
- [x] **Transcription** — отправка .webm → OpenAI Whisper verbose_json → сегменты с таймкодами
- [x] **Diarization** — мёрж STT-сегментов со speaker log по таймкодам → DiarizedSegment[] с реальными именами
- [x] **AI Summary** — диаризованный транскрипт → Claude Sonnet → резюме + action items
- [x] **Sidepanel UI** — React: транскрипт, диаризация, резюме, состояния пайплайна (loading/error/done)
- [x] **Export** — выгрузка в .txt, .srt; Telegram-экспорт
- [x] **Error Handling & Polish** — обработка ошибок API, loading states, graceful degradation, UX-полировка
- [x] **Chrome Web Store** — иконки, store listing, privacy policy, финальный manifest

## Completed

| Milestone | Date |
|-----------|------|
| Project Scaffold | 2026-03-14 |
| Audio Recording  | 2026-03-14 |
| Popup UI         | 2026-03-14 |
| Transcription    | 2026-03-15 |
| Speaker Tracker  | 2026-03-15 |
| Options Page     | 2026-03-15 |
| Diarization      | 2026-03-15 |
| AI Summary       | 2026-03-15 |
| Sidepanel UI     | 2026-03-15 |
| Export           | 2026-03-15 |
| Error Handling & Polish | 2026-03-15 |
| Chrome Web Store        | 2026-03-15 |
