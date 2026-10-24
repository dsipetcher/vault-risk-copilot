# Risk Model Documentation

**Version:** 1.0  
**Last Updated:** October 24, 2026

---

## Overview

The Vault Risk Copilot risk model calculates **explainable, transparent risk scores** for DeFi pools using **rule-based signals**. This is **not a machine learning model** that predicts future yields or prices. Instead, it applies deterministic formulas to historical data to identify risk factors that may indicate:

- Protocol instability or capital flight
- Unsustainable yield mechanisms
- Data quality issues
- Asset volatility risks
- Dependency on external incentives

**Aggregate Risk Score:** Each pool receives a score from **0 to 100**, where:
- **0 = lowest risk** (most stable, reliable)
- **100 = highest risk** (most volatile, uncertain)

Scores are categorized as:
- **0-25**: Low risk
- **26-50**: Medium risk
- **51-75**: High risk
- **76-100**: Critical risk

---

## Risk Signals

### 1. TVL Size Signal

**What it measures:** Total Value Locked (TVL) in the pool.

**Rationale:**
- **Larger TVL = lower risk.** High TVL pools have:
  - More liquidity depth (harder to manipulate)
  - More battle-testing (survived longer with more capital)
  - Greater market confidence
- **Smaller TVL = higher risk.** Low TVL pools:
  - Can be more easily manipulated
  - May be new or experimental
  - Have less proven track record

**Formula:**
- TVL < $1M: **100 points** (maximum risk)
- TVL > $10M: **0 points** (minimum risk)
- Linear interpolation between $1M and $10M

**Example:**
- Pool with $500K TVL → 100 points
- Pool with $5.5M TVL → ~50 points
- Pool with $20M TVL → 0 points

**Limitations:**
- Does not account for TVL concentration (single whale vs distributed)
- High TVL does not guarantee safety (Luna had billions of TVL)
- Does not consider smart contract risk

---

### 2. TVL Drop Signal

**What it measures:** 7-day percentage change in TVL.

**Rationale:**
- **Sharp TVL drops = capital flight.** Users are withdrawing funds rapidly, which may indicate:
  - Loss of confidence in the protocol
  - Better yields available elsewhere
  - Discovered vulnerability or exploit
  - Protocol shutdown or migration
- **Stable or growing TVL = lower risk.**

**Formula:**
- TVL growing or stable: **0 points**
- TVL drop < 20%: **0-50 points** (scaled)
- TVL drop 20-50%: **50-100 points** (scaled)
- TVL drop ≥ 50%: **100 points** (critical)

**Example:**
- TVL +5% (growth) → 0 points
- TVL -10% → 25 points
- TVL -30% → 70 points
- TVL -60% → 100 points

**Limitations:**
- Does not distinguish between:
  - Planned migrations (protocol upgrade)
  - Market-wide selloffs (contagion)
  - Single whale withdrawal
- 7-day window may miss slower erosion

---

### 3. APY Volatility Signal

**What it measures:** Stability and sustainability of yields.

**Rationale:**
Extremely high, volatile, or spiking APY suggests:
- **Temporary incentive programs** (unsustainable once rewards end)
- **Low liquidity** (rates swing wildly with small deposits/withdrawals)
- **Manipulation or oracle issues**
- **Ponzi-like dynamics** (unsustainable returns)

**Formula (composite):**

1. **Absolute APY check:**
   - APY > 100%: Add penalty (capped at 30 points)

2. **Historical volatility (coefficient of variation):**
   - CV = APY standard deviation / mean APY
   - High CV (>2.5): Add penalty (capped at 35 points)

3. **Recent spike:**
   - |7-day APY change| > 100%: Add penalty (capped at 35 points)

**Total:** Sum of penalties, capped at 100 points.

**Example:**
- APY 8%, stable (sigma 0.5), no spike → ~5 points
- APY 150%, volatile (sigma 50), +200% spike → 100 points

**Limitations:**
- Does not distinguish between:
  - Legitimate yield farming opportunities
  - Short-term promotional APY boosts
  - Ponzi schemes
- High APY alone is not always bad (could be high-risk/high-reward)

---

### 4. Reward Ratio Signal

**What it measures:** Proportion of APY from external token rewards vs base protocol yield.

**Rationale:**
- **High reward/total APY ratio = yield dependency risk.**
  - If 90% of yield is from incentive tokens, APY collapses when incentives stop
  - Reward tokens may be inflationary or have poor tokenomics
- **Low reward ratio = sustainable yield.**
  - Base APY from protocol fees/interest is more stable

**Formula:**
- Reward ratio < 30%: **0 points** (sustainable)
- Reward ratio > 70%: **100 points** (high dependency)
- Linear interpolation between 30-70%

**Example:**
- 8% total APY (7% base, 1% reward) → 12.5% ratio → 0 points
- 10% total APY (3% base, 7% reward) → 70% ratio → 100 points

**Limitations:**
- Does not evaluate reward token quality
- Some protocols sustainably emit rewards (e.g., CRV, AAVE)
- Does not account for vesting or lockups

