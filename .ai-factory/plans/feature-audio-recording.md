# Plan: Audio Recording

**Branch:** `feature/audio-recording`
**Created:** 2026-03-14
**Milestone:** Audio Recording

## Settings

- **Testing:** No
- **Logging:** Verbose — подробные `console.debug` / `console.log` на каждый шаг audio pipeline
- **Docs:** Yes — обязательный docs-чекпоинт через `/aif-docs` после завершения реализации

## Roadmap Linkage

**Milestone:** "Audio Recording"
**Rationale:** Второй этап по roadmap — основа всего pipeline. Без рабочего audio blob дальнейшие этапы (Transcription, Diarization, AI Summary) невозможны.

## Scope

Реализовать полный audio recording pipeline в двух контекстах MV3:

1. **`src/background/background.ts`** — координатор: tabCapture → offscreen document → хранение blob + speaker log → открытие sidepanel
2. **`src/offscreen/offscreen.ts`** — audio engine: getUserMedia (tab + mic) → Web Audio API mix → MediaRecorder → `.webm` blob → AUDIO_BLOB_READY

**Что уже готово (не трогаем):**
- `shared/types.ts` — все типы определены
- `shared/messages.ts` — все константы сообщений определены
- `shared/storage.ts` — helpers для chrome.storage.local готовы
- `content.ts` + `speakerTracker.ts` — speaker tracking полностью реализован
- `popup.ts` — отправляет RECORDING_START / RECORDING_STOP в background

---

## Tasks

### Phase 1 — Background Service Worker

#### [x] Task 1: Implement RECORDING_START handler in background.ts

**File:** `src/background/background.ts`

**Deliverable:** При получении `MSG.RECORDING_START` от popup:
1. Вызвать `chrome.tabCapture.getMediaStreamId({ targetTabId })` для активного таба
2. Создать offscreen document через `chrome.offscreen.createDocument()` (если ещё не существует — проверить через `chrome.offscreen.hasDocument()`)
3. Отправить `MSG.START_OFFSCREEN` в offscreen с payload `{ streamId }`
4. Сохранить `tabId` в модульной переменной `let activeTabId: number | null`
5. Обновить состояние `isRecording = true`

**Logging:**
- `console.debug('[bg] RECORDING_START received, tabId:', tabId)`
- `console.debug('[bg] getMediaStreamId result:', streamId)`
- `console.debug('[bg] offscreen document created')`
- `console.debug('[bg] START_OFFSCREEN sent to offscreen')`
- `console.error('[bg] RECORDING_START error:', err)` — при любом сбое

**Notes:**
- Использовать `chrome.tabs.query({ active: true, currentWindow: true })` для получения tabId
- Offscreen URL: `chrome.runtime.getURL('src/offscreen/offscreen.html')`
- Причина создания offscreen: `chrome.offscreen.Reason.USER_MEDIA`

---

#### [x] Task 2: Send RECORDING_STARTED to content script

**File:** `src/background/background.ts`

**Deliverable:** После успешного запуска offscreen (после Task 1) отправить `MSG.RECORDING_STARTED` в content script активного таба через `chrome.tabs.sendMessage(activeTabId, { type: MSG.RECORDING_STARTED })`.

**Logging:**
- `console.debug('[bg] RECORDING_STARTED sent to content script, tabId:', activeTabId)`
- `console.warn('[bg] Could not send RECORDING_STARTED to tab:', err)` — если content script недоступен (tab could be reload)

**Notes:**
- Оборачивать `chrome.tabs.sendMessage` в try/catch — content script может не быть загружен
- Блокируется: Task 1

---

#### [x] Task 3: Implement RECORDING_STOP handler in background.ts

**File:** `src/background/background.ts`

**Deliverable:** При получении `MSG.RECORDING_STOP` от popup:
1. Отправить `MSG.STOP_OFFSCREEN` в offscreen document
2. Отправить `MSG.RECORDING_STOPPED` в content script активного таба
3. Обновить `isRecording = false`

**Logging:**
- `console.debug('[bg] RECORDING_STOP received')`
- `console.debug('[bg] STOP_OFFSCREEN sent to offscreen')`
- `console.debug('[bg] RECORDING_STOPPED sent to content script')`

**Notes:**
- Блокируется: Task 1

---

#### [x] Task 4: Implement AUDIO_BLOB_READY handler + coordination logic

**File:** `src/background/background.ts`

