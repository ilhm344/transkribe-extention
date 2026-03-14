import React from 'react';

/**
 * Root sidepanel UI component.
 * TODO: implement full pipeline UI in Sidepanel UI milestone:
 *   - load MeetingData from chrome.storage.local
 *   - trigger runPipeline() from application layer
 *   - render TranscriptView, SummaryView, ExportButton
 */
export function SidePanel() {
  if (import.meta.env.DEV) console.log('[SidePanel] rendered');

  return (
    <div className="p-4 min-h-screen bg-white">
      <h1 className="text-xl font-bold mb-4 text-gray-900">Transkribe</h1>
      <p className="text-gray-500 text-sm">
        После завершения митинга здесь появятся транскрипт и резюме.
      </p>
      {/* TODO: TranscriptView, SummaryView, ExportButton */}
    </div>
  );
}
