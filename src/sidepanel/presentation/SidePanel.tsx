import React, { useCallback, useEffect, useRef, useState } from 'react';
import { loadMeetingData } from '../../shared/storage';
import { runPipeline } from '../application/pipeline';
import type { PipelineStep } from '../application/pipeline';
import { toTxt, toSrt, toTelegram, downloadFile } from '../application/export';
import type { PipelineResult } from '../../shared/types';

// ─── Types ───────────────────────────────────────────────────────────────────

type Status =
  | { state: 'idle' }
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

// ─── Root component ──────────────────────────────────────────────────────────

export function SidePanel() {
  const [status, setStatus] = useState<Status>({ state: 'idle' });
  const [runKey, setRunKey] = useState(0);
  const cancelRef = useRef(false);

  const retry = useCallback(() => {
    cancelRef.current = false;
    setRunKey(k => k + 1);
  }, []);

  useEffect(() => {
    cancelRef.current = false;

    async function start() {
      if (import.meta.env.DEV) console.log('[SidePanel] run #' + runKey + ' — loading meeting data');

      const data = await loadMeetingData();
      if (!data) {
        if (import.meta.env.DEV) console.log('[SidePanel] no meeting data found');
        setStatus({ state: 'idle' });
        return;
      }

      if (cancelRef.current) return;
      if (import.meta.env.DEV) console.log('[SidePanel] starting pipeline');

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

      {status.state === 'running' && (
        <Spinner step={status.step} />
      )}

      {status.state === 'done' && (
        <>
          <ExportBar result={status.result} />
          <SummaryView result={status.result} />
          <TranscriptView result={status.result} />
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
