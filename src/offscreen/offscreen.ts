import { MSG } from '../shared/messages';
import type { StartOffscreenMessage } from '../shared/messages';

if (import.meta.env.DEV) console.log('[offscreen] document loaded');

// ─── State ──────────────────────────────────────────────────────────────────

let tabStream: MediaStream | null = null;
let micStream: MediaStream | null = null;
let audioCtx: AudioContext | null = null;
let mediaRecorder: MediaRecorder | null = null;
let chunks: BlobPart[] = [];
let recordingStartMs = 0;

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  console.debug('[offscreen] message received:', message.type);

  switch (message.type) {
    case MSG.START_OFFSCREEN:
      void handleStartOffscreen(message as StartOffscreenMessage);
      break;

    case MSG.STOP_OFFSCREEN:
      void handleStopOffscreen();
      break;

    default:
      // offscreen only handles its own messages — ignore others silently
      break;
  }
});

// ─── Handler: START_OFFSCREEN ─────────────────────────────────────────────────

async function handleStartOffscreen(msg: StartOffscreenMessage): Promise<void> {
  const { streamId } = msg.payload;
  console.debug('[offscreen] START_OFFSCREEN received, streamId:', streamId);

  try {
    // ── Step 1: Capture tab audio stream ──────────────────────────────────────
    const tabConstraints = {
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    } as MediaStreamConstraints;

    tabStream = await navigator.mediaDevices.getUserMedia(tabConstraints);
    console.debug('[offscreen] tab stream acquired, audio tracks:', tabStream.getAudioTracks().length);

    recordingStartMs = Date.now();
    console.debug('[offscreen] recordingStartMs:', recordingStartMs);

    // ── Step 2: Capture microphone stream (graceful degradation if denied) ────
    let micAcquired = false;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micAcquired = true;
      console.debug('[offscreen] mic stream acquired');
    } catch (err) {
      console.warn('[offscreen] mic permission denied, recording tab audio only:', err);
    }

    // ── Step 3: Web Audio API mix ─────────────────────────────────────────────
    audioCtx = new AudioContext();
    console.debug('[offscreen] AudioContext created, state:', audioCtx.state);

    const tabSource = audioCtx.createMediaStreamSource(tabStream);
    const destination = audioCtx.createMediaStreamDestination();

    // Tab audio → destination (for recording) AND → ctx.destination (so user hears the meeting)
    tabSource.connect(destination);
    tabSource.connect(audioCtx.destination);

    if (micAcquired && micStream) {
      const micSource = audioCtx.createMediaStreamSource(micStream);
      micSource.connect(destination);
      console.debug('[offscreen] mic source connected to destination');
    }

    const mixedStream = destination.stream;
    console.debug('[offscreen] mixed stream ready, audio tracks:', mixedStream.getAudioTracks().length);

    // ── Step 4: MediaRecorder ─────────────────────────────────────────────────
    chunks = [];
    const mimeType = 'audio/webm;codecs=opus';
    mediaRecorder = new MediaRecorder(mixedStream, { mimeType });
    console.debug('[offscreen] MediaRecorder created, mimeType:', mediaRecorder.mimeType);

    mediaRecorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
        console.debug('[offscreen] chunk received, size:', e.data.size, '| total chunks:', chunks.length);
      }
    };

    mediaRecorder.onerror = (e: Event) => {
      console.error('[offscreen] MediaRecorder error:', e);
    };

    mediaRecorder.onstop = () => {
      console.debug('[offscreen] onstop fired — total chunks:', chunks.length);
      const blob = new Blob(chunks, { type: mimeType });
      console.debug('[offscreen] assembled blob size:', blob.size, 'bytes');

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        // dataUrl = "data:audio/webm;codecs=opus;base64,<base64data>"
        const base64 = dataUrl.split(',')[1];
        console.debug('[offscreen] AUDIO_BLOB_READY sending, base64 length:', base64.length);

        chrome.runtime.sendMessage({
          type: MSG.AUDIO_BLOB_READY,
          payload: {
            audioBase64:      base64,
            audioMimeType:    blob.type,
            recordingStartMs,
          },
        });
      };
      reader.onerror = (err) => {
        console.error('[offscreen] FileReader error:', err);
      };
      reader.readAsDataURL(blob);
    };

    // Start recording — emit a chunk every second for low-latency failure recovery
    mediaRecorder.start(1000);
    console.debug('[offscreen] MediaRecorder started');
  } catch (err) {
    console.error('[offscreen] failed to start recording:', err);
    // Notify background of the failure so it can reset its state
    chrome.runtime.sendMessage({
      type: MSG.AUDIO_BLOB_READY,
      payload: {
        audioBase64:      '',
        audioMimeType:    '',
        recordingStartMs: 0,
      },
    });
  }
}

// ─── Handler: STOP_OFFSCREEN ──────────────────────────────────────────────────

async function handleStopOffscreen(): Promise<void> {
  console.debug('[offscreen] STOP_OFFSCREEN received');

  if (!mediaRecorder) {
    console.warn('[offscreen] STOP_OFFSCREEN: mediaRecorder is null, nothing to stop');
    return;
  }

  // Stop recorder — onstop will fire asynchronously and send AUDIO_BLOB_READY
  mediaRecorder.stop();
  console.debug('[offscreen] MediaRecorder stopped, waiting for onstop...');

  // Stop all tracks and release hardware
  tabStream?.getTracks().forEach(t => {
    t.stop();
    console.debug('[offscreen] tab track stopped:', t.kind, t.label);
  });

  micStream?.getTracks().forEach(t => {
    t.stop();
    console.debug('[offscreen] mic track stopped:', t.kind, t.label);
  });

  if (audioCtx) {
    await audioCtx.close();
    console.debug('[offscreen] AudioContext closed');
  }

  // Reset state
  tabStream     = null;
  micStream     = null;
  audioCtx      = null;
  mediaRecorder = null;
  chunks        = [];

  console.debug('[offscreen] streams and AudioContext cleaned up');
}
