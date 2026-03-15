import React, { useCallback, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { loadApiKeys, saveApiKeys } from '../shared/storage';

console.log('[options] page loaded');

type MicStatus = 'checking' | 'granted' | 'denied' | 'prompt';

function MicPermission() {
  const [status, setStatus] = useState<MicStatus>('checking');

  const checkPermission = useCallback(async () => {
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      setStatus(result.state as MicStatus);
      result.onchange = () => setStatus(result.state as MicStatus);
    } catch {
      // Fallback: try getUserMedia to check
      setStatus('prompt');
    }
  }, []);

  useEffect(() => { void checkPermission(); }, [checkPermission]);

  const requestMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setStatus('granted');
      console.log('[options] mic permission granted');
    } catch (err) {
      console.warn('[options] mic permission denied:', err);
      setStatus('denied');
    }
  };

  if (status === 'checking') return null;

  if (status === 'granted') {
    return (
      <div className="mb-6 p-3 rounded bg-green-50 border border-green-200">
        <p className="text-sm text-green-700 font-medium">Микрофон разрешён</p>
      </div>
    );
  }

  return (
    <div className="mb-6 p-3 rounded bg-amber-50 border border-amber-200">
      <p className="text-sm text-amber-800 font-medium mb-2">
        {status === 'denied'
          ? 'Доступ к микрофону заблокирован. Разрешите в настройках сайта.'
          : 'Для записи звонков нужен доступ к микрофону'}
      </p>
      {status !== 'denied' && (
        <button
          onClick={requestMic}
          className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-1.5 rounded text-sm transition-colors"
        >
          Разрешить микрофон
        </button>
      )}
    </div>
  );
}

function OptionsApp() {
  const [openaiKey, setOpenaiKey] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadApiKeys().then(keys => {
      if (keys) {
        setOpenaiKey(keys.openaiKey);
      }
    });
  }, []);

  const handleSave = async () => {
    await saveApiKeys({ openaiKey });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Transkribe — Настройки</h1>

      <MicPermission />

      <div className="mb-6">
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
        <p className="text-xs text-gray-400 mt-1">Используется для транскрипции (Whisper) и AI-резюме (GPT)</p>
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
