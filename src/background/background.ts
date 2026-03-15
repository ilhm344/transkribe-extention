import { MSG } from '../shared/messages';
import type { AudioBlobReadyMessage, SpeakerLogReadyMessage } from '../shared/messages';
import { saveMeetingData } from '../shared/storage';
import type { MeetingData, SpeakerLog } from '../shared/types';

if (import.meta.env.DEV) console.log('[bg] service worker started');

// ─── State ──────────────────────────────────────────────────────────────────

let isRecording = false;
let activeTabId: number | null = null;

interface PendingAudio {
  audioBase64: string;
  audioMimeType: string;
  recordingStartMs: number;
}

let pendingAudio: PendingAudio | null = null;
let pendingSpeakerLog: SpeakerLog | null = null;
let speakerLogTimeoutId: ReturnType<typeof setTimeout> | null = null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function detectPlatform(url: string): 'meet' | 'telemost' {
  if (url.includes('telemost.yandex.ru')) return 'telemost';
  return 'meet';
}

function extractMeetingId(url: string): string {
  // meet.google.com/abc-defg-hij → abc-defg-hij
  // telemost.yandex.ru/j/12345678 → 12345678
  const match = url.match(/\/([a-zA-Z0-9_-]{4,})(?:[?#]|$)/);
  return match?.[1] ?? `meeting-${Date.now()}`;
}

async function ensureOffscreenDocument(): Promise<void> {
  const existing = await chrome.offscreen.hasDocument();
  if (!existing) {
    await chrome.offscreen.createDocument({
      url: chrome.runtime.getURL('src/offscreen/offscreen.html'),
      reasons: [chrome.offscreen.Reason.USER_MEDIA],
      justification: 'Capture tab audio and microphone for meeting transcription',
    });
    console.debug('[bg] offscreen document created');
  } else {
    console.debug('[bg] offscreen document already exists, reusing');
  }
}

async function checkBothReady(): Promise<void> {
  console.debug('[bg] checkBothReady: audio ready:', !!pendingAudio, '| speakerLog ready:', !!pendingSpeakerLog);
  if (!pendingAudio) return;

  // If speaker log not yet received, wait up to 3s then proceed with empty log
  if (!pendingSpeakerLog) {
    if (!speakerLogTimeoutId) {
      console.debug('[bg] waiting up to 3s for speakerLog...');
      speakerLogTimeoutId = setTimeout(() => {
        speakerLogTimeoutId = null;
        if (pendingAudio && !pendingSpeakerLog) {
          console.warn('[bg] speakerLog timeout — proceeding without speaker data');
          pendingSpeakerLog = { recordingStartMs: pendingAudio.recordingStartMs, log: [] };
          void checkBothReady();
        }
      }, 3000);
    }
    return;
  }

  if (speakerLogTimeoutId) {
    clearTimeout(speakerLogTimeoutId);
    speakerLogTimeoutId = null;
  }

  console.debug('[bg] both audio+speakerLog ready → saving MeetingData + opening sidepanel');

  try {
    const tab = activeTabId !== null ? await chrome.tabs.get(activeTabId) : null;
    const url = tab?.url ?? '';
    const platform = detectPlatform(url);
    const meetingId = extractMeetingId(url);

    const meetingData: MeetingData = {
      audioBase64:      pendingAudio.audioBase64,
      audioMimeType:    pendingAudio.audioMimeType,
      speakerLog:       pendingSpeakerLog,
      recordingStartMs: pendingAudio.recordingStartMs,
      meetingId,
      platform,
    };

    await saveMeetingData(meetingData);
    console.debug('[bg] MeetingData saved — platform:', platform, '| meetingId:', meetingId);

    pendingAudio = null;
    pendingSpeakerLog = null;
  } catch (err) {
    console.error('[bg] checkBothReady error:', err);
  }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  if (import.meta.env.DEV) console.log('[bg] extension installed/updated');
});

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, _sendResponse) => {
  console.debug('[bg] message received:', message.type, { senderTabId: sender.tab?.id });

  switch (message.type) {
    case MSG.RECORDING_START:
      void handleRecordingStart();
      break;

    case MSG.RECORDING_STOP:
      void handleRecordingStop();
      break;

    case MSG.AUDIO_BLOB_READY:
      void handleAudioBlobReady(message as AudioBlobReadyMessage);
      break;

    case MSG.SPEAKER_LOG_READY:
      void handleSpeakerLogReady(message as SpeakerLogReadyMessage);
      break;

    case MSG.MEETING_ENDED:
      void handleMeetingEnded();
      break;

    case MSG.OFFSCREEN_LOG:
      console.log('[offscreen]', ...(message.payload?.args ?? []));
      break;

    default:
      console.warn('[bg] unknown message type:', message.type);
  }
});

