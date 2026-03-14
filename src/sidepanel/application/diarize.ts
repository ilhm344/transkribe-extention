// TODO: implement in Diarization milestone
import type { SttSegment, SpeakerLog, DiarizedSegment } from '../../shared/types';

/**
 * Merges STT segments (Speaker N + timestamps) with DOM speaker log (real names + timestamps).
 * For each STT segment, finds the speaker log entry with maximum timestamp overlap.
 *
 * @param segments - Array of STT segments from Whisper verbose_json
 * @param speakerLog - Speaker log captured by content script during meeting
 * @param recordingStartMs - absolute Date.now() at recording start (sync point)
 * @returns DiarizedSegment[] with real speaker names
 *
 * TODO: implement timestamp overlap merge algorithm in Diarization milestone.
 */
export function diarize(
  _segments: SttSegment[],
  _speakerLog: SpeakerLog,
  _recordingStartMs: number,
): DiarizedSegment[] {
  if (import.meta.env.DEV) console.log('[diarize] called — TODO: implement');
  return [];
}
