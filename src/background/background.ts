import { MSG } from '../shared/messages';
import type { AudioBlobReadyMessage, SpeakerLogReadyMessage } from '../shared/messages';

if (import.meta.env.DEV) console.log('[background] service worker started');

chrome.runtime.onInstalled.addListener(() => {
  if (import.meta.env.DEV) console.log('[background] extension installed/updated');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (import.meta.env.DEV) {
    console.debug('[background] message received', message.type, { tabId: sender.tab?.id });
  }

  switch (message.type) {
    case MSG.RECORDING_START:
      if (import.meta.env.DEV) console.log('[background] RECORDING_START — TODO: implement in Audio Recording milestone');
      // TODO: chrome.tabCapture.getMediaStreamId() → create offscreen → pass streamId
      break;

    case MSG.RECORDING_STOP:
      if (import.meta.env.DEV) console.log('[background] RECORDING_STOP — TODO: implement in Audio Recording milestone');
      // TODO: send STOP_OFFSCREEN to offscreen document
      break;

    case MSG.AUDIO_BLOB_READY: {
      const msg = message as AudioBlobReadyMessage;
      if (import.meta.env.DEV) {
        console.log('[background] AUDIO_BLOB_READY received', {
          mimeType: msg.payload.audioMimeType,
          recordingStartMs: msg.payload.recordingStartMs,
        });
      }
      // TODO: store audio + check if speaker log also ready → open sidepanel
      break;
    }

    case MSG.SPEAKER_LOG_READY: {
      const msg = message as SpeakerLogReadyMessage;
      if (import.meta.env.DEV) {
        console.log('[background] SPEAKER_LOG_READY received', {
          segmentCount: msg.payload.log.log.length,
        });
      }
      // TODO: store speaker log + check if audio also ready → open sidepanel
      break;
    }

    case MSG.MEETING_ENDED:
      if (import.meta.env.DEV) console.log('[background] MEETING_ENDED signal received');
      // TODO: auto-stop recording if active
      break;

    default:
      console.warn('[background] unknown message type:', message.type);
  }

  return true; // keep sendResponse channel open for async responses
});