// ─── Handler: RECORDING_START ─────────────────────────────────────────────────

async function handleRecordingStart(): Promise<void> {
  console.debug('[bg] RECORDING_START received');

  try {
    // 1. Find the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      console.error('[bg] RECORDING_START error: no active tab found');
      return;
    }
    activeTabId = tab.id;
    console.debug('[bg] active tabId:', activeTabId, '| url:', tab.url);

    // 2. Get media stream ID for tab capture (requires user gesture — triggered from popup click)
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: activeTabId });
    console.debug('[bg] getMediaStreamId result:', streamId);

    // 3. Ensure offscreen document exists
    await ensureOffscreenDocument();

    // 4. Send stream ID to offscreen to start recording
    await chrome.runtime.sendMessage({ type: MSG.START_OFFSCREEN, payload: { streamId } });
    console.debug('[bg] START_OFFSCREEN sent to offscreen');

    // 5. Signal content script to start speaker tracking
    try {
      await chrome.tabs.sendMessage(activeTabId, { type: MSG.RECORDING_STARTED });
      console.debug('[bg] RECORDING_STARTED sent to content script, tabId:', activeTabId);
    } catch (err) {
      // Content script may not be injected yet (e.g., not on a supported page)
      console.warn('[bg] Could not send RECORDING_STARTED to tab:', err);
    }

    isRecording = true;
    const startMs = Date.now();
    await chrome.storage.local.set({ recordingState: { active: true, startMs } });
    console.debug('[bg] recordingState saved to storage, startMs:', startMs);
    console.debug('[bg] isRecording:', isRecording);
  } catch (err) {
    console.error('[bg] RECORDING_START error:', err);
  }
}

// ─── Handler: RECORDING_STOP ──────────────────────────────────────────────────

async function handleRecordingStop(): Promise<void> {
  console.debug('[bg] RECORDING_STOP received');

  try {
    // Tell offscreen to stop MediaRecorder (will fire onstop → AUDIO_BLOB_READY)
    await chrome.runtime.sendMessage({ type: MSG.STOP_OFFSCREEN });
    console.debug('[bg] STOP_OFFSCREEN sent to offscreen');

    // Tell content script to flush speaker log
    if (activeTabId !== null) {
      try {
        await chrome.tabs.sendMessage(activeTabId, { type: MSG.RECORDING_STOPPED });
        console.debug('[bg] RECORDING_STOPPED sent to content script');
      } catch (err) {
        console.warn('[bg] Could not send RECORDING_STOPPED to tab:', err);
      }
    }

    isRecording = false;
    await chrome.storage.local.remove('recordingState');
    console.debug('[bg] recordingState cleared from storage');
    console.debug('[bg] isRecording:', isRecording);
  } catch (err) {
    console.error('[bg] RECORDING_STOP error:', err);
  }
}

// ─── Handler: AUDIO_BLOB_READY ────────────────────────────────────────────────

async function handleAudioBlobReady(msg: AudioBlobReadyMessage): Promise<void> {
  console.debug('[bg] AUDIO_BLOB_READY received, base64 length:', msg.payload.audioBase64.length,
    '| mimeType:', msg.payload.audioMimeType,
    '| recordingStartMs:', msg.payload.recordingStartMs);

  pendingAudio = {
    audioBase64:      msg.payload.audioBase64,
    audioMimeType:    msg.payload.audioMimeType,
    recordingStartMs: msg.payload.recordingStartMs,
  };

  // Close the offscreen document — it's no longer needed
  try {
    await chrome.offscreen.closeDocument();
    console.debug('[bg] offscreen document closed');
  } catch (err) {
    console.warn('[bg] Could not close offscreen document:', err);
  }

  await checkBothReady();
}

// ─── Handler: SPEAKER_LOG_READY ───────────────────────────────────────────────

async function handleSpeakerLogReady(msg: SpeakerLogReadyMessage): Promise<void> {
  console.debug('[bg] SPEAKER_LOG_READY received, entries:', msg.payload.log.log.length);
  pendingSpeakerLog = msg.payload.log;
  await checkBothReady();
}

// ─── Handler: MEETING_ENDED ───────────────────────────────────────────────────

async function handleMeetingEnded(): Promise<void> {
  console.debug('[bg] MEETING_ENDED received — isRecording:', isRecording);
  if (isRecording) {
    console.debug('[bg] auto-stopping recording due to meeting end');
    await handleRecordingStop();
  }
}
