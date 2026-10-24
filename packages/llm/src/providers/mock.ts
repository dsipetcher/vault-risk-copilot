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
      `with a score of ${riskScore.toFixed(1)} out of 100. This assessment is based on multiple factors ` +
      `including liquidity depth, yield stability, and historical performance data.`
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

    if (input.breakdown.tvl_score > 60) {
      const tvl = input.pool_metrics.tvl_usd;
      factors.push({
        signal: 'TVL Size',
        value: tvl ? `$${this.formatNumber(tvl)}` : 'Low TVL',
        explanation:
          'Lower total value locked indicates less market confidence and higher manipulation risk.',
      });
    }

    if (input.breakdown.tvl_volatility_score > 60) {
      const change = input.pool_metrics.tvl_change_7d_pct;
      factors.push({
        signal: 'TVL Volatility',
        value: change ? `${change.toFixed(1)}% change` : 'Recent TVL drop',
        explanation:
          'Significant capital outflows suggest declining user confidence or yield opportunities elsewhere.',
      });
    }

    if (input.breakdown.apy_volatility_score > 60) {
      const apy = input.pool_metrics.apy;
      const sigma = input.pool_metrics.apy_sigma;
      factors.push({
        signal: 'APY Volatility',
        value:
          apy && sigma
            ? `${apy.toFixed(2)}% APY, σ=${sigma.toFixed(2)}%`
            : 'Unstable yields',
        explanation:
          'High yield volatility often indicates unsustainable incentive programs or low liquidity.',
      });
    }

    if (input.breakdown.reward_ratio_score > 60) {
      const base = input.pool_metrics.apy_base ?? 0;
      const reward = input.pool_metrics.apy_reward ?? 0;
      const total = base + reward;
      const ratio = total > 0 ? (reward / total) * 100 : 0;
      factors.push({
        signal: 'Reward Dependency',
        value: `${ratio.toFixed(0)}% from incentives`,
        explanation:
          'Heavy reliance on reward tokens creates sustainability risk when incentive programs end.',
      });
    }

    if (input.breakdown.stablecoin_score > 40 && !input.pool_metrics.is_stablecoin) {
      factors.push({
        signal: 'Asset Volatility',
        value: 'Non-stablecoin assets',
        explanation:
          'Volatile assets expose users to price risk in addition to protocol-specific risks.',
      });
    }

    if (input.breakdown.il_score > 60) {
      const ilRisk = input.pool_metrics.il_risk;
      factors.push({
        signal: 'Impermanent Loss',
        value: ilRisk ? `IL risk: ${ilRisk.toFixed(2)}` : 'High IL exposure',
        explanation:
          'AMM pools with uncorrelated assets can experience significant impermanent loss during price divergence.',
      });
    }

    if (input.breakdown.data_age_score > 60) {
      const count = input.pool_metrics.count ?? 0;
      factors.push({
        signal: 'Data History',
        value: `${count} data points`,
        explanation:
          'Limited historical data makes it harder to assess long-term stability and performance.',
      });
    }

    if (input.breakdown.vault_score > 60) {
      factors.push({
        signal: 'Vault Performance',
        value: 'Share price concerns',
        explanation:
          'Vault share price movements may indicate underlying strategy performance issues.',
      });
    }

    if (factors.length === 0) {
      factors.push({
        signal: 'Overall Assessment',
        value: `${input.total_risk_score.toFixed(1)}/100 risk score`,
        explanation: 'This pool shows relatively stable metrics across all monitored signals.',
      });
    }

    return factors.slice(0, 8);
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
