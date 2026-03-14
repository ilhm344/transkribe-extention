import { MSG } from '../shared/messages';
import type { StartOffscreenMessage } from '../shared/messages';

if (import.meta.env.DEV) console.log('[offscreen] document loaded');

chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (import.meta.env.DEV) {
    console.debug('[offscreen] message received', message.type);
  }

  switch (message.type) {
    case MSG.START_OFFSCREEN: {
      const msg = message as StartOffscreenMessage;
      if (import.meta.env.DEV) {
        console.log('[offscreen] START_OFFSCREEN — streamId:', msg.payload.streamId);
        console.log('[offscreen] TODO: implement tabCapture + mic mix + MediaRecorder in Audio Recording milestone');
      }
      // TODO: getUserMedia({ chromeMediaSource: 'tab', chromeMediaSourceId: streamId })
      // TODO: getUserMedia(microphone)
      // TODO: Web Audio API: mix tab + mic → AudioContext.destination
      // TODO: MediaRecorder → chunks → Blob(.webm) → send AUDIO_BLOB_READY
      break;
    }

    case MSG.STOP_OFFSCREEN:
      if (import.meta.env.DEV) console.log('[offscreen] STOP_OFFSCREEN — TODO: stop MediaRecorder');
      // TODO: mediaRecorder.stop() → triggers onstop → send AUDIO_BLOB_READY
      break;

    default:
      // offscreen only handles its own messages — ignore others
      break;
  }
});
