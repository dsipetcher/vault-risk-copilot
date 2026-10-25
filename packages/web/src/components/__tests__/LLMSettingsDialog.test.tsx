import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// ServerKeySettings uses wagmi hooks (needs WagmiProvider); covered separately.
vi.mock('../ServerKeySettings', () => ({ ServerKeySettings: () => null }));
import { LLMSettingsDialog } from '../LLMSettingsDialog';
import * as llmStorage from '@/lib/llm-storage';

vi.mock('@/lib/llm-storage');
vi.mock('@/lib/api');

describe('LLMSettingsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    
    vi.mocked(llmStorage.getLLMSettings).mockReturnValue({
      provider: 'mock',
      rememberKey: false,
    });
  });

  it('should not render when isOpen is false', () => {
    render(<LLMSettingsDialog isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId('llm-settings-dialog')).not.toBeInTheDocument();
  });

  it('should render when isOpen is true', () => {
    render(<LLMSettingsDialog isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('llm-settings-dialog')).toBeInTheDocument();
    expect(screen.getByText('LLM Settings')).toBeInTheDocument();
  });

  it('should call onClose when close button clicked', async () => {
    const onClose = vi.fn();
    render(<LLMSettingsDialog isOpen={true} onClose={onClose} />);
    
    await userEvent.click(screen.getByTestId('close-dialog'));
    expect(onClose).toHaveBeenCalled();
  });

  it('should load settings from storage on open', () => {
    vi.mocked(llmStorage.providerRequiresApiKey).mockReturnValue(true);
    vi.mocked(llmStorage.getLLMSettings).mockReturnValue({
      provider: 'openai',
      model: 'gpt-4',
      apiKey: 'sk-test',
      rememberKey: false,
    });

    render(<LLMSettingsDialog isOpen={true} onClose={vi.fn()} />);
    
    expect(screen.getByTestId('provider-select')).toHaveValue('openai');
    expect(screen.getByTestId('model-input')).toHaveValue('gpt-4');
    expect(screen.getByTestId('api-key-input')).toHaveValue('sk-test');
  });

  it('should update model and baseUrl when provider changes', async () => {
    vi.mocked(llmStorage.getDefaultModelForProvider).mockImplementation((provider) => {
      if (provider === 'groq') return 'openai/gpt-oss-120b';
      return 'mock-v1';
    });
    
    vi.mocked(llmStorage.getDefaultBaseUrlForProvider).mockImplementation((provider) => {
      if (provider === 'groq') return 'https://api.groq.com/openai/v1';
      return undefined;
    });

    render(<LLMSettingsDialog isOpen={true} onClose={vi.fn()} />);
    
    const select = screen.getByTestId('provider-select');
    await userEvent.selectOptions(select, 'groq');

    expect(llmStorage.getDefaultModelForProvider).toHaveBeenCalledWith('groq');
    expect(llmStorage.getDefaultBaseUrlForProvider).toHaveBeenCalledWith('groq');
  });

  it('should show API key field for providers that require it', () => {
    vi.mocked(llmStorage.providerRequiresApiKey).mockReturnValue(true);
    vi.mocked(llmStorage.getLLMSettings).mockReturnValue({
      provider: 'openai',
      rememberKey: false,
    });

    render(<LLMSettingsDialog isOpen={true} onClose={vi.fn()} />);
    
    expect(screen.getByTestId('api-key-input')).toBeInTheDocument();
    expect(screen.getByTestId('remember-key-checkbox')).toBeInTheDocument();
  });

  it('should hide API key field for mock provider', () => {
    vi.mocked(llmStorage.providerRequiresApiKey).mockReturnValue(false);
    vi.mocked(llmStorage.getLLMSettings).mockReturnValue({
      provider: 'mock',
      rememberKey: false,
    });

    render(<LLMSettingsDialog isOpen={true} onClose={vi.fn()} />);
    
    expect(screen.queryByTestId('api-key-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('remember-key-checkbox')).not.toBeInTheDocument();
  });

  it('should show warning when rememberKey is enabled', async () => {
    vi.mocked(llmStorage.providerRequiresApiKey).mockReturnValue(true);
    vi.mocked(llmStorage.getLLMSettings).mockReturnValue({
      provider: 'openai',
      rememberKey: false,
    });

    render(<LLMSettingsDialog isOpen={true} onClose={vi.fn()} />);
    
    const checkbox = screen.getByTestId('remember-key-checkbox');
    await userEvent.click(checkbox);

    expect(screen.getByText(/Your API key will be stored in localStorage/)).toBeInTheDocument();
  });

  it('should save settings to storage when Save clicked', async () => {
    const mockSave = vi.fn();
    vi.mocked(llmStorage.saveLLMSettings).mockImplementation(mockSave);
    vi.mocked(llmStorage.providerRequiresApiKey).mockReturnValue(true);

    const onClose = vi.fn();
    render(<LLMSettingsDialog isOpen={true} onClose={onClose} />);
    
    // Change settings
    await userEvent.selectOptions(screen.getByTestId('provider-select'), 'openai');
    await userEvent.type(screen.getByTestId('model-input'), 'gpt-4');
    await userEvent.type(screen.getByTestId('api-key-input'), 'sk-test');
    await userEvent.click(screen.getByTestId('remember-key-checkbox'));

    // Save
    await userEvent.click(screen.getByTestId('save-settings-button'));

    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openai',
        rememberKey: true,
      })
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('should respect storage choice: sessionStorage when rememberKey is false', async () => {
    vi.mocked(llmStorage.providerRequiresApiKey).mockReturnValue(true);
    
    const mockSave = vi.fn((settings) => {
      if (settings.rememberKey) {
        localStorage.setItem('llm-settings-persistent', JSON.stringify(settings));
      } else {
        sessionStorage.setItem('llm-settings', JSON.stringify(settings));
      }
    });
    vi.mocked(llmStorage.saveLLMSettings).mockImplementation(mockSave);

    render(<LLMSettingsDialog isOpen={true} onClose={vi.fn()} />);
    
    await userEvent.type(screen.getByTestId('api-key-input'), 'sk-test');
    // rememberKey checkbox is NOT checked (default false)
    await userEvent.click(screen.getByTestId('save-settings-button'));

    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        rememberKey: false,
      })
    );
  });

  it('should respect storage choice: localStorage when rememberKey is true', async () => {
    vi.mocked(llmStorage.providerRequiresApiKey).mockReturnValue(true);
    
    const mockSave = vi.fn((settings) => {
      if (settings.rememberKey) {
        localStorage.setItem('llm-settings-persistent', JSON.stringify(settings));
      } else {
        sessionStorage.setItem('llm-settings', JSON.stringify(settings));
      }
    });
    vi.mocked(llmStorage.saveLLMSettings).mockImplementation(mockSave);

    render(<LLMSettingsDialog isOpen={true} onClose={vi.fn()} />);
    
    await userEvent.type(screen.getByTestId('api-key-input'), 'sk-test');
    await userEvent.click(screen.getByTestId('remember-key-checkbox'));
    await userEvent.click(screen.getByTestId('save-settings-button'));

    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        rememberKey: true,
      })
    );
  });

  it('should disable test connection when no API key provided', () => {
    vi.mocked(llmStorage.providerRequiresApiKey).mockReturnValue(true);
    vi.mocked(llmStorage.getLLMSettings).mockReturnValue({
      provider: 'openai',
      apiKey: '',
      rememberKey: false,
    });

    render(<LLMSettingsDialog isOpen={true} onClose={vi.fn()} />);
    
    expect(screen.getByTestId('test-connection-button')).toBeDisabled();
  });

  it('should show error state when test connection fails', async () => {
    vi.mocked(llmStorage.providerRequiresApiKey).mockReturnValue(false);
    
      const mockApi = await import('@/lib/api');
      vi.mocked(mockApi.apiClient.validateLlm).mockRejectedValue(
        new Error('Invalid API key')
      );

    render(<LLMSettingsDialog isOpen={true} onClose={vi.fn()} />);
    
    await userEvent.click(screen.getByTestId('test-connection-button'));

    await waitFor(() => {
      expect(screen.getByText('✗ Connection failed')).toBeInTheDocument();
      expect(screen.getByTestId('test-error')).toHaveTextContent('Invalid API key');
    });
  });
});
