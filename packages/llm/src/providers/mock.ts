import type { LLMProvider } from '../types.js';
import type { RiskInput, ExplanationOutput } from '../schemas.js';

export class MockProvider implements LLMProvider {
  private readonly model = 'mock-v1';

  async generate(input: RiskInput): Promise<{
    output: ExplanationOutput;
    metadata: {
      model: string;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      latencyMs: number;
      costUsd: number;
    };
  }> {
    const startTime = Date.now();

    const poolNameSafe = this.sanitizeInput(input.pool_name);
    const protocolSafe = this.sanitizeInput(input.protocol);
    const chainSafe = this.sanitizeInput(input.chain);

    const summary = this.generateSummary(
      poolNameSafe,
      protocolSafe,
      chainSafe,
      input.total_risk_score,
      input.risk_category
    );

    const keyFactors = this.generateKeyFactors(input);

    const disclaimer =
      'This risk assessment is for educational purposes only and does not constitute financial advice. ' +
      'DeFi protocols carry inherent risks including smart contract vulnerabilities, market volatility, and potential loss of funds. ' +
      'Always conduct your own research before making investment decisions.';

    const latencyMs = Date.now() - startTime;

    const promptTokens = 150;
    const completionTokens = 200;

    return {
      output: {
        summary,
        key_factors: keyFactors,
        disclaimer,
      },
      metadata: {
        model: this.model,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        latencyMs,
        costUsd: 0,
      },
    };
  }

  private sanitizeInput(text: string): string {
    const truncated = text.substring(0, 200);
    return truncated.replace(/[<>]/g, '');
  }

  private generateSummary(
    poolName: string,
    protocol: string,
    chain: string,
    riskScore: number,
    category: string
  ): string {
    const riskLevel = category.charAt(0).toUpperCase() + category.slice(1);
    
    return (
      `This pool on ${protocol} (${chain}) has a ${riskLevel.toLowerCase()} risk rating ` +
      `with a score of ${riskScore.toFixed(1)} out of 100. The assessment is based on the pool's ` +
      `current metrics and risk signals.`
    );
  }

  private generateKeyFactors(input: RiskInput): Array<{
    signal: string;
    value: string;
    explanation: string;
  }> {
    const factors: Array<{
      signal: string;
      value: string;
      explanation: string;
    }> = [];

    // Generate factor for each non-null signal with its actual value
    if (input.breakdown.tvl_score != null) {
      const tvl = input.pool_metrics.tvl_usd;
      const score = input.breakdown.tvl_score;
      factors.push({
        signal: 'TVL Score',
        value: `${score.toFixed(1)}/100 (TVL: $${tvl ? this.formatNumber(tvl) : 'N/A'})`,
        explanation:
          score > 50
            ? 'Lower total value locked indicates less market confidence and higher manipulation risk.'
            : 'High total value locked suggests strong market confidence and liquidity.',
      });
    }

    if (input.breakdown.tvl_volatility_score != null) {
      const change = input.pool_metrics.tvl_change_7d_pct;
      const score = input.breakdown.tvl_volatility_score;
      factors.push({
        signal: 'TVL Volatility',
        value: `${score.toFixed(1)}/100 (${change != null ? change.toFixed(1) : 'N/A'}% 7d change)`,
        explanation:
          score > 50
            ? 'Significant capital movements suggest changing user confidence or market conditions.'
            : 'Stable TVL indicates consistent liquidity and user confidence.',
      });
    }

    if (input.breakdown.apy_volatility_score != null) {
      const apy = input.pool_metrics.apy;
      const sigma = input.pool_metrics.apy_sigma;
      const score = input.breakdown.apy_volatility_score;
      factors.push({
        signal: 'APY Volatility',
        value: `${score.toFixed(1)}/100 (APY: ${apy?.toFixed(2) ?? 'N/A'}%, σ=${sigma?.toFixed(2) ?? 'N/A'}%)`,
        explanation:
          score > 50
            ? 'High yield volatility often indicates unsustainable incentive programs or low liquidity.'
            : 'Stable yields suggest reliable returns and mature incentive structure.',
      });
    }

    if (input.breakdown.reward_ratio_score != null) {
      const base = input.pool_metrics.apy_base ?? 0;
      const reward = input.pool_metrics.apy_reward ?? 0;
      const total = base + reward;
      const ratio = total > 0 ? (reward / total) * 100 : 0;
      const score = input.breakdown.reward_ratio_score;
      factors.push({
        signal: 'Reward Ratio',
        value: `${score.toFixed(1)}/100 (${ratio.toFixed(0)}% from incentives)`,
        explanation:
          score > 50
            ? 'Heavy reliance on reward tokens creates sustainability risk when incentive programs end.'
            : 'Low reward dependency indicates organic yield generation.',
      });
    }

    if (input.breakdown.il_score != null) {
      const ilRisk = input.pool_metrics.il_risk;
      const score = input.breakdown.il_score;
      factors.push({
        signal: 'IL Score',
        value: `${score.toFixed(1)}/100 (IL risk: ${ilRisk?.toFixed(2) ?? 'N/A'})`,
        explanation:
          score > 50
            ? 'AMM pools with uncorrelated assets can experience significant impermanent loss during price divergence.'
            : 'Low impermanent loss risk due to correlated or stable assets.',
      });
    }

    if (input.breakdown.data_age_score != null) {
      const count = input.pool_metrics.count ?? 0;
      const score = input.breakdown.data_age_score;
      factors.push({
        signal: 'Data Age',
        value: `${score.toFixed(1)}/100 (${count} data points)`,
        explanation:
          score > 50
            ? 'Limited historical data makes it harder to assess long-term stability and performance.'
            : 'Comprehensive historical data enables reliable performance assessment.',
      });
    }

    return factors;
  }

  private formatNumber(num: number): string {
    if (num >= 1e9) {
      return `${(num / 1e9).toFixed(2)}B`;
    }
    if (num >= 1e6) {
      return `${(num / 1e6).toFixed(2)}M`;
    }
    if (num >= 1e3) {
      return `${(num / 1e3).toFixed(2)}K`;
    }
    return num.toFixed(2);
  }
}
