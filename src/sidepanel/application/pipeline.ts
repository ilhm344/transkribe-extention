import { transcribe } from '../infrastructure/stt';
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
  const t0 = Date.now();
  console.log('[pipeline] ▶ start — platform:', data.platform, '| meetingId:', data.meetingId,
    '| speakerLog entries:', data.speakerLog.log.length);

  const keys = await loadApiKeys();
  if (!keys) {
    throw new Error('API ключи не настроены. Откройте Настройки.');
  }
  const provider = keys.sttProvider ?? 'openai';
  console.log('[pipeline] stt provider:', provider);
  // OpenAI key is always required (for summarization even with RunPod STT)
  if (!keys.openaiKey) {
    throw new Error('OpenAI API ключ не настроен. Он нужен для AI-резюме. Откройте Настройки.');
  }
  if (provider === 'runpod' && (!keys.runpodApiKey || !keys.runpodEndpointId)) {
    throw new Error('RunPod API ключ или Endpoint ID не настроены. Откройте Настройки.');
  }

  // Step 1: Transcription
  onProgress?.('transcribing');
  const audioBlob = base64ToBlob(data.audioBase64, data.audioMimeType);
  const audioMb = (audioBlob.size / 1024 / 1024).toFixed(2);
  console.log('[pipeline] step 1 — transcribing | blob:', audioMb, 'MB | mimeType:', data.audioMimeType);
  const t1 = Date.now();
  const whisper = await transcribe(audioBlob, keys);
  console.log('[pipeline] step 1 done — Whisper took', Date.now() - t1, 'ms',
    '| language:', whisper.language, '| duration:', whisper.duration?.toFixed(1), 's',
    '| segments:', whisper.segments.length,
    '| text preview:', whisper.text?.slice(0, 80));

  // Step 2: Diarization
  onProgress?.('diarizing');
  console.log('[pipeline] step 2 — diarizing');
  const diarized = diarize(whisper.segments, data.speakerLog, data.recordingStartMs);
  console.log('[pipeline] step 2 done — diarized segments:', diarized.length,
    '| speakers:', [...new Set(diarized.map(s => s.speaker))].join(', '));

  // Step 3: AI Summary
  onProgress?.('summarizing');
  console.log('[pipeline] step 3 — summarizing');
  const t3 = Date.now();
  const { summary, actionItems } = await summarize(diarized, keys.openaiKey);
  console.log('[pipeline] step 3 done — GPT took', Date.now() - t3, 'ms',
    '| actionItems:', actionItems.length);

  console.log('[pipeline] ✓ complete — total time:', Date.now() - t0, 'ms');

  return { diarized, summary, actionItems };
}