---

### 5. Stablecoin Signal

**What it measures:** Asset type (stablecoin vs volatile).

**Rationale:**
- **Stablecoin pools = lower price volatility risk.**
  - USDC/USDT/DAI pools have minimal price swings
- **Volatile asset pools = higher risk.**
  - ETH, BTC, altcoins can have sharp price movements
  - Adds additional risk layer beyond yield volatility

**Formula:**
- Stablecoin: **0 points**
- Volatile asset: **50 points**

**Example:**
- USDC lending pool → 0 points
- ETH lending pool → 50 points

**Limitations:**
- Binary classification (no mixed pools)
- Does not account for stablecoin depeg risk (UST, USDC depeg events)
- Does not distinguish between correlated assets (ETH-stETH)

---

### 6. Impermanent Loss (IL) Risk Signal

**What it measures:** Impermanent loss risk for AMM pools (from DeFiLlama).

**Rationale:**
- **AMM pools with volatile assets can experience IL.**
  - When token prices diverge, LPs lose value vs holding
  - Correlated pairs (ETH-WBTC) have lower IL
  - Uncorrelated pairs (USDC-ETH) have higher IL
- **Non-AMM pools (lending) have no IL risk.**

**Formula:**
- No IL risk data: **0 points** (likely not an AMM)
- IL risk 0-0.5 (DeFiLlama scale): **0-100 points** (scaled)
- IL risk ≥ 0.5: **100 points**

**Example:**
- USDC-USDT pool → IL risk ~0.0 → 0 points
- ETH-DAI pool → IL risk ~0.3 → 60 points
- Meme-ETH pool → IL risk 0.8 → 100 points

**Limitations:**
- Relies on DeFiLlama's IL risk calculation (not disclosed)
- Does not account for fee income offsetting IL
- Historical IL does not predict future IL

---

### 7. Data Age Signal

**What it measures:** Length of historical data (number of data points).

**Rationale:**
- **Longer data history = more reliable.**
  - Pool has been operating longer
  - More observations for trend analysis
  - Lower chance of being a scam/rugpull
- **Short history = less reliable.**
  - New pool, unproven
  - Could be a honeypot or temporary farm

**Formula:**
- Data count ≥ 30: **0 points** (reliable)
- Data count < 7: **100 points** (very new)
- Linear interpolation between 7 and 30

**Example:**
- Pool with 100 data points → 0 points
- Pool with 15 data points → ~45 points
- Pool with 3 data points → 100 points

**Limitations:**
- Does not account for data frequency (daily vs hourly)
- Legitimate new pools are penalized
- Does not validate data quality

---

### 8. Vault Share Price Drop Signal

**What it measures:** Change in our SimpleVault's share price (losses in the vault's underlying strategy).

**Rationale:**
- **Share price drops indicate actual losses** in the vault.
  - Unlike TVL drops (users withdrawing), share price drops mean existing shares lost value
  - Critical indicator of vault strategy performance
  - Direct measure of user losses
- **Stable or growing share price = low risk.**

**Formula:**
- No drop or increase: **0 points**
- Drop < 1% (warning threshold): **0-50 points** (linear scale)
- Drop ≥ 1% but < 5%: **50-100 points** (linear scale)
- Drop ≥ 5% (critical): **100 points**

**Example:**
- Share price +2%: 0 points
- Share price -0.5%: 25 points
- Share price -1.5%: 62 points
- Share price -10%: 100 points

**Limitations:**
- Only applies to our SimpleVault (not all pools)
- Depends on vault_state_snapshots data availability
- Short-term fluctuations may not indicate long-term trend
- Block-over-block comparison may be noisy

---

## Aggregate Risk Score

The **total risk score** is a weighted sum of all signals:

```
Total = 0.12 × TVL_size
      + 0.12 × TVL_drop
      + 0.18 × APY_volatility
      + 0.13 × Reward_ratio
      + 0.08 × Stablecoin
      + 0.13 × IL_risk
      + 0.08 × Data_age
      + 0.16 × Vault_price_drop
```

**Weights rationale (sum = 1.0):**
- **APY volatility (18%):** High weight because unsustainable yields are a primary risk
- **Vault price drop (16%):** Critical indicator of our vault's actual performance
- **Reward ratio (13%):** Yield composition matters for sustainability
- **IL risk (13%):** Significant for AMM pools
- **TVL signals (12% each):** TVL size and drops are strong indicators of stability
- **Stablecoin (8%):** Binary signal, less nuanced
- **Data age (8%):** Important but secondary to yield/TVL/vault signals

---

## Anomaly Detection (Rule-Based)

In addition to individual signals, the model uses **deterministic rule-based detection** to flag pools with unusual risk patterns.

**Rules (all deterministic, no ML):**

1. **Multiple Critical Signals (≥3 signals ≥90):**
   - Flags pools with 3+ individual signal scores in critical range
   - Reason: "N signals in critical range (≥90)"

