# NovaTrader Deployment Guide

This guide explains how to deploy the NovaTrader Autonomous Trading Agent.

## 1. Prerequisites
- **Solana Wallet**: You need a Solana wallet with some SOL for trading.
- **Helius API Key**: For reliable RPC access. [Get one here](https://www.helius.dev/).
- **OpenRouter/Gemini API Key**: For the AI agent's reasoning.

## 2. Environment Variables
Configure the following in your deployment environment (Vercel, Railway, etc.):

```env
GEMINI_API_KEY=your_key
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=your_key
WALLET_PRIVATE_KEY=your_base58_private_key
JUPITER_API_URL=https://quote-api.jup.ag/v6
STOP_LOSS_PCT=15
TAKE_PROFIT_PCT=30
```

## 3. Deployment Options

### Frontend (Dashboard)
The dashboard is a React app. You can deploy it to **Vercel** or **Netlify**.
1. Push this code to a GitHub repository.
2. Connect the repository to Vercel.
3. Vercel will automatically detect the build settings (`npm run build`).

### Backend (Agent Logic)
The agent needs to run continuously. We recommend a VPS or a container service:
- **Railway**: Easiest for Express/Node.js apps.
- **Hetzner/DigitalOcean**: Standard VPS.
  - Install Node.js 20+.
  - Clone the repo.
  - Run `npm install`.
  - Run `npm run build`.
  - Start with `npm start` (or use `pm2` for process management).

## 4. Security Warnings
- **Private Keys**: Never commit your `WALLET_PRIVATE_KEY` to GitHub. Always use environment variables.
- **Slippage**: Meme coins are volatile. The default slippage is set to 0.5% (50 bps) in the code, but you may need to increase it for high-tax tokens.
- **Safety Checks**: The current safety check is a skeleton. Before live trading, integrate a real security API like RugCheck.

## 5. Cost Optimization
- **RPC**: Helius free tier is generous for basic scanning.
- **LLM**: Gemini 1.5 Flash is highly cost-effective for trading logic.
- **Hosting**: Railway's hobby plan ($5/mo) is sufficient for this agent.
