import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { API_BASE_URL } from '../lib/config';

interface ServerKeySettingsProps {
  onClose: () => void;
}

export function ServerKeySettings({ onClose }: ServerKeySettingsProps) {
  const { isAuthenticated } = useAuth();
  const [provider, setProvider] = useState<string>('openai');
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [stored, setStored] = useState<{ provider: string; maskedKey: string }[]>([]);

  async function loadStored() {
    const res = await fetch(`${API_BASE_URL}/api/llm-credentials`, { credentials: 'include' });
    if (res.ok) setStored((await res.json()).credentials ?? []);
  }

  useEffect(() => {
    if (isAuthenticated) loadStored().catch(() => setStored([]));
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-sm text-yellow-800">
          Please sign in with your wallet to save keys on the server.
        </p>
      </div>
    );
  }

  async function handleSave() {
    if (!apiKey.trim()) {
      setError('API key is required');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch(`${API_BASE_URL}/api/llm-credentials`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          provider,
          apiKey,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to save credential');
      }

      setSuccess(true);
      setApiKey('');
      await loadStored();
      setTimeout(() => {
        setSuccess(false);
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save credential');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="server-key-settings">
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="text-sm font-medium text-blue-900 mb-2">
          Server-Side Key Storage
        </h3>
        <p className="text-xs text-blue-800">
          Save your LLM API key encrypted on the server. It will be used automatically when you're signed in.
        </p>
      </div>

      <div>
        <label htmlFor="server-provider" className="block text-sm font-medium text-gray-700 mb-1">
          Provider
        </label>
        <select
          id="server-provider"
          data-testid="server-provider-select"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="openrouter">OpenRouter</option>
          <option value="groq">Groq</option>
          <option value="ollama">Ollama</option>
          <option value="mock">Mock (Testing)</option>
        </select>
      </div>

      <div>
        <label htmlFor="server-api-key" className="block text-sm font-medium text-gray-700 mb-1">
          API Key
        </label>
        <input
          id="server-api-key"
          data-testid="server-api-key-input"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {stored.length > 0 && (
        <ul className="text-xs text-gray-700" data-testid="stored-keys-list">
          {stored.map((c) => (
            <li key={c.provider} data-testid={`stored-key-${c.provider}`}>
              {c.provider}: {c.maskedKey}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg" data-testid="server-key-error">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg" data-testid="server-key-success">
          <p className="text-sm text-green-800">API key saved successfully!</p>
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button
          onClick={onClose}
          data-testid="server-key-cancel-button"
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          data-testid="server-key-save-button"
          disabled={isLoading}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Saving...' : 'Save to Server'}
        </button>
      </div>
    </div>
  );
}
