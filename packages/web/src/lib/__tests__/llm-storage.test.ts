import { describe, it, expect, beforeEach } from 'vitest';
import {
  getLLMSettings,
  saveLLMSettings,
  clearLLMSettings,
  getDefaultModelForProvider,
  providerRequiresApiKey,
} from '../llm-storage';
import type { LLMSettings } from '@/types/api';

describe('llm-storage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('getLLMSettings', () => {
    it('should return default settings when storage is empty', () => {
      const settings = getLLMSettings();
      expect(settings.provider).toBe('mock');
      expect(settings.rememberKey).toBe(false);
    });

    it('should load from sessionStorage when available', () => {
      const testSettings = {
        provider: 'openai',
        model: 'gpt-4',
        apiKey: 'test-key',
      };
      sessionStorage.setItem('llm-settings', JSON.stringify(testSettings));

      const settings = getLLMSettings();
      expect(settings.provider).toBe('openai');
      expect(settings.model).toBe('gpt-4');
      expect(settings.apiKey).toBe('test-key');
      expect(settings.rememberKey).toBe(false);
    });

    it('should prefer localStorage over sessionStorage', () => {
      sessionStorage.setItem(
        'llm-settings',
        JSON.stringify({ provider: 'openai' })
      );
      localStorage.setItem(
        'llm-settings-persistent',
        JSON.stringify({ provider: 'groq' })
      );

      const settings = getLLMSettings();
      expect(settings.provider).toBe('groq');
      expect(settings.rememberKey).toBe(true);
    });

    it('should handle corrupted data gracefully', () => {
      sessionStorage.setItem('llm-settings', 'invalid json');

      const settings = getLLMSettings();
      expect(settings.provider).toBe('mock');
    });
  });

  describe('saveLLMSettings', () => {
    it('should save to sessionStorage when rememberKey is false', () => {
      const settings: LLMSettings = {
        provider: 'openai',
        model: 'gpt-4',
        apiKey: 'sk-test',
        rememberKey: false,
      };

      saveLLMSettings(settings);

      const stored = sessionStorage.getItem('llm-settings');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed.provider).toBe('openai');
      expect(parsed.apiKey).toBe('sk-test');

      // Should not be in localStorage
      expect(localStorage.getItem('llm-settings-persistent')).toBeNull();
    });

    it('should save to localStorage when rememberKey is true', () => {
      const settings: LLMSettings = {
        provider: 'groq',
        model: 'llama-3',
        apiKey: 'gsk-test',
        rememberKey: true,
      };

      saveLLMSettings(settings);

      const stored = localStorage.getItem('llm-settings-persistent');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed.provider).toBe('groq');
      expect(parsed.apiKey).toBe('gsk-test');

      // Should clear sessionStorage
      expect(sessionStorage.getItem('llm-settings')).toBeNull();
    });

    it('should not store rememberKey flag in storage', () => {
      const settings: LLMSettings = {
        provider: 'openai',
        rememberKey: true,
      };

      saveLLMSettings(settings);

      const stored = localStorage.getItem('llm-settings-persistent');
      const parsed = JSON.parse(stored!);
      expect(parsed.rememberKey).toBeUndefined();
    });
  });

  describe('clearLLMSettings', () => {
    it('should clear both storages', () => {
      sessionStorage.setItem('llm-settings', JSON.stringify({ provider: 'openai' }));
      localStorage.setItem('llm-settings-persistent', JSON.stringify({ provider: 'groq' }));

      clearLLMSettings();

      expect(sessionStorage.getItem('llm-settings')).toBeNull();
      expect(localStorage.getItem('llm-settings-persistent')).toBeNull();
    });
  });

  describe('getDefaultModelForProvider', () => {
    it('should return correct default models', () => {
      expect(getDefaultModelForProvider('openai')).toBe('gpt-4o-mini');
      expect(getDefaultModelForProvider('openrouter')).toBe('openai/gpt-4o-mini');
      expect(getDefaultModelForProvider('groq')).toBe('openai/gpt-oss-120b');
      expect(getDefaultModelForProvider('ollama')).toBe('llama3.2');
      expect(getDefaultModelForProvider('mock')).toBe('mock-v1');
    });
  });

  describe('providerRequiresApiKey', () => {
    it('should return false for mock provider', () => {
      expect(providerRequiresApiKey('mock')).toBe(false);
    });

    it('should return true for real providers', () => {
      expect(providerRequiresApiKey('openai')).toBe(true);
      expect(providerRequiresApiKey('openrouter')).toBe(true);
      expect(providerRequiresApiKey('groq')).toBe(true);
      expect(providerRequiresApiKey('ollama')).toBe(true);
    });
  });
});
