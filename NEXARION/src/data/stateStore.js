const logger = require('../core/logger');

const defaultState = {
  capital: 0,
  availableCapital: 0,
  realizedPnl: 0,
  cumulativeReturn: 0,
  openPositions: [],
  tradeHistory: [],
  walletPerformance: {},
  walletEvents: {},
  copyTradeWallets: [],
  clusters: [],
  knownTokens: {},
  metrics: {
    totalTrades: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    averageReturn: 0,
    currentDrawdown: 0,
  },
  lastTradeAt: null,
  dailyLoss: 0,
};

class StateStore {
  constructor({ storage, config }) {
    this.storage = storage;
    this.config = config;
    this.state = JSON.parse(JSON.stringify(defaultState));
  }

  async load() {
    const persisted = await this.storage.loadJson(this.config.storageFile, {});
    if (persisted && Object.keys(persisted).length > 0) {
      this.state = Object.assign({}, this.state, persisted);
      if (Array.isArray(this.state.copyTradeWallets)) {
        this.state.copyTradeWallets = this.sortCopyTradeWallets(this.state.copyTradeWallets);
      }
      logger.info({ event: 'state_loaded', source: this.config.storageFile });
    } else {
      this.reset();
    }
    this.state.capital = this.state.capital || this.config.startCapital;
    this.state.availableCapital = this.state.availableCapital || this.state.capital;
    return this.state;
  }

  reset() {
    this.state = JSON.parse(JSON.stringify(defaultState));
    this.state.capital = this.config.startCapital;
    this.state.availableCapital = this.state.capital;
  }

  async save() {
    if (Array.isArray(this.state.copyTradeWallets)) {
      this.state.copyTradeWallets = this.sortCopyTradeWallets(this.state.copyTradeWallets);
    }
    await this.storage.saveJson(this.config.storageFile, this.state);
  }

  sortCopyTradeWallets(wallets) {
    return wallets
      .slice()
      .sort((a, b) => b.score - a.score || b.winRate - a.winRate || b.averageReturn - a.averageReturn || (a.addedAt || 0) - (b.addedAt || 0));
  }

  updateMetrics() {
    const trades = this.state.tradeHistory;
    this.state.metrics.totalTrades = trades.length;
    this.state.metrics.wins = trades.filter((trade) => trade.pnlUsd > 0).length;
    this.state.metrics.losses = trades.filter((trade) => trade.pnlUsd <= 0).length;
    this.state.metrics.winRate = trades.length ? Number((this.state.metrics.wins / trades.length).toFixed(3)) : 0;
    this.state.metrics.averageReturn = trades.length
      ? Number((trades.reduce((sum, trade) => sum + trade.returnPct, 0) / trades.length).toFixed(3))
      : 0;
    const peak = Math.max(this.state.capital, this.state.realizedPnl + this.config.startCapital);
    const drawdown = peak > 0 ? ((peak - (this.state.realizedPnl + this.config.startCapital)) / peak) : 0;
    this.state.metrics.currentDrawdown = Number(drawdown.toFixed(3));
  }
}

module.exports = StateStore;
