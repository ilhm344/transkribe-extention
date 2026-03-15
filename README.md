# Transkribe

> Chrome-расширение для автоматической расшифровки встреч с диаризацией спикеров и AI-саммари.

Записывает аудио Google Meet / Yandex Telemost через `chrome.tabCapture`, отслеживает активных спикеров в реальном времени и после завершения встречи автоматически расшифровывает запись, сопоставляет текст с именами участников и генерирует саммари с action items.

## Быстрый старт

```bash
# 1. Установить зависимости
npm install

# 2. Режим разработки (hot reload через CRXJS)
npm run dev

# 3. Сборка для продакшена
npm run build
```

Затем открыть `chrome://extensions/`, включить **Developer mode**, нажать **Load unpacked** и выбрать папку `dist/`.

## Возможности

- **Запись аудио** — MV3 Offscreen Document + `chrome.tabCapture`; микрофон и звук вкладки пишутся одновременно
- **Отслеживание спикеров** — `MutationObserver` на DOM Meet/Telemost, логирует кто говорил и когда
- **Расшифровка** — OpenAI Whisper API (`verbose_json`), временны́е метки на каждый сегмент
- **Диаризация** — автоматическое сопоставление сегментов STT с именами участников по меткам времени
- **AI-саммари** — Claude API (claude-sonnet-4-6) генерирует краткое изложение и список action items
- **Экспорт** — `.txt` / `.srt` / Telegram прямо из сайдпанели

## Поддерживаемые платформы

| Платформа | Домен |
|-----------|-------|
| Google Meet | `meet.google.com` |
| Yandex Telemost | `telemost.yandex.ru` |

## Настройка

После установки расширения откройте страницу настроек (кнопка **⚙ Настройки** в popup) и введите API-ключи:

- **OpenAI API Key** — для транскрипции через Whisper
- **Anthropic API Key** — для саммари через Claude

Ключи хранятся локально в `chrome.storage.local`, не передаются никуда кроме соответствующих API.

## Tech Stack

TypeScript · React 18 · Vite + CRXJS · Tailwind CSS · Chrome MV3

## Статус проекта

MVP в разработке. Реализованы: audio recording pipeline, speaker tracking, options page, popup. В планах: sidepanel UI, транскрипция, диаризация, AI-саммари.
