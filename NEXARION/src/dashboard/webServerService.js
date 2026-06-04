const express = require('express');
const WebSocket = require('ws');
const logger = require('../core/logger');

class WebServerService {
  constructor({ stateStore, config }) {
    this.stateStore = stateStore;
    this.config = config;
    this.server = null;
    this.wss = null;
  }

  start() {
    const app = express();
    app.use(express.json());

    app.get('/api/status', (req, res) => {
      return res.json({
        capital: this.stateStore.state.capital,
        availableCapital: this.stateStore.state.availableCapital,
        realizedPnl: this.stateStore.state.realizedPnl,
        openPositions: this.stateStore.state.openPositions,
        metrics: this.stateStore.state.metrics,
        knownTokens: this.stateStore.state.knownTokens,
      });
    });

    app.get('/api/positions', (req, res) => res.json(this.stateStore.state.openPositions));
    app.get('/api/trades', (req, res) => res.json(this.stateStore.state.tradeHistory));
    app.get('/api/wallets', (req, res) => res.json(this.stateStore.state.walletPerformance));
    app.get('/api/copytrade', (req, res) => res.json(this.stateStore.state.copyTradeWallets || []));

    app.get('/api/copytrade/config', (req, res) => {
      return res.json({
        autoAdd: this.config.copyTradeAutoAdd,
        minWallets: this.config.copyTradeMinWallets,
        maxWallets: this.config.copyTradeMaxWallets,
        minTrades: this.config.copyTradeMinTrades,
        minScore: this.config.copyTradeMinScore,
        minWinRate: this.config.copyTradeMinWinRate,
        minAverageReturn: this.config.copyTradeMinAverageReturn,
        walletCount: (this.stateStore.state.copyTradeWallets || []).length,
      });
    });

    app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: Date.now() }));

    this.server = app.listen(this.config.serverPort, () => {
      logger.info({ event: 'dashboard_start', port: this.config.serverPort });
    });

    this.wss = new WebSocket.Server({ server: this.server });
    this.wss.on('connection', (ws) => {
      logger.info({ event: 'ws_connection', message: 'Dashboard client connected' });
      ws.send(JSON.stringify({ type: 'snapshot', data: this.buildSnapshot() }));
    });
  }

  buildSnapshot() {
    return {
      capital: this.stateStore.state.capital,
      availableCapital: this.stateStore.state.availableCapital,
      realizedPnl: this.stateStore.state.realizedPnl,
      openPositions: this.stateStore.state.openPositions,
      tradeHistory: this.stateStore.state.tradeHistory.slice(-30),
      metrics: this.stateStore.state.metrics,
      copyTradeWallets: this.stateStore.state.copyTradeWallets || [],
    };
  }

  broadcastUpdate() {
    if (!this.wss) return;
    const payload = JSON.stringify({ type: 'update', data: this.buildSnapshot() });
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }
}

module.exports = WebServerService;
