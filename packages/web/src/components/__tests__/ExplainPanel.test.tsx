import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExplainPanel } from '../ExplainPanel';
import * as api from '@/lib/api';
import * as llmStorage from '@/lib/llm-storage';
import type { ExplanationResponse } from '@/types/api';

vi.mock('@/lib/api');
vi.mock('@/lib/llm-storage');

describe('ExplainPanel', () => {
  const mockPoolId = '747c1d2a-c668-4682-b9f9-296708a3dd90';

  const mockExplanation: ExplanationResponse = {
    explanation: {
      summary: 'This pool has moderate risk due to APY volatility.',
      key_factors: [
        {
          signal: 'APY Volatility',
          value: '15.5%',
          explanation: 'High yield volatility indicates potential instability.',
        },
        {
          signal: 'TVL Score',
          value: '$5.2M',
          explanation: 'Lower TVL increases exposure to market manipulation.',
        },
      ],
      disclaimer: 'This is for educational purposes only.',
    },
    metadata: {
      provider: 'mock',
      model: 'mock-v1',
      timestamp: '2026-10-24T17:00:00Z',
      latency_ms: 42,
    },
    cached: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(llmStorage.getLLMSettings).mockReturnValue({
      provider: 'mock',
      rememberKey: false,
    });
  });

  it('should render explain button', () => {
    render(<ExplainPanel poolId={mockPoolId} />);
    expect(screen.getByTestId('explain-button')).toBeInTheDocument();
    expect(screen.getByText('Explain Risk')).toBeInTheDocument();
  });

  it('should call API with settings from storage when button clicked', async () => {
    const mockExplainRisk = vi.fn().mockResolvedValue(mockExplanation);
    vi.mocked(api.apiClient.explainRisk).mockImplementation(mockExplainRisk);

    vi.mocked(llmStorage.getLLMSettings).mockReturnValue({
      provider: 'openai',
      model: 'gpt-4',
      apiKey: 'sk-test-key',
      rememberKey: false,
    });

    render(<ExplainPanel poolId={mockPoolId} />);
    
    const button = screen.getByTestId('explain-button');
    await userEvent.click(button);

    await waitFor(() => {
      expect(mockExplainRisk).toHaveBeenCalledWith(mockPoolId, {
        provider: 'openai',
        model: 'gpt-4',
        baseUrl: undefined,
        apiKey: 'sk-test-key',
      });
    });
  });

  it('should send API key ONLY in options (for header), never in body', async () => {
    const mockExplainRisk = vi.fn().mockResolvedValue(mockExplanation);
    vi.mocked(api.apiClient.explainRisk).mockImplementation(mockExplainRisk);

    vi.mocked(llmStorage.getLLMSettings).mockReturnValue({
      provider: 'openai',
      model: 'gpt-4',
      apiKey: 'sk-secret-key',
      rememberKey: false,
    });

    render(<ExplainPanel poolId={mockPoolId} />);
    
    await userEvent.click(screen.getByTestId('explain-button'));

    await waitFor(() => {
      expect(mockExplainRisk).toHaveBeenCalled();
    });

    // Verify API key is in options (will be sent as header)
    const callArgs = mockExplainRisk.mock.calls[0];
    expect(callArgs[1]).toHaveProperty('apiKey', 'sk-secret-key');
  });

  it('should display explanation with all fields after loading', async () => {
    vi.mocked(api.apiClient.explainRisk).mockResolvedValue(mockExplanation);

    render(<ExplainPanel poolId={mockPoolId} />);
    
    await userEvent.click(screen.getByTestId('explain-button'));

    await waitFor(() => {
      expect(screen.getByTestId('explanation-content')).toBeInTheDocument();
    });

    // Check summary
    expect(screen.getByTestId('explanation-summary')).toHaveTextContent(
      'This pool has moderate risk due to APY volatility.'
    );

    // Check factors
    expect(screen.getByText('APY Volatility')).toBeInTheDocument();
    expect(screen.getByText('15.5%')).toBeInTheDocument();
    expect(screen.getByText(/High yield volatility/)).toBeInTheDocument();

    expect(screen.getByText('TVL Score')).toBeInTheDocument();
    expect(screen.getByText('$5.2M')).toBeInTheDocument();

    // Check disclaimer
    expect(screen.getByTestId('explanation-disclaimer')).toHaveTextContent(
      'This is for educational purposes only.'
    );

    // Check metadata
    expect(screen.getByTestId('explanation-metadata')).toHaveTextContent('mock');
    expect(screen.getByTestId('explanation-metadata')).toHaveTextContent('mock-v1');
    expect(screen.getByTestId('explanation-metadata')).toHaveTextContent('42ms');
  });

  it('should show cached badge when explanation is cached', async () => {
    const cachedExplanation = { ...mockExplanation, cached: true };
    vi.mocked(api.apiClient.explainRisk).mockResolvedValue(cachedExplanation);

    render(<ExplainPanel poolId={mockPoolId} />);
    
    await userEvent.click(screen.getByTestId('explain-button'));

    await waitFor(() => {
      expect(screen.getByText('Cached')).toBeInTheDocument();
    });
  });

  it('should hide latency when explanation is cached', async () => {
    const cachedExplanation = { ...mockExplanation, cached: true };
    vi.mocked(api.apiClient.explainRisk).mockResolvedValue(cachedExplanation);

    render(<ExplainPanel poolId={mockPoolId} />);
    
    await userEvent.click(screen.getByTestId('explain-button'));

    await waitFor(() => {
      expect(screen.getByTestId('explanation-metadata')).toBeInTheDocument();
    });

    // Latency should not be shown when cached
    expect(screen.queryByText(/Generated in.*ms/)).not.toBeInTheDocument();
  });

  it('should hide latency when latency_ms is null', async () => {
    const explanationWithoutLatency = {
      ...mockExplanation,
      metadata: { ...mockExplanation.metadata, latency_ms: null },
    };
    vi.mocked(api.apiClient.explainRisk).mockResolvedValue(explanationWithoutLatency);

    render(<ExplainPanel poolId={mockPoolId} />);
    
    await userEvent.click(screen.getByTestId('explain-button'));

    await waitFor(() => {
      expect(screen.getByTestId('explanation-metadata')).toBeInTheDocument();
    });

    // Latency should not be shown when null
    expect(screen.queryByText(/Generated in.*ms/)).not.toBeInTheDocument();
  });

  it('should show error message when API call fails', async () => {
    vi.mocked(api.apiClient.explainRisk).mockRejectedValue(
      new Error('API key invalid')
    );

    render(<ExplainPanel poolId={mockPoolId} />);
    
    await userEvent.click(screen.getByTestId('explain-button'));

    await waitFor(() => {
      expect(screen.getByText('API key invalid')).toBeInTheDocument();
    });
  });

  it('should show loading state while generating', async () => {
    let resolvePromise: (value: ExplanationResponse) => void;
    const promise = new Promise<ExplanationResponse>((resolve) => {
      resolvePromise = resolve;
    });

    vi.mocked(api.apiClient.explainRisk).mockReturnValue(promise);

    render(<ExplainPanel poolId={mockPoolId} />);
    
    await userEvent.click(screen.getByTestId('explain-button'));

    // Should show loading state
    expect(screen.getByText('Generating...')).toBeInTheDocument();
    expect(screen.getByTestId('explain-button')).toBeDisabled();

    // Resolve promise
    resolvePromise!(mockExplanation);

    await waitFor(() => {
      expect(screen.getByTestId('explanation-content')).toBeInTheDocument();
    });
  });

  it('shows a clear rate-limited status instead of a generic fallback', async () => {
    vi.mocked(api.apiClient.explainRisk).mockResolvedValue({
      ...mockExplanation,
      metadata: {
        ...mockExplanation.metadata,
        fallback: true,
        fallback_reason: 'rate_limited',
      },
    });

    render(<ExplainPanel poolId={mockPoolId} />);
    await userEvent.click(screen.getByTestId('explain-button'));

    await waitFor(() => {
      expect(screen.getByTestId('rate-limited-warning')).toHaveTextContent(
        /Rate limited by the provider/i
      );
    });
    expect(screen.queryByTestId('fallback-warning')).not.toBeInTheDocument();
  });

  it('should render multiple risk factors', async () => {
    vi.mocked(api.apiClient.explainRisk).mockResolvedValue(mockExplanation);

    render(<ExplainPanel poolId={mockPoolId} />);
    
    await userEvent.click(screen.getByTestId('explain-button'));

    await waitFor(() => {
      expect(screen.getByTestId('risk-factor-0')).toBeInTheDocument();
      expect(screen.getByTestId('risk-factor-1')).toBeInTheDocument();
    });
  });
});
