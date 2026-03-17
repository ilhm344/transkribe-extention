import { MSG } from '../shared/messages';
import type { SpeakerLogReadyMessage } from '../shared/messages';
import type { SpeakerLog } from '../shared/types';
import { SpeakerTracker } from './speakerTracker';
import { MeetingEndWatcher } from './meetingEnd';

const TAG = '[content]';
const platform = location.hostname.includes('telemost') ? 'telemost' : 'meet';
console.log(TAG, `loaded | platform: ${platform} | url: ${location.href}`);

// ─── Inject main-world speaker detector ────────────────────────────────────

function injectSpeakerDetector(): void {
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('speaker-detector.js');
    script.onload = () => {
      console.log(TAG, 'speaker-detector.js injected into main world');
      script.remove(); // clean up <script> tag after execution
    };
    script.onerror = (e) => {
      console.warn(TAG, 'failed to inject speaker-detector.js:', e);
    };
    (document.head || document.documentElement).appendChild(script);
  } catch (e) {
    console.warn(TAG, 'injectSpeakerDetector error:', e);
  }
}

// Inject immediately — needs to be in place before RTCPeerConnection is created
injectSpeakerDetector();

// ─── Lazy-load platform module ─────────────────────────────────────────────

let tracker: SpeakerTracker | null = null;
let endWatcher: MeetingEndWatcher | null = null;
let recordingStartMs: number | null = null;
let getSelfNameFn: (() => string) | null = null;

// [FIX] Track tab audio activity to suppress mic speaker bleed
let lastTabActivityMs = 0;

async function getPlatformFns() {
  if (platform === 'telemost') {
    const mod = await import('./platforms/telemost');
    return { getActiveSpeaker: mod.getActiveSpeaker, getSelfName: mod.getSelfName, isMeetingEnded: mod.isMeetingEnded };
  }
  const mod = await import('./platforms/meet');
  return { getActiveSpeaker: mod.getActiveSpeaker, getSelfName: mod.getSelfName, isMeetingEnded: mod.isMeetingEnded };
}

// ─── Listen for speaker events from main-world detector ────────────────────

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== 'TRANSKRIBE_SPEAKER') return;

  const { name, level } = event.data;
  if (tracker && name) {
    tracker.onRemoteSpeaker(name, level);
  }
});

// ─── Message listener ──────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  console.debug(TAG, 'message received:', message.type);

  if (message.type === MSG.RECORDING_STARTED) {
    recordingStartMs = message.payload?.recordingStartMs ?? Date.now();
    console.log(TAG, 'RECORDING_STARTED — recordingStartMs:', recordingStartMs);

    getPlatformFns().then(({ getActiveSpeaker, getSelfName, isMeetingEnded }) => {
      console.log(TAG, 'platform module loaded:', platform);

      const initialSpeaker = getActiveSpeaker();
      console.log(TAG, 'initial getActiveSpeaker() =', initialSpeaker);

      getSelfNameFn = getSelfName;
      tracker = new SpeakerTracker(getActiveSpeaker, getSelfName);
      tracker.start();

      endWatcher = new MeetingEndWatcher(isMeetingEnded, () => {
        console.log(TAG, 'meeting ended via watcher — signalling background');
        chrome.runtime.sendMessage({ type: MSG.MEETING_ENDED });
      });
      endWatcher.start();
    });
  }

  // [FIX] Tab audio activity from offscreen → remote speaking detection.
  // During tab capture, main-world AnalyserNode returns zeros for WebRTC streams.
  // Tab audio = remote speakers (echo cancellation removes self mic).
  // Resolve remote participant name from DOM and feed into tracker.
  // MUST be checked BEFORE MIC_ACTIVITY to update lastTabActivityMs.
  if (message.type === MSG.TAB_ACTIVITY) {
    lastTabActivityMs = Date.now();
    if (tracker && getSelfNameFn) {
      const level = message.payload?.level ?? 0;
      const selfName = getSelfNameFn();
      const nameEls = document.querySelectorAll('[class*="participantName"]');
      for (const el of nameEls) {
        const n = el.textContent?.trim();
        if (n && n !== selfName && n !== 'Я') {
          tracker.onRemoteSpeaker(n, level);
          break;
        }
      }
    }
    return;
  }

  // [FIX] Mic activity from offscreen → self speaking detection.
  // When tab audio is active (remote speaking), the mic picks up speaker bleed.
  // Suppress mic as "self speaking" when tab was recently active to avoid
  // false self-detection that prevents speaker switching.
  if (message.type === MSG.MIC_ACTIVITY) {
    if (tracker) {
      const level = message.payload?.level ?? 0;
      const tabRecentlyActive = (Date.now() - lastTabActivityMs) < 400;
      if (!tabRecentlyActive) {
        tracker.onSelfSpeaker(level);
      }
    }
    return;
  }

  if (message.type === MSG.RECORDING_STOPPED) {
    console.log(TAG, 'RECORDING_STOPPED — flushing speaker log');

    endWatcher?.stop();

    const logEntries = tracker?.stop() ?? [];
    const speakerLog: SpeakerLog = {
      recordingStartMs: recordingStartMs ?? Date.now(),
      log: logEntries,
    };

    console.log(TAG, 'sending SPEAKER_LOG_READY | entries:', logEntries.length,
      '| speakers:', [...new Set(logEntries.map(e => e.name))].join(', ') || '(none)');

    // [FIX] Log the full speaker log for debugging
    console.log(TAG, '=== SPEAKER LOG ===');
    console.log(TAG, 'recordingStartMs:', speakerLog.recordingStartMs);
    for (const entry of logEntries) {
      const startSec = ((entry.startMs - speakerLog.recordingStartMs) / 1000).toFixed(1);
      const endSec = ((entry.endMs - speakerLog.recordingStartMs) / 1000).toFixed(1);
      const dur = ((entry.endMs - entry.startMs) / 1000).toFixed(1);
      console.log(TAG, `  ${startSec}s → ${endSec}s (${dur}s) "${entry.name}"`);
    }
    console.log(TAG, '=== END SPEAKER LOG ===');

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
