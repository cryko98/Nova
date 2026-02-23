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
    console.log("Starting Pump.fun Autonomous Scanner...");
    
    this.db.prepare("INSERT INTO logs (message, level) VALUES (?, ?)").run(
      "Pump.fun Scanner initialized. Monitoring bonding curves...",
      "INFO"
    );

    // Initial scan
    await this.scan();
    await this.updatePnL();

    // Intervals
    setInterval(() => this.scan(), 30000); // Scan every 30 seconds for Pump.fun
    setInterval(() => this.updatePnL(), 15000); // Update PnL every 15 seconds
  }

  private async scan() {
    try {
      // Use Pump.fun API for latest coins
      const response = await fetch("https://frontend-api.pump.fun/coins/latest?limit=20&offset=0&sort=created_timestamp&order=DESC&includeNsfw=false");
      if (!response.ok) {
        console.error("Pump.fun API error:", response.status);
        return;
      }
      
      const coins = await response.json();
      
      for (const coin of coins) {
        try {
          // Pump.fun specific filters
          // We look for tokens with some volume/activity
          const volume = coin.usd_market_cap || 0; // Market cap as a proxy for early interest
          
          const tokenData: TokenData = {
            address: coin.mint,
            symbol: coin.symbol || 'UNKNOWN',
            name: coin.name || 'Unknown Token',
            priceUsd: coin.usd_market_cap / 1000000000, // Very rough estimate for early pricing
            liquidityUsd: coin.usd_market_cap * 0.2, // Rough estimate of bonding curve liquidity
            volume24h: volume,
            mintDisabled: true, // Pump.fun tokens have mint disabled by default
            lpBurnt: true,      // Pump.fun tokens have LP "burnt" (locked in curve)
          };

          // Update opportunities table
          const safetyScore = 100; // Pump.fun tokens are technically "safe" from standard rugs
          
          this.db.prepare(`
            INSERT OR REPLACE INTO opportunities (token_address, token_symbol, liquidity_usd, price_usd, is_safe, safety_score)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            tokenData.address,
            tokenData.symbol,
            tokenData.liquidityUsd,
            tokenData.priceUsd,
            1,
            safetyScore
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
        const currentPrice = await this.simulationEngine.getCurrentPrice(pos.token_address);
        
        if (currentPrice > 0) {
          const pnl = ((currentPrice - pos.entry_price) / pos.entry_price) * 100;
          this.db.prepare("UPDATE positions SET pnl_percent = ? WHERE id = ?").run(pnl, pos.id);
          
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
