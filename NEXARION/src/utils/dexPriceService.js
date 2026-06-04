const axios = require('axios');
const logger = require('../core/logger');

// Lightweight DEX price service that attempts Jupiter public APIs
// and gracefully falls back if unavailable.
class DexPriceService {
  constructor({ config }) {
    this.config = config;
    this.jupiterQuoteBase = 'https://quote-api.jup.ag/v1/quote';
    // Use wrapped SOL as the output asset for price routing; convert to USD via CoinGecko SOL price
    this.wsolMint = 'So11111111111111111111111111111111111111112';
  }

  async getOnchainPrice(tokenMint) {
    if (!tokenMint) return null;
    // Try Jupiter quote endpoint
    try {
      const url = `${this.jupiterQuoteBase}`;
      const params = {
        inputMint: tokenMint,
        outputMint: this.wsolMint,
        amount: 1000000,
      };
      const resp = await axios.get(url, { params, timeout: 8000 });
      const best = resp.data?.data?.[0] || resp.data?.data || resp.data;
      if (best && typeof best === 'object') {
        // Try standard fields
        const outAmount = Number(best.outAmount || best.out_amount || best.outAmountWithSlippage || 0);
        if (outAmount > 0) {
          // outAmount is in wSOL base units (heuristic) — convert to SOL
          const solAmount = outAmount / 1e9; // heuristic: lamports
          // fetch SOL price from CoinGecko
          try {
            const priceResp = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
              params: { ids: 'solana', vs_currencies: 'usd' },
              timeout: 6000,
            });
            const solPrice = priceResp.data?.solana?.usd || null;
            if (solPrice) {
              const usdPrice = solAmount * solPrice;
              return Number(usdPrice.toFixed(6));
            }
          } catch (errPrice) {
            logger.debug({ event: 'dex_price_sol_price_failed', message: errPrice.message });
          }
        }
      }
    } catch (err) {
      logger.debug({ event: 'dex_price_jupiter_failed', tokenMint, message: err.message });
    }

    // If Jupiter fails, we don't currently perform Serum lookup here.
    return null;
  }
}

module.exports = DexPriceService;
