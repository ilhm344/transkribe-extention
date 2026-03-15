# Plan: Post-transcription actions + auto-open sidepanel on meeting detected

**Created:** 2026-03-15
**Mode:** Fast
**Testing:** No
**Logging:** Verbose (console.log everywhere)
**Docs:** No

---

## Feature A: Post-transcription action buttons

После завершения пайплайна транскрипции в сайдпанели появляются две кнопки действий:
1. **Найти задачи** — извлечь из транскрипта задачи с ответственными и дедлайнами (GPT по требованию)
2. **Подготовить follow-up письмо** — сгенерировать письмо клиенту на основе транскрипта

Каждая кнопка: `idle → loading → done (результат + копировать) | error`

```
presentation/SidePanel.tsx
  → application/tasks.ts       (runExtractTasks)
  → application/followUp.ts    (runFollowUpEmail)
      → infrastructure/claude.ts  (extractTasks, generateFollowUpEmail)
          → OpenAI GPT-4o-mini
```

---

## Feature B: Auto-open sidepanel when meeting detected

Когда пользователь открывает Google Meet или Yandex Telemost:
- Сайдпанель автоматически открывается (или делается доступной)
- Показывает состояние `meeting_active`: предложение начать запись
- Кнопка "Начать запись" в сайдпанели → запись стартует
- Состояние "Запись идёт..." с кнопкой "Остановить"
- После остановки — пайплайн запускается автоматически (уже реализовано через storage listener)

Синхронизация состояния: background уже сохраняет `recordingState: { active, startMs }` в
`chrome.storage.local` — сайдпанель читает и слушает изменения.

```
chrome.tabs.onUpdated (background)
  → chrome.sidePanel.open() + chrome.action.setBadgeText()

SidePanel on mount:
  1. есть meetingData? → pipeline (existing)
  2. recordingState.active? → 'recording' state
  3. текущий URL — митинг? → 'meeting_active' state
  4. иначе → 'idle'
```

**Ограничение MV3:** `chrome.sidePanel.open()` технически требует user gesture, но на практике
работает из `tabs.onUpdated` в Chrome 116+. Пробуем — при ошибке логируем и продолжаем.
Как fallback: `chrome.action.setBadgeText({ text: '●' })` сигнализирует пользователю.

---

## Tasks

### [x] Task 1: Infrastructure — два новых GPT-вызова

**File:** `src/sidepanel/infrastructure/claude.ts`

**`extractTasks(segments, openaiKey): Promise<string[]>`**
- Промпт: извлечь задачи из транскрипта в формате "Ответственный: задача [дедлайн если есть]"
- GPT ответ: JSON `{ "tasks": ["..."] }` — парсить как `summarize()` (strip fences)
- Ответ на языке транскрипта
- Логи: `[extractTasks] start — segments: N`, raw preview, `[extractTasks] done — tasks: N`

**`generateFollowUpEmail(segments, openaiKey): Promise<string>`**
- Промпт: написать follow-up письмо клиенту (тема встречи, ключевые договорённости, next steps)
- GPT ответ: plain text (не JSON)
- Ответ на языке транскрипта
- Логи: `[followUpEmail] start — segments: N`, `[followUpEmail] done — chars: N`

---

### [x] Task 2: Application — тонкие обёртки

**Новые файлы:**
- `src/sidepanel/application/tasks.ts`
- `src/sidepanel/application/followUp.ts`

**`tasks.ts`** — `runExtractTasks(segments: DiarizedSegment[]): Promise<string[]>`:
- `loadApiKeys()` → если нет ключа → throw
- Вызывает `extractTasks(segments, key)` из infrastructure
- Логи: `[runExtractTasks] start/done`

**`followUp.ts`** — `runFollowUpEmail(segments: DiarizedSegment[]): Promise<string>`:
- Аналогично, вызывает `generateFollowUpEmail(segments, key)`
- Логи: `[runFollowUpEmail] start/done`

---

### [x] Task 3: Presentation — кнопки post-transcription

**File:** `src/sidepanel/presentation/SidePanel.tsx`

Добавить `ActionButtons` компонент. Рендерится только при `status.state === 'done'`, после `<TranscriptView>`.

**Тип состояния кнопки:**
```typescript
type ActionState<T> =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'done'; result: T }
  | { state: 'error'; message: string };
```

