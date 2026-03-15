# Chrome Web Store — Listing Copy

## Extension name
Transkribe

## Short description (≤ 132 characters)
Автоматический транскрипт и AI-резюме звонков в Google Meet и Яндекс Телемост с определением спикеров.

## Detailed description

**Transkribe** превращает каждую рабочую встречу в структурированный документ — без ручных заметок.

### Что умеет расширение

- 🎙 **Запись** — одним нажатием захватывает аудио вкладки и микрофона прямо во время звонка.
- 📝 **Транскрипция** — отправляет запись в OpenAI Whisper и получает полный текст с таймкодами.
- 👥 **Диаризация** — определяет, кто и когда говорил, используя имена из интерфейса Google Meet / Яндекс Телемост.
- 🤖 **AI-резюме** — Claude Sonnet формирует краткое резюме встречи и список action items.
- 📤 **Экспорт** — скачайте транскрипт в .txt или .srt, либо скопируйте готовый текст для Telegram.

### Поддерживаемые платформы
- Google Meet (meet.google.com)
- Яндекс Телемост (telemost.yandex.ru)

### Требования
Расширение использует ваши собственные API-ключи:
- **OpenAI API key** — для транскрибирования через Whisper
- **Anthropic API key** — для генерации резюме через Claude

Ключи вводятся один раз на странице настроек и хранятся только локально на вашем устройстве.

---

## Category
Productivity

## Language
Russian

## Permissions justification (for review)

| Permission | Reason |
|---|---|
| `tabCapture` | Capture audio from the meeting tab |
| `offscreen` | Use MediaRecorder in an offscreen document (MV3 requirement) |
| `storage` | Store API keys and meeting data locally |
| `activeTab` | Access the current meeting tab to start capture |
| `sidePanel` | Show transcript/summary in the side panel |
| `host_permissions: meet.google.com` | Inject content script to track speaker names |
| `host_permissions: telemost.yandex.ru` | Inject content script to track speaker names |

---

## Screenshots checklist (1280×800 or 640×400)

- [ ] Screenshot 1: SidePanel showing summary + action items after a meeting
- [ ] Screenshot 2: SidePanel showing diarized transcript with speaker names
- [ ] Screenshot 3: Options page with API key fields
- [ ] Screenshot 4: Popup showing recording in progress (timer visible)
- [ ] Screenshot 5: Export buttons (TXT / SRT / Telegram)

## Promotional tile (440×280)
Blue background (#1e40af), white Transkribe logo, tagline: "Транскрипт и резюме митинга за секунды"

---

## Privacy policy URL
https://<your-github-username>.github.io/transkribe-extention/privacy-policy.html

> Deploy privacy-policy.html to GitHub Pages and paste the URL above.
