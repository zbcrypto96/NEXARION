const logger = require('../core/logger');

class CopyTradeService {
  constructor({ stateStore, config, notifier }) {
    this.stateStore = stateStore;
    this.config = config;
    this.notifier = notifier;
  }

  get copyTradeWallets() {
    return this.stateStore.state.copyTradeWallets || [];
  }

  shouldAutoAdd(walletRecord) {
    if (!walletRecord) return false;
    if (!this.config.copyTradeAutoAdd) return false;
    if (walletRecord.trades < this.config.copyTradeMinTrades) return false;
    if (walletRecord.score < this.config.copyTradeMinScore) return false;
    if (walletRecord.winRate < this.config.copyTradeMinWinRate) return false;
    if (walletRecord.averageReturn < this.config.copyTradeMinAverageReturn) return false;
    if (walletRecord.riskyTrades > this.config.copyTradeMaxRiskyTrades) return false;
    if (walletRecord.riskyTradeRate > this.config.copyTradeMaxRiskyTradeRate) return false;
    return true;
  }

  buildWalletEntry(record, existingEntry) {
    return {
      wallet: record.wallet,
      score: record.score,
      trades: record.trades,
      winRate: record.winRate,
      averageReturn: record.averageReturn,
      riskyTrades: record.riskyTrades || 0,
      riskyTradeRate: record.riskyTradeRate || 0,
      lastSeen: record.lastSeen,
      addedAt: existingEntry?.addedAt || Date.now(),
      updatedAt: Date.now(),
    };
  }

  getSeedWalletIds() {
    return Array.isArray(this.config.copyTradeSeedWallets)
      ? [...new Set(this.config.copyTradeSeedWallets.map((wallet) => wallet.trim()).filter(Boolean))]
      : [];
  }

  buildSeedWalletEntries(existingMap) {
    const seeds = this.getSeedWalletIds();
    return seeds.map((wallet) => {
      const record = this.stateStore.state.walletPerformance[wallet];
      if (record) {
        return this.buildWalletEntry(record, existingMap.get(wallet));
      }

      return {
        wallet,
        score: Math.max(this.config.copyTradeMinScore, 0.75),
        trades: Math.max(this.config.copyTradeMinTrades, 3),
        winRate: Math.max(this.config.copyTradeMinWinRate, 0.65),
        averageReturn: Math.max(this.config.copyTradeMinAverageReturn, 0.12),
        riskyTrades: 0,
        riskyTradeRate: 0,
        lastSeen: Date.now(),
        addedAt: Date.now(),
        updatedAt: Date.now(),
      };
    });
  }

  async notifyWalletEvent(message) {
    if (!this.notifier || !this.notifier.sendMessage) return;
    try {
      await this.notifier.sendMessage(message);
    } catch (error) {
      logger.error({ event: 'copytrade_notification_error', message: error.message });
    }
  }

  async evaluateWallet(wallet) {
    if (!wallet) return false;
    const record = this.stateStore.state.walletPerformance[wallet];
    if (!record) return false;

    const wallets = this.stateStore.state.copyTradeWallets || [];
    const existingIndex = wallets.findIndex((entry) => entry.wallet === wallet);
    const qualifies = this.shouldAutoAdd(record);

    if (existingIndex !== -1) {
      wallets[existingIndex] = {
        ...wallets[existingIndex],
        score: record.score,
        trades: record.trades,
        winRate: record.winRate,
        averageReturn: record.averageReturn,
        lastSeen: record.lastSeen,
        updatedAt: Date.now(),
      };
      this.stateStore.state.copyTradeWallets = this.trimWallets(wallets);
      return qualifies;
    }

    if (!qualifies) {
      return false;
    }

    wallets.push(this.buildWalletEntry(record));
    this.stateStore.state.copyTradeWallets = this.trimWallets(wallets);
    logger.info({ event: 'copytrade_wallet_added', wallet, score: record.score, trades: record.trades });
    this.notifyWalletEvent(`CopyTrade wallet added: ${wallet}\nscore=${(record.score ?? 0).toFixed(3)} trades=${record.trades} winRate=${(record.winRate ?? 0).toFixed(3)} avgReturn=${(record.averageReturn ?? 0).toFixed(3)}`);
    return true;
  }

  async refreshWallets() {
    if (!this.config.copyTradeAutoAdd) return false;

    const records = Object.values(this.stateStore.state.walletPerformance || {});
    const existingMap = new Map((this.stateStore.state.copyTradeWallets || []).map((entry) => [entry.wallet, entry]));
    const seedEntries = this.buildSeedWalletEntries(existingMap).filter(
      (entry) => !this.copyTradeWallets.some((existing) => existing.wallet === entry.wallet)
    );
    const candidates = records
      .sort((a, b) => b.score - a.score || b.winRate - a.winRate || b.averageReturn - a.averageReturn || b.trades - a.trades);

    if (records.length === 0 && seedEntries.length === 0) return false;

    const qualified = candidates.filter((record) => this.shouldAutoAdd(record));
    const selected = qualified.slice(0, this.config.copyTradeMaxWallets);

    while (selected.length < this.config.copyTradeMaxWallets && seedEntries.length) {
      selected.push(seedEntries.shift());
    }

    const remaining = candidates.filter(
      (record) => !selected.some((entry) => entry.wallet === record.wallet)
    );
    while (selected.length < this.config.copyTradeMaxWallets && remaining.length) {
      selected.push(remaining.shift());
    }

    if (selected.length < this.config.copyTradeMinWallets) {
      const fallback = remaining.filter((record) => !selected.some((entry) => entry.wallet === record.wallet));
      while (selected.length < this.config.copyTradeMinWallets && fallback.length) {
        selected.push(fallback.shift());
      }
    }

    const refreshed = this.trimWallets(selected.map((record) => this.buildWalletEntry(record, existingMap.get(record.wallet))));
    const existing = this.stateStore.state.copyTradeWallets || [];

    if (!this.areWalletListsEqual(existing, refreshed)) {
      logger.info({ event: 'copytrade_refresh', count: refreshed.length });
    }

    this.stateStore.state.copyTradeWallets = refreshed;
    return true;
  }

  areWalletListsEqual(current, next) {
    if (current.length !== next.length) return false;
    for (let i = 0; i < current.length; i += 1) {
      if (
        current[i].wallet !== next[i].wallet ||
        current[i].score !== next[i].score ||
        current[i].winRate !== next[i].winRate ||
        current[i].averageReturn !== next[i].averageReturn ||
        current[i].riskyTradeRate !== next[i].riskyTradeRate
      ) {
        return false;
      }
    }
    return true;
  }


  trimWallets(wallets) {
    const unique = wallets.reduce((acc, entry) => {
      if (!acc[entry.wallet] || acc[entry.wallet].score < entry.score) {
        acc[entry.wallet] = entry;
      }
      return acc;
    }, {});

    const sorted = Object.values(unique).sort(
      (a, b) =>
        b.score - a.score ||
        b.winRate - a.winRate ||
        b.averageReturn - a.averageReturn ||
        b.trades - a.trades ||
        (a.addedAt || 0) - (b.addedAt || 0)
    );
    return sorted.slice(0, this.config.copyTradeMaxWallets);
  }
}

module.exports = CopyTradeService;
