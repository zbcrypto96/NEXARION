# NEXARION

This repository contains the NEXARION Node.js paper-trading and analytics platform. The application code lives in the `NEXARION/` subfolder.

## Railway Deployment

A root-level `Dockerfile` is included to enable Railway deployment from the repository root. Railway will build the app from the `NEXARION` folder and run `npm start`.

Railway-specific configuration files are included:
- `Procfile` — locks the web process start command to `cd NEXARION && npm start`
- `railway.json` — instructs Railway to use the Docker builder and the app start command
- `.env.example` — root example environment file for Railway and local dev

Set the following Railway environment variables as needed:
- `PORT` (Railway will provide one automatically)
- `PAPER_MODE` (true/false)
- `START_CAPITAL`
- `SOLANA_RPC_URL` (a valid Solana JSON-RPC endpoint, e.g. `https://api.mainnet-beta.solana.com`)
- `HELIUS_API_KEY` (recommended for Helius event scanning)
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TRADE_REPORT_ENABLED`

If you want Helius transaction signals, prefer setting `HELIUS_API_KEY` separately and using a standard public RPC provider for `SOLANA_RPC_URL`.
If you are using a Helius RPC endpoint directly, keep `HELIUS_API_KEY` set too so Helius event polling is enabled.

Example Railway environment values:

```env
PORT=3000
PAPER_MODE=true
START_CAPITAL=1000
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
HELIUS_API_KEY=your_helius_api_key_here
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
TRADE_REPORT_ENABLED=true
```

For local development, change into the `NEXARION` folder and run:

```bash
cd NEXARION
npm start
```