**Deliverable:** При получении `MSG.AUDIO_BLOB_READY` от offscreen:
1. Сохранить `{ audioBase64, mimeType, recordingStartMs }` в модульную переменную `pendingAudio`
2. Закрыть offscreen document через `chrome.offscreen.closeDocument()`
3. Вызвать `checkBothReady()` — если `pendingAudio` и `pendingSpeakerLog` оба не `null`, собрать `MeetingData` и открыть sidepanel

**`checkBothReady()` логика:**
```typescript
if (pendingAudio && pendingSpeakerLog) {
  const meetingData: MeetingData = {
    audioBase64: pendingAudio.audioBase64,
    mimeType: pendingAudio.mimeType,
    recordingStartMs: pendingAudio.recordingStartMs,
    speakerLog: pendingSpeakerLog,
  };
  await saveMeetingData(meetingData);  // из shared/storage.ts
  await chrome.sidePanel.open({ tabId: activeTabId! });
  pendingAudio = null;
  pendingSpeakerLog = null;
}
```

**Logging:**
- `console.debug('[bg] AUDIO_BLOB_READY received, size (base64):', payload.audioBase64.length)`
- `console.debug('[bg] offscreen document closed')`
- `console.debug('[bg] both audio+speakerLog ready → saving MeetingData + opening sidepanel')`
- `console.error('[bg] checkBothReady error:', err)`

---

#### [x] Task 5: Implement SPEAKER_LOG_READY and MEETING_ENDED handlers

**File:** `src/background/background.ts`

**Deliverable:**
- `SPEAKER_LOG_READY`: сохранить `payload.speakerLog` в `pendingSpeakerLog`, вызвать `checkBothReady()`
- `MEETING_ENDED`: если `isRecording === true`, имитировать RECORDING_STOP (отправить STOP_OFFSCREEN + RECORDING_STOPPED, обновить состояние)

**Logging:**
- `console.debug('[bg] SPEAKER_LOG_READY received, entries:', payload.speakerLog.log.length)`
- `console.debug('[bg] MEETING_ENDED received — auto-stopping recording')`

**Notes:**
- Блокируется: Task 4

---

### 💾 Commit Checkpoint 1 — Background complete

```
feat(background): implement audio recording coordinator

- tabCapture.getMediaStreamId + offscreen document lifecycle
- RECORDING_START/STOP handlers with content script signalling
- AUDIO_BLOB_READY + SPEAKER_LOG_READY coordination → MeetingData save + sidepanel open
- MEETING_ENDED auto-stop
```

---

### Phase 2 — Offscreen Document

#### [x] Task 6: Implement START_OFFSCREEN — tab audio capture

**File:** `src/offscreen/offscreen.ts`

**Deliverable:** При получении `MSG.START_OFFSCREEN` с payload `{ streamId }`:
1. Вызвать `navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } } as MediaTrackConstraints })`
2. Сохранить stream в модульную переменную `let tabStream: MediaStream | null`
3. Сохранить `recordingStartMs = Date.now()`

**Logging:**
- `console.debug('[offscreen] START_OFFSCREEN received, streamId:', streamId)`
- `console.debug('[offscreen] tab stream acquired, tracks:', tabStream.getAudioTracks().length)`
- `console.error('[offscreen] failed to get tab stream:', err)` + `chrome.runtime.sendMessage` с ошибкой

---

#### [x] Task 7: Add microphone stream + Web Audio API mix

**File:** `src/offscreen/offscreen.ts`

**Deliverable:** После получения tab stream (Task 6):
1. Вызвать `navigator.mediaDevices.getUserMedia({ audio: true })` для микрофона
2. Создать `AudioContext`
3. Создать `tabSource = ctx.createMediaStreamSource(tabStream)`
4. Создать `micSource = ctx.createMediaStreamSource(micStream)`
5. Создать `destination = ctx.createMediaStreamDestination()`
6. Соединить: `tabSource.connect(destination)`, `micSource.connect(destination)`
7. Также подключить tabSource к `ctx.destination` (чтобы пользователь слышал митинг)
8. Сохранить `mixedStream = destination.stream`

**Logging:**
- `console.debug('[offscreen] mic stream acquired')`
- `console.debug('[offscreen] AudioContext created, state:', ctx.state)`
- `console.debug('[offscreen] streams mixed → destination stream tracks:', mixedStream.getAudioTracks().length)`
- `console.warn('[offscreen] mic permission denied, recording tab audio only:', err)` — если getUserMedia(mic) упало, продолжать только с tab stream

**Notes:**
- Если mic недоступен — graceful degradation: записывать только tab audio
- Блокируется: Task 6

---

