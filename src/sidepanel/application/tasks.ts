import { loadApiKeys } from '../../shared/storage';
import { extractTasks } from '../infrastructure/claude';
import type { DiarizedSegment } from '../../shared/types';

/**
 * Application-layer wrapper: loads API key and calls extractTasks infrastructure.
 */
export async function runExtractTasks(segments: DiarizedSegment[]): Promise<string[]> {
  console.log('[runExtractTasks] start — segments:', segments.length);

  const keys = await loadApiKeys();
  if (!keys?.openaiKey) {
    throw new Error('API ключ не настроен. Откройте Настройки и введите ваш OpenAI ключ.');
  }

  const tasks = await extractTasks(segments, keys.openaiKey);
  console.log('[runExtractTasks] done — tasks:', tasks.length);
  return tasks;
}
