import React, { useCallback, useEffect, useRef, useState } from 'react';
import { loadMeetingData } from '../../shared/storage';
import { MSG } from '../../shared/messages';
import { runPipeline } from '../application/pipeline';
import type { PipelineStep } from '../application/pipeline';
import { runExtractTasks } from '../application/tasks';
import { runFollowUpEmail } from '../application/followUp';
import { toTxt, toSrt, toTelegram, downloadFile } from '../application/export';
import type { PipelineResult, DiarizedSegment } from '../../shared/types';

// ─── Types ───────────────────────────────────────────────────────────────────

const MEETING_DOMAINS = ['meet.google.com', 'telemost.yandex.ru'];

type Status =
  | { state: 'idle' }
  | { state: 'meeting_active' }
  | { state: 'recording'; startMs: number }
  | { state: 'running'; step: PipelineStep }
  | { state: 'done'; result: PipelineResult }
  | { state: 'error'; message: string };

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STEP_LABELS: Record<PipelineStep, string> = {
  transcribing: 'Транскрибирование аудио...',
  diarizing:    'Диаризация по спикерам...',
  summarizing:  'Генерация резюме...',
};

const STEP_ORDER: PipelineStep[] = ['transcribing', 'diarizing', 'summarizing'];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Spinner({ step }: { step: PipelineStep }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-gray-600 font-medium">{STEP_LABELS[step]}</p>
      <div className="flex gap-2 mt-1">
        {STEP_ORDER.map(s => (
          <div
            key={s}
            className={`h-1.5 w-10 rounded-full transition-colors ${
              STEP_ORDER.indexOf(s) <= STEP_ORDER.indexOf(step)
                ? 'bg-blue-500'
                : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function ExportBar({ result }: { result: PipelineResult }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(toTelegram(result));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    if (import.meta.env.DEV) console.log('[SidePanel] copied Telegram format to clipboard');
  }

  return (
    <div className="flex gap-2 mb-4 flex-wrap">
      <button
        onClick={() => downloadFile(toTxt(result), 'transcript.txt', 'text/plain')}
        className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 active:bg-gray-100"
      >
        ↓ TXT
      </button>
      <button
        onClick={() => downloadFile(toSrt(result), 'transcript.srt', 'text/plain')}
        className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 active:bg-gray-100"
      >
        ↓ SRT
      </button>
      <button
        onClick={handleCopy}
        className={`text-xs px-3 py-1.5 rounded border transition-colors ${
          copied
            ? 'border-green-400 text-green-600 bg-green-50'
            : 'border-gray-300 text-gray-600 hover:bg-gray-50 active:bg-gray-100'
        }`}
      >
        {copied ? '✓ Скопировано' : '📋 Telegram'}
      </button>
    </div>
  );
}

function SummaryView({ result }: { result: PipelineResult }) {
  return (
    <div className="mb-4">
      <h2 className="text-sm font-semibold text-gray-700 mb-1">Резюме</h2>
      <p className="text-sm text-gray-800 leading-relaxed">{result.summary}</p>

      {result.actionItems.length > 0 && (
        <div className="mt-3">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Action Items</h2>
          <ul className="list-disc list-inside space-y-1">
            {result.actionItems.map((item, i) => (
              <li key={i} className="text-sm text-gray-800">{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TranscriptView({ result }: { result: PipelineResult }) {
  const [open, setOpen] = useState(false);
  const hasSpeakers = result.diarized.some(s => s.speaker !== 'Unknown');

  return (
    <div className="mb-4">
      <button
        className="w-full text-left text-sm font-semibold text-gray-700 flex justify-between items-center py-2 border-b border-gray-200"
        onClick={() => setOpen(v => !v)}
      >
        <span>
          Транскрипт ({result.diarized.length} фрагментов)
          {!hasSpeakers && (
            <span className="ml-2 text-xs font-normal text-amber-600">спикеры не определены</span>
          )}
        </span>
        <span className="text-gray-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-1 max-h-64 overflow-y-auto text-sm pr-1">
          {result.diarized.map((seg, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-gray-400 shrink-0 w-10">{formatTime(seg.start)}</span>
              {hasSpeakers && (
                <span className="font-medium text-blue-700 shrink-0 w-24 truncate">{seg.speaker}</span>
              )}
              <span className="text-gray-800">{seg.text.trim()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MeetingReadyBanner ───────────────────────────────────────────────────────

function MeetingReadyBanner() {
  const [starting, setStarting] = useState(false);

  async function handleStart() {
    console.log('[SidePanel] start recording clicked from sidepanel');
    setStarting(true);
    try {
      await chrome.runtime.sendMessage({ type: MSG.RECORDING_START });
    } catch (err) {
      console.error('[SidePanel] failed to send RECORDING_START:', err);
      setStarting(false);
    }
  }

  return (
    <div className="mt-8 flex flex-col items-center gap-4 text-center px-2">
      <div className="text-3xl">🎙</div>
      <p className="text-gray-700 font-medium">Встреча обнаружена</p>
      <p className="text-sm text-gray-500">Нажмите кнопку ниже чтобы начать запись звонка</p>
      <button
        onClick={handleStart}
        disabled={starting}
        className="mt-2 px-6 py-2.5 rounded-lg bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-semibold text-sm disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {starting ? 'Запуск...' : 'Начать запись'}
        {starting && (
          <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin ml-2 align-middle" />
        )}
      </button>
    </div>
  );
}

// ─── RecordingBanner ──────────────────────────────────────────────────────────

function RecordingBanner({ startMs }: { startMs: number }) {
  const [elapsed, setElapsed] = useState(Math.floor((Date.now() - startMs) / 1000));

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startMs) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [startMs]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  async function handleStop() {
    console.log('[SidePanel] stop recording clicked from sidepanel — elapsed:', elapsed, 's');
    try {
      await chrome.runtime.sendMessage({ type: MSG.RECORDING_STOP });
      // Open side panel (already open, but send stop to background)
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        void chrome.sidePanel.open({ tabId: tab.id });
      }
    } catch (err) {
      console.error('[SidePanel] failed to send RECORDING_STOP:', err);
    }
  }

  return (
    <div className="mt-8 flex flex-col items-center gap-4 text-center">
      <div className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
        <span className="text-gray-700 font-semibold">Запись идёт...</span>
      </div>
      <span className="text-3xl font-mono font-bold text-gray-800 tabular-nums">
        {mm}:{ss}
      </span>
      <button
        onClick={handleStop}
        className="px-6 py-2.5 rounded-lg bg-red-500 hover:bg-red-600 active:bg-red-700 text-white font-semibold text-sm transition-colors"
      >
        Остановить запись
      </button>
    </div>
  );
}

// ─── ActionButtons ────────────────────────────────────────────────────────────

type ActionState<T> =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'done'; result: T }
  | { state: 'error'; message: string };

function CopyButton({ text, label = '📋 Копировать' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={handleCopy}
      className={`text-xs px-3 py-1 rounded border transition-colors ${
        copied
          ? 'border-green-400 text-green-600 bg-green-50'
          : 'border-gray-300 text-gray-500 hover:bg-gray-50'
      }`}
    >
      {copied ? '✓ Скопировано' : label}
    </button>
  );
}

function InlineSpinner() {
  return (
    <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin ml-2 align-middle" />
  );
}

function ActionButtons({ diarized }: { diarized: DiarizedSegment[] }) {
  const [tasksState, setTasksState] = useState<ActionState<string[]>>({ state: 'idle' });
  const [emailState, setEmailState] = useState<ActionState<string>>({ state: 'idle' });

  async function handleExtractTasks() {
    console.log('[ActionButtons] extractTasks clicked — segments:', diarized.length);
    setTasksState({ state: 'loading' });
    try {
      const tasks = await runExtractTasks(diarized);
      console.log('[ActionButtons] extractTasks done — tasks:', tasks.length);
      setTasksState({ state: 'done', result: tasks });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[ActionButtons] extractTasks error:', message);
      setTasksState({ state: 'error', message });
    }
  }

  async function handleFollowUpEmail() {
    console.log('[ActionButtons] followUpEmail clicked — segments:', diarized.length);
    setEmailState({ state: 'loading' });
    try {
      const email = await runFollowUpEmail(diarized);
      console.log('[ActionButtons] followUpEmail done — chars:', email.length);
      setEmailState({ state: 'done', result: email });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[ActionButtons] followUpEmail error:', message);
      setEmailState({ state: 'error', message });
    }
  }

  return (
    <div className="mt-4 space-y-3">
      {/* ── Найти задачи ── */}
      <div>
        <button
          onClick={handleExtractTasks}
          disabled={tasksState.state === 'loading'}
          className="text-sm px-4 py-2 rounded bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-medium disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          Найти задачи
          {tasksState.state === 'loading' && <InlineSpinner />}
        </button>

        {tasksState.state === 'done' && (
          <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-600">
                Задачи ({tasksState.result.length})
              </span>
              <CopyButton text={tasksState.result.join('\n')} />
            </div>
            {tasksState.result.length === 0 ? (
              <p className="text-xs text-gray-400">Задачи не обнаружены</p>
            ) : (
              <ul className="space-y-1">
                {tasksState.result.map((task, i) => (
                  <li key={i} className="text-sm text-gray-800 flex gap-1.5">
                    <span className="text-gray-400 shrink-0">•</span>
                    <span>{task}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tasksState.state === 'error' && (
          <div className="mt-2 flex items-center gap-2">
            <p className="text-xs text-red-600">{tasksState.message}</p>
            <button
              onClick={handleExtractTasks}
              className="text-xs px-2 py-0.5 rounded bg-red-100 hover:bg-red-200 text-red-700"
            >
              Повторить
            </button>
          </div>
        )}
      </div>

      {/* ── Follow-up письмо ── */}
      <div>
        <button
          onClick={handleFollowUpEmail}
          disabled={emailState.state === 'loading'}
          className="text-sm px-4 py-2 rounded bg-gray-700 hover:bg-gray-800 active:bg-gray-900 text-white font-medium disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          Follow-up письмо
          {emailState.state === 'loading' && <InlineSpinner />}
        </button>

        {emailState.state === 'done' && (
          <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-600">Письмо клиенту</span>
              <CopyButton text={emailState.result} />
            </div>
            <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">
              {emailState.result}
            </pre>
          </div>
        )}

        {emailState.state === 'error' && (
          <div className="mt-2 flex items-center gap-2">
            <p className="text-xs text-red-600">{emailState.message}</p>
            <button
              onClick={handleFollowUpEmail}
              className="text-xs px-2 py-0.5 rounded bg-red-100 hover:bg-red-200 text-red-700"
            >
              Повторить
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Root component ──────────────────────────────────────────────────────────

export function SidePanel() {
  const [status, setStatus] = useState<Status>({ state: 'idle' });
  const [runKey, setRunKey] = useState(0);
  const cancelRef = useRef(false);

  const retry = useCallback(() => {
    cancelRef.current = false;
    setRunKey(k => k + 1);
  }, []);

  // Listen to storage changes: meetingData (triggers pipeline) + recordingState (sync recording UI)
  useEffect(() => {
    console.log('[SidePanel] mounted — listening for storage changes');
    function onStorageChanged(changes: Record<string, chrome.storage.StorageChange>) {
      if ('meetingData' in changes) {
        if (changes.meetingData.newValue) {
          const mb = (JSON.stringify(changes.meetingData.newValue).length / 1024 / 1024).toFixed(2);
          console.log('[SidePanel] meetingData appeared in storage (~' + mb + ' MB) → starting pipeline');
          cancelRef.current = false;
          setRunKey(k => k + 1);
        } else {
          console.log('[SidePanel] meetingData removed from storage');
        }
      }
      if ('recordingState' in changes) {
        if (changes.recordingState.newValue) {
          const { startMs } = changes.recordingState.newValue as { startMs: number };
          console.log('[SidePanel] recordingState appeared → recording state, startMs:', startMs);
          setStatus({ state: 'recording', startMs });
        } else {
          console.log('[SidePanel] recordingState removed → back to checking tab');
          // Recording stopped — pipeline will kick in via meetingData listener
          // Reset to idle for now; meetingData listener will trigger pipeline
          setStatus({ state: 'idle' });
        }
      }
    }
    chrome.storage.local.onChanged.addListener(onStorageChanged);
    return () => chrome.storage.local.onChanged.removeListener(onStorageChanged);
  }, []);

  useEffect(() => {
    cancelRef.current = false;

    async function start() {
      console.log('[SidePanel] run #' + runKey + ' — loading meeting data from storage');

      const data = await loadMeetingData();
      if (!data) {
        console.log('[SidePanel] no meeting data — checking recordingState and tab URL');

        // 1. Check if recording is already in progress
        const stored = await chrome.storage.local.get('recordingState');
        const recState = stored.recordingState as { active: boolean; startMs: number } | undefined;
        if (recState?.active) {
          const { startMs } = recState;
          console.log('[SidePanel] recording in progress (from storage), startMs:', startMs);
          setStatus({ state: 'recording', startMs });
          return;
        }

        // 2. Check if current tab is a meeting page
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          const url = tab?.url ?? '';
          const isMeeting = MEETING_DOMAINS.some(d => url.includes(d));
          console.log('[SidePanel] init — tab url:', url, '| isMeeting:', isMeeting);
          if (isMeeting) {
            console.log('[SidePanel] meeting_active — meeting URL detected');
            setStatus({ state: 'meeting_active' });
            return;
          }
        } catch (err) {
          console.warn('[SidePanel] could not query active tab:', err);
        }

        // 3. Fallback: idle
        console.log('[SidePanel] no meeting data found — showing idle state');
        setStatus({ state: 'idle' });
        return;
      }

      console.log('[SidePanel] meeting data loaded — platform:', data.platform,
        '| meetingId:', data.meetingId,
        '| audioBase64 length:', data.audioBase64.length,
        '| speakerLog entries:', data.speakerLog.log.length);

      if (cancelRef.current) return;
      console.log('[SidePanel] starting pipeline');

      try {
        setStatus({ state: 'running', step: 'transcribing' });
        const result = await runPipeline(data, step => {
          if (!cancelRef.current) setStatus({ state: 'running', step });
        });
        if (!cancelRef.current) setStatus({ state: 'done', result });
      } catch (err) {
        if (!cancelRef.current) {
          const message = err instanceof Error ? err.message : String(err);
          console.error('[SidePanel] pipeline error:', message);
          setStatus({ state: 'error', message });
        }
      }
    }

    void start();
    return () => { cancelRef.current = true; };
  }, [runKey]);

  return (
    <div className="p-4 min-h-screen bg-white">
      <h1 className="text-xl font-bold mb-4 text-gray-900">Transkribe</h1>

      {status.state === 'idle' && (
        <p className="text-gray-400 text-sm text-center mt-12">
          После завершения митинга здесь появятся транскрипт и резюме.
        </p>
      )}

      {status.state === 'meeting_active' && (
        <MeetingReadyBanner />
      )}

      {status.state === 'recording' && (
        <RecordingBanner startMs={status.startMs} />
      )}

      {status.state === 'running' && (
        <Spinner step={status.step} />
      )}

      {status.state === 'done' && (
        <>
          <ExportBar result={status.result} />
          <SummaryView result={status.result} />
          <TranscriptView result={status.result} />
          <ActionButtons diarized={status.result.diarized} />
        </>
      )}

      {status.state === 'error' && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3">
          <p className="text-sm font-semibold text-red-700 mb-1">Ошибка</p>
          <p className="text-sm text-red-600 mb-3">{status.message}</p>
          <button
            onClick={retry}
            className="text-xs px-3 py-1.5 rounded bg-red-100 hover:bg-red-200 text-red-700 font-medium"
          >
            Повторить
          </button>
          <button
            onClick={() => chrome.runtime.openOptionsPage()}
            className="ml-2 text-xs px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-600"
          >
            Настройки
          </button>
        </div>
      )}
    </div>
  );
}
