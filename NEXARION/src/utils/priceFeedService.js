const axios = require('axios');
const logger = require('../core/logger');
const DexPriceService = require('./dexPriceService');

const COINGECKO_TOKENS = {
  SOL: 'solana',
  BTC: 'bitcoin',
  ETH: 'ethereum',
  USDC: 'usd-coin',
  USDT: 'tether',
  SRM: 'serum',
  ORCA: 'orca',
  BONK: 'bonk',
  RAY: 'raydium',
};

class PriceFeedService {
  constructor({ config }) {
    this.config = config;
    this.cache = new Map();
    this.cacheTtlMs = 1000 * 60;
    this.cacheTimestamps = new Map();
    this.dex = new DexPriceService({ config });
  }

  async getLatestPrice(tokenId, tokenSymbol) {
    const key = tokenId || tokenSymbol || 'unknown';
    if (!key) {
      return null;
    }

    const now = Date.now();
    if (this.cache.has(key) && now - this.cacheTimestamps.get(key) < this.cacheTtlMs) {
      return this.cache.get(key);
    }

    const symbol = tokenSymbol || this.deriveSymbolFromTokenId(tokenId);
    // Try on-chain DEX price first when tokenId available
    let price = null;
    if (tokenId && this.dex) {
      try {
        price = await this.dex.getOnchainPrice(tokenId);
      } catch (err) {
        logger.debug({ event: 'dex_price_error', tokenId, message: err.message });
      }
    }

    const coingeckoId = this.resolveCoingeckoId(symbol);
    if (price === null && coingeckoId) {
      price = await this.fetchCoingeckoPrice(coingeckoId);
    }

    if (price === null) {
      price = this.estimateFallbackPrice(tokenId, tokenSymbol);
    }

    this.cache.set(key, price);
    this.cacheTimestamps.set(key, now);
    return price;
  }

  resolveCoingeckoId(symbol) {
    if (!symbol || typeof symbol !== 'string') {
      return null;
    }
    const normalized = symbol.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    return COINGECKO_TOKENS[normalized] || null;
  }

  deriveSymbolFromTokenId(tokenId) {
    if (!tokenId || typeof tokenId !== 'string') {
      return null;
    }
    if (tokenId.startsWith('TKN-')) {
      return tokenId.slice(4);
    }
    return tokenId;
  }

  async fetchCoingeckoPrice(id) {
    try {
      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
        params: {
          ids: id,
          vs_currencies: 'usd',
        },
        timeout: 8000,
      });
      const price = response.data?.[id]?.usd;
      if (typeof price === 'number') {
        return Number(price.toFixed(6));
      }
      return null;
    } catch (error) {
      logger.warn({ event: 'price_feed_error', message: error.message, id });
      return null;
    }
  }

  estimateFallbackPrice(tokenId, tokenSymbol) {
    const base = 0.12;
    const seed = (tokenSymbol || tokenId || 'token').length;
    const price = Number((base + Math.log10(seed + 1) * 0.08 + Math.random() * 0.1).toFixed(6));
    return Math.max(0.01, price);
  }

  async getEntryPrice(signal) {
    const price = await this.getLatestPrice(signal.tokenId, signal.token);
    if (price && price > 0) {
      return price;
    }
    return this.estimateFallbackPrice(signal.tokenId, signal.token);
  }

  async getMarketPrice(position, event) {
    let price = await this.getLatestPrice(position.tokenId, position.token);
    if (!price || price <= 0) {
      price = position.entryPrice;
    }

    if (event && (event.tokenId === position.tokenId || event.token === position.token)) {
      const momentum = event.volumeUsd ? Math.min(0.15, event.volumeUsd / 200000) : 0.03;
      const drift = event.type === 'volume' ? 0.05 : event.type === 'liquidity' ? 0.03 : 0.015;
      const direction = Math.random() > 0.5 ? 1 : -1;
      const adjustment = 1 + direction * (momentum + drift) * Math.random();
      return Number(Math.max(0.005, price * adjustment).toFixed(6));
    }

    return Number(Math.max(0.005, price * (1 + (Math.random() - 0.5) * 0.02)).toFixed(6));
  }
}

module.exports = PriceFeedService;
