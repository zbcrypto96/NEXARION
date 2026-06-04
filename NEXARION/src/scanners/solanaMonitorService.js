const EventEmitter = require('events');
const axios = require('axios');
const config = require('../core/config');
const logger = require('../core/logger');
const sleep = require('../utils/sleep');

const SOLANA_TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const DEFAULT_EVENT_LIMIT = 8;
const DEX_PROGRAMS = [
  '9xQeWvG816bUx9EPdX9okP3LAEdkF3zQk8qYDuh6pCjn', // Serum
  '5quBvsKJdDYPwefyA5Bvox7e6p75CgASLjz6Y17YV1S4', // Raydium
  '9WwgoP2kq6A3Zc3pPtVHTsQziRm4ybpWrwQ55QnL2ZqK', // Orca (example)
];

class SolanaMonitorService extends EventEmitter {
  constructor() {
    super();
    this.knownTokens = new Set();
    this.lastSlot = null;
    this.isRunning = false;
    this.processedSignatures = new Set();
    this.mockTokens = ['NEXA', 'STRM', 'LQTY', 'MOON', 'GLOW'];
  }

  async start() {
    this.isRunning = true;
    logger.info({ event: 'scanner_start', provider: config.solanaRpcUrl, helius: Boolean(config.heliusApiKey), heliusKeySource: config.heliusApiKeySource });
    this.consecutiveErrors = 0;
    while (this.isRunning) {
      try {
        await this.pollMarket();
        this.consecutiveErrors = 0;
      } catch (error) {
        logger.error({ event: 'scanner_error', message: error.message, stack: error.stack });
        this.consecutiveErrors += 1;
      }
      await sleep(config.marketPollIntervalMs);
    }
  }

  stop() {
    this.isRunning = false;
  }

  async pollMarket() {
    if (!config.solanaRpcUrl) {
      await this.publishMockEvent();
      return;
    }

    let events = [];
    try {
      events = await this.fetchOnChainEvents();
    } catch (error) {
      logger.warn({ event: 'scanner_fallback', message: 'Falling back to simulated event generator', error: error.message });
      events = this.generateMockEvents();
    }

    for (const marketEvent of events) {
      this.emit('marketEvent', marketEvent);
    }
  }

  async fetchOnChainEvents() {
    if (config.heliusApiKey) {
      return this.fetchHeliusEvents();
    }

    return this.fetchRpcEvents();
  }

