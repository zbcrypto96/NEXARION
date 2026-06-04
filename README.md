# NEXARION

This repository contains the NEXARION Node.js paper-trading and analytics platform. The application code lives in the `NEXARION/` subfolder.

## Railway Deployment

A root-level `Dockerfile` is included to enable Railway deployment from the repository root. Railway will build the app from the `NEXARION` folder and run `npm start`.

Set the following Railway environment variables as needed:
- `PORT`
- `PAPER_MODE`
- `START_CAPITAL`
- `SOLANA_RPC_URL`
- `HELIUS_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TRADE_REPORT_ENABLED`

For local development, change into the `NEXARION` folder and run:

```bash
cd NEXARION
npm start
```
