import type { SpeakerLog } from './types';

/**
 * All chrome.runtime.sendMessage type constants.
 * ALWAYS use these — never raw strings in sendMessage calls.
 */
export const MSG = {
  // popup → background
  RECORDING_START:   'RECORDING_START',
  RECORDING_STOP:    'RECORDING_STOP',
  // background → offscreen
  START_OFFSCREEN:   'START_OFFSCREEN',
  STOP_OFFSCREEN:    'STOP_OFFSCREEN',
  // background → content
  RECORDING_STARTED: 'RECORDING_STARTED',
  RECORDING_STOPPED: 'RECORDING_STOPPED',
  // offscreen → background
  AUDIO_BLOB_READY:  'AUDIO_BLOB_READY',
  // content → background
  SPEAKER_LOG_READY: 'SPEAKER_LOG_READY',
  MEETING_ENDED:     'MEETING_ENDED',
  // offscreen → background → content (mic audio level for self-speaking detection)
  MIC_ACTIVITY:      'MIC_ACTIVITY',
  // offscreen → background → content (tab audio level for remote-speaking detection)
  TAB_ACTIVITY:      'TAB_ACTIVITY',
  // offscreen → background (diagnostics)
  OFFSCREEN_LOG:     'OFFSCREEN_LOG',
} as const;

export type MsgType = typeof MSG[keyof typeof MSG];

/** Base message shape */
export interface BaseMessage {
  type: MsgType;
}

/** offscreen → background: audio capture complete */
export interface AudioBlobReadyMessage extends BaseMessage {
  type: typeof MSG.AUDIO_BLOB_READY;
  payload: {
    audioBase64: string;
    audioMimeType: string;
    recordingStartMs: number;
  };
}

/** content → background: speaker log flushed */
export interface SpeakerLogReadyMessage extends BaseMessage {
  type: typeof MSG.SPEAKER_LOG_READY;
  payload: { log: SpeakerLog };
}

/** background → offscreen: start capturing tab audio */
export interface StartOffscreenMessage extends BaseMessage {
  type: typeof MSG.START_OFFSCREEN;
  payload: { streamId: string };
}
