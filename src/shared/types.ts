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
