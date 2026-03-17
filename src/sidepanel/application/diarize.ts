import type { SttSegment, SpeakerLog, DiarizedSegment } from '../../shared/types';

/** Speaker log entry converted to relative seconds (same base as STT segments) */
interface RelSpeaker {
  name: string;
  startSec: number;
  endSec: number;
}

/**
 * Merges STT segments with DOM speaker log using overlap + late-speaker bias.
 *
 * STT segments have relative times (seconds from recording start).
 * Speaker log entries have absolute Date.now() timestamps.
 * recordingStartMs is the sync point that converts between the two.
 *
 * Algorithm:
 *  1. Convert speaker log to relative seconds
 *  2. For each STT segment, find overlapping speakers
 *  3. If dominant speaker covers >75% of segment → use directly
 *  4. Otherwise (boundary case) → prefer speaker with most overlap in the last 40% of the segment
 *  5. Merge consecutive same-speaker segments
 */
export function diarize(
  segments: SttSegment[],
  speakerLog: SpeakerLog,
  recordingStartMs: number,
): DiarizedSegment[] {
  console.log('[diarize] start — segments:', segments.length,
    '| speakerLog entries:', speakerLog.log.length,
    '| recordingStartMs:', recordingStartMs);

  if (speakerLog.log.length === 0) {
    console.log('[diarize] empty speaker log — all segments → Unknown');
    return segments.map(seg => ({
      start: seg.start, end: seg.end, speaker: 'Unknown', text: seg.text,
    }));
  }

  // Convert speaker log to relative seconds
  const speakers: RelSpeaker[] = speakerLog.log.map(entry => ({
    name: entry.name,
    startSec: (entry.startMs - recordingStartMs) / 1000,
    endSec:   (entry.endMs   - recordingStartMs) / 1000,
  }));

  console.log('[diarize] speaker timeline (sec):',
    speakers.map(s => `${s.startSec.toFixed(1)}→${s.endSec.toFixed(1)} "${s.name}"`).join(' | '));

  // Step 1: Assign speaker to each segment
  const assigned: DiarizedSegment[] = segments.map((seg, i) => {
    const speaker = assignSpeaker(seg, speakers, i);
    return { start: seg.start, end: seg.end, speaker, text: seg.text };
  });

  // Step 2: Merge consecutive segments with the same speaker
  const merged = mergeConsecutive(assigned);

  console.log('[diarize] done — assigned:', assigned.length, '→ merged:', merged.length,
    '| speakers:', [...new Set(merged.map(s => s.speaker))].join(', '));
  return merged;
}

/**
 * Assign a speaker to a single STT segment using overlap + late-speaker bias.
 */
function assignSpeaker(seg: SttSegment, speakers: RelSpeaker[], segIdx: number): string {
  // Find all speakers that overlap this segment
  const overlaps: { name: string; overlap: number; lateOverlap: number }[] = [];

  for (const sp of speakers) {
    const overlap = Math.min(seg.end, sp.endSec) - Math.max(seg.start, sp.startSec);
    if (overlap > 0) {
      // Also calculate overlap with the last 40% of the segment
      const lateCutoff = seg.start + (seg.end - seg.start) * 0.6;
      const lateOverlap = Math.min(seg.end, sp.endSec) - Math.max(lateCutoff, sp.startSec);
      overlaps.push({ name: sp.name, overlap, lateOverlap: Math.max(0, lateOverlap) });
    }
  }

  const segDuration = seg.end - seg.start;
  const textPreview = seg.text.trim().slice(0, 40);

  // No overlap → fallback to nearest speaker
  if (overlaps.length === 0) {
    const nearest = findNearest(seg.start, speakers);
    console.log(`[diarize] seg#${segIdx} ${seg.start.toFixed(1)}→${seg.end.toFixed(1)} "${textPreview}" — no overlap → nearest: "${nearest}"`);
    return nearest;
  }

  // Single speaker → use directly
  if (overlaps.length === 1) {
    console.log(`[diarize] seg#${segIdx} ${seg.start.toFixed(1)}→${seg.end.toFixed(1)} "${textPreview}" — single: "${overlaps[0].name}" (${overlaps[0].overlap.toFixed(2)}s)`);
    return overlaps[0].name;
  }

  // Multiple speakers overlap — sort by total overlap descending
  overlaps.sort((a, b) => b.overlap - a.overlap);
  const dominant = overlaps[0];
  const dominantRatio = dominant.overlap / segDuration;

  // Clear winner (>75% of segment) → use dominant
  if (dominantRatio > 0.75) {
    console.log(`[diarize] seg#${segIdx} ${seg.start.toFixed(1)}→${seg.end.toFixed(1)} "${textPreview}" — dominant: "${dominant.name}" (${(dominantRatio * 100).toFixed(0)}%)`,
      '| others:', overlaps.slice(1).map(o => `"${o.name}" ${o.overlap.toFixed(2)}s`).join(', '));
    return dominant.name;
  }

  // Close call → prefer speaker with most overlap in the last 40% of segment
  // (Whisper tends to start segments before actual speech onset)
  const byLate = [...overlaps].sort((a, b) => b.lateOverlap - a.lateOverlap);
  const winner = byLate[0];

  console.log(`[diarize] seg#${segIdx} ${seg.start.toFixed(1)}→${seg.end.toFixed(1)} "${textPreview}" — BOUNDARY:`,
    overlaps.map(o => `"${o.name}" total=${o.overlap.toFixed(2)}s late=${o.lateOverlap.toFixed(2)}s`).join(' | '),
    `→ winner: "${winner.name}" (late-bias)`);

  return winner.name;
}

/** Fallback: find the speaker closest in time when there's no overlap */
function findNearest(timeSec: number, speakers: RelSpeaker[]): string {
  let best = 'Unknown';
  let bestDist = Infinity;
  for (const sp of speakers) {
    const dist = Math.min(Math.abs(sp.startSec - timeSec), Math.abs(sp.endSec - timeSec));
    if (dist < bestDist) {
      bestDist = dist;
      best = sp.name;
    }
  }
  return best;
}

/** Merge consecutive segments with the same speaker into one */
function mergeConsecutive(segments: DiarizedSegment[]): DiarizedSegment[] {
  if (segments.length === 0) return [];

  const merged: DiarizedSegment[] = [{ ...segments[0] }];

  for (let i = 1; i < segments.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = segments[i];

    if (curr.speaker === prev.speaker) {
      prev.end = curr.end;
      prev.text = prev.text + ' ' + curr.text;
    } else {
      merged.push({ ...curr });
    }
  }

  return merged;
}
