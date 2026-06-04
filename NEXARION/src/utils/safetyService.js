const axios = require('axios');
const logger = require('../core/logger');

class SafetyService {
  constructor({ config }) {
    this.config = config;
    this.rpc = config.solanaRpcUrl;
  }

  async quickCheck(tokenMint) {
    if (!tokenMint) return { risky: false, multiplier: 1, reason: null };
    try {
      // getTokenSupply
      const supplyResp = await axios.post(this.rpc, {
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenSupply',
        params: [tokenMint],
      }, { timeout: 8000 });

      const supplyVal = supplyResp?.data?.result?.value || {};
      const amountRaw = Number(supplyVal.amount || 0);
      const decimals = Number(supplyVal.decimals || 0) || 0;
      const totalSupply = decimals ? amountRaw / Math.pow(10, decimals) : amountRaw;

      // getTokenLargestAccounts
      const largestResp = await axios.post(this.rpc, {
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenLargestAccounts',
        params: [tokenMint],
      }, { timeout: 8000 });

      const largest = largestResp?.data?.result || [];
      const topAmountRaw = Number(largest?.[0]?.amount || 0);
      const topAmount = decimals ? topAmountRaw / Math.pow(10, decimals) : topAmountRaw;
      const topPct = totalSupply > 0 ? topAmount / totalSupply : 1;

      // Heuristics
      if (totalSupply > 0 && totalSupply < 1000) {
        return { risky: true, multiplier: 0.1, reason: 'low_total_supply', totalSupply, topPct };
      }

      if (topPct > 0.4) {
        return { risky: true, multiplier: 0.25, reason: 'high_holder_concentration', totalSupply, topPct };
      }

      return { risky: false, multiplier: 1, reason: null, totalSupply, topPct };
    } catch (err) {
      logger.debug({ event: 'safety_quickcheck_failed', tokenMint, message: err.message });
      return { risky: false, multiplier: 1, reason: 'check_failed' };
    }
  }
}

module.exports = SafetyService;