2. **Extreme Risk + Low TVL (risk ≥85 AND tvl_score ≥80):**
   - Very high total risk combined with very low TVL
   - Reason: "Extreme risk (≥85) + very low TVL"

3. **Contradictory Signals:**
   - High total risk (≥60) despite stable fundamentals
   - Stablecoin pool + stable APY + high TVL but high risk
   - Reason: "High risk despite stable fundamentals (possible data error)"

4. **New Pool + Extreme APY Volatility:**
   - Short data history (data_age_score ≥80) + high APY volatility (≥80)
   - Reason: "New pool with extreme APY volatility"

**Flagging:**
- Pools matching rules get `is_anomaly=true`
- Each rule has a specific human-readable reason

**Use case:** Catches pools with unusual combinations of metrics that may indicate:
- Data quality issues
- Manipulated metrics
- Genuinely dangerous protocols

**Advantages over ML:**
- ✅ **Fully deterministic** (same input → same output)
- ✅ **Explainable** (exact reason for each flag)
- ✅ **No training data required**
- ✅ **No scikit-learn dependency**
- ✅ **Works with any number of pools**

**Limitations:**
- Fixed rules may miss novel risk patterns
- Thresholds are manually chosen (not data-driven)
- May flag legitimate edge-case pools

---

## What This Model Does NOT Do

❌ **Predict future yields or prices**
- No backtested forecasting model
- No time-series predictions

❌ **Account for smart contract risk**
- Does not audit code
- Does not check for known vulnerabilities
- Does not evaluate audit quality

❌ **Consider governance or regulatory risk**
- Does not analyze token governance
- Does not account for legal/compliance issues

❌ **Evaluate oracle quality**
- Does not check oracle manipulation risk
- Assumes data sources are accurate

❌ **Detect exploits in real-time**
- Not a monitoring system
- Scores are calculated on historical data

❌ **Provide financial advice**
- This is a **learning project** for educational purposes
- **Not intended for real investment decisions**

---

## Limitations & Caveats

### Data Quality
- **Relies on DeFiLlama API:** If their data is wrong, our scores are wrong
- **Snapshot-based:** Scores are point-in-time, not real-time
- **Missing data:** Pools with incomplete data get medium risk scores (not worst-case)

### Model Simplicity
- **Linear formulas:** Real risk is non-linear and multi-dimensional
- **Fixed weights:** Optimal weights may vary by protocol type
- **No protocol-specific logic:** Treats all lending pools the same, all AMMs the same

### False Positives/Negatives
- **High-risk score ≠ guaranteed loss.** Experimental DeFi can be risky but not fraudulent.
- **Low-risk score ≠ guaranteed safety.** Terra/Luna would have had decent scores before UST depeg.

### Threshold Tuning
- **Arbitrary thresholds:** $1M and $10M for TVL, 20% and 50% for drops, etc. were chosen based on intuition, not rigorous backtesting.
- **Not optimized per-chain:** Ethereum TVL thresholds may not apply to smaller chains.

---

## Future Improvements

Potential enhancements (not implemented in this version):

1. **Protocol-specific models:** Different weights for lending vs AMM vs staking
2. **Historical backtesting:** Validate thresholds on known exploits/rugpulls
3. **Time-weighted signals:** Recent data weighted more heavily
4. **Correlation analysis:** Detect pools that move together (contagion risk)
5. **Machine learning:** Gradient boosting or neural nets (requires labeled training data)
6. **Real-time alerts:** Trigger notifications on sudden risk spikes
7. **Multi-chain normalization:** Adjust thresholds per chain (Ethereum vs Arbitrum)
8. **Smart contract risk score integration:** Use audit reports, formal verification
9. **User-adjustable weights:** Allow users to customize risk preferences

---

## Usage Guidelines

### For Learning
- ✅ Use to understand DeFi risk factors
- ✅ Compare pools within the same protocol
- ✅ Identify outliers for further investigation

### For Development
- ✅ Test risk calculation logic
- ✅ Experiment with threshold tuning
- ✅ Build dashboards and visualizations

### Do NOT Use
- ❌ As sole basis for investment decisions
- ❌ For mainnet funds without additional due diligence
- ❌ To claim this is a "production-grade" risk model

---

## References

- **DeFiLlama Yields API:** https://yields.llama.fi/pools
- **ERC-4626 Standard:** https://eips.ethereum.org/EIPS/eip-4626
- **Impermanent Loss:** Pintail's analysis (https://pintail.medium.com/)
- **Isolation Forest:** Liu et al., "Isolation-Based Anomaly Detection" (2012)

---

## License & Disclaimer

**MIT License** - See [LICENSE](../LICENSE)

**⚠️ EDUCATIONAL PROJECT ONLY**

This risk model is a **simplified learning project** built for a job application portfolio. It is:
- **Not audited**
- **Not backtested on real exploit data**
- **Not suitable for production use**
- **Not financial advice**

Use at your own risk. The author is not liable for any losses incurred from using this model.

---

**Questions or feedback?** Open an issue on GitHub.
