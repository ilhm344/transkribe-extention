/**
 * HTTP client for the streaming backend (Fastify service behind your reverse proxy).
 *
 * All requests carry `X-API-Key`. Callers (chunkUploader, eventBatcher) layer
 * their own retry/backoff on top of these primitives — this module does no
 * retries itself, just wraps fetch with sane defaults (AbortController
 * timeout, error surfaces).
 */

import type { BackendConfig, SessionMeta, SpeakerEvent } from './types';

const LOG = '[backend]';

const DEFAULT_TIMEOUT_MS = 15_000;
const UPLOAD_TIMEOUT_MS = 60_000; // chunks can be several hundred KB over slow nets

export class BackendError extends Error {
  readonly status?: number;
  readonly retryable: boolean;
  constructor(message: string, opts: { status?: number; retryable?: boolean } = {}) {
    super(message);
    this.name = 'BackendError';
    this.status = opts.status;
    this.retryable = opts.retryable !== false; // default true
  }
}

function assertConfigured(cfg: BackendConfig): void {
  if (!cfg.url) throw new BackendError('backend url missing', { retryable: false });
  if (!cfg.apiSecret) throw new BackendError('api secret missing', { retryable: false });
}

function headers(cfg: BackendConfig, extra: Record<string, string> = {}): HeadersInit {
  return { 'X-API-Key': cfg.apiSecret, ...extra };
}

async function request<T>(
  cfg: BackendConfig,
  path: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<T> {
  assertConfigured(cfg);
  const url = cfg.url + path;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const retryable = res.status >= 500 || res.status === 408 || res.status === 429;
      console.warn(LOG, `${init.method ?? 'GET'} ${path} → ${res.status}`, body.slice(0, 200));
      throw new BackendError(`backend ${res.status}: ${body.slice(0, 200)}`, {
        status: res.status,
        retryable,
      });
    }
    // Some endpoints return empty body
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      return (await res.json()) as T;
    }
    return undefined as unknown as T;
  } catch (err) {
    if (err instanceof BackendError) throw err;
    const aborted = (err as Error)?.name === 'AbortError';
    console.warn(LOG, `${init.method ?? 'GET'} ${path} failed`, err);
    throw new BackendError(
      aborted ? `backend timeout after ${timeoutMs}ms` : String(err),
      { retryable: true },
    );
  } finally {
    clearTimeout(to);
  }
}

// ─── Session lifecycle ─────────────────────────────────────────────────────

export interface CreateSessionResponse {
  sessionId: string;
}

/**
 * POST /sessions — register a new streaming session with the backend.
 * We pass a client-generated `sessionId` so chunks can be queued with a
 * stable key even before this call succeeds.
 */
export function createSession(
  cfg: BackendConfig,
  sessionId: string,
  meta: SessionMeta,
): Promise<CreateSessionResponse> {
  return request<CreateSessionResponse>(
    cfg,
    '/sessions',
    {
      method: 'POST',
      headers: headers(cfg, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ sessionId, ...meta }),
    },
    DEFAULT_TIMEOUT_MS,
  );
}

// ─── Chunk upload ─────────────────────────────────────────────────────────

export interface PostChunkResponse {
  ok: true;
  /** Optional partial transcript if backend ENABLE_PER_CHUNK_STT is on. */
  transcript?: string;
}

/**
 * POST /sessions/:id/chunks — upload one self-contained .webm chunk.
 * Sends as multipart/form-data because backend uses @fastify/multipart.
 */
export function postChunk(
  cfg: BackendConfig,
  sessionId: string,
  chunk: {
    index: number;
    blob: Blob;
    offsetMs: number;
    durationMs: number;
    isFinal: boolean;
  },
): Promise<PostChunkResponse> {
  const form = new FormData();
  form.append('file', chunk.blob, `${String(chunk.index).padStart(5, '0')}.webm`);
  form.append('index', String(chunk.index));
  form.append('offsetMs', String(chunk.offsetMs));
  form.append('durationMs', String(chunk.durationMs));
  form.append('isFinal', String(chunk.isFinal));
  return request<PostChunkResponse>(
    cfg,
    `/sessions/${encodeURIComponent(sessionId)}/chunks`,
    {
      method: 'POST',
      headers: headers(cfg),
      body: form,
    },
    UPLOAD_TIMEOUT_MS,
  );
}

// ─── Speaker events ───────────────────────────────────────────────────────

export interface PostEventsResponse {
  ok: true;
  count: number;
}

/** POST /sessions/:id/events — append a batch of speaker events. */
export function postEvents(
  cfg: BackendConfig,
  sessionId: string,
  events: SpeakerEvent[],
): Promise<PostEventsResponse> {
  return request<PostEventsResponse>(
    cfg,
    `/sessions/${encodeURIComponent(sessionId)}/events`,
    {
      method: 'POST',
      headers: headers(cfg, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ events }),
    },
    DEFAULT_TIMEOUT_MS,
  );
}

// ─── Session completion ───────────────────────────────────────────────────

export interface CompleteSessionResponse {
  ok: true;
  finalUrl?: string;
  transcript?: string;
}

/**
 * POST /sessions/:id/complete — tells backend all chunks are in, triggers
 * ffmpeg concat and (optional) final Whisper pass. Called from offscreen
 * after the chunkUploader drains its queue.
 */
export function completeSession(
  cfg: BackendConfig,
  sessionId: string,
  expectedChunks: number,
): Promise<CompleteSessionResponse> {
  return request<CompleteSessionResponse>(
    cfg,
    `/sessions/${encodeURIComponent(sessionId)}/complete`,
    {
      method: 'POST',
      headers: headers(cfg, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ expectedChunks }),
    },
    UPLOAD_TIMEOUT_MS,
  );
}
