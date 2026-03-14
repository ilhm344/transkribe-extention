// TODO: implement in AI Summary milestone
import type { DiarizedSegment, PipelineResult } from '../../shared/types';

/**
 * Sends diarized transcript to Claude API (claude-sonnet-4-6).
 * Returns meeting summary and action items with real speaker names.
 *
 * TODO: implement in AI Summary milestone.
 * Reference: https://docs.anthropic.com/en/api/getting-started
 */
export async function summarize(
  _segments: DiarizedSegment[],
  _anthropicKey: string,
): Promise<Pick<PipelineResult, 'summary' | 'actionItems'>> {
  if (import.meta.env.DEV) console.log('[claude] summarize called — TODO: implement');
  throw new Error('summarize not yet implemented');
}
