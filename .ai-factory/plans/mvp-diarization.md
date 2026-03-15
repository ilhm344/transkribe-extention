# Plan: Diarization — STT segments + speaker log merge

**Created:** 2026-03-14
**Mode:** Fast
**Milestone:** Diarization

## Settings

- **Testing:** No
- **Logging:** Verbose (DEV-only)
- **Docs:** No

## Context

`src/sidepanel/application/diarize.ts` — stub, возвращает `[]`.

**Алгоритм:** для каждого `SttSegment` (start/end в секундах от начала записи)
найти `SpeakerLogEntry` (startMs/endMs в абсолютных мс) с максимальным перекрытием по времени.

```
segAbsStartMs = recordingStartMs + segment.start * 1000
segAbsEndMs   = recordingStartMs + segment.end   * 1000

overlap = min(segAbsEndMs, entry.endMs) - max(segAbsStartMs, entry.startMs)
```

Выбрать запись с наибольшим overlap. Если overlap <= 0 — взять ближайшего по времени.

Типы из `src/shared/types.ts`:
```typescript
SttSegment      { start: number; end: number; text: string; }
SpeakerLog      { recordingStartMs: number; log: SpeakerLogEntry[]; }
SpeakerLogEntry { name: string; startMs: number; endMs: number; }
DiarizedSegment { start: number; end: number; speaker: string; text: string; }
```

---

## Tasks

### Task 1: Реализовать diarize в diarize.ts

**File:** `src/sidepanel/application/diarize.ts`

**Deliverable:** Функция сопоставляет каждый STT-сегмент с говорящим по временному перекрытию.

```typescript
export function diarize(
  segments: SttSegment[],
  speakerLog: SpeakerLog,
  recordingStartMs: number,
): DiarizedSegment[] {
  if (import.meta.env.DEV) {
    console.log('[diarize] segments:', segments.length, 'speakers:', speakerLog.log.length);
  }

  return segments.map(seg => {
    const segStartMs = recordingStartMs + seg.start * 1000;
    const segEndMs   = recordingStartMs + seg.end   * 1000;

    let bestSpeaker = 'Unknown';
    let bestOverlap = -Infinity;

    for (const entry of speakerLog.log) {
      const overlap = Math.min(segEndMs, entry.endMs) - Math.max(segStartMs, entry.startMs);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestSpeaker = entry.name;
      }
    }

    if (import.meta.env.DEV) {
      console.log(`[diarize] seg [${seg.start.toFixed(1)}–${seg.end.toFixed(1)}] → ${bestSpeaker}`);
    }

    return { start: seg.start, end: seg.end, speaker: bestSpeaker, text: seg.text };
  });
}
```

**Log:**
- `[diarize] segments: <n> speakers: <m>` (entry)
- `[diarize] seg [X–Y] → <speaker>` (per segment, DEV only)

---

## Commit

```
feat(diarize): implement STT segment + speaker log merge algorithm
```
