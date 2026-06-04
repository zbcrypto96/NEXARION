const AppService = require('./core/appService');
const logger = require('./core/logger');
const TelegramNotifier = require('./utils/telegramNotifier');

const notifier = new TelegramNotifier();

async function start() {
  try {
    const app = new AppService();
    await app.start();
    logger.info({ event: 'startup', message: 'NEXARION paper trading engine is live' });
  } catch (error) {
    logger.error({ event: 'startup_error', message: error.message, stack: error.stack });
    process.exit(1);
  }
}

process.on('uncaughtException', (error) => {
  logger.error({ event: 'uncaught_exception', message: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ event: 'unhandled_rejection', reason });
  process.exit(1);
});

start();
