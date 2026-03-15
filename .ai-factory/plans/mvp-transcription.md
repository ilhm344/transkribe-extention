# Plan: Transcription — OpenAI Whisper API

**Created:** 2026-03-14
**Mode:** Fast
**Milestone:** Transcription

## Settings

- **Testing:** No
- **Logging:** Verbose (DEV-only)
- **Docs:** No

## Context

`src/sidepanel/infrastructure/stt.ts` — stub, выбрасывает ошибку.
Нужно реализовать POST multipart/form-data → OpenAI Whisper → `WhisperResponse`.

`MeetingData.audioBase64` хранит аудио в base64 (mimeType: `audio/webm`).
`transcribeAudio` принимает `Blob` — конвертацию делает `pipeline.ts`.

Типы уже в `src/shared/types.ts`:
```typescript
SttSegment     { start: number; end: number; text: string; }
WhisperResponse { text: string; segments: SttSegment[]; }
```

---

## Tasks

### Task 1: Реализовать transcribeAudio в stt.ts

**File:** `src/sidepanel/infrastructure/stt.ts`

**Deliverable:** Функция делает POST на `https://api.openai.com/v1/audio/transcriptions`
с multipart/form-data и возвращает `WhisperResponse`.

```typescript
export async function transcribeAudio(
  audioBlob: Blob,
  openaiKey: string,
): Promise<WhisperResponse> {
  if (import.meta.env.DEV) console.log('[stt] transcribeAudio start, size:', audioBlob.size);

  const form = new FormData();
  form.append('file', audioBlob, 'audio.webm');
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'segment');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[stt] Whisper API error:', res.status, err);
    throw new Error(`Whisper API error ${res.status}: ${err}`);
  }

  const data: WhisperResponse = await res.json();
  if (import.meta.env.DEV) console.log('[stt] transcribeAudio done, segments:', data.segments.length);
  return data;
}
```

**Imports needed:** `WhisperResponse` from `../../shared/types`

**Log:**
- `[stt] transcribeAudio start, size: <n>`
- `[stt] Whisper API error: <status> <body>` (on error)
- `[stt] transcribeAudio done, segments: <n>`

---

## Commit

```
feat(stt): implement OpenAI Whisper transcription call
```
