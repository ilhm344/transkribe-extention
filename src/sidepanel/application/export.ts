import type { PipelineResult } from '../../shared/types';

// ─── Time formatters ─────────────────────────────────────────────────────────

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatSrtTime(seconds: number): string {
  const h  = Math.floor(seconds / 3600);
  const m  = Math.floor((seconds % 3600) / 60);
  const s  = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

// ─── Format builders ─────────────────────────────────────────────────────────

export function toTxt(result: PipelineResult): string {
  const lines: string[] = [];

  lines.push('=== РЕЗЮМЕ ===');
  lines.push(result.summary);

  if (result.actionItems.length > 0) {
    lines.push('');
    lines.push('=== ACTION ITEMS ===');
    result.actionItems.forEach(item => lines.push(`• ${item}`));
  }

  lines.push('');
  lines.push('=== ТРАНСКРИПТ ===');
  result.diarized.forEach(seg => {
    lines.push(`[${formatTimestamp(seg.start)}] ${seg.speaker}: ${seg.text.trim()}`);
  });

  return lines.join('\n');
}

export function toSrt(result: PipelineResult): string {
  return result.diarized
    .map((seg, i) =>
      [
        String(i + 1),
        `${formatSrtTime(seg.start)} --> ${formatSrtTime(seg.end)}`,
        `${seg.speaker}: ${seg.text.trim()}`,
        '',
      ].join('\n'),
    )
    .join('\n');
}

export function toTelegram(result: PipelineResult): string {
  const lines: string[] = [];

  lines.push('📋 *Резюме встречи*');
  lines.push(result.summary);

  if (result.actionItems.length > 0) {
    lines.push('');
    lines.push('✅ *Action Items*');
    result.actionItems.forEach(item => lines.push(`• ${item}`));
  }

  lines.push('');
  lines.push('🎙 *Транскрипт*');
  result.diarized.forEach(seg => {
    lines.push(`[${formatTimestamp(seg.start)}] *${seg.speaker}*: ${seg.text.trim()}`);
  });

  return lines.join('\n');
}

// ─── Download helper ─────────────────────────────────────────────────────────

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  if (import.meta.env.DEV) console.log('[export] downloaded:', filename);
}
