import type { WhisperResponse } from '../../shared/types';

/**
 * Sends audio blob to OpenAI Whisper API (verbose_json mode).
 * Returns segments with timestamps for diarization merge.
 *
 * Reference: https://platform.openai.com/docs/guides/speech-to-text
 */
export async function transcribeAudio(
  audioBlob: Blob,
  openaiKey: string,
): Promise<WhisperResponse> {
  console.log('[stt] transcribeAudio start — size:', audioBlob.size, 'bytes | type:', audioBlob.type);

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
    console.error('[stt] Whisper API error:', res.status, err);
    if (res.status === 401) throw new Error('Неверный OpenAI API ключ. Проверьте настройки.');
    if (res.status === 429) throw new Error('OpenAI: превышен лимит запросов. Подождите и попробуйте снова.');
    if (res.status === 413) throw new Error('Аудио слишком большое для Whisper API (лимит 25 МБ).');
    throw new Error(`OpenAI Whisper: ошибка ${res.status}`);
  }

  const data: WhisperResponse = await res.json();
  console.log('[stt] transcribeAudio done — language:', data.language,
    '| duration:', data.duration?.toFixed(1), 's | segments:', data.segments.length,
    '| text:', data.text?.slice(0, 100));
  return data;
}
