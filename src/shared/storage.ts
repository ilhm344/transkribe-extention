import type { MeetingData, ApiKeys } from './types';

const KEYS = {
  MEETING_DATA: 'meetingData',
  API_KEYS: 'apiKeys',
} as const;

// ─── Meeting data ──────────────────────────────────────────────────────────

export async function saveMeetingData(data: MeetingData): Promise<void> {
  if (import.meta.env.DEV) {
    console.debug('[storage] saveMeetingData', {
      platform: data.platform,
      speakerCount: data.speakerLog.log.length,
      recordingStartMs: data.recordingStartMs,
    });
  }
  await chrome.storage.local.set({ [KEYS.MEETING_DATA]: data });
}

export async function loadMeetingData(): Promise<MeetingData | null> {
  const result = await chrome.storage.local.get(KEYS.MEETING_DATA);
  const data: MeetingData | null = result[KEYS.MEETING_DATA] ?? null;
  if (import.meta.env.DEV) {
    console.debug('[storage] loadMeetingData', data ? `found (platform: ${data.platform})` : 'empty');
  }
  return data;
}

export async function clearMeetingData(): Promise<void> {
  await chrome.storage.local.remove(KEYS.MEETING_DATA);
  if (import.meta.env.DEV) console.debug('[storage] clearMeetingData');
}

// ─── API keys ──────────────────────────────────────────────────────────────

export async function saveApiKeys(keys: ApiKeys): Promise<void> {
  if (import.meta.env.DEV) console.debug('[storage] saveApiKeys — storing API keys');
  await chrome.storage.local.set({ [KEYS.API_KEYS]: keys });
}

export async function loadApiKeys(): Promise<ApiKeys | null> {
  const result = await chrome.storage.local.get(KEYS.API_KEYS);
  const keys: ApiKeys | null = result[KEYS.API_KEYS] ?? null;
  if (import.meta.env.DEV) {
    console.debug('[storage] loadApiKeys', keys ? 'found' : 'not configured');
  }
  return keys;
}
