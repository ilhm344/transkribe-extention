import { MSG } from '../shared/messages';

if (import.meta.env.DEV) console.log('[popup] loaded');

const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLParagraphElement;
const settingsBtn = document.getElementById('settingsBtn') as HTMLButtonElement;

let isRecording = false;
let recordingStartMs = 0;
let timerInterval: ReturnType<typeof setInterval> | null = null;

// ─── Timer helpers ────────────────────────────────────────────────────────────

function startTimer(startMs: number): void {
  const timerEl = document.getElementById('timer') as HTMLElement;
  timerEl.classList.remove('hidden');
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startMs) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    timerEl.textContent = `${mm}:${ss}`;
  }, 1000);
  console.debug('[popup] timer started, startMs:', startMs);
}

function stopTimer(): void {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  const timerEl = document.getElementById('timer') as HTMLElement;
  timerEl.classList.add('hidden');
  timerEl.textContent = '00:00';
  console.debug('[popup] timer stopped');
}

// ─── UI state helpers ─────────────────────────────────────────────────────────

function setRecordingUI(): void {
  startBtn.textContent = 'Остановить запись';
  startBtn.classList.replace('bg-blue-500', 'bg-red-500');
  startBtn.classList.replace('hover:bg-blue-600', 'hover:bg-red-600');
  statusEl.textContent = 'Идёт запись...';
}

// ─── Restore state on popup open ──────────────────────────────────────────────

async function restoreState(): Promise<void> {
  const result = await chrome.storage.local.get('recordingState');
  const state = result.recordingState as { active: boolean; startMs: number } | undefined;
  console.debug('[popup] recordingState on open:', state);

  if (state?.active) {
    isRecording = true;
    recordingStartMs = state.startMs;
    setRecordingUI();
    startTimer(recordingStartMs);
    console.debug('[popup] UI restored, isRecording:', isRecording);
  }
}

void restoreState();

// ─── Button handler ───────────────────────────────────────────────────────────

settingsBtn.addEventListener('click', () => {
  if (import.meta.env.DEV) console.log('[popup] opening options page');
  chrome.runtime.openOptionsPage();
});

startBtn.addEventListener('click', () => {
  console.debug('[popup] button clicked, isRecording:', isRecording);

  if (!isRecording) {
    chrome.runtime.sendMessage({ type: MSG.RECORDING_START });
    isRecording = true;
    recordingStartMs = Date.now();
    setRecordingUI();
    startTimer(recordingStartMs);
    console.debug('[popup] RECORDING_START sent');
  } else {
    chrome.runtime.sendMessage({ type: MSG.RECORDING_STOP });
    isRecording = false;
    recordingStartMs = 0;
    stopTimer();
    startBtn.textContent = 'Начать запись';
    startBtn.classList.replace('bg-red-500', 'bg-blue-500');
    startBtn.classList.replace('hover:bg-red-600', 'hover:bg-blue-600');
    statusEl.textContent = 'Запись остановлена';
    console.debug('[popup] RECORDING_STOP sent');
  }
});
