# Plan: AI Summary — Claude API + pipeline wiring

**Created:** 2026-03-14
**Mode:** Fast
**Milestone:** AI Summary

## Settings

- **Testing:** No
- **Logging:** Verbose (DEV-only)
- **Docs:** No

## Context

**Два stub-а для реализации:**

1. `src/sidepanel/infrastructure/claude.ts` — `summarize()` выбрасывает ошибку.
2. `src/sidepanel/application/pipeline.ts` — `runPipeline()` выбрасывает ошибку.

**Зависимости (должны быть реализованы до):**
- `mvp-transcription.md` — `transcribeAudio()` в stt.ts
- `mvp-diarization.md` — `diarize()` в diarize.ts

Типы из `src/shared/types.ts`:
```typescript
DiarizedSegment { start: number; end: number; speaker: string; text: string; }
PipelineResult  { diarized: DiarizedSegment[]; summary: string; actionItems: string[]; }
MeetingData     { audioBase64: string; mimeType: string; speakerLog: SpeakerLog; recordingStartMs: number; ... }
```

API: Anthropic Messages API (прямой fetch, без SDK — чтобы не раздувать бандл).
Модель: `claude-sonnet-4-6`.

---

## Tasks

### Task 1: Реализовать summarize в claude.ts

**File:** `src/sidepanel/infrastructure/claude.ts`

**Deliverable:** Функция форматирует диаризованный транскрипт и отправляет в Claude API,
получает `{summary, actionItems}`.

```typescript
export async function summarize(
  segments: DiarizedSegment[],
  anthropicKey: string,
): Promise<Pick<PipelineResult, 'summary' | 'actionItems'>> {
  if (import.meta.env.DEV) console.log('[claude] summarize start, segments:', segments.length);

  const transcript = segments
    .map(s => `[${s.speaker}]: ${s.text}`)
    .join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are a meeting assistant. Summarize the following meeting transcript and extract action items.\n\nTranscript:\n${transcript}\n\nRespond in JSON: {"summary": "...", "actionItems": ["...", "..."]}`,
      }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[claude] API error:', res.status, err);
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data.content[0].text as string;

  if (import.meta.env.DEV) console.log('[claude] raw response:', text);

  // Extract JSON from response (may be wrapped in markdown code block)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Claude response did not contain JSON');

  const result = JSON.parse(jsonMatch[0]) as { summary: string; actionItems: string[] };
  if (import.meta.env.DEV) console.log('[claude] summarize done, actionItems:', result.actionItems.length);
  return result;
}
```

**Log:**
- `[claude] summarize start, segments: <n>`
- `[claude] API error: <status> <body>` (on error)
- `[claude] raw response: <text>` (DEV)
- `[claude] summarize done, actionItems: <n>`

---

### Task 2: Реализовать runPipeline в pipeline.ts

**File:** `src/sidepanel/application/pipeline.ts`

**Deliverable:** Оркестрирует весь pipeline: base64 → Blob → STT → diarize → summarize → PipelineResult.
Читает API-ключи из storage самостоятельно.

```typescript
export async function runPipeline(data: MeetingData): Promise<PipelineResult> {
  if (import.meta.env.DEV) console.log('[pipeline] runPipeline start');

  const keys = await loadApiKeys();
  if (!keys?.openaiKey) throw new Error('OpenAI API key not set. Open Settings to add it.');
  if (!keys?.anthropicKey) throw new Error('Anthropic API key not set. Open Settings to add it.');

  // Convert base64 to Blob
  const byteString = atob(data.audioBase64);
  const bytes = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
  const audioBlob = new Blob([bytes], { type: data.mimeType });
  if (import.meta.env.DEV) console.log('[pipeline] audio blob size:', audioBlob.size);

  const whisperResponse = await transcribeAudio(audioBlob, keys.openaiKey);
  if (import.meta.env.DEV) console.log('[pipeline] STT done, segments:', whisperResponse.segments.length);

  const diarized = diarize(whisperResponse.segments, data.speakerLog, data.recordingStartMs);
  if (import.meta.env.DEV) console.log('[pipeline] diarize done');

  const { summary, actionItems } = await summarize(diarized, keys.anthropicKey);
  if (import.meta.env.DEV) console.log('[pipeline] summarize done');

  return { diarized, summary, actionItems };
}
```

**Imports needed:**
- `loadApiKeys` from `../../shared/storage`
- `transcribeAudio` from `../infrastructure/stt`
- `diarize` from `./diarize`
- `summarize` from `../infrastructure/claude`
- `MeetingData, PipelineResult` from `../../shared/types`

**Log:**
- `[pipeline] runPipeline start`
- `[pipeline] audio blob size: <n>`
- `[pipeline] STT done, segments: <n>`
- `[pipeline] diarize done`
- `[pipeline] summarize done`

---

## Commit

```
feat(pipeline): implement Claude summarize and wire runPipeline
```
