# Project Roadmap

> Chrome MV3 extension: запись митинга → транскрипт + диаризация с реальными именами → AI-резюме

## Milestones

- [ ] **Project Scaffold** — Vite + CRXJS + TypeScript + React 18 + Tailwind, manifest.json, структура папок по архитектуре
- [ ] **Audio Recording** — background service worker + offscreen document, tabCapture + mic mix, MediaRecorder → .webm blob
- [ ] **Popup UI** — кнопка старт/стоп, индикатор статуса записи
- [ ] **Speaker Tracker** — content script, MutationObserver для Google Meet + Yandex Telemost, speaker log JSON
- [ ] **Options Page** — ввод API-ключей (OpenAI + Anthropic), сохранение в chrome.storage.local
- [ ] **Transcription** — отправка .webm → OpenAI Whisper verbose_json → сегменты с таймкодами
- [ ] **Diarization** — мёрж STT-сегментов со speaker log по таймкодам → DiarizedSegment[] с реальными именами
- [ ] **AI Summary** — диаризованный транскрипт → Claude Sonnet → резюме + action items
- [ ] **Sidepanel UI** — React: транскрипт, диаризация, резюме, состояния пайплайна (loading/error/done)
- [ ] **Export** — выгрузка в .txt, .srt; Telegram-экспорт
- [ ] **Error Handling & Polish** — обработка ошибок API, loading states, graceful degradation, UX-полировка
- [ ] **Chrome Web Store** — иконки, store listing, privacy policy, финальный manifest

## Completed

| Milestone | Date |
|-----------|------|
