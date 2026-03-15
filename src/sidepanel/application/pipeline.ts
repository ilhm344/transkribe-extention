import { transcribeAudio } from '../infrastructure/stt';
import { summarize } from '../infrastructure/claude';
import { diarize } from './diarize';
import { loadApiKeys } from '../../shared/storage';
import type { MeetingData, PipelineResult } from '../../shared/types';

export type PipelineStep = 'transcribing' | 'diarizing' | 'summarizing';
export type OnProgress = (step: PipelineStep) => void;

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

/**
 * Runs the full post-meeting pipeline:
 *   1. transcribeAudio (OpenAI Whisper)
 *   2. diarize (merge STT segments with speaker log)
 *   3. summarize (Claude Sonnet)
 */
export async function runPipeline(data: MeetingData, onProgress?: OnProgress): Promise<PipelineResult> {
  if (import.meta.env.DEV) console.log('[pipeline] start — platform:', data.platform, '| meetingId:', data.meetingId);

  const keys = await loadApiKeys();
  if (!keys?.openaiKey || !keys?.anthropicKey) {
    throw new Error('API keys not configured. Open Settings and enter your OpenAI and Anthropic keys.');
  }

  // Step 1: Transcription
  onProgress?.('transcribing');
  const audioBlob = base64ToBlob(data.audioBase64, data.audioMimeType);
  if (import.meta.env.DEV) console.log('[pipeline] transcribing — blob size:', audioBlob.size);
  const whisper = await transcribeAudio(audioBlob, keys.openaiKey);

  // Step 2: Diarization
  onProgress?.('diarizing');
  const diarized = diarize(whisper.segments, data.speakerLog, data.recordingStartMs);

  // Step 3: AI Summary
  onProgress?.('summarizing');
  const { summary, actionItems } = await summarize(diarized, keys.anthropicKey);

  if (import.meta.env.DEV) {
    console.log('[pipeline] done — diarized:', diarized.length, '| summary length:', summary.length, '| actionItems:', actionItems.length);
  }

  return { diarized, summary, actionItems };
}
