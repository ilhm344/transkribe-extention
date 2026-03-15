import { MSG } from '../shared/messages';
import type { StartOffscreenMessage } from '../shared/messages';

// ─── Log helper: sends logs to background so they appear in service worker console ──
function log(...args: unknown[]) {
  console.log('[offscreen]', ...args);
  chrome.runtime.sendMessage({ type: MSG.OFFSCREEN_LOG, payload: { args } }).catch(() => {});
}

log('document loaded');

// ─── State ──────────────────────────────────────────────────────────────────

let tabStream: MediaStream | null = null;
let micStream: MediaStream | null = null;
let audioCtx: AudioContext | null = null;
let mediaRecorder: MediaRecorder | null = null;
let chunks: BlobPart[] = [];
let recordingStartMs = 0;
let totalBytesRecorded = 0;

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  switch (message.type) {
    case MSG.START_OFFSCREEN:
      void handleStartOffscreen(message as StartOffscreenMessage);
      break;

    case MSG.STOP_OFFSCREEN:
      void handleStopOffscreen();
      break;

    default:
      break;
  }
});

// ─── Handler: START_OFFSCREEN ─────────────────────────────────────────────────

async function handleStartOffscreen(msg: StartOffscreenMessage): Promise<void> {
  const { streamId } = msg.payload;
  log('START_OFFSCREEN received, streamId:', streamId);

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
    const tabTracks = tabStream.getAudioTracks();
    log('tab stream — tracks:', tabTracks.length,
      '| label:', tabTracks[0]?.label,
      '| enabled:', tabTracks[0]?.enabled,
      '| muted:', tabTracks[0]?.muted,
      '| readyState:', tabTracks[0]?.readyState);

    recordingStartMs = Date.now();
    totalBytesRecorded = 0;

    // ── Step 2: Capture microphone stream (graceful degradation if denied) ────
    let micAcquired = false;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micAcquired = true;
      const micTracks = micStream.getAudioTracks();
      log('✓ MIC ACQUIRED — tracks:', micTracks.length,
        '| label:', micTracks[0]?.label,
        '| enabled:', micTracks[0]?.enabled,
        '| muted:', micTracks[0]?.muted,
        '| readyState:', micTracks[0]?.readyState);
    } catch (err) {
      log('✗ MIC DENIED — recording tab audio only. Error:', String(err));
    }

    // ── Step 3: Web Audio API mix ─────────────────────────────────────────────
    audioCtx = new AudioContext();
    log('AudioContext — state:', audioCtx.state, '| sampleRate:', audioCtx.sampleRate);

    const tabSource = audioCtx.createMediaStreamSource(tabStream);
    const destination = audioCtx.createMediaStreamDestination();

    tabSource.connect(destination);
    tabSource.connect(audioCtx.destination);

    if (micAcquired && micStream) {
      const micSource = audioCtx.createMediaStreamSource(micStream);
      micSource.connect(destination);
      log('✓ mic connected to mix');
    } else {
      log('✗ NO mic in mix — only tab audio');
    }

    const mixedTracks = destination.stream.getAudioTracks();
    log('mixed stream — tracks:', mixedTracks.length,
      '| enabled:', mixedTracks[0]?.enabled,
      '| muted:', mixedTracks[0]?.muted);

    // ── Step 4: MediaRecorder ─────────────────────────────────────────────────
    chunks = [];
    const mimeType = 'audio/webm;codecs=opus';
    mediaRecorder = new MediaRecorder(destination.stream, { mimeType });

    mediaRecorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
        totalBytesRecorded += e.data.size;
        log('chunk #' + chunks.length,
          '| size:', e.data.size, 'B',
          '| total:', totalBytesRecorded, 'B',
          '| elapsed:', ((Date.now() - recordingStartMs) / 1000).toFixed(1), 's');
      }
    };

    mediaRecorder.onerror = (e: Event) => {
      log('MediaRecorder ERROR:', e);
    };

    mediaRecorder.onstop = () => {
      log('onstop — chunks:', chunks.length, '| total bytes:', totalBytesRecorded);
      const blob = new Blob(chunks, { type: mimeType });
      log('blob assembled — size:', blob.size, 'B ≈', (blob.size / 1024).toFixed(1), 'KB');

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(',')[1];
        log('→ sending AUDIO_BLOB_READY, base64 length:', base64.length);

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
        log('FileReader error:', err);
      };
      reader.readAsDataURL(blob);
    };

    mediaRecorder.start(1000);
    log('▶ RECORDING STARTED');
    log('=== SUMMARY: tab=✓ mic=' + (micAcquired ? '✓' : '✗') + ' ctx=' + audioCtx.state + ' ===');
  } catch (err) {
    log('FAILED to start recording:', String(err));
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
  log('STOP — duration:', ((Date.now() - recordingStartMs) / 1000).toFixed(1), 's',
    '| bytes:', totalBytesRecorded);

  if (!mediaRecorder) {
    log('no mediaRecorder to stop');
    return;
  }

  mediaRecorder.stop();

  tabStream?.getTracks().forEach(t => {
    log('stop tab track:', t.kind, t.label, '| enabled:', t.enabled, '| muted:', t.muted);
    t.stop();
  });

  micStream?.getTracks().forEach(t => {
    log('stop mic track:', t.kind, t.label, '| enabled:', t.enabled, '| muted:', t.muted);
    t.stop();
  });

  if (audioCtx) {
    await audioCtx.close();
    log('AudioContext closed');
  }

  tabStream     = null;
  micStream     = null;
  audioCtx      = null;
  mediaRecorder = null;
  log('cleanup complete');
}
