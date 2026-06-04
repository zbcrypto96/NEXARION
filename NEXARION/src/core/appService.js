const SolanaMonitorService = require('../scanners/solanaMonitorService');
const WalletIntelligenceService = require('../intelligence/walletIntelligenceService');
const WalletClusteringService = require('../intelligence/walletClusteringService');
const LaunchDetectionService = require('../intelligence/launchDetectionService');
const SignalScoringService = require('../intelligence/signalScoringService');
const PaperTradingEngine = require('../execution/paperTradingEngine');
const PriceFeedService = require('../utils/priceFeedService');
const WebServerService = require('../dashboard/webServerService');
const TelegramNotifier = require('../utils/telegramNotifier');
const StateStore = require('../data/stateStore');
const storage = require('../storage/jsonStorage');
const config = require('./config');
const logger = require('./logger');
const SafetyService = require('../utils/safetyService');
const CopyTradeService = require('../utils/copyTradeService');

class AppService {
  constructor() {
    this.stateStore = new StateStore({ storage, config });
    this.monitor = new SolanaMonitorService();
    this.notifier = new TelegramNotifier();
    this.copyTradeService = new CopyTradeService({ stateStore: this.stateStore, config, notifier: this.notifier });
    this.walletIntelligence = new WalletIntelligenceService({ stateStore: this.stateStore, copyTradeService: this.copyTradeService });
    this.clusterService = new WalletClusteringService({ stateStore: this.stateStore });
    this.launchDetection = new LaunchDetectionService({ stateStore: this.stateStore });
    this.scoringService = new SignalScoringService();
    this.safetyService = new SafetyService({ config });
    this.priceFeed = new PriceFeedService({ config });
    this.engine = new PaperTradingEngine({
      config,
      stateStore: this.stateStore,
      notifier: this.notifier,
      walletIntelligence: this.walletIntelligence,
      clusterService: this.clusterService,
      launchDetection: this.launchDetection,
      priceFeed: this.priceFeed,
    });
    this.dashboard = new WebServerService({ stateStore: this.stateStore, config });
    this.isPersisting = false;
  }

  async start() {
    await this.stateStore.load();
    await this.copyTradeService.refreshWallets();
    this.registerEventHandlers();
    this.dashboard.start();
    this.monitor.start();
    setInterval(() => this.persistState(), config.dashboardUpdateIntervalMs);
    setInterval(() => this.copyTradeService.refreshWallets(), config.copyTradeRefreshIntervalMs);
    this.scheduleDailySummary();
  }

  registerEventHandlers() {
    this.monitor.on('marketEvent', async (event) => {
      try {
        await this.handleMarketEvent(event);
      } catch (error) {
        logger.error({ event: 'market_event_error', message: error.message, stack: error.stack });
      }
    });

    this.engine.on('positionOpened', () => this.dashboard.broadcastUpdate());
    this.engine.on('positionClosed', () => this.dashboard.broadcastUpdate());
  }

  async handleMarketEvent(event) {
    logger.debug({ event: 'market_event', payload: event });

    this.walletIntelligence.recordWalletEvent(event);
    this.clusterService.recordActivity(event);
    this.launchDetection.recordMarketEvent(event);

    const launchProfile = this.launchDetection.getLaunchProfile(event.token);
    const walletScore = this.walletIntelligence.getWalletScore(event.wallet);
    const clusterConfidence = Number(this.clusterService.getClusterConfidenceForWallets([event.wallet]));

    // Run quick on-chain safety checks before committing to a trade
    const safety = await this.safetyService.quickCheck(event.tokenId);

    let baseScore = this.scoringService.score({
      walletScore,
      liquidityUsd: event.liquidityUsd,
      volumeUsd: event.volumeUsd,
      launchAgeHours: launchProfile.ageHours,
      clusterConfidence,
    });

    const finalScore = safety.risky ? Math.round(baseScore * safety.multiplier) : baseScore;

    const signal = {
      token: event.token,
      tokenId: event.tokenId,
      wallet: event.wallet,
      score: finalScore,
      baseScore,
      safety,
      walletScore,
      clusterConfidence,
      liquidityUsd: event.liquidityUsd,
      volumeUsd: event.volumeUsd,
      launchAgeHours: launchProfile.ageHours,
      price: undefined,
    };

    if (signal.score >= 7.0) {
      await this.engine.openPosition(signal);
    }

    await this.engine.updatePositions(event);
    this.stateStore.updateMetrics();
    this.dashboard.broadcastUpdate();
  }

  async persistState() {
    if (this.isPersisting) return;
    this.isPersisting = true;
    try {
      this.stateStore.updateMetrics();
      await this.stateStore.save();
      this.dashboard.broadcastUpdate();
    } catch (error) {
      logger.error({ event: 'persist_error', message: error.message, stack: error.stack });
    } finally {
      this.isPersisting = false;
    }
  }

  buildDailySummary() {
    const startingBalance = Number(config.startCapital || 0).toFixed(2);
    const endingBalance = Number(this.stateStore.state.capital || 0).toFixed(2);
    const pnlUsd = Number(endingBalance - startingBalance).toFixed(2);
    const pnlPct = startingBalance > 0
      ? Number(((endingBalance - startingBalance) / startingBalance) * 100).toFixed(2)
      : '0.00';
    const tradesMade = Array.isArray(this.stateStore.state.tradeHistory)
      ? this.stateStore.state.tradeHistory.length
      : 0;
    const date = new Date().toISOString().slice(0, 10);

    return `Daily summary ${date}\nStarting Balance $${startingBalance}\nEnding Balance $${endingBalance}\nPNL $${pnlUsd}\nPNL %${pnlPct}\nTrades made ${tradesMade}`;
  }

  async sendDailySummary(isTest = false) {
    if (!config.dailySummaryEnabled) return;
    const message = this.buildDailySummary();
    const prefix = isTest ? 'Daily summary test\n' : '';
    await this.notifier.sendMessage(`${prefix}${message}`);
  }

  getNextDailySummaryDelayMs() {
    const nowUtc = new Date();
    const mstOffsetMs = config.dailySummaryTimezoneOffsetHours * 60 * 60 * 1000;
    const nowMst = new Date(nowUtc.getTime() + mstOffsetMs);
    const year = nowMst.getUTCFullYear();
    const month = nowMst.getUTCMonth();
    const day = nowMst.getUTCDate();
    const utcHour = config.dailySummaryHour - config.dailySummaryTimezoneOffsetHours;
    const nextMstReportUtc = Date.UTC(year, month, day + 1, utcHour, config.dailySummaryMinute, 0);
    const msUntil = nextMstReportUtc - nowUtc.getTime();
    return msUntil > 0 ? msUntil : 24 * 60 * 60 * 1000;
  }

  scheduleDailySummary() {
    if (!config.dailySummaryEnabled) return;

    const sendNextSummary = async () => {
      try {
        await this.sendDailySummary();
      } catch (error) {
        logger.error({ event: 'daily_summary_error', message: error.message, stack: error.stack });
      } finally {
        setTimeout(sendNextSummary, this.getNextDailySummaryDelayMs());
      }
    };

    this.sendDailySummary(true).catch((error) => {
      logger.error({ event: 'daily_summary_test_error', message: error.message, stack: error.stack });
    });

    setTimeout(sendNextSummary, this.getNextDailySummaryDelayMs());
  }
}

module.exports = AppService;
