import { loadApiKeys } from '../../shared/storage';
import { generateFollowUpEmail } from '../infrastructure/claude';
import type { DiarizedSegment } from '../../shared/types';

/**
 * Application-layer wrapper: loads API key and calls generateFollowUpEmail infrastructure.
 */
export async function runFollowUpEmail(segments: DiarizedSegment[]): Promise<string> {
  console.log('[runFollowUpEmail] start — segments:', segments.length);

  const keys = await loadApiKeys();
  if (!keys?.openaiKey) {
    throw new Error('API ключ не настроен. Откройте Настройки и введите ваш OpenAI ключ.');
  }

  const email = await generateFollowUpEmail(segments, keys.openaiKey);
  console.log('[runFollowUpEmail] done — chars:', email.length);
  return email;
}
