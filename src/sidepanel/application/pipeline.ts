// TODO: implement in Transcription + Diarization + AI Summary milestones
// import { transcribeAudio } from '../infrastructure/stt';
// import { summarize } from '../infrastructure/claude';
// import { diarize } from './diarize';
// import type { MeetingData, PipelineResult } from '../../shared/types';

/**
 * Runs the full post-meeting pipeline:
 *   1. transcribeAudio (OpenAI Whisper)
 *   2. diarize (merge STT segments with speaker log)
 *   3. summarize (Claude API)
 *
 * TODO: implement in Transcription milestone.
 */
export async function runPipeline(/* _data: MeetingData */): Promise<void> {
  if (import.meta.env.DEV) console.log('[pipeline] runPipeline called — TODO: implement');
  throw new Error('runPipeline not yet implemented');
}
