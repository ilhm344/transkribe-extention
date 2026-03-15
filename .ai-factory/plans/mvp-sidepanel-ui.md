# Plan: Sidepanel UI — pipeline integration + transcript/summary display

**Created:** 2026-03-14
**Mode:** Fast
**Milestone:** Sidepanel UI

## Settings

- **Testing:** No
- **Logging:** Verbose (DEV-only)
- **Docs:** No

## Context

`src/sidepanel/presentation/SidePanel.tsx` — placeholder, не загружает данные и не запускает pipeline.

**Зависимости (должны быть реализованы до):**
- `mvp-transcription.md`, `mvp-diarization.md`, `mvp-ai-summary.md` — весь pipeline должен работать.

**Состояния UI:**
- `idle` — ждём MeetingData (митинг ещё не завершён)
- `loading` — pipeline запущен
- `error` — ошибка pipeline
- `done` — показываем результат

**Структура файлов** (по ARCHITECTURE.md):
```
src/sidepanel/presentation/
├── SidePanel.tsx          ← главный компонент (изменить)
├── TranscriptView.tsx     ← создать
├── SummaryView.tsx        ← создать
└── ExportButton.tsx       ← создать
```

**Export форматы для MVP:**
- `.txt` — текстовый транскрипт `Speaker: text\n`
- `.srt` — субтитры с таймкодами

---

## Tasks

### Task 1: Реализовать TranscriptView

**File:** `src/sidepanel/presentation/TranscriptView.tsx` (создать)

**Deliverable:** Компонент отображает список `DiarizedSegment[]` с именем говорящего и текстом.

```tsx
import type { DiarizedSegment } from '../../shared/types';

interface Props { segments: DiarizedSegment[]; }

export function TranscriptView({ segments }: Props) {
  if (import.meta.env.DEV) console.log('[TranscriptView] rendered, segments:', segments.length);
  return (
    <div className="space-y-2">
      {segments.map((seg, i) => (
        <div key={i} className="text-sm">
          <span className="font-semibold text-blue-700">{seg.speaker}</span>
          <span className="text-gray-400 text-xs ml-2">{formatTime(seg.start)}</span>
          <p className="text-gray-800 mt-0.5">{seg.text}</p>
        </div>
      ))}
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
```

---

### Task 2: Реализовать SummaryView

**File:** `src/sidepanel/presentation/SummaryView.tsx` (создать)

**Deliverable:** Компонент отображает summary и список action items.

```tsx
interface Props { summary: string; actionItems: string[]; }

export function SummaryView({ summary, actionItems }: Props) {
  if (import.meta.env.DEV) console.log('[SummaryView] rendered');
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Резюме</h3>
        <p className="text-sm text-gray-800 leading-relaxed">{summary}</p>
      </div>
      {actionItems.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Action Items</h3>
          <ul className="list-disc list-inside space-y-1">
            {actionItems.map((item, i) => (
              <li key={i} className="text-sm text-gray-800">{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

---

### Task 3: Реализовать ExportButton

**File:** `src/sidepanel/presentation/ExportButton.tsx` (создать)

**Deliverable:** Компонент с двумя кнопками: экспорт в `.txt` и `.srt`.

```tsx
import type { DiarizedSegment } from '../../shared/types';

interface Props { segments: DiarizedSegment[]; }

export function ExportButton({ segments }: Props) {
  const exportTxt = () => {
    if (import.meta.env.DEV) console.log('[ExportButton] exporting .txt');
    const text = segments.map(s => `[${s.speaker}]: ${s.text}`).join('\n');
    download('transcript.txt', text, 'text/plain');
  };

  const exportSrt = () => {
    if (import.meta.env.DEV) console.log('[ExportButton] exporting .srt');
    const srt = segments.map((s, i) => {
      return `${i + 1}\n${toSrtTime(s.start)} --> ${toSrtTime(s.end)}\n${s.speaker}: ${s.text}\n`;
    }).join('\n');
    download('transcript.srt', srt, 'text/plain');
  };

  return (
    <div className="flex gap-2">
      <button onClick={exportTxt} className="text-xs border border-gray-300 rounded px-3 py-1 hover:bg-gray-50">
        Скачать .txt
      </button>
      <button onClick={exportSrt} className="text-xs border border-gray-300 rounded px-3 py-1 hover:bg-gray-50">
        Скачать .srt
      </button>
    </div>
  );
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function toSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  const ms = Math.round((seconds % 1) * 1000).toString().padStart(3, '0');
  return `${h}:${m}:${s},${ms}`;
}
```

---

### Task 4: Реализовать SidePanel — загрузка данных, pipeline, состояния

**File:** `src/sidepanel/presentation/SidePanel.tsx` (переписать)

**Deliverable:** Главный компонент загружает `MeetingData`, запускает `runPipeline`, управляет
состояниями `idle | loading | error | done` и рендерит дочерние компоненты.

```tsx
import React, { useEffect, useState } from 'react';
import { loadMeetingData } from '../../shared/storage';
import { runPipeline } from '../application/pipeline';
import type { PipelineResult } from '../../shared/types';
import { TranscriptView } from './TranscriptView';
import { SummaryView } from './SummaryView';
import { ExportButton } from './ExportButton';

type Status = 'idle' | 'loading' | 'error' | 'done';

export function SidePanel() {
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'transcript' | 'summary'>('summary');

  useEffect(() => {
    if (import.meta.env.DEV) console.log('[SidePanel] mounted, loading meeting data');
    loadMeetingData().then(data => {
      if (!data) {
        if (import.meta.env.DEV) console.log('[SidePanel] no meeting data yet');
        return;
      }
      if (import.meta.env.DEV) console.log('[SidePanel] meeting data loaded, starting pipeline');
      setStatus('loading');
      runPipeline(data)
        .then(r => {
          if (import.meta.env.DEV) console.log('[SidePanel] pipeline done');
          setResult(r);
          setStatus('done');
        })
        .catch(err => {
          console.error('[SidePanel] pipeline error:', err);
          setError(err instanceof Error ? err.message : String(err));
          setStatus('error');
        });
    });
  }, []);

  return (
    <div className="p-4 min-h-screen bg-white font-sans">
      <h1 className="text-lg font-bold text-gray-900 mb-4">Transkribe</h1>

      {status === 'idle' && (
        <p className="text-sm text-gray-400">Запись ещё не завершена.</p>
      )}

      {status === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="animate-spin inline-block w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />
          Обрабатываем запись…
        </div>
      )}

      {status === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
          <strong>Ошибка:</strong> {error}
        </div>
      )}

      {status === 'done' && result && (
        <div className="space-y-4">
          {/* Tabs */}
          <div className="flex gap-2 border-b border-gray-200 pb-2">
            {(['summary', 'transcript'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`text-sm px-3 py-1 rounded-t ${activeTab === tab ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {tab === 'summary' ? 'Резюме' : 'Транскрипт'}
              </button>
            ))}
          </div>

          {activeTab === 'summary' && (
            <SummaryView summary={result.summary} actionItems={result.actionItems} />
          )}
          {activeTab === 'transcript' && (
            <TranscriptView segments={result.diarized} />
          )}

          <ExportButton segments={result.diarized} />
        </div>
      )}
    </div>
  );
}
```

**Log:**
- `[SidePanel] mounted, loading meeting data`
- `[SidePanel] no meeting data yet` (если данных нет)
- `[SidePanel] meeting data loaded, starting pipeline`
- `[SidePanel] pipeline done`
- `[SidePanel] pipeline error: <msg>`

---

## Commit

```
feat(sidepanel): implement full pipeline UI — transcript, summary, export
```
