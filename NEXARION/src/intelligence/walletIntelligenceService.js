const logger = require('../core/logger');

class WalletIntelligenceService {
  constructor({ stateStore, copyTradeService }) {
    this.stateStore = stateStore;
    this.copyTradeService = copyTradeService;
  }

  recordWalletEvent(event) {
    if (!event.wallet) return;
    const wallet = event.wallet;
    const record = this.stateStore.state.walletPerformance[wallet] || {
      wallet,
      trades: 0,
      wins: 0,
      losses: 0,
      totalReturn: 0,
      earlyEntries: 0,
      riskyTrades: 0,
      riskyTradeRate: 0,
      lastSeen: Date.now(),
      score: 0,
    };

    record.lastSeen = Date.now();
    if (event.type === 'launch' || event.type === 'liquidity') {
      record.earlyEntries += 1;
    }

    this.stateStore.state.walletPerformance[wallet] = record;
    this.scoreWallet(wallet);
  }

  registerTrade(trade) {
    if (!trade.wallet) return;
    const wallet = trade.wallet;
    const record = this.stateStore.state.walletPerformance[wallet] || {
      wallet,
      trades: 0,
      wins: 0,
      losses: 0,
      totalReturn: 0,
      earlyEntries: 0,
      lastSeen: Date.now(),
      score: 0,
    };

    record.trades += 1;
    record.lastSeen = Date.now();
    record.totalReturn += trade.returnPct;
    if (trade.returnPct > 0) {
      record.wins += 1;
    } else {
      record.losses += 1;
    }
    if (trade.earlyEntry) {
      record.earlyEntries += 1;
    }
    if (trade.safety && trade.safety.risky) {
      record.riskyTrades = (record.riskyTrades || 0) + 1;
    }
    record.riskyTradeRate = record.trades ? Number((record.riskyTrades / record.trades).toFixed(3)) : 0;

    this.stateStore.state.walletPerformance[wallet] = record;
    this.scoreWallet(wallet);
    if (this.copyTradeService) {
      this.copyTradeService.evaluateWallet(wallet);
      this.copyTradeService.refreshWallets();
    }
  }

  scoreWallet(wallet) {
    const record = this.stateStore.state.walletPerformance[wallet];
    if (!record) return 0;

    const winRate = record.trades ? record.wins / record.trades : 0.4;
    const averageReturn = record.trades ? record.totalReturn / record.trades : 0.05;
    const earlyEntryBonus = Math.min(record.earlyEntries / Math.max(record.trades, 1), 0.3);
    const riskPenalty = 1 - Math.min(0.5, record.riskyTradeRate || 0);

    record.winRate = Number(winRate.toFixed(3));
    record.averageReturn = Number(averageReturn.toFixed(3));

    const normalizedReturn = Math.max(0, Math.min(1, averageReturn / 0.2));
    const score = Math.min(1, (winRate * 0.5 + normalizedReturn * 0.3 + earlyEntryBonus * 0.2) * riskPenalty);

    record.score = Number(score.toFixed(3));
    record.winRate = Number(winRate.toFixed(3));
    record.averageReturn = Number(averageReturn.toFixed(3));
    this.stateStore.state.walletPerformance[wallet] = record;
    logger.debug({ event: 'wallet_score_updated', wallet, score: record.score, winRate: record.winRate, averageReturn: record.averageReturn });
    return record.score;
  }

  getWalletScore(wallet) {
    const record = this.stateStore.state.walletPerformance[wallet];
    return record ? record.score : 0.5;
  }
}

module.exports = WalletIntelligenceService;
