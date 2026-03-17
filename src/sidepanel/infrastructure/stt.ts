import type { WhisperResponse, ApiKeys, RunPodResponse, RunPodWhisperModel } from '../../shared/types';

// ─── OpenAI Whisper ─────────────────────────────────────────────────────────

/**
 * Sends audio blob to OpenAI Whisper API (verbose_json mode).
 * Returns segments with timestamps for diarization merge.
 */
async function transcribeWithOpenAI(
  audioBlob: Blob,
  openaiKey: string,
): Promise<WhisperResponse> {
  console.log('[stt] openai request — size:', audioBlob.size, 'bytes | type:', audioBlob.type);

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
    console.error('[stt] openai error:', res.status, err);
    if (res.status === 401) throw new Error('Неверный OpenAI API ключ. Проверьте настройки.');
    if (res.status === 429) throw new Error('OpenAI: превышен лимит запросов. Подождите и попробуйте снова.');
    if (res.status === 413) throw new Error('Аудио слишком большое для Whisper API (лимит 25 МБ).');
    throw new Error(`OpenAI Whisper: ошибка ${res.status}`);
  }

  const data: WhisperResponse = await res.json();
  console.log('[stt] openai done — language:', data.language,
    '| duration:', data.duration?.toFixed(1), 's | segments:', data.segments.length,
    '| text:', data.text?.slice(0, 100));
  return data;
}

// ─── RunPod Faster Whisper ──────────────────────────────────────────────────

/** Convert Blob to base64 string (without data URI prefix). */
async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Sends audio blob to RunPod Faster Whisper endpoint (runsync).
 * Converts blob to base64, posts JSON, maps response to WhisperResponse.
 */
async function transcribeWithRunpod(
  audioBlob: Blob,
  apiKey: string,
  endpointId: string,
  model?: RunPodWhisperModel,
): Promise<WhisperResponse> {
  const selectedModel = model ?? 'large-v3';
  console.log('[stt] runpod request — endpoint:', endpointId, '| model:', selectedModel, '| audio size:', audioBlob.size, 'bytes');

  const audioBase64 = await blobToBase64(audioBlob);
  console.log('[stt] runpod base64 encoded — length:', audioBase64.length);

  const res = await fetch(`https://api.runpod.ai/v2/${endpointId}/runsync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: {
        audio_base64: audioBase64,
        model: selectedModel,
        enable_vad: true,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[stt] runpod HTTP error:', res.status, err);
    if (res.status === 401) throw new Error('Неверный RunPod API ключ. Проверьте настройки.');
    if (res.status === 429) throw new Error('RunPod: превышен лимит запросов. Подождите и попробуйте снова.');
    throw new Error(`RunPod: ошибка ${res.status}`);
  }

  const data: RunPodResponse = await res.json();
  console.log('[stt] runpod response — status:', data.status, '| id:', data.id);

  if (data.status === 'FAILED') {
    console.error('[stt] runpod job failed:', data.error);
    throw new Error(`RunPod: задача завершилась с ошибкой — ${data.error ?? 'unknown'}`);
  }

  if (data.status !== 'COMPLETED' || !data.output) {
    console.error('[stt] runpod unexpected status:', data.status);
    throw new Error(`RunPod: неожиданный статус — ${data.status}. Попробуйте снова.`);
  }

  const { segments, detected_language, transcription } = data.output;
  const duration = segments.length > 0 ? segments[segments.length - 1].end : 0;

  const result: WhisperResponse = {
    task: 'transcribe',
    language: detected_language,
    duration,
    text: transcription,
    segments,
  };

  console.log('[stt] runpod done — language:', result.language,
    '| duration:', result.duration?.toFixed(1), 's | segments:', result.segments.length,
    '| text:', result.text?.slice(0, 100));
  return result;
}

// ─── Provider router ────────────────────────────────────────────────────────

/**
 * Transcribe audio using the configured STT provider.
 * Routes to OpenAI Whisper or RunPod Faster Whisper based on keys.sttProvider.
 */
export async function transcribe(
  audioBlob: Blob,
  keys: ApiKeys,
): Promise<WhisperResponse> {
  const provider = keys.sttProvider ?? 'openai';
  console.log('[stt] provider:', provider);

  if (provider === 'runpod') {
    if (!keys.runpodApiKey) throw new Error('RunPod API ключ не настроен. Откройте Настройки.');
    if (!keys.runpodEndpointId) throw new Error('RunPod Endpoint ID не настроен. Откройте Настройки.');
    return transcribeWithRunpod(audioBlob, keys.runpodApiKey, keys.runpodEndpointId, keys.runpodModel);
  }

  if (!keys.openaiKey) throw new Error('OpenAI API ключ не настроен. Откройте Настройки.');
  return transcribeWithOpenAI(audioBlob, keys.openaiKey);
}
