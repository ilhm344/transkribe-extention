// TODO: implement in Transcription milestone
import type { WhisperResponse } from '../../shared/types';

/**
 * Sends audio blob to OpenAI Whisper API (verbose_json mode).
 * Returns segments with timestamps for diarization merge.
 *
 * TODO: implement in Transcription milestone.
 * Reference: https://platform.openai.com/docs/guides/speech-to-text
 */
export async function transcribeAudio(
  _audioBlob: Blob,
  _openaiKey: string,
): Promise<WhisperResponse> {
  if (import.meta.env.DEV) console.log('[stt] transcribeAudio called — TODO: implement');
  throw new Error('transcribeAudio not yet implemented');
}
