import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Wallet, 
  TrendingUp, 
  History, 
  ShieldCheck, 
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Terminal as TerminalIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Position {
  id: number;
  token_address: string;
  token_symbol: string;
  entry_price: number;
  amount_token: number;
  status: string;
  pnl_percent: number;
  is_simulated: number;
  created_at: string;
}

interface Trade {
  id: number;
  token_symbol: string;
  type: string;
  amount_sol: number;
  price_usd: number;
  is_simulated: number;
  timestamp: string;
}

interface Log {
  id: number;
  message: string;
  level: string;
  timestamp: string;
}

interface Opportunity {
  id: number;
  token_address: string;
  token_symbol: string;
  liquidity_usd: number;
  safety_score: number;
  is_safe: number;
  created_at: string;
}

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('positions');

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats');
      if (!res.ok) {
        const text = await res.text();
        console.error(`Server error (${res.status}):`, text);
        return;
      }
      
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("Expected JSON but received:", text.substring(0, 100));
        return;
      }

      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error("Failed to fetch stats", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] text-white flex items-center justify-center font-mono">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 animate-spin text-emerald-500" />
          <p className="text-sm tracking-widest uppercase opacity-50">Initializing NovaTrader...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#E4E3E0] font-mono selection:bg-emerald-500 selection:text-black">
      {/* Header */}
      <header className="border-b border-white/10 p-4 flex items-center justify-between bg-[#0D0D0E]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded flex items-center justify-center">
            <Activity className="w-5 h-5 text-black" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tighter uppercase">NovaTrader Agent</h1>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full animate-pulse ${stats?.isPaperTrading ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              <span className="text-[10px] opacity-50 uppercase tracking-widest">
                {stats?.isPaperTrading ? 'Paper Trading Mode' : 'Autonomous Mode Active'}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex gap-6">
          <div className="text-right">
            <p className="text-[10px] opacity-50 uppercase tracking-widest">
              {stats?.isPaperTrading ? 'Virtual Balance' : 'Wallet Balance'}
            </p>
            <p className={`text-sm font-bold ${stats?.isPaperTrading ? 'text-amber-400' : 'text-emerald-400'}`}>
              {stats?.isPaperTrading ? stats?.balance?.virtual_sol?.toFixed(2) : stats?.balance?.sol} SOL 
              <span className="text-white/30 text-xs font-normal ml-1">
                (${stats?.isPaperTrading ? stats?.balance?.virtual_usd?.toFixed(2) : stats?.balance?.usd})
              </span>
            </p>
          </div>
          <div className="h-8 w-[1px] bg-white/10" />
          <div className="text-right">
            <p className="text-[10px] opacity-50 uppercase tracking-widest">Active Positions</p>
            <p className="text-sm font-bold">{stats?.activePositions?.length || 0}</p>
          </div>
        </div>
      </header>

      <main className="p-4 grid grid-cols-12 gap-4 max-w-[1600px] mx-auto">
        {/* Left Column: Positions & History */}
        <div className="col-span-12 lg:col-span-8 space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 bg-white/5 p-1 rounded-lg w-fit">
            <button 
              onClick={() => setActiveTab('positions')}
              className={`px-4 py-1.5 rounded text-[11px] uppercase tracking-wider transition-all ${activeTab === 'positions' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/60'}`}
            >
              Active Positions
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={`px-4 py-1.5 rounded text-[11px] uppercase tracking-wider transition-all ${activeTab === 'history' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/60'}`}
            >
              Trade History
            </button>
          </div>

          <div className="bg-[#0D0D0E] border border-white/10 rounded-xl overflow-hidden min-h-[400px]">
            <AnimatePresence mode="wait">
              {activeTab === 'positions' ? (
                <motion.div 
                  key="positions"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="p-0"
                >
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/5 bg-white/[0.02]">
                        <th className="p-4 text-[10px] uppercase tracking-widest opacity-40 font-medium">Token</th>
                        <th className="p-4 text-[10px] uppercase tracking-widest opacity-40 font-medium">Entry Price</th>
                        <th className="p-4 text-[10px] uppercase tracking-widest opacity-40 font-medium">Amount</th>
                        <th className="p-4 text-[10px] uppercase tracking-widest opacity-40 font-medium">PnL %</th>
                        <th className="p-4 text-[10px] uppercase tracking-widest opacity-40 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {stats?.activePositions?.map((pos: Position) => (
                        <tr key={pos.id} className="hover:bg-white/[0.02] transition-colors group">
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${pos.is_simulated ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                {pos.token_symbol?.[0]}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-bold">{pos.token_symbol}</p>
                                  {pos.is_simulated === 1 && (
                                    <span className="text-[8px] bg-amber-500/20 text-amber-500 px-1 rounded uppercase font-bold">Demo</span>
                                  )}
                                </div>
                                <p className="text-[10px] opacity-30 truncate w-24">{pos.token_address}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-4 text-sm opacity-80">${pos.entry_price.toFixed(6)}</td>
                          <td className="p-4 text-sm opacity-80">{pos.amount_token.toLocaleString()}</td>
                          <td className={`p-4 text-sm font-bold ${pos.pnl_percent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {pos.pnl_percent >= 0 ? '+' : ''}{pos.pnl_percent.toFixed(2)}%
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <span className="flex items-center gap-1.5 text-[10px] bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded uppercase font-bold">
                                <Activity className="w-3 h-3 animate-pulse" />
                                Monitoring
                              </span>
                              <button className="p-2 hover:bg-white/10 rounded transition-colors opacity-0 group-hover:opacity-100">
                                <ExternalLink className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {(!stats?.activePositions || stats.activePositions.length === 0) && (
                        <tr>
                          <td colSpan={5} className="p-12 text-center opacity-30 text-xs uppercase tracking-widest">
                            No active positions found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </motion.div>
              ) : (
                <motion.div 
                  key="history"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="p-0"
                >
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/5 bg-white/[0.02]">
                        <th className="p-4 text-[10px] uppercase tracking-widest opacity-40 font-medium">Time</th>
                        <th className="p-4 text-[10px] uppercase tracking-widest opacity-40 font-medium">Type</th>
                        <th className="p-4 text-[10px] uppercase tracking-widest opacity-40 font-medium">Token</th>
                        <th className="p-4 text-[10px] uppercase tracking-widest opacity-40 font-medium">Amount</th>
                        <th className="p-4 text-[10px] uppercase tracking-widest opacity-40 font-medium">Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {stats?.recentTrades?.map((trade: Trade) => (
                        <tr key={trade.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="p-4 text-[10px] opacity-40">{new Date(trade.timestamp).toLocaleTimeString()}</td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold ${trade.type === 'BUY' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                                {trade.type}
                              </span>
                              {trade.is_simulated === 1 && (
                                <span className="text-[8px] border border-amber-500/30 text-amber-500 px-1 rounded uppercase font-bold">Simulated</span>
                              )}
                            </div>
                          </td>
                          <td className="p-4 text-sm font-bold">{trade.token_symbol}</td>
                          <td className="p-4 text-sm opacity-80">{trade.amount_sol} SOL</td>
                          <td className="p-4 text-sm opacity-80">${trade.price_usd.toFixed(6)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Chart Iframe Placeholder */}
          <div className="bg-[#0D0D0E] border border-white/10 rounded-xl overflow-hidden h-[500px] relative">
            {stats?.activePositions?.length > 0 ? (
              <>
                <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-black/60 backdrop-blur px-3 py-1.5 rounded-lg border border-white/10">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  <span className="text-[11px] uppercase tracking-wider font-bold">
                    Live Analysis: {stats.activePositions[0].token_symbol}/SOL
                  </span>
                </div>
                <iframe 
                  src={`https://dexscreener.com/solana/${stats.activePositions[0].token_address}?embed=1&theme=dark&trades=0&info=0`}
                  className="w-full h-full border-0"
                  title="DexScreener Chart"
                />
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center space-y-4 opacity-30">
                <TrendingUp className="w-12 h-12" />
                <p className="text-xs uppercase tracking-widest">Waiting for first autonomous trade...</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Logs & Strategy */}
        <div className="col-span-12 lg:col-span-4 space-y-4">
          {/* Strategy Card */}
          <div className="bg-[#0D0D0E] border border-white/10 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] uppercase tracking-widest font-bold flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                Risk Strategy
              </h2>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded uppercase font-bold">Conservative</span>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-[9px] opacity-40 uppercase tracking-widest mb-1">Stop Loss</p>
                <p className="text-lg font-bold text-rose-400">-15%</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-[9px] opacity-40 uppercase tracking-widest mb-1">Take Profit</p>
                <p className="text-lg font-bold text-emerald-400">+30%</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-[9px] opacity-40 uppercase tracking-widest mb-1">Min Liquidity</p>
                <p className="text-sm font-bold">$5,000</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-[9px] opacity-40 uppercase tracking-widest mb-1">Max Trade</p>
                <p className="text-sm font-bold">0.1 SOL</p>
              </div>
            </div>
          </div>

          {/* New Opportunities */}
          <div className="bg-[#0D0D0E] border border-white/10 rounded-xl p-5 space-y-4">
            <h2 className="text-[11px] uppercase tracking-widest font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              New Opportunities
            </h2>
            <div className="space-y-3">
              {stats?.opportunities?.map((opp: Opportunity) => (
                <div key={opp.id} className="bg-white/5 p-3 rounded-lg border border-white/5 hover:border-white/20 transition-all group">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-sm font-bold">{opp.token_symbol}</p>
                      <p className="text-[9px] opacity-30 truncate w-32">{opp.token_address}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-emerald-400">{opp.safety_score}% Safe</p>
                      <p className="text-[9px] opacity-40">${opp.liquidity_usd.toLocaleString()} Liq</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className={`flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded text-[10px] uppercase font-bold border ${opp.safety_score >= 80 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-amber-500/10 border-amber-500/20 text-amber-500'}`}>
                      {stats?.activePositions?.some((p: any) => p.token_address === opp.token_address) ? (
                        <>
                          <ShieldCheck className="w-3 h-3" />
                          POSITION OPENED
                        </>
                      ) : opp.safety_score >= 80 ? (
                        <>
                          <ShieldCheck className="w-3 h-3" />
                          ANALYZING...
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3 h-3" />
                          REJECTED
                        </>
                      )}
                    </div>
                    <button className="px-2 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded transition-colors">
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
              {(!stats?.opportunities || stats.opportunities.length === 0) && (
                <p className="text-center py-4 text-[10px] opacity-30 uppercase tracking-widest">Scanning for gems...</p>
              )}
            </div>
          </div>

          {/* Terminal Logs */}
          <div className="bg-[#0D0D0E] border border-white/10 rounded-xl flex flex-col h-[calc(100vh-450px)] min-h-[400px]">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <h2 className="text-[11px] uppercase tracking-widest font-bold flex items-center gap-2">
                <TerminalIcon className="w-4 h-4 opacity-50" />
                Agent Logs
              </h2>
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-rose-500/20" />
                <div className="w-2 h-2 rounded-full bg-amber-500/20" />
                <div className="w-2 h-2 rounded-full bg-emerald-500/20" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-[11px]">
              {stats?.logs?.map((log: Log) => (
                <div key={log.id} className="flex gap-3 group">
                  <span className="opacity-20 shrink-0">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                  <span className={`shrink-0 font-bold ${log.level === 'ERROR' ? 'text-rose-500' : log.level === 'WARN' ? 'text-amber-500' : log.level === 'SUCCESS' ? 'text-emerald-400' : 'text-emerald-500/50'}`}>
                    {log.level}
                  </span>
                  <span className="opacity-70 group-hover:opacity-100 transition-opacity">{log.message}</span>
                </div>
              ))}
              <div className="flex gap-3 animate-pulse">
                <span className="opacity-20 shrink-0">[{new Date().toLocaleTimeString()}]</span>
                <span className="text-emerald-500/50 font-bold">INFO</span>
                <span className="opacity-40">Scanning Raydium for new pools...</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Status Bar */}
      <footer className="fixed bottom-0 left-0 right-0 bg-[#0D0D0E] border-t border-white/10 px-4 py-2 flex items-center justify-between text-[10px] uppercase tracking-widest opacity-50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
            <span>RPC: Helius Mainnet</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
            <span>Jupiter V6 API: Connected</span>
          </div>
        </div>
        <div>
          NovaTrader v1.0.4-alpha
        </div>
      </footer>
    </div>
  );
}
