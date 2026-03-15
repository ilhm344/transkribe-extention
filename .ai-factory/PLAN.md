# Plan: Options Page — ввод и сохранение API-ключей

**Created:** 2026-03-14
**Mode:** Fast

## Settings

- **Testing:** No
- **Logging:** Verbose (DEV-only console logs, как в остальном коде)
- **Docs:** No

## Context

Страница настроек (`src/options/`) уже почти готова — React-компонент с формой ввода ключей
и хелперы `saveApiKeys`/`loadApiKeys` в `shared/storage.ts` реализованы.

**Что не сделано:**
1. `manifest.json` не регистрирует options page → CRXJS не включает её в билд, Chrome не знает о ней
2. В popup нет ссылки "Настройки" → пользователю сложно найти страницу ключей

---

## Tasks

### Phase 1 — Регистрация страницы в манифесте

#### Task 1: Добавить `options_ui` в manifest.json

**Deliverable:** Chrome регистрирует options page и открывает её через `chrome.runtime.openOptionsPage()`.

**File:** `manifest.json`

Добавить после блока `"side_panel"`:

```json
"options_ui": {
  "page": "src/options/options.html",
  "open_in_tab": true
}
```

`open_in_tab: true` — открывает в полной вкладке, что удобнее для страницы с полями ввода.

**Log:** нет (манифест не логирует)

---

### Phase 2 — Доступ из popup

#### Task 2: Добавить кнопку «Настройки» в popup

**Deliverable:** В popup появляется маленькая кнопка «⚙ Настройки», кликая на которую
пользователь попадает на options page через `chrome.runtime.openOptionsPage()`.

**Files:**
- `src/popup/popup.html` — добавить кнопку под `<span id="timer">`
- `src/popup/popup.ts` — добавить обработчик клика

В `popup.html` добавить после `<span id="timer">`:

```html
<button id="settingsBtn" class="text-xs text-gray-400 hover:text-gray-600 mt-3 w-full text-center">
  ⚙ Настройки
</button>
```

В `popup.ts` добавить:

```typescript
const settingsBtn = document.getElementById('settingsBtn') as HTMLButtonElement;
settingsBtn.addEventListener('click', () => {
  if (import.meta.env.DEV) console.log('[popup] opening options page');
  chrome.runtime.openOptionsPage();
});
```

**Log:** `[popup] opening options page` (DEV only)

---

### Phase 3 — Верификация билда

#### Task 3: Собрать проект и проверить dist

**Deliverable:** `npm run build` завершается без ошибок, в `dist/` присутствует `options.html`
с корректными ссылками на JS и CSS.

**Command:** `npm run build`

**Checks:**
- `dist/options.html` существует
- `dist/manifest.json` содержит `options_ui`
- Нет TypeScript/Vite ошибок

---

## Commit

Все три задачи — одна атомарная фича. Один коммит после завершения:

```
feat(options): wire options page — add manifest entry, popup settings button
```

---

## Notes

- `src/options/options.tsx` и `src/shared/storage.ts` — **не трогать**, уже полностью реализованы
- CRXJS автоматически подхватит `options.html` из манифеста — отдельная настройка vite.config не нужна
- `options.html` ссылается на `../styles/globals.css` — путь работает, popup.html использует тот же паттерн