**UI «Найти задачи»:**
- Кнопка синяя "Найти задачи"; loading → disabled + inline спиннер
- Done: `<ul>` со списком задач + кнопка "📋 Копировать"
- Error: красный текст + "Повторить"

**UI «Follow-up письмо»:**
- Кнопка нейтральная "Follow-up письмо"; loading → disabled + спиннер
- Done: `<pre className="whitespace-pre-wrap">` с текстом + "📋 Копировать"
- Error: аналогично

**Копирование:** `navigator.clipboard.writeText()` + feedback "✓ Скопировано" 2 сек

**Логи:** `[ActionButtons] extractTasks clicked/done/error`, `[ActionButtons] followUp clicked/done/error`, `[ActionButtons] copy *`

---

### [x] Task 4: Background — обнаружение митинга

**File:** `src/background/background.ts`

Добавить `chrome.tabs.onUpdated` listener:

```typescript
const MEETING_URL_PATTERNS = [
  'meet.google.com',
  'telemost.yandex.ru',
];

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  const url = tab.url ?? '';
  const isMeeting = MEETING_URL_PATTERNS.some(p => url.includes(p));
  if (!isMeeting) return;

  console.log('[bg] meeting tab detected — tabId:', tabId, '| url:', url);

  // Enable side panel for this tab
  void chrome.sidePanel.setOptions({ tabId, enabled: true, path: 'sidepanel.html' });

  // Try to open side panel (works in Chrome 116+ from event handlers)
  chrome.sidePanel.open({ tabId }).then(() => {
    console.log('[bg] sidepanel opened for meeting tab:', tabId);
  }).catch(err => {
    console.warn('[bg] sidepanel.open failed (needs user gesture?):', err);
    // Fallback: set badge to signal user
    chrome.action.setBadgeText({ text: '●', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444', tabId });
  });
});
```

Очистить badge при навигации прочь от митинга:
```typescript
// Если tab уходит с митинга — сбросить badge
if (changeInfo.status === 'complete' && !isMeeting && activeTabId === tabId) {
  chrome.action.setBadgeText({ text: '', tabId });
}
```

Логи: `[bg] meeting tab detected`, `[bg] sidepanel opened / fallback badge set`

---

### [x] Task 5: SidePanel — состояния meeting_active и recording

**File:** `src/sidepanel/presentation/SidePanel.tsx`

**Новые состояния в `Status` union:**
```typescript
| { state: 'meeting_active' }
| { state: 'recording'; startMs: number }
```

**Логика init (в `start()` функции useEffect):**
```
1. есть meetingData → pipeline (existing — без изменений)
2. нет meetingData →
   a. читаем recordingState из storage
      → если active → setStatus({ state: 'recording', startMs })
   b. читаем текущий tab URL через chrome.tabs.query({ active, currentWindow })
      → если URL содержит meet.google.com или telemost.yandex.ru
      → setStatus({ state: 'meeting_active' })
   c. иначе → setStatus({ state: 'idle' })
```

**Слушаем изменения `recordingState` в storage** (дополнить существующий `onStorageChanged`):
- `recordingState` появился → переход в `'recording'`
- `recordingState` удалён → переход в `'idle'` (пайплайн запустится через meetingData listener)

**UI `meeting_active`:**
```
🎙 Встреча обнаружена
[Начать запись]   ← синяя кнопка
```
- Кнопка → `chrome.runtime.sendMessage({ type: MSG.RECORDING_START })` → ждём storage change

**UI `recording`:**
```
⏺ Запись идёт...   (elapsed timer: MM:SS)
[Остановить]
```
- Timer: `useEffect` с `setInterval(1000)`, считает от `startMs`
- Кнопка "Остановить" → `MSG.RECORDING_STOP`

**Логи:**
- `[SidePanel] init — checking recordingState and tab URL`
- `[SidePanel] meeting_active — meeting URL detected`
- `[SidePanel] recording — startMs: N`
- `[SidePanel] start recording clicked from sidepanel`
- `[SidePanel] stop recording clicked from sidepanel`

---

## Commit Plan

Два коммита:

**Коммит 1** (Tasks 1–3):
```
feat(sidepanel): add post-transcription action buttons — задачи и follow-up письмо
```

**Коммит 2** (Tasks 4–5):
```
feat(recording): auto-open sidepanel and add recording controls when meeting detected
```
