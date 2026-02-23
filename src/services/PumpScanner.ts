import { TokenData } from "./AutonomousEngine";
import { SimulationEngine } from "./SimulationEngine";
import { AutonomousEngine } from "./AutonomousEngine";

export class PumpScanner {
  private db: any;
  private simulationEngine: SimulationEngine;
  private autonomousEngine: AutonomousEngine;
  private isScanning: boolean = false;

  constructor(db: any, simulationEngine: SimulationEngine, autonomousEngine: AutonomousEngine) {
    this.db = db;
    this.simulationEngine = simulationEngine;
    this.autonomousEngine = autonomousEngine;
  }

  async start() {
    if (this.isScanning) return;
    this.isScanning = true;
    const intervalMs = parseInt(process.env.SCAN_INTERVAL_MS || "3000");
    
    console.log(`Starting Pump.fun High-Frequency Scanner (${intervalMs}ms)...`);
    
    this.db.prepare("INSERT INTO logs (message, level) VALUES (?, ?)").run(
      `Pump.fun Scanner Active. Mode: ${process.env.DETECTION_MODE}. Interval: ${intervalMs}ms`,
      "INFO"
    );

    // Initial scan
    await this.scan();
    await this.updatePnL();

    // High-frequency intervals
    setInterval(() => this.scan(), intervalMs);
    setInterval(() => this.updatePnL(), 10000); // PnL update can be slightly slower
  }

  private async scan() {
    try {
      const minVolume = parseFloat(process.env.MIN_VOLUME_USD || "5000");
      const maxAgeMinutes = parseInt(process.env.MAX_COIN_AGE_MINUTES || "60");
      const now = Date.now();

      const response = await fetch("https://frontend-api.pump.fun/coins/latest?limit=20&offset=0&includeNsfw=false");
      if (!response.ok) return;
      
      const coins = await response.json();
      
      for (const coin of coins) {
        try {
          const ageMinutes = (now - (coin.created_timestamp || now)) / 60000;
          const volume = coin.usd_market_cap || 0; // Using market cap as a proxy for volume/interest in early stages

          // Filter: Created in last X minutes and has minimum "volume" (market cap)
          if (ageMinutes > maxAgeMinutes || volume < minVolume) {
            continue;
          }

          const tokenData: TokenData = {
            address: coin.mint,
            symbol: coin.symbol || 'UNKNOWN',
            name: coin.name || 'Unknown Token',
            priceUsd: coin.usd_market_cap / 1000000000,
            liquidityUsd: coin.usd_market_cap * 0.15, // Conservative liquidity estimate
            volume24h: volume,
            mintDisabled: true,
            lpBurnt: true,
          };

          // Update opportunities table
          this.db.prepare(`
            INSERT OR REPLACE INTO opportunities (token_address, token_symbol, liquidity_usd, price_usd, is_safe, safety_score)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            tokenData.address,
            tokenData.symbol,
            tokenData.liquidityUsd,
            tokenData.priceUsd,
            1,
            100
          );

          // Autonomous Decision Making
          await this.autonomousEngine.analyzeAndTrade(tokenData);

        } catch (e) {
          console.error(`Error processing Pump.fun token ${coin.mint}:`, e);
        }
      }
    } catch (error) {
      console.error("Pump.fun Scanner error:", error);
    }
  }

  private async updatePnL() {
    try {
      const positions = this.db.prepare("SELECT * FROM positions WHERE status = 'OPEN'").all();
      for (const pos of positions) {
        // For Pump.fun tokens, we might need a different price source if DexScreener hasn't indexed them yet
        // But DexScreener is usually fast.
        const { priceUsd, marketCap } = await this.simulationEngine.getCurrentPrice(pos.token_address);
        
        if (priceUsd > 0) {
          const pnl = ((priceUsd - pos.entry_price) / pos.entry_price) * 100;
          this.db.prepare("UPDATE positions SET pnl_percent = ?, market_cap = ? WHERE id = ?").run(pnl, marketCap, pos.id);
          
          // Auto-sell logic
          const sl = parseFloat(process.env.STOP_LOSS_PCT || "15");
          const tp = parseFloat(process.env.TAKE_PROFIT_PCT || "30");
          
          if (pnl <= -sl || pnl >= tp) {
            await this.simulationEngine.executeVirtualSell(pos.token_address, pos.amount_token);
          }
        }
      }
    } catch (e) {
      console.error("PnL Update error:", e);
    }
  }
}