#### [x] Task 8: Set up MediaRecorder on mixed stream

**File:** `src/offscreen/offscreen.ts`

**Deliverable:**
1. Создать `mediaRecorder = new MediaRecorder(mixedStream, { mimeType: 'audio/webm;codecs=opus' })`
2. `mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }`
3. `mediaRecorder.onstop = async () => { ... собрать Blob → FileReader → base64 → отправить AUDIO_BLOB_READY }`
4. `mediaRecorder.start(1000)` — chunk каждую секунду
5. Сохранить в `chunks: BlobPart[] = []`

**`onstop` handler:**
```typescript
const blob = new Blob(chunks, { type: 'audio/webm;codecs=opus' });
const reader = new FileReader();
reader.onload = () => {
  const base64 = (reader.result as string).split(',')[1];
  chrome.runtime.sendMessage({
    type: MSG.AUDIO_BLOB_READY,
    payload: { audioBase64: base64, mimeType: blob.type, recordingStartMs }
  });
};
reader.readAsDataURL(blob);
```

**Logging:**
- `console.debug('[offscreen] MediaRecorder created, mimeType:', mediaRecorder.mimeType)`
- `console.debug('[offscreen] MediaRecorder started')`
- `console.debug('[offscreen] onstop: total chunks:', chunks.length, 'blob size:', blob.size)`
- `console.debug('[offscreen] AUDIO_BLOB_READY sent, base64 length:', base64.length)`
- `console.error('[offscreen] MediaRecorder error:', err)`

**Notes:**
- Блокируется: Task 7

---

#### [x] Task 9: Implement STOP_OFFSCREEN handler + cleanup

**File:** `src/offscreen/offscreen.ts`

**Deliverable:** При получении `MSG.STOP_OFFSCREEN`:
1. Вызвать `mediaRecorder.stop()` — это тригернёт `onstop` из Task 8
2. Остановить все треки: `tabStream.getTracks().forEach(t => t.stop())`, `micStream.getTracks().forEach(t => t.stop())`
3. Закрыть AudioContext: `ctx.close()`
4. Сбросить все модульные переменные в `null`

**Logging:**
- `console.debug('[offscreen] STOP_OFFSCREEN received')`
- `console.debug('[offscreen] MediaRecorder stopped, waiting for onstop...')`
- `console.debug('[offscreen] streams and AudioContext cleaned up')`

**Notes:**
- Блокируется: Tasks 6, 7, 8

---

### 💾 Commit Checkpoint 2 — Offscreen complete

```
feat(offscreen): implement audio capture engine

- getUserMedia tab + mic streams
- Web Audio API mix (tab + mic → destination; tab → ctx.destination for playback)
- MediaRecorder with 1s chunks → .webm blob → base64 → AUDIO_BLOB_READY
- STOP_OFFSCREEN: stop recorder + cleanup streams/AudioContext
- Graceful degradation: mic unavailable → tab audio only
```

---

### Phase 3 — Финальный чекпоинт

#### Task 10: Docs checkpoint — update DESCRIPTION.md / README if needed

**File:** `.ai-factory/DESCRIPTION.md` (если появились отклонения от плана)

**Deliverable:** Запустить `/aif-docs` для обновления документации по реализованному audio recording pipeline. Обязательный шаг.

**Logging:** N/A

---

### 💾 Commit Checkpoint 3 — Final

```
docs: update project documentation for audio recording milestone
```

---

## Commit Plan

| Tasks | Commit Message |
|-------|---------------|
| 1–5   | `feat(background): implement audio recording coordinator` |
| 6–9   | `feat(offscreen): implement audio capture engine` |
| 10    | `docs: update project documentation for audio recording milestone` |

---

## Architecture Notes

- **background.ts** не содержит бизнес-логики — только маршрутизация сообщений и координация Chrome API
- **offscreen.ts** — изолированный audio engine, не импортирует ничего из других контекстов
- Все типы сообщений — через `MSG.*` из `shared/messages.ts`, никаких raw strings
- `MeetingData` собирается в background только после получения обоих: audio blob + speaker log
- Audio blob хранится как base64 в `chrome.storage.local` (не как Blob — storage не поддерживает бинарные объекты напрямую)

## Risk Notes

- `chrome.tabCapture.getMediaStreamId` требует active user gesture → тригерится только из popup click (уже реализовано)
- Offscreen document — singleton в MV3, нельзя создать два одновременно → проверяем `hasDocument()` перед созданием
- Большие встречи (2ч+) → большой base64 в storage → по необходимости в будущих milestones конвертировать в mp3
