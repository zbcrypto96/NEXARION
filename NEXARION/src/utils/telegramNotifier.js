const axios = require('axios');
const logger = require('../core/logger');
const config = require('../core/config');

class TelegramNotifier {
  constructor() {
    this.enabled = Boolean(config.telegramBotToken && config.telegramChatId);
    this.baseUrl = this.enabled ? `https://api.telegram.org/bot${config.telegramBotToken}` : null;
  }

  async sendMessage(text) {
    if (!this.enabled) {
      logger.warn({ event: 'telegram_disabled', message: 'Telegram notifier is not configured' });
      return false;
    }

    try {
      await axios.post(`${this.baseUrl}/sendMessage`, {
        chat_id: config.telegramChatId,
        text,
        parse_mode: 'Markdown',
      });
      logger.info({ event: 'telegram_message_sent', message: text });
      return true;
    } catch (error) {
      logger.error({ event: 'telegram_error', message: error.message, payload: text });
      return false;
    }
  }

  async sendTradeNotification(trade) {
    const currentCapital = typeof trade.currentCapital === 'number' ? trade.currentCapital : 0;
    const text = `TRADE CLOSED\n${trade.token}\nPNL $${trade.pnlUsd.toFixed(2)}\nPNL %${trade.returnPct.toFixed(2)}\nCurrent capital $${currentCapital.toFixed(2)}`;
    return this.sendMessage(text);
  }
}

module.exports = TelegramNotifier;
