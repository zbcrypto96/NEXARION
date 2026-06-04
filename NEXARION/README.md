# NEXARION

NEXARION is a Node.js paper-trading cryptocurrency intelligence and execution simulation platform built for Solana market monitoring.

## Features

- Real Solana market event scanning for token launches, liquidity flow, volume spikes, and wallet activity
- Wallet intelligence scoring with win rate, average return, and early-entry performance
- Wallet clustering for co-movement analysis and confidence scoring
- Launch detection and early-stage signal generation
- Signal scoring from 0 to 10 using liquidity, volume, wallet quality, launch age, and cluster confidence
- Risk controls for max positions, position sizing, daily loss protection, trade spacing, and correlation
- Paper trading simulation with PnL, win rate, and trade history
- Express dashboard with live API and WebSocket updates
- Structured logging and JSON persistence across restarts

## Run Locally

1. Duplicate `.env.example` to `.env`
2. Set your Telegram bot values if you want trade notifications:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
3. Run the platform:

```bash
npm start
```

4. Open the dashboard API at:

```bash
http://localhost:3000/api/status
```

## Environment

- `PAPER_MODE=true`
- `START_CAPITAL=1000`
- `SOLANA_RPC_URL=https://api.mainnet-beta.solana.com`
- `HELIUS_API_KEY=` (recommended for real Solana transaction signals)
- `TELEGRAM_BOT_TOKEN=`
- `TELEGRAM_CHAT_ID=`
- `TRADE_REPORT_ENABLED=true`

### Real data requirements

To use real Solana market events and more realistic token signal generation, add a `HELIUS_API_KEY` to your `.env`. Without it, the platform will still run and scan RPC events, but Helius provides richer token activity signals for real-time paper trading.

## Notes

- This project uses CommonJS modules and is configured for GitHub Codespaces and Railway deployment.
- The trading engine is entirely simulated; no real trade execution is performed.
