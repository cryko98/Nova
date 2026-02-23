import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db: any;
try {
  db = new Database("trading_agent.db");
  // Initialize Database
  db.exec(`
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_address TEXT NOT NULL,
      token_symbol TEXT,
      type TEXT NOT NULL, -- 'BUY' or 'SELL'
      amount_sol REAL,
      amount_token REAL,
      price_usd REAL,
      is_simulated INTEGER DEFAULT 0,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_address TEXT UNIQUE NOT NULL,
      token_symbol TEXT,
      entry_price REAL,
      amount_token REAL,
      status TEXT DEFAULT 'OPEN',
      pnl_percent REAL DEFAULT 0,
      is_simulated INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    INSERT OR IGNORE INTO settings (key, value) VALUES ('virtual_balance', '10.0');

    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message TEXT,
      level TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS opportunities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_address TEXT UNIQUE NOT NULL,
      token_symbol TEXT,
      liquidity_usd REAL,
      volume_24h REAL,
      price_usd REAL,
      is_safe INTEGER DEFAULT 0,
      safety_score INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
} catch (e) {
  console.error("Failed to initialize database, using mock mode:", e);
  db = {
    prepare: () => ({
      all: () => [],
      get: () => ({ count: 0 }),
      run: () => {}
    }),
    exec: () => {}
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Logging middleware
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });

  app.use(express.json());

  // Health check - No DB dependency
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // API Routes
  app.get("/api/stats", (req, res) => {
    try {
      if (!db || typeof db.prepare !== 'function') {
        throw new Error("Database not initialized");
      }
      const activePositions = db.prepare("SELECT * FROM positions WHERE status = 'OPEN'").all();
      const recentTrades = db.prepare("SELECT * FROM trades ORDER BY timestamp DESC LIMIT 10").all();
      const logs = db.prepare("SELECT * FROM logs ORDER BY timestamp DESC LIMIT 20").all();
      const opportunities = db.prepare("SELECT * FROM opportunities ORDER BY created_at DESC LIMIT 5").all();
      const virtualBalance = db.prepare("SELECT value FROM settings WHERE key = 'virtual_balance'").get();
      
      res.json({
        balance: { 
          sol: 1.25, 
          usd: 125.50,
          virtual_sol: parseFloat(virtualBalance?.value || '0'),
          virtual_usd: parseFloat(virtualBalance?.value || '0') * 150
        },
        isPaperTrading: process.env.PAPER_TRADING_MODE === 'true',
        activePositions,
        recentTrades,
        logs,
        opportunities
      });
    } catch (error) {
      console.error("Error in /api/stats:", error);
      res.status(500).json({ 
        error: "Internal Server Error", 
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get("/api/config", (req, res) => {
    try {
      res.json({
        rpcUrl: process.env.SOLANA_RPC_URL ? "Configured" : "Missing",
        wallet: process.env.WALLET_PRIVATE_KEY ? "Configured" : "Missing",
        strategy: {
          stopLoss: process.env.STOP_LOSS_PCT || 15,
          takeProfit: process.env.TAKE_PROFIT_PCT || 30
        }
      });
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting Vite in middleware mode...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Serving static files from dist...");
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    startScanner().catch(err => console.error("Scanner failed to start:", err));
  });
}

import { SimulationEngine } from "./src/services/SimulationEngine";
import { AutonomousEngine, TokenData } from "./src/services/AutonomousEngine";

const simulationEngine = new SimulationEngine(db);
const autonomousEngine = new AutonomousEngine(db, simulationEngine);

async function startScanner() {
  console.log("Starting Autonomous Token Scanner...");
  
  const scan = async () => {
    try {
      // 1. Fetch latest token profiles from DEX Screener
      // We use the search API to find active Solana pairs
      const response = await fetch("https://api.dexscreener.com/latest/dex/search?q=solana");
      if (!response.ok) return;
      
      const data = await response.json();
      const pairs = data.pairs || [];
      
      // Filter for Solana pairs using the simulation engine's logic
      const filteredPairs = simulationEngine.filterTokens(pairs);
      
      for (const pair of filteredPairs) {
        try {
          const tokenData: TokenData = {
            address: pair.baseToken.address,
            symbol: pair.baseToken.symbol || 'UNKNOWN',
            name: pair.baseToken.name || 'Unknown Token',
            priceUsd: parseFloat(pair.priceUsd || '0'),
            liquidityUsd: pair.liquidity?.usd || 0,
            volume24h: pair.volume?.h24 || 0,
            mintDisabled: Math.random() > 0.2, // Simulated security check
            lpBurnt: Math.random() > 0.3,     // Simulated security check
          };

          // 3. Update opportunities table
          const safetyScore = (tokenData.mintDisabled ? 50 : 0) + (tokenData.lpBurnt ? 50 : 0);
          
          db.prepare(`
            INSERT OR REPLACE INTO opportunities (token_address, token_symbol, liquidity_usd, price_usd, is_safe, safety_score)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            tokenData.address,
            tokenData.symbol,
            tokenData.liquidityUsd,
            tokenData.priceUsd,
            safetyScore >= 80 ? 1 : 0,
            safetyScore
          );

          // 4. Autonomous Decision Making
          await autonomousEngine.analyzeAndTrade(tokenData);

        } catch (e) {
          console.error(`Error processing token ${pair.baseToken.address}:`, e);
        }
      }
    } catch (error) {
      console.error("Scanner error:", error);
    }
  };

  const updatePnL = async () => {
    try {
      const positions = db.prepare("SELECT * FROM positions WHERE status = 'OPEN'").all();
      for (const pos of positions) {
        const currentPrice = await simulationEngine.getCurrentPrice(pos.token_address);
        if (currentPrice > 0) {
          const pnl = ((currentPrice - pos.entry_price) / pos.entry_price) * 100;
          db.prepare("UPDATE positions SET pnl_percent = ? WHERE id = ?").run(pnl, pos.id);
          
          // Auto-sell logic (Stop Loss / Take Profit)
          const sl = parseFloat(process.env.STOP_LOSS_PCT || "15");
          const tp = parseFloat(process.env.TAKE_PROFIT_PCT || "30");
          
          if (pnl <= -sl || pnl >= tp) {
            await simulationEngine.executeVirtualSell(pos.token_address, pos.amount_token);
          }
        }
      }
    } catch (e) {
      console.error("PnL Update error:", e);
    }
  };

  // Initial scan and PnL update
  await scan();
  await updatePnL();

  // Intervals
  setInterval(scan, 60000); // Scan every minute
  setInterval(updatePnL, 30000); // Update PnL every 30 seconds
}

// Seed some mock data if empty
const tradeCount = db.prepare("SELECT COUNT(*) as count FROM trades").get() as { count: number };
if (tradeCount.count === 0) {
  db.prepare("INSERT INTO logs (message, level) VALUES (?, ?)").run("Agent started. Scanning for new tokens...", "INFO");
}

startServer();
