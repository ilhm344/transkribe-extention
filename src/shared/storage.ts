import type {
  ActiveSession,
  ApiKeys,
  BackendConfig,
  MeetingData,
  SpeakerSettings,
} from './types';

const KEYS = {
  MEETING_DATA: 'meetingData',
  API_KEYS: 'apiKeys',
  BACKEND_CONFIG: 'backendConfig',
  ACTIVE_SESSION: 'activeSession',
  SPEAKER_SETTINGS: 'speakerSettings',
} as const;

/** Default pause threshold. Speaker silence longer than this starts a new segment. */
export const DEFAULT_PAUSE_THRESHOLD_MS = 1000;

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
  const data = (result[KEYS.MEETING_DATA] as MeetingData | undefined) ?? null;
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
  const raw = result[KEYS.API_KEYS] as Partial<ApiKeys> | undefined;
  if (!raw) {
    if (import.meta.env.DEV) console.debug('[storage] loadApiKeys — not configured');
    return null;
  }
  // Migration: ensure sttProvider exists (older installs only had openaiKey)
  const keys: ApiKeys = {
    openaiKey: raw.openaiKey ?? '',
    sttProvider: raw.sttProvider ?? 'openai',
    runpodApiKey: raw.runpodApiKey,
    runpodEndpointId: raw.runpodEndpointId,
  };
  if (import.meta.env.DEV) {
    console.debug('[storage] loadApiKeys — sttProvider:', keys.sttProvider);
  }
  return keys;
}

// ─── Backend streaming config ──────────────────────────────────────────────

export async function getBackendConfig(): Promise<BackendConfig | null> {
  const result = await chrome.storage.local.get(KEYS.BACKEND_CONFIG);
  const raw = result[KEYS.BACKEND_CONFIG] as Partial<BackendConfig> | undefined;
  if (!raw) return null;
  const cfg: BackendConfig = {
    url: (raw.url ?? '').replace(/\/+$/, ''),
    apiSecret: raw.apiSecret ?? '',
    enabled: raw.enabled === true,
  };
  return cfg;
}

export async function setBackendConfig(cfg: BackendConfig): Promise<void> {
  const normalized: BackendConfig = {
    url: cfg.url.replace(/\/+$/, ''),
    apiSecret: cfg.apiSecret,
    enabled: cfg.enabled,
  };
  if (import.meta.env.DEV) {
    console.debug('[storage] setBackendConfig', {
      urlSet: !!normalized.url,
      secretSet: !!normalized.apiSecret,
      enabled: normalized.enabled,
    });
  }
  await chrome.storage.local.set({ [KEYS.BACKEND_CONFIG]: normalized });
}

/** Returns true when streaming is fully configured and enabled. */
export function isStreamingEnabled(cfg: BackendConfig | null): boolean {
  return !!cfg && cfg.enabled && cfg.url.length > 0 && cfg.apiSecret.length > 0;
}

// ─── Active streaming session ──────────────────────────────────────────────

export async function getActiveSession(): Promise<ActiveSession | null> {
  const result = await chrome.storage.local.get(KEYS.ACTIVE_SESSION);
  return (result[KEYS.ACTIVE_SESSION] as ActiveSession | undefined) ?? null;
}

export async function setActiveSession(session: ActiveSession): Promise<void> {
  if (import.meta.env.DEV) {
    console.debug('[storage] setActiveSession', {
      sessionId: session.sessionId,
      status: session.status,
      lastChunkIndex: session.lastChunkIndex,
    });
  }
  await chrome.storage.local.set({ [KEYS.ACTIVE_SESSION]: session });
}

export async function updateActiveSession(
  patch: Partial<ActiveSession>,
): Promise<ActiveSession | null> {
  const current = await getActiveSession();
  if (!current) return null;
  const next: ActiveSession = { ...current, ...patch };
  await setActiveSession(next);
  return next;
}

export async function clearActiveSession(): Promise<void> {
  await chrome.storage.local.remove(KEYS.ACTIVE_SESSION);
  if (import.meta.env.DEV) console.debug('[storage] clearActiveSession');
}

// ─── Speaker detection settings ────────────────────────────────────────────

export async function getSpeakerSettings(): Promise<SpeakerSettings> {
  const result = await chrome.storage.local.get(KEYS.SPEAKER_SETTINGS);
  const raw = result[KEYS.SPEAKER_SETTINGS] as Partial<SpeakerSettings> | undefined;
  const pauseThresholdMs =
    typeof raw?.pauseThresholdMs === 'number' && raw.pauseThresholdMs > 0
      ? raw.pauseThresholdMs
      : DEFAULT_PAUSE_THRESHOLD_MS;
  return { pauseThresholdMs };
}

export async function setSpeakerSettings(settings: SpeakerSettings): Promise<void> {
  if (import.meta.env.DEV) {
    console.debug('[storage] setSpeakerSettings', settings);
  }
  await chrome.storage.local.set({ [KEYS.SPEAKER_SETTINGS]: settings });
}
