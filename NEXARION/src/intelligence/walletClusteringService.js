const logger = require('../core/logger');

class WalletClusteringService {
  constructor({ stateStore }) {
    this.stateStore = stateStore;
  }

  recordActivity(event) {
    if (!event.wallet || !event.token) return;
    const wallet = event.wallet;
    const token = event.token;
    const walletEvents = new Set(this.stateStore.state.walletEvents[wallet] || []);
    walletEvents.add(token);
    this.stateStore.state.walletEvents[wallet] = Array.from(walletEvents);
    this.buildClusters();
  }

  buildClusters() {
    const walletKeys = Object.keys(this.stateStore.state.walletEvents);
    const clusters = [];

    for (let i = 0; i < walletKeys.length; i += 1) {
      const walletA = walletKeys[i];
      const tokensA = this.stateStore.state.walletEvents[walletA] || [];
      for (let j = i + 1; j < walletKeys.length; j += 1) {
        const walletB = walletKeys[j];
        const tokensB = this.stateStore.state.walletEvents[walletB] || [];
        const shared = tokensA.filter((token) => tokensB.includes(token));
        const union = new Set([...tokensA, ...tokensB]);
        const confidence = union.size > 0 ? shared.length / union.size : 0;
        if (confidence >= 0.2) {
          clusters.push({
            wallets: [walletA, walletB],
            sharedTokens: shared,
            confidence: Number(confidence.toFixed(3)),
          });
        }
      }
    }

    this.stateStore.state.clusters = clusters;
    logger.debug({ event: 'clusters_updated', count: clusters.length });
  }

  getClusterConfidenceForWallets(wallets) {
    if (!Array.isArray(wallets) || wallets.length === 0) {
      return 0;
    }
    const clusters = this.stateStore.state.clusters.filter((cluster) =>
      wallets.every((wallet) => cluster.wallets.includes(wallet)),
    );
    if (clusters.length === 0) return 0;
    return Number((clusters.reduce((sum, cluster) => sum + cluster.confidence, 0) / clusters.length).toFixed(3));
  }
}

module.exports = WalletClusteringService;
