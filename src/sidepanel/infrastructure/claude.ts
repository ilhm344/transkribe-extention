import type { DiarizedSegment, PipelineResult } from '../../shared/types';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Sends diarized transcript to OpenAI GPT-4o.
 * Returns meeting summary and action items with real speaker names.
 */
export async function summarize(
  segments: DiarizedSegment[],
  openaiKey: string,
): Promise<Pick<PipelineResult, 'summary' | 'actionItems'>> {
  const transcript = segments
    .map(s => `[${formatTime(s.start)}] ${s.speaker}: ${s.text.trim()}`)
    .join('\n');

  console.log('[summarize] start — segments:', segments.length, '| transcript chars:', transcript.length);

  const prompt = `You are analyzing a meeting transcript. Each line is formatted as [timestamp] Speaker: text.

TRANSCRIPT:
${transcript}

Respond in the SAME LANGUAGE as the transcript (if the transcript is in Russian, respond in Russian).
Provide a concise meeting summary (3–5 sentences) and a list of action items with responsible persons.
Respond with valid JSON only, no extra text:
{
  "summary": "...",
  "actionItems": ["Person: action 1", "Person: action 2"]
}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[summarize] API error:', res.status, err);
    if (res.status === 401) throw new Error('Неверный OpenAI API ключ. Проверьте настройки.');
    if (res.status === 429) throw new Error('OpenAI: превышен лимит запросов. Подождите и попробуйте снова.');
    throw new Error(`OpenAI GPT: ошибка ${res.status}`);
  }

  const data = await res.json();
  const text: string = data.choices?.[0]?.message?.content ?? '';

  console.log('[summarize] raw response:', text?.slice(0, 200));

  // Strip markdown code fences if present
  const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  let parsed: { summary: string; actionItems: string[] };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    console.error('[summarize] JSON parse failed, raw text:', text);
    throw new Error('GPT returned malformed JSON');
  }

  console.log('[summarize] done — summary chars:', parsed.summary?.length ?? 0,
    '| actionItems:', parsed.actionItems?.length ?? 0);

  return {
    summary: parsed.summary ?? '',
    actionItems: parsed.actionItems ?? [],
  };
}
