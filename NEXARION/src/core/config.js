const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

function parseFloatEnv(name, fallback) {
  const value = process.env[name];
  return value !== undefined && value !== '' ? Number.parseFloat(value) : fallback;
}

function parseIntEnv(name, fallback) {
  const value = process.env[name];
  return value !== undefined && value !== '' ? Number.parseInt(value, 10) : fallback;
}

function parseBoolEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return ['true', '1', 'yes'].includes(value.toLowerCase());
}

function parseListEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

const STORAGE_FOLDER = path.join(process.cwd(), 'storage');
const STORAGE_FILE = path.join(STORAGE_FOLDER, 'state.json');

module.exports = {
  mode: parseBoolEnv('PAPER_MODE', true),
  startCapital: parseFloatEnv('START_CAPITAL', 1000),
  maxConcurrentPositions: parseIntEnv('MAX_CONCURRENT_POSITIONS', 3),
  positionSizePercent: parseFloatEnv('POSITION_SIZE_PERCENT', 0.02),
  dailyLossLimitPercent: parseFloatEnv('DAILY_LOSS_LIMIT_PERCENT', 0.05),
  tradeSpacingMinutes: parseIntEnv('TRADE_SPACING_MINUTES', 20),
  correlationThreshold: parseFloatEnv('CORRELATION_THRESHOLD', 0.6),
  storageFolder: STORAGE_FOLDER,
  storageFile: STORAGE_FILE,
  serverPort: parseIntEnv('PORT', parseIntEnv('SERVER_PORT', 3000)),
  solanaRpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  heliusApiKey: process.env.HELIUS_API_KEY || '',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
  tradeReportEnabled: parseBoolEnv('TRADE_REPORT_ENABLED', true),
  marketPollIntervalMs: parseIntEnv('MARKET_POLL_INTERVAL_MS', 60000),
  dashboardUpdateIntervalMs: parseIntEnv('DASHBOARD_UPDATE_INTERVAL_MS', 5000),
  minLiquidityUsd: parseFloatEnv('MIN_LIQUIDITY_USD', 10000),
  minVolumeUsd: parseFloatEnv('MIN_VOLUME_USD', 5000),
  copyTradeAutoAdd: parseBoolEnv('COPYTRADE_AUTO_ADD', true),
  copyTradeMinWallets: parseIntEnv('COPYTRADE_MIN_WALLETS', 20),
  copyTradeMaxWallets: parseIntEnv('COPYTRADE_MAX_WALLETS', 50),
  copyTradeMinTrades: parseIntEnv('COPYTRADE_MIN_TRADES', 3),
  copyTradeMinScore: parseFloatEnv('COPYTRADE_MIN_SCORE', 0.65),
  copyTradeMinWinRate: parseFloatEnv('COPYTRADE_MIN_WIN_RATE', 0.6),
  copyTradeMinAverageReturn: parseFloatEnv('COPYTRADE_MIN_AVERAGE_RETURN', 0.08),
  copyTradeMaxRiskyTrades: parseIntEnv('COPYTRADE_MAX_RISKY_TRADES', 1),
  copyTradeMaxRiskyTradeRate: parseFloatEnv('COPYTRADE_MAX_RISKY_TRADE_RATE', 0.25),
  copyTradeSeedWallets: parseListEnv('COPYTRADE_SEED_WALLETS', []),
  copyTradeRefreshIntervalMs: parseIntEnv('COPYTRADE_REFRESH_INTERVAL_MS', 60000),
  dailySummaryEnabled: parseBoolEnv('DAILY_SUMMARY_ENABLED', true),
  dailySummaryTimezoneOffsetHours: parseFloatEnv('DAILY_SUMMARY_TZ_OFFSET_HOURS', -7),
  dailySummaryHour: parseIntEnv('DAILY_SUMMARY_HOUR', 0),
  dailySummaryMinute: parseIntEnv('DAILY_SUMMARY_MINUTE', 0),
  watchMaxRestarts: parseIntEnv('WATCH_MAX_RESTARTS', 5),
  watchRestartWindowMinutes: parseIntEnv('WATCH_RESTART_WINDOW_MINUTES', 10),
  watchLogFolder: path.join(process.cwd(), 'logs'),
  watchLogFile: path.join(process.cwd(), 'logs', 'watchdog.log'),
};
