import { MSG } from '../shared/messages';
import type { SpeakerLogReadyMessage } from '../shared/messages';
import type { SpeakerLog } from '../shared/types';
import { SpeakerTracker } from './speakerTracker';
import { MeetingEndWatcher } from './meetingEnd';

const platform = location.hostname.includes('telemost') ? 'telemost' : 'meet';
if (import.meta.env.DEV) console.log(`[content] loaded on platform: ${platform}, url: ${location.href}`);

// ─── Lazy-load platform module ─────────────────────────────────────────────

let tracker: SpeakerTracker | null = null;
let endWatcher: MeetingEndWatcher | null = null;
let recordingStartMs: number | null = null;

async function getPlatformFns() {
  if (platform === 'telemost') {
    const mod = await import('./platforms/telemost');
    return { getActiveSpeaker: mod.getActiveSpeaker, getSelfName: mod.getSelfName, isMeetingEnded: mod.isMeetingEnded };
  }
  const mod = await import('./platforms/meet');
  return { getActiveSpeaker: mod.getActiveSpeaker, getSelfName: mod.getSelfName, isMeetingEnded: mod.isMeetingEnded };
}

// ─── Message listener ──────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (import.meta.env.DEV) {
    console.debug('[content] message received', message.type);
  }

  if (message.type === MSG.RECORDING_STARTED) {
    recordingStartMs = message.payload?.recordingStartMs ?? Date.now();
    if (import.meta.env.DEV) {
      console.log('[content] RECORDING_STARTED — recordingStartMs:', recordingStartMs);
    }

    getPlatformFns().then(({ getActiveSpeaker, getSelfName, isMeetingEnded }) => {
      tracker = new SpeakerTracker(getActiveSpeaker, getSelfName);
      tracker.start();

      endWatcher = new MeetingEndWatcher(isMeetingEnded, () => {
        if (import.meta.env.DEV) console.log('[content] meeting ended via watcher — signalling background');
        chrome.runtime.sendMessage({ type: MSG.MEETING_ENDED });
      });
      endWatcher.start();
    });
  }

  if (message.type === MSG.RECORDING_STOPPED) {
    if (import.meta.env.DEV) console.log('[content] RECORDING_STOPPED — flushing speaker log');

    endWatcher?.stop();

    const logEntries = tracker?.stop() ?? [];
    const speakerLog: SpeakerLog = {
      recordingStartMs: recordingStartMs ?? Date.now(),
      log: logEntries,
    };

    if (import.meta.env.DEV) {
      console.log('[content] sending SPEAKER_LOG_READY, entries:', logEntries.length);
    }

    const msg: SpeakerLogReadyMessage = {
      type: MSG.SPEAKER_LOG_READY,
      payload: { log: speakerLog },
    };
    chrome.runtime.sendMessage(msg);

    tracker = null;
    endWatcher = null;
    recordingStartMs = null;
  }
});
