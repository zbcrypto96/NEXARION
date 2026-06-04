const EventEmitter = require('events');
const logger = require('../core/logger');

class PaperTradingEngine extends EventEmitter {
  constructor({ config, stateStore, notifier, walletIntelligence, clusterService, launchDetection, priceFeed }) {
    super();
    this.config = config;
    this.stateStore = stateStore;
    this.notifier = notifier;
    this.walletIntelligence = walletIntelligence;
    this.clusterService = clusterService;
    this.launchDetection = launchDetection;
    this.priceFeed = priceFeed;
  }

  canOpenPosition(signal) {
    const state = this.stateStore.state;
    if (state.openPositions.length >= this.config.maxConcurrentPositions) {
      logger.debug({ event: 'risk_rejected', reason: 'max_positions' });
      return false;
    }

    if (state.lastTradeAt && Date.now() - state.lastTradeAt < this.config.tradeSpacingMinutes * 60 * 1000) {
      logger.debug({ event: 'risk_rejected', reason: 'trade_spacing' });
      return false;
    }

    const dailyLossLimit = this.config.startCapital * this.config.dailyLossLimitPercent;
    if (state.dailyLoss >= dailyLossLimit) {
      logger.debug({ event: 'risk_rejected', reason: 'daily_loss_limit' });
      return false;
    }

    const overlap = state.openPositions.filter((position) => position.tokenId === signal.tokenId || position.token === signal.token).length;
    if (overlap > 0) {
      logger.debug({ event: 'risk_rejected', reason: 'correlation_same_token', token: signal.token });
      return false;
    }

    const clusterConfidence = Number(signal.clusterConfidence ?? 0);
    if (clusterConfidence >= this.config.correlationThreshold) {
      logger.debug({ event: 'risk_rejected', reason: 'correlation_cluster', clusterConfidence });
      return false;
    }

    return true;
  }

  estimateEntryPrice(signal) {
    const trend = Math.log10(signal.volumeUsd + 1) / 3;
    return Number(Math.max(0.02, 0.2 + trend).toFixed(4));
  }

  async openPosition(signal) {
    if (!this.canOpenPosition(signal)) {
      return null;
    }

    const state = this.stateStore.state;
    const price = signal.price || (this.priceFeed ? await this.priceFeed.getEntryPrice(signal) : null) || this.estimateEntryPrice(signal);
    const allocation = state.capital * this.config.positionSizePercent;
    if (allocation > state.availableCapital) {
      logger.warn({ event: 'trade_rejected', reason: 'insufficient_capital', needed: allocation, available: state.availableCapital });
      return null;
    }

    const quantity = Number((allocation / price).toFixed(4));
    const position = {
      id: `pos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      token: signal.token,
      tokenId: signal.tokenId || null,
      wallet: signal.wallet,
      side: 'buy',
      entryPrice: price,
      quantity,
      sizeUsd: allocation,
      status: 'open',
      openedAt: Date.now(),
      earlyEntry: signal.launchAgeHours < 24,
      stopLoss: Number((price * 0.92).toFixed(6)),
      takeProfit: Number((price * 1.18).toFixed(6)),
      signalScore: signal.score,
      clusterConfidence: signal.clusterConfidence,
      safety: signal.safety,
    };

    state.openPositions.push(position);
    state.availableCapital = Number((state.availableCapital - allocation).toFixed(2));
    state.lastTradeAt = Date.now();
    state.tradeHistory.push({
      ...position,
      status: 'open',
      pnlUsd: 0,
      returnPct: 0,
      closedAt: null,
    });
    state.metrics.totalTrades += 1;
    logger.info({ event: 'position_opened', token: signal.token, price, quantity, score: signal.score });
    this.emit('positionOpened', position);
    return position;
  }

  async updatePositions(event) {
    const state = this.stateStore.state;

    for (const position of [...state.openPositions]) {
      const marketPrice = this.priceFeed
        ? await this.priceFeed.getMarketPrice(position, event)
        : this.estimateMarketPriceForToken(position.token, event);
      if (marketPrice <= 0) continue;

      if (marketPrice <= position.stopLoss || marketPrice >= position.takeProfit || Date.now() - position.openedAt > 1000 * 60 * 60 * 6) {
        await this.closePosition(position, marketPrice, marketPrice <= position.stopLoss ? 'stop_loss' : marketPrice >= position.takeProfit ? 'take_profit' : 'time_exit');
      }
    }
  }

  estimateMarketPriceForToken(token, event) {
    if (event && event.token === token) {
      const volumeImpact = Math.log10(event.volumeUsd + 1) / 4;
      const drift = event.type === 'volume' ? 0.06 : event.type === 'liquidity' ? 0.03 : 0.01;
      return Number(Math.max(0.02, (0.2 + volumeImpact + drift)).toFixed(6));
    }
    return Number((0.2 + Math.random() * 0.04).toFixed(6));
  }

  async closePosition(position, exitPrice, reason) {
    const state = this.stateStore.state;
    const pnlUsd = Number(((exitPrice - position.entryPrice) * position.quantity).toFixed(2));
    const returnPct = Number((pnlUsd / position.sizeUsd * 100).toFixed(2));
    const closedAt = Date.now();

    position.status = 'closed';
    position.exitPrice = exitPrice;
    position.closedAt = closedAt;
    position.pnlUsd = pnlUsd;
    position.returnPct = returnPct;
    position.exitReason = reason;

    state.realizedPnl = Number((state.realizedPnl + pnlUsd).toFixed(2));
    state.availableCapital = Number((state.availableCapital + position.sizeUsd + pnlUsd).toFixed(2));
    state.dailyLoss = Number((state.dailyLoss + Math.max(0, -pnlUsd)).toFixed(2));
    state.capital = Number((this.config.startCapital + state.realizedPnl).toFixed(2));

    state.openPositions = state.openPositions.filter((active) => active.id !== position.id);
    const historyEntry = state.tradeHistory.find((trade) => trade.id === position.id);
    if (historyEntry) {
      historyEntry.status = 'closed';
      historyEntry.exitPrice = exitPrice;
      historyEntry.closedAt = closedAt;
      historyEntry.pnlUsd = pnlUsd;
      historyEntry.returnPct = returnPct;
      historyEntry.exitReason = reason;
    }

    state.metrics.wins = state.tradeHistory.filter((trade) => trade.status === 'closed' && trade.pnlUsd > 0).length;
    state.metrics.losses = state.tradeHistory.filter((trade) => trade.status === 'closed' && trade.pnlUsd <= 0).length;
    state.metrics.winRate = state.tradeHistory.length
      ? Number((state.metrics.wins / state.tradeHistory.length).toFixed(3))
      : 0;

    this.walletIntelligence.registerTrade({
      wallet: position.wallet,
      returnPct,
      earlyEntry: position.earlyEntry,
      safety: position.safety,
    });

    logger.info({ event: 'position_closed', token: position.token, pnlUsd, returnPct, reason });
    this.emit('positionClosed', position);

    const notificationPayload = {
      ...position,
      pnlUsd,
      returnPct,
      currentCapital: state.capital,
      status: 'closed',
    };

    await this.notifier.sendTradeNotification(notificationPayload);
    return position;
  }
}

module.exports = PaperTradingEngine;
