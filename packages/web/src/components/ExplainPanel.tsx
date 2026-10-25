import { useState } from 'react';
import { apiClient } from '@/lib/api';
import { getLLMSettings } from '@/lib/llm-storage';
import type { ExplanationResponse } from '@/types/api';
import { LoadingSpinner } from './LoadingSpinner';
import { ErrorMessage } from './ErrorMessage';

interface ExplainPanelProps {
  poolId: string;
}

function rateLimitedWarningText(summary: string): string {
  const match = summary.match(/Rate limited by the provider[^.]*(?:\.|$)/i);
  return match?.[0]?.trim() || 'Rate limited by the provider. Wait a moment and try again.';
}

export function ExplainPanel({ poolId }: ExplainPanelProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<ExplanationResponse | null>(null);

  const handleExplain = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const settings = getLLMSettings();
      
      const result = await apiClient.explainRisk(poolId, {
        provider: settings.provider,
        model: settings.model,
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
      });

      setExplanation(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate explanation');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-6" data-testid="explain-panel">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">AI Risk Explanation</h2>
        <button
          onClick={handleExplain}
          disabled={isLoading}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="explain-button"
        >
          {isLoading ? 'Generating...' : 'Explain Risk'}
        </button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      )}

      {error && (
        <ErrorMessage message={error} />
      )}

      {explanation && !isLoading && (
        <div className="space-y-6" data-testid="explanation-content">
          {/* Cached badge */}
          {explanation.cached && (
            <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              Cached
            </div>
          )}

          {/* Fallback warning */}
          {explanation.metadata.fallback && (
            <div
              className="bg-orange-50 border border-orange-200 rounded-md p-3"
              data-testid={
                explanation.metadata.fallback_reason === 'rate_limited'
                  ? 'rate-limited-warning'
                  : 'fallback-warning'
              }
            >
              <p className="text-sm text-orange-800">
                <strong>
                  {explanation.metadata.fallback_reason === 'rate_limited'
                    ? 'Rate limited:'
                    : '⚠️ Limited Analysis:'}
                </strong>{' '}
                {explanation.metadata.fallback_reason === 'rate_limited'
                  ? rateLimitedWarningText(explanation.explanation.summary)
                  : explanation.metadata.fallback_reason}
              </p>
            </div>
          )}

          {/* Summary */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Summary</h3>
            <p className="text-gray-900" data-testid="explanation-summary">
              {explanation.explanation.summary}
            </p>
          </div>

          {/* Key Factors */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Key Risk Factors</h3>
            <div className="space-y-4" data-testid="explanation-factors">
              {explanation.explanation.key_factors.map((factor, index) => (
                <div
                  key={index}
                  className="border-l-4 border-primary-500 pl-4 py-2"
                  data-testid={`risk-factor-${index}`}
                >
                  <div className="flex items-baseline justify-between mb-1">
                    <h4 className="text-sm font-semibold text-gray-900">
                      {factor.signal}
                    </h4>
                    <span className="text-sm text-gray-600 font-mono">
                      {factor.value}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">{factor.explanation}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Disclaimer */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
            <p className="text-sm text-yellow-800" data-testid="explanation-disclaimer">
              <strong>Disclaimer:</strong> {explanation.explanation.disclaimer}
            </p>
          </div>

          {/* Metadata */}
          <div className="text-xs text-gray-500 border-t pt-3" data-testid="explanation-metadata">
            <div className="flex items-center justify-between">
              <span>
                Provider: <strong>{explanation.metadata.provider}</strong>
                {explanation.metadata.model && ` • Model: ${explanation.metadata.model}`}
              </span>
              {!explanation.cached && explanation.metadata.latency_ms != null && (
                <span>Generated in {explanation.metadata.latency_ms}ms</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
