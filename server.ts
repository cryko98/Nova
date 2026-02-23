console.log("Starting server.ts...");

import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { SimulationEngine } from "./src/services/SimulationEngine";
import { AutonomousEngine, TokenData } from "./src/services/AutonomousEngine";
import { PumpScanner } from "./src/services/PumpScanner";

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
      market_cap REAL DEFAULT 0,
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

const simulationEngine = new SimulationEngine(db);
const autonomousEngine = new AutonomousEngine(db, simulationEngine);
const pumpScanner = new PumpScanner(db, simulationEngine, autonomousEngine);

async function startServer() {
  console.log("NODE_ENV:", process.env.NODE_ENV);
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // DEBUG LOGGING
  app.use((req, res, next) => {
    if (!req.url.startsWith('/@vite') && !req.url.startsWith('/src')) {
      console.log(`[EXPRESS] ${req.method} ${req.url}`);
    }
    next();
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // API Routes - Direct mount for maximum reliability
  app.get("/api/stats", (req, res) => {
    console.log("Handling /api/stats request");
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

  // API 404 handler
  app.use("/api/*", (req, res) => {
    res.status(404).json({ error: "API Route Not Found" });
  });

  // Logging middleware
  app.use((req, res, next) => {
    if (!req.url.startsWith('/@vite') && !req.url.startsWith('/src')) {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    }
    next();
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
    pumpScanner.start().catch(err => console.error("PumpScanner failed to start:", err));
  });
}

// Seed some mock data if empty
const tradeCount = db.prepare("SELECT COUNT(*) as count FROM trades").get() as { count: number };
if (tradeCount.count === 0) {
  db.prepare("INSERT INTO logs (message, level) VALUES (?, ?)").run("Agent started. Scanning for new tokens...", "INFO");
}

startServer().catch(err => console.error("Server failed to start:", err));
