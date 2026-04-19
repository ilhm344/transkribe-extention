/** Single speaker segment captured by DOM observer in content script */
export interface SpeakerLogEntry {
  name: string;
  startMs: number; // absolute Date.now() timestamp
  endMs: number;
}

/** Full speaker log saved after meeting ends */
export interface SpeakerLog {
  recordingStartMs: number;
  log: SpeakerLogEntry[];
}

/** Single segment from OpenAI Whisper verbose_json response */
export interface SttSegment {
  id: number;
  seek: number;
  start: number; // seconds from recording start
  end: number;
  text: string;
}

/** OpenAI Whisper verbose_json response shape */
export interface WhisperResponse {
  task: string;
  language: string;
  duration: number;
  text: string;
  segments: SttSegment[];
}

/** Segment after merging STT output with speaker log (diarization) */
export interface DiarizedSegment {
  start: number;  // seconds from recording start
  end: number;
  speaker: string; // real participant name from DOM
  text: string;
}

/** Meeting data persisted in chrome.storage.local between contexts */
export interface MeetingData {
  audioBase64: string;   // base64-encoded .webm audio (Blob serialized for storage)
  audioMimeType: string; // e.g. "audio/webm;codecs=opus"
  speakerLog: SpeakerLog;
  recordingStartMs: number;
  meetingId: string;
  platform: 'meet' | 'telemost';
}

/** Result from post-meeting pipeline (transcription → diarization → summary) */
export interface PipelineResult {
  diarized: DiarizedSegment[];
  summary: string;
  actionItems: string[];
}

/** STT provider selection */
export type SttProvider = 'openai' | 'runpod';

/** RunPod Faster Whisper model choices */
export type RunPodWhisperModel =
  | 'tiny' | 'base' | 'small' | 'medium'
  | 'large-v1' | 'large-v2' | 'large-v3'
  | 'distil-large-v2' | 'distil-large-v3'
  | 'turbo';

/** API keys stored securely in chrome.storage.local */
export interface ApiKeys {
  openaiKey: string;
  sttProvider: SttProvider;
  runpodApiKey?: string;
  runpodEndpointId?: string;
  runpodModel?: RunPodWhisperModel;
}

/** RunPod Faster Whisper output (inside the envelope) */
export interface RunPodSttOutput {
  segments: SttSegment[];
  detected_language: string;
  transcription: string;
}

/** RunPod serverless API response envelope */
export interface RunPodResponse {
  id: string;
  status: 'COMPLETED' | 'FAILED' | 'IN_QUEUE' | 'IN_PROGRESS';
  output?: RunPodSttOutput;
  error?: string;
}

// ─── Streaming backend types ─────────────────────────────────────────────────

/** Structured speaker event emitted by SpeakerTracker on start/end of segment */
export interface SpeakerEvent {
  kind: 'start' | 'end';
  name: string;
  /** Offset in ms from recordingStartMs. Single clock anchor across contexts. */
  offsetMs: number;
}

/** One rotated chunk of audio waiting to be uploaded (persisted in IDB) */
export interface ChunkRecord {
  /** Synthetic primary key for IDB (see idb.ts makeChunkId). */
  id: string;
  /** Null until POST /sessions succeeds; chunks queued with null get backfilled. */
  sessionId: string | null;
  index: number;
  blob: Blob;
  offsetMs: number;
  durationMs: number;
  isFinal: boolean;
  attempts: number;
  createdAt: number;
}

/** Metadata sent to backend on session creation */
export interface SessionMeta {
  recordingStartMs: number;
  platform: 'meet' | 'telemost';
  meetingId?: string;
}

/** Backend configuration stored in chrome.storage.local */
export interface BackendConfig {
  /** Base URL, e.g. https://transkribe-api.example.com (no trailing slash). */
  url: string;
  /** Shared secret sent as X-API-Key header. */
  apiSecret: string;
  /** Master toggle — if false, chunks are not streamed at all. */
  enabled: boolean;
}

/** Runtime-configurable speaker detection parameters */
export interface SpeakerSettings {
  /** Pause longer than this ends the current segment and starts a new one. */
  pauseThresholdMs: number;
}

/** State of an in-flight streaming session, persisted for recovery after restart */
export interface ActiveSession {
  /** Null while POST /sessions has not yet succeeded. */
  sessionId: string | null;
  recordingStartMs: number;
  status: 'active' | 'completing' | 'done' | 'abandoned';
  /** Filled at STOP; backend uses it to verify drain. */
  expectedChunks?: number;
  lastChunkIndex: number;
  startedAt: number;
  platform: 'meet' | 'telemost';
  meetingId?: string;
}
