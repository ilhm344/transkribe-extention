import type { DiarizedSegment, PipelineResult } from '../../shared/types';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Sends diarized transcript to Claude Sonnet.
 * Returns meeting summary and action items with real speaker names.
 */
export async function summarize(
  segments: DiarizedSegment[],
  anthropicKey: string,
): Promise<Pick<PipelineResult, 'summary' | 'actionItems'>> {
  if (import.meta.env.DEV) console.log('[claude] summarize start — segments:', segments.length);

  const transcript = segments
    .map(s => `[${formatTime(s.start)}] ${s.speaker}: ${s.text.trim()}`)
    .join('\n');

  const prompt = `You are analyzing a meeting transcript. Each line is formatted as [timestamp] Speaker: text.

TRANSCRIPT:
${transcript}

Provide a concise meeting summary (3–5 sentences) and a list of action items with responsible persons.
Respond with valid JSON only, no extra text:
{
  "summary": "...",
  "actionItems": ["Person: action 1", "Person: action 2"]
}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[claude] API error:', res.status, err);
    if (res.status === 401) throw new Error('Неверный Anthropic API ключ. Проверьте настройки.');
    if (res.status === 429) throw new Error('Anthropic: превышен лимит запросов. Подождите и попробуйте снова.');
    throw new Error(`Anthropic Claude: ошибка ${res.status}`);
  }

  const data = await res.json();
  const text: string = data.content?.[0]?.text ?? '';

  if (import.meta.env.DEV) console.log('[claude] raw response:', text);

  // Strip markdown code fences if present
  const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  let parsed: { summary: string; actionItems: string[] };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    console.error('[claude] JSON parse failed, raw text:', text);
    throw new Error('Claude returned malformed JSON');
  }

  if (import.meta.env.DEV) {
    console.log('[claude] summarize done — actionItems:', parsed.actionItems?.length ?? 0);
  }

  return {
    summary: parsed.summary ?? '',
    actionItems: parsed.actionItems ?? [],
  };
}
