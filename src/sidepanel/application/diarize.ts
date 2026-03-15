import type { SttSegment, SpeakerLog, DiarizedSegment } from '../../shared/types';

/**
 * Merges STT segments with DOM speaker log via maximum timestamp overlap.
 *
 * STT segments have relative times (seconds from recording start).
 * Speaker log entries have absolute Date.now() timestamps.
 * recordingStartMs is the sync point that converts between the two.
 */
export function diarize(
  segments: SttSegment[],
  speakerLog: SpeakerLog,
  recordingStartMs: number,
): DiarizedSegment[] {
  if (import.meta.env.DEV) {
    console.log('[diarize] start — segments:', segments.length, '| speakerLog entries:', speakerLog.log.length);
  }

  const result: DiarizedSegment[] = segments.map(seg => {
    const segStartMs = recordingStartMs + seg.start * 1000;
    const segEndMs   = recordingStartMs + seg.end   * 1000;

    let bestSpeaker = 'Unknown';
    let bestOverlap = -Infinity;
    let bestDist    = Infinity;

    for (const entry of speakerLog.log) {
      const overlap = Math.min(segEndMs, entry.endMs) - Math.max(segStartMs, entry.startMs);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestSpeaker = entry.name;
      }
      // Track closest entry by distance for fallback (no-overlap case)
      const dist = Math.abs(entry.startMs - segStartMs);
      if (overlap <= 0 && dist < bestDist) {
        bestDist = dist;
        if (bestOverlap <= 0) bestSpeaker = entry.name;
      }
    }

    return { start: seg.start, end: seg.end, speaker: bestSpeaker, text: seg.text };
  });

  if (import.meta.env.DEV) {
    console.log('[diarize] done — diarized segments:', result.length);
  }
  return result;
}