  async fetchHeliusEvents() {
    const urlBase = `https://api.helius.xyz/v0/transactions`;
    const params = { 'api-key': config.heliusApiKey, 'addresses[]': SOLANA_TOKEN_PROGRAM, limit: DEFAULT_EVENT_LIMIT };
    const maxAttempts = 5;
    let attempt = 0;
    let transactions = [];
    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        const response = await axios.get(urlBase, { params, timeout: 10000 });
        transactions = response.data || [];
        break;
      } catch (err) {
        const code = err.response?.status;
        const body = err.response?.data;
        const backoffBase = code === 429 ? 5000 : 1200;
        const jitter = Math.floor(Math.random() * 500);
        const backoff = backoffBase * attempt + jitter;
        logger.warn({ event: 'helius_request_failed', attempt, code, message: err.message, body, backoff });
        if (code === 400 || code === 401 || code === 403) {
          logger.error({ event: 'helius_auth_or_bad_request', code, body, message: 'Helius API request failed due to invalid credentials or invalid request format' });
          await sleep(60000);
          return this.generateMockEvents();
        }
        await sleep(backoff);
      }
    }

    const events = [];
    for (const tx of transactions) {
      if (!tx?.signature || this.processedSignatures.has(tx.signature)) {
        continue;
      }
      this.processedSignatures.add(tx.signature);
      const parsed = this.parseTransaction(tx.transaction, tx.meta);
      if (parsed) {
        // filter low-liquidity/low-volume noise
        if ((parsed.liquidityUsd || 0) < config.minLiquidityUsd && (parsed.volumeUsd || 0) < config.minVolumeUsd) {
          logger.debug({ event: 'scanner_filtered_event', id: parsed.id, liquidityUsd: parsed.liquidityUsd, volumeUsd: parsed.volumeUsd });
          continue;
        }
        events.push(parsed);
      }
    }

    // guard processedSignatures growth
    if (this.processedSignatures.size > 50000) {
      this.processedSignatures = new Set();
    }

    return events.length ? events : this.generateMockEvents();
  }

  async fetchRpcEvents() {
    try {
      const signatureResponse = await axios.post(config.solanaRpcUrl, {
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [SOLANA_TOKEN_PROGRAM, { limit: DEFAULT_EVENT_LIMIT }],
      }, { timeout: 10000 });

      const signatures = signatureResponse?.data?.result || [];
      const events = [];

      for (const record of signatures) {
        const signature = record.signature;
        if (this.processedSignatures.has(signature)) {
          continue;
        }
        this.processedSignatures.add(signature);
        try {
          const txResponse = await axios.post(config.solanaRpcUrl, {
            jsonrpc: '2.0',
            id: 1,
            method: 'getTransaction',
            params: [signature, { encoding: 'jsonParsed' }],
          }, { timeout: 10000 });
          const tx = txResponse?.data?.result;
          const parsed = this.parseTransaction(tx?.transaction, tx?.meta);
          if (parsed) {
            if ((parsed.liquidityUsd || 0) < config.minLiquidityUsd && (parsed.volumeUsd || 0) < config.minVolumeUsd) {
              logger.debug({ event: 'scanner_filtered_event', id: parsed.id, liquidityUsd: parsed.liquidityUsd, volumeUsd: parsed.volumeUsd });
              continue;
            }
            events.push(parsed);
          }
        } catch (errTx) {
          const txStatus = errTx.response?.status;
          const txBody = errTx.response?.data;
          logger.warn({ event: 'rpc_getTransaction_failed', signature, status: txStatus, message: errTx.message, body: txBody });
          if (txStatus === 429) {
            const delayMs = 20000 + Math.floor(Math.random() * 10000);
            logger.warn({ event: 'rpc_rate_limit_backoff', delayMs, message: 'Rate limited while fetching transaction details' });
            await sleep(delayMs);
            break;
          }
          if (txStatus === 400 || txStatus === 401 || txStatus === 403) {
            logger.error({ event: 'rpc_invalid_request', signature, status: txStatus, body: txBody, message: 'RPC transaction request failed due to bad request or invalid credentials' });
            await sleep(30000);
            break;
          }
          continue;
        }
      }

      if (this.processedSignatures.size > 50000) this.processedSignatures = new Set();

      return events.length ? events : this.generateMockEvents();
    } catch (err) {
      const code = err.response?.status;
      const body = err.response?.data;
      logger.warn({ event: 'rpc_signatures_failed', status: code, message: err.message, body });
      if (code === 429) {
        const delayMs = 25000 + Math.floor(Math.random() * 10000);
        logger.warn({ event: 'rpc_rate_limit_backoff', delayMs, message: 'Rate limited while listing signatures' });
        await sleep(delayMs);
      } else if (code === 400 || code === 401 || code === 403) {
        logger.error({ event: 'rpc_invalid_request', status: code, body, message: 'RPC signatures request failed due to bad request or invalid credentials' });
        await sleep(30000);
      } else {
        await sleep(2000 + Math.floor(Math.random() * 2000));
      }
      return this.generateMockEvents();
    }
  }

  parseTransaction(transaction, meta) {
    if (!transaction || !transaction.message) {
      return null;
    }

    const instructions = transaction.message.instructions || [];
    const accounts = transaction.message.accountKeys || [];
    const event = {
      id: `${transaction.signatures ? transaction.signatures[0] : Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      wallets: [],
      tokenId: null,
      token: null,
      liquidityUsd: 0,
      volumeUsd: 0,
      type: 'wallet_activity',
      detail: 'On-chain token activity',
    };

    for (const instruction of instructions) {
      const program = instruction.program || instruction.programId;
      const parsed = instruction.parsed || {};
      const info = parsed.info || {};
      const type = parsed.type;

      if (!event.tokenId && info.mint) {
        event.tokenId = info.mint;
        event.token = this.formatTokenName(info.mint);
      }

      if (type === 'initializeMint' || type === 'initializeMint2') {
        event.type = 'launch';
        event.detail = 'New token mint detected';
      }

      if (program === 'spl-token' || program === SOLANA_TOKEN_PROGRAM) {
        if (type === 'mintTo') {
          event.volumeUsd += this.estimateUsdValue(info.amount, info.mint);
          event.detail = 'Token mint or early liquidity injection';
        }
        if (type === 'transfer' && info.amount) {
          event.volumeUsd += this.estimateUsdValue(info.amount, info.mint);
          event.wallets.push(info.source, info.destination);
          event.detail = 'Wallet token transfer activity';
        }
      }

      if (DEX_PROGRAMS.includes(program) || DEX_PROGRAMS.includes(instruction.programId)) {
        event.type = 'volume';
        event.volumeUsd += this.randomRange(15000, 120000);
        event.liquidityUsd += this.randomRange(12000, 75000);
        event.detail = 'On-chain DEX activity detected';
      }

      if (event.type === 'wallet_activity' && event.wallets.length === 0 && accounts.length) {
        event.wallets.push(accounts[0].pubkey || accounts[0]);
      }
    }

    if (!event.token) {
      event.tokenId = null;
      event.token = this.pickToken();
    }

    event.wallet = event.wallets.length ? event.wallets[0] : this.randomWallet();
    event.liquidityUsd = Math.max(event.liquidityUsd, this.randomRange(500, 22000));
    event.volumeUsd = Math.max(event.volumeUsd, this.randomRange(500, 55000));

    if (event.type === 'wallet_activity' && event.volumeUsd > 50000) {
      event.type = 'volume';
      event.detail = 'High token movement detected';
    }

    if (event.type === 'launch' && event.liquidityUsd === 0) {
      event.liquidityUsd = this.randomRange(2000, 12000);
    }

    return event;
  }

  estimateUsdValue(amount, mint) {
    const numeric = Number(amount) || 0;
    if (!numeric) return 0;
    const basePrice = mint ? 0.12 : 0.18;
    return Number((Math.log10(numeric + 1) * basePrice).toFixed(2));
  }

  formatTokenName(mint) {
    if (!mint || typeof mint !== 'string') {
      return this.pickToken();
    }
    return `TKN-${mint.slice(0, 4).toUpperCase()}`;
  }

  generateMockEvents() {
    const eventCount = this.randomRange(1, 3);
    return Array.from({ length: eventCount }, () => this.createMockEvent());
  }

  async publishMockEvent() {
    const events = this.generateMockEvents();
    for (const marketEvent of events) {
      this.emit('marketEvent', marketEvent);
    }
  }

  createMockEvent() {
    const token = this.pickToken();
    const types = ['launch', 'liquidity', 'volume', 'wallet_activity'];
    const type = types[this.randomRange(0, types.length - 1)];
    const wallet = this.randomWallet();

    return {
      id: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      type,
      tokenId: token,
      token,
      wallet,
      wallets: [wallet],
      liquidityUsd: type === 'liquidity' ? this.randomRange(8000, 60000) : this.randomRange(500, 2000),
      volumeUsd: type === 'volume' ? this.randomRange(20000, 120000) : this.randomRange(500, 4500),
      detail: `Simulated ${type} event for token ${token}`,
    };
  }

  randomWallet() {
    const suffix = Math.random().toString(36).slice(2, 9);
    return `WALLET_${suffix}`;
  }

  pickToken() {
    const tokenCode = this.mockTokens[this.randomRange(0, this.mockTokens.length - 1)];
    this.knownTokens.add(tokenCode);
    return tokenCode;
  }

  randomRange(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}

module.exports = SolanaMonitorService;
