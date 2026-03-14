import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { loadApiKeys, saveApiKeys } from '../shared/storage';

if (import.meta.env.DEV) console.log('[options] page loaded');

function OptionsApp() {
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadApiKeys().then(keys => {
      if (keys) {
        setOpenaiKey(keys.openaiKey);
        setAnthropicKey(keys.anthropicKey);
        if (import.meta.env.DEV) console.log('[options] loaded existing API keys');
      }
    });
  }, []);

  const handleSave = async () => {
    if (import.meta.env.DEV) console.log('[options] saving API keys');
    await saveApiKeys({ openaiKey, anthropicKey });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Transkribe — Настройки</h1>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          OpenAI API Key
        </label>
        <input
          type="password"
          value={openaiKey}
          onChange={e => setOpenaiKey(e.target.value)}
          placeholder="sk-..."
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-400 mt-1">Используется для транскрипции через Whisper API</p>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Anthropic API Key
        </label>
        <input
          type="password"
          value={anthropicKey}
          onChange={e => setAnthropicKey(e.target.value)}
          placeholder="sk-ant-..."
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-400 mt-1">Используется для AI-резюме через Claude API</p>
      </div>

      <button
        onClick={handleSave}
        className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded transition-colors"
      >
        {saved ? 'Сохранено ✓' : 'Сохранить'}
      </button>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <OptionsApp />
  </React.StrictMode>
);
