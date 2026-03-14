import { MSG } from '../shared/messages';

if (import.meta.env.DEV) console.log('[popup] loaded');

const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLParagraphElement;

let isRecording = false;

startBtn.addEventListener('click', () => {
  if (import.meta.env.DEV) {
    console.log('[popup] button clicked, isRecording:', isRecording);
  }

  if (!isRecording) {
    // TODO: implement actual recording start in Audio Recording milestone
    chrome.runtime.sendMessage({ type: MSG.RECORDING_START });
    isRecording = true;
    startBtn.textContent = 'Остановить запись';
    startBtn.classList.replace('bg-blue-500', 'bg-red-500');
    startBtn.classList.replace('hover:bg-blue-600', 'hover:bg-red-600');
    statusEl.textContent = 'Запись... (не реализовано)';
    if (import.meta.env.DEV) console.log('[popup] RECORDING_START sent');
  } else {
    chrome.runtime.sendMessage({ type: MSG.RECORDING_STOP });
    isRecording = false;
    startBtn.textContent = 'Начать запись';
    startBtn.classList.replace('bg-red-500', 'bg-blue-500');
    startBtn.classList.replace('hover:bg-red-600', 'hover:bg-blue-600');
    statusEl.textContent = 'Запись остановлена';
    if (import.meta.env.DEV) console.log('[popup] RECORDING_STOP sent');
  }
});
