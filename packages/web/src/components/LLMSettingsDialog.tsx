import { useState, useEffect } from 'react';
import { ServerKeySettings } from './ServerKeySettings';
import type { LLMProvider, LLMSettings } from '@/types/api';
import {
  getLLMSettings,
  saveLLMSettings,
  getDefaultModelForProvider,
  getDefaultBaseUrlForProvider,
  providerRequiresApiKey,
} from '@/lib/llm-storage';
import { apiClient } from '@/lib/api';

interface LLMSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LLMSettingsDialog({ isOpen, onClose }: LLMSettingsDialogProps) {
  const [settings, setSettings] = useState<LLMSettings>(getLLMSettings());
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setSettings(getLLMSettings());
      setTestStatus('idle');
      setTestError('');
    }
  }, [isOpen]);

  const handleProviderChange = (provider: LLMProvider) => {
    setSettings({
      ...settings,
      provider,
      model: getDefaultModelForProvider(provider),
      baseUrl: getDefaultBaseUrlForProvider(provider),
    });
  };

  const handleSave = () => {
    saveLLMSettings(settings);
    onClose();
  };

  const handleTestConnection = async () => {
    setTestStatus('testing');
    setTestError('');

    try {
      const result = await apiClient.validateLlm({
        provider: settings.provider,
        model: settings.model,
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
      });

      if (result.ok === false) {
        setTestStatus('error');
        setTestError(result.message || result.error || 'Connection test failed');
        return;
      }

      setTestStatus('success');
      setTimeout(() => setTestStatus('idle'), 3000);
    } catch (err) {
      setTestStatus('error');
      setTestError(err instanceof Error ? err.message : 'Connection test failed');
    }
  };

  if (!isOpen) return null;

  const requiresKey = providerRequiresApiKey(settings.provider);

  return (
    <div
      className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50"
      onClick={onClose}
      data-testid="llm-settings-dialog"
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">LLM Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
            data-testid="close-dialog"
          >
            <span className="sr-only">Close</span>
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          {/* Provider Selection */}
          <div>
            <label htmlFor="provider" className="block text-sm font-medium text-gray-700 mb-1">
              Provider
            </label>
            <select
              id="provider"
              value={settings.provider}
              onChange={(e) => handleProviderChange(e.target.value as LLMProvider)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              data-testid="provider-select"
            >
              <option value="mock">Mock (Demo)</option>
              <option value="openai">OpenAI</option>
              <option value="openrouter">OpenRouter</option>
              <option value="groq">Groq</option>
              <option value="ollama">Ollama (Local)</option>
            </select>
          </div>

          {/* Model */}
          <div>
            <label htmlFor="model" className="block text-sm font-medium text-gray-700 mb-1">
              Model
            </label>
            <input
              id="model"
              type="text"
              value={settings.model || ''}
              maxLength={100}
              onChange={(e) => setSettings({ ...settings, model: e.target.value.slice(0, 100) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              placeholder="e.g., gpt-4o-mini"
              data-testid="model-input"
            />
          </div>

          {/* Base URL (for Ollama or custom endpoints) */}
          {(settings.provider === 'ollama' || settings.baseUrl) && (
            <div>
              <label htmlFor="baseUrl" className="block text-sm font-medium text-gray-700 mb-1">
                Base URL
              </label>
              <input
                id="baseUrl"
                type="text"
                value={settings.baseUrl || ''}
                onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                placeholder="e.g., http://localhost:11434/v1"
                data-testid="base-url-input"
              />
            </div>
          )}

          {/* API Key */}
          {requiresKey && (
            <div>
              <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 mb-1">
                API Key
              </label>
              <input
                id="apiKey"
                type="password"
                value={settings.apiKey || ''}
                onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                placeholder="Your API key"
                data-testid="api-key-input"
              />
              <p className="mt-1 text-xs text-gray-500">
                Keys are stored locally and sent only in the X-LLM-Api-Key header.
              </p>
            </div>
          )}

          {/* Remember Key Checkbox */}
          {requiresKey && (
            <div className="flex items-start">
              <input
                id="rememberKey"
                type="checkbox"
                checked={settings.rememberKey}
                onChange={(e) => setSettings({ ...settings, rememberKey: e.target.checked })}
                className="h-4 w-4 mt-0.5 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                data-testid="remember-key-checkbox"
              />
              <label htmlFor="rememberKey" className="ml-2 block text-sm text-gray-700">
                Remember on this device
              </label>
            </div>
          )}

          {settings.rememberKey && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
              <p className="text-xs text-yellow-800">
                <strong>Warning:</strong> Your API key will be stored in localStorage and persist across browser sessions.
                Only enable this on trusted devices.
              </p>
            </div>
          )}

          {/* Test Connection Button */}
          <button
            onClick={handleTestConnection}
            disabled={testStatus === 'testing' || (requiresKey && !settings.apiKey)}
            className="w-full px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="test-connection-button"
          >
            {testStatus === 'testing' && 'Testing...'}
            {testStatus === 'success' && '✓ Connection successful'}
            {testStatus === 'error' && '✗ Connection failed'}
            {testStatus === 'idle' && 'Test Connection'}
          </button>

          {testStatus === 'error' && (
            <p className="text-sm text-red-600" data-testid="test-error">
              {testError || 'Connection test failed'}
            </p>
          )}
          <ServerKeySettings onClose={onClose} />
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            data-testid="save-settings-button"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
