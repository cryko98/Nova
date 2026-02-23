import Database from 'better-sqlite3';

export class SimulationEngine {
  private db: any;
  private jupiterApiUrl = 'https://quote-api.jup.ag/v6';

  constructor(db: any) {
    this.db = db;
  }

  /**
   * Fetch current price for a token pair from DexScreener
   */
  async getCurrentPrice(tokenAddress: string): Promise<number> {
    try {
      const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
      const data = await response.json();
      const pair = data.pairs?.find((p: any) => p.chainId === 'solana');
      
      if (pair?.priceUsd) {
        return parseFloat(pair.priceUsd);
      }

      // Fallback to Pump.fun API if not on DexScreener yet
      const pumpRes = await fetch(`https://frontend-api.pump.fun/coins/${tokenAddress}`);
      if (pumpRes.ok) {
        const coin = await pumpRes.json();
        return (coin.usd_market_cap || 0) / 1000000000;
      }

      return 0;
    } catch (e) {
      console.error("Failed to fetch price:", e);
      return 0;
    }
  }

  /**
   * Filter tokens based on volume, liquidity, and age
   */
  filterTokens(pairs: any[]): any[] {
    const minVolume = parseFloat(process.env.MIN_VOLUME_24H || "50000");
    const minLiquidity = parseFloat(process.env.MIN_LIQUIDITY_USD || "10000");
    const maxAgeMs = parseInt(process.env.MAX_COIN_AGE_DAYS || "14") * 24 * 60 * 60 * 1000;
    const now = Date.now();

    return pairs.filter((p: any) => {
      const ageMs = now - (p.pairCreatedAt || 0);
      return p.chainId === 'solana' && 
             (p.volume?.h24 || 0) >= minVolume && 
             (p.liquidity?.usd || 0) >= minLiquidity &&
             ageMs <= maxAgeMs;
    }).slice(0, 10);
  }

  /**
   * Execute a virtual buy
   */
  async executeVirtualBuy(tokenAddress: string, tokenSymbol: string, amountSol: number) {
    const priceUsd = await this.getCurrentPrice(tokenAddress);
    if (priceUsd === 0) {
      console.warn(`Could not determine price for ${tokenSymbol}, using placeholder.`);
    }

    const finalPrice = priceUsd || 0.000000001;
    const amountToken = (amountSol * 150) / finalPrice; // Simplified SOL/USD conversion for demo

    this.db.transaction(() => {
      // Deduct from virtual balance
      this.db.prepare("UPDATE settings SET value = value - ? WHERE key = 'virtual_balance'").run(amountSol);

      // Record trade
      this.db.prepare(`
        INSERT INTO trades (token_address, token_symbol, type, amount_sol, amount_token, price_usd, is_simulated)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `).run(tokenAddress, tokenSymbol, 'BUY', amountSol, amountToken, finalPrice);

      // Create position
      this.db.prepare(`
        INSERT INTO positions (token_address, token_symbol, entry_price, amount_token, status, is_simulated)
        VALUES (?, ?, ?, ?, 'OPEN', 1)
      `).run(tokenAddress, tokenSymbol, finalPrice, amountToken);

      this.db.prepare("INSERT INTO logs (message, level) VALUES (?, ?)").run(
        `[SIMULATION] Virtual Buy: ${amountSol} SOL of ${tokenSymbol} at $${finalPrice}`,
        "INFO"
      );
    })();

    return { success: true, priceUsd: finalPrice };
  }

  /**
   * Execute a virtual sell
   */
  async executeVirtualSell(tokenAddress: string, amountToken: number) {
    const priceUsd = await this.getCurrentPrice(tokenAddress);
    const position = this.db.prepare("SELECT * FROM positions WHERE token_address = ? AND status = 'OPEN'").get(tokenAddress);
    
    if (!position) return;

    const pnl = ((priceUsd - position.entry_price) / position.entry_price) * 100;
    const solReturned = (amountToken * priceUsd) / 150;

    this.db.transaction(() => {
      // Add to virtual balance
      this.db.prepare("UPDATE settings SET value = value + ? WHERE key = 'virtual_balance'").run(solReturned);

      // Record trade
      this.db.prepare(`
        INSERT INTO trades (token_address, token_symbol, type, amount_sol, amount_token, price_usd, is_simulated)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `).run(tokenAddress, position.token_symbol, 'SELL', solReturned, amountToken, priceUsd);

      // Close position
      this.db.prepare("UPDATE positions SET status = 'CLOSED', pnl_percent = ? WHERE id = ?").run(pnl, position.id);

      this.db.prepare("INSERT INTO logs (message, level) VALUES (?, ?)").run(
        `[SIMULATION] Virtual Sell: ${position.token_symbol} closed at $${priceUsd} (PnL: ${pnl.toFixed(2)}%)`,
        "INFO"
      );
    })();
  }
}
