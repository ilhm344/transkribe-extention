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

/** API keys stored securely in chrome.storage.local */
export interface ApiKeys {
  openaiKey: string;
}
