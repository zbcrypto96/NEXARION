const logger = require('../core/logger');

class LaunchDetectionService {
  constructor({ stateStore }) {
    this.stateStore = stateStore;
  }

  recordMarketEvent(event) {
    if (!event.token) return;
    const token = event.token;
    const record = this.stateStore.state.knownTokens[token] || {
      firstSeenAt: Date.now(),
      liquiditySeenAt: null,
      launchEvents: 0,
    };

    if (event.type === 'liquidity') {
      record.liquiditySeenAt = record.liquiditySeenAt || Date.now();
    }
    if (event.type === 'launch') {
      record.launchEvents += 1;
    }

    this.stateStore.state.knownTokens[token] = record;
    logger.debug({ event: 'launch_recorded', token, record });
  }

  getLaunchProfile(token) {
    const record = this.stateStore.state.knownTokens[token];
    if (!record) {
      return {
        ageHours: 0,
        isNewLaunch: true,
        isPreLiquidity: true,
      };
    }

    const ageHours = (Date.now() - record.firstSeenAt) / 1000 / 60 / 60;
    return {
      ageHours: Number(ageHours.toFixed(2)),
      isNewLaunch: ageHours < 72,
      isPreLiquidity: !record.liquiditySeenAt || record.liquiditySeenAt > record.firstSeenAt,
    };
  }
}

module.exports = LaunchDetectionService;
