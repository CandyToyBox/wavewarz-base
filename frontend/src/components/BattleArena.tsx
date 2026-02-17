'use client';

import React, { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface BattleData {
  battleId: number;
  artist1: string;
  artist2: string;
  pool1: number;
  pool2: number;
  trades: number;
  timeRemaining: number;
  musicPlaying: boolean;
}

const BattleArena: React.FC<{ battleId?: number }> = ({ battleId = 1001 }) => {
  const [battle, setBattle] = useState<BattleData>({
    battleId,
    artist1: 'WAVEX',
    artist2: 'NOVA',
    pool1: 2450.50,
    pool2: 1850.75,
    trades: 523,
    timeRemaining: 245,
    musicPlaying: true,
  });

  const [chartData, setChartData] = useState(
    Array.from({ length: 20 }, (_, i) => ({
      time: `${i}m`,
      artist1: Math.floor(Math.random() * 3000) + 1000,
      artist2: Math.floor(Math.random() * 2500) + 1000,
    }))
  );

  const [achievements, setAchievements] = useState([
    { id: 1, name: '🔥 Hot Hand', value: '+15% multiplier', active: true },
    { id: 2, name: '🎯 Trader', value: '+5 wins', active: true },
    { id: 3, name: '🦞 Lobster Lord', value: 'Ultra Rare', active: false },
  ]);

  const winRate1 = (battle.pool1 / (battle.pool1 + battle.pool2)) * 100;
  const winRate2 = (battle.pool2 / (battle.pool1 + battle.pool2)) * 100;

  useEffect(() => {
    const interval = setInterval(() => {
      setBattle(prev => ({
        ...prev,
        timeRemaining: Math.max(0, prev.timeRemaining - 1),
        trades: prev.trades + Math.floor(Math.random() * 3),
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative w-full min-h-screen bg-deep-space overflow-hidden">
      {/* Matrix background effect */}
      <div className="absolute inset-0 opacity-5">
        <div className="text-action-green text-xs font-mono whitespace-pre animate-matrix-rain">
          {`88 88 888888 88 88 8888888\n88 88   88   88 88   88\n88 8 89 888888 88 88 88888\n88  888 88   88 88 88   88\n888 888 88   88 88888 8888888`.repeat(
            10
          )}
        </div>
      </div>

      {/* Main container */}
      <div className="relative z-10 p-6 md:p-8 max-w-full">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-5xl md:text-6xl font-rajdhani font-bold mb-4 animate-neon-glow">
            <span className="text-action-green">WAVE</span>
            <span className="text-wave-blue">WARZ</span>
          </h1>
          <div className="text-xl text-wave-blue font-mono">
            🦞 LOBSTER TRADING ARENA 🦞
          </div>
        </div>

        {/* Battle Arena */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Artist 1 */}
          <div className="bg-gradient-to-b from-red-900/20 to-deep-space border border-red-500/30 rounded-lg p-6 animate-scale-in">
            <div className="text-center mb-6">
              <div className="text-4xl mb-2 animate-lobster-bounce">🦞</div>
              <h2 className="text-2xl font-rajdhani font-bold text-red-400 mb-2">{battle.artist1}</h2>
              <div className="text-sm text-action-green font-mono">AGGRESSIVE STRATEGY</div>
            </div>

            {/* Pool Amount */}
            <div className="bg-red-950/30 rounded p-4 mb-4 border border-red-500/20">
              <div className="text-xs text-red-300/70 mb-1">TRADING POOL</div>
              <div className="text-3xl font-bold text-red-400 font-mono">
                {battle.pool1.toFixed(2)} SOL
              </div>
            </div>

            {/* Win Probability */}
            <div className="w-full bg-deep-space border border-red-500/20 rounded overflow-hidden h-2">
              <div
                className="h-full bg-gradient-to-r from-red-500 to-red-600 transition-all duration-300 animate-trading-pulse"
                style={{ width: `${winRate1}%` }}
              />
            </div>
            <div className="text-xs text-red-300/70 mt-2 text-center font-mono">
              {winRate1.toFixed(1)}% Probability
            </div>
          </div>

          {/* Center - Timer & Stats */}
          <div className="flex flex-col justify-center items-center gap-4">
            {/* Timer */}
            <div className="bg-gradient-to-b from-wave-blue/20 to-deep-space border border-wave-blue/50 rounded-lg p-6 w-full text-center">
              <div className="text-sm text-wave-blue/70 mb-2 font-mono">TIME REMAINING</div>
              <div className="text-4xl font-mono font-bold text-wave-blue animate-cyber-flicker">
                {formatTime(battle.timeRemaining)}
              </div>
            </div>

            {/* Trade Count */}
            <div className="bg-gradient-to-b from-action-green/20 to-deep-space border border-action-green/50 rounded-lg p-4 w-full text-center">
              <div className="text-sm text-action-green/70 mb-1 font-mono">TRADES EXECUTED</div>
              <div className="text-3xl font-bold text-action-green">{battle.trades}</div>
            </div>

            {/* Music Status */}
            <div className="w-full">
              <button className="w-full bg-gradient-to-r from-wave-blue to-action-green text-deep-space py-3 rounded-lg font-bold font-rajdhani hover:shadow-lg hover:shadow-action-green/50 transition-all duration-300">
                {battle.musicPlaying ? '🎵 MUSIC PLAYING' : '🔇 UNMUTED'}
              </button>
            </div>
          </div>

          {/* Artist 2 */}
          <div className="bg-gradient-to-b from-blue-900/20 to-deep-space border border-wave-blue/30 rounded-lg p-6 animate-scale-in animation-delay-100">
            <div className="text-center mb-6">
              <div className="text-4xl mb-2 animate-lobster-bounce animation-delay-200">🦞</div>
              <h2 className="text-2xl font-rajdhani font-bold text-wave-blue mb-2">{battle.artist2}</h2>
              <div className="text-sm text-action-green font-mono">STRATEGIC APPROACH</div>
            </div>

            {/* Pool Amount */}
            <div className="bg-blue-950/30 rounded p-4 mb-4 border border-wave-blue/20">
              <div className="text-xs text-wave-blue/70 mb-1">TRADING POOL</div>
              <div className="text-3xl font-bold text-wave-blue font-mono">
                {battle.pool2.toFixed(2)} SOL
              </div>
            </div>

            {/* Win Probability */}
            <div className="w-full bg-deep-space border border-wave-blue/20 rounded overflow-hidden h-2">
              <div
                className="h-full bg-gradient-to-r from-wave-blue to-action-green transition-all duration-300 animate-trading-pulse"
                style={{ width: `${winRate2}%` }}
              />
            </div>
            <div className="text-xs text-wave-blue/70 mt-2 text-center font-mono">
              {winRate2.toFixed(1)}% Probability
            </div>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Trading Volume Chart */}
          <div className="bg-gradient-to-b from-wave-blue/10 to-deep-space border border-wave-blue/20 rounded-lg p-6">
            <h3 className="text-lg font-rajdhani font-bold text-action-green mb-4">
              📈 TRADING VOLUME
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(126, 193, 251, 0.1)" />
                <XAxis dataKey="time" stroke="rgba(126, 193, 251, 0.5)" />
                <YAxis stroke="rgba(126, 193, 251, 0.5)" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(13, 19, 33, 0.9)',
                    border: '1px solid rgba(149, 254, 124, 0.5)',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="artist1"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={true}
                />
                <Line
                  type="monotone"
                  dataKey="artist2"
                  stroke="#7ec1fb"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={true}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Live Trades Feed */}
          <div className="bg-gradient-to-b from-action-green/10 to-deep-space border border-action-green/20 rounded-lg p-6">
            <h3 className="text-lg font-rajdhani font-bold text-action-green mb-4">
              🔥 LIVE TRADES
            </h3>
            <div className="space-y-2 h-64 overflow-y-auto">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="flex justify-between items-center p-3 bg-deep-space border border-action-green/20 rounded animate-slide-up"
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-action-green animate-glow-flash">●</span>
                    <span className="text-sm font-mono text-action-green">
                      {i % 2 === 0 ? 'WAVEX' : 'NOVA'} BUY
                    </span>
                  </div>
                  <span className="font-mono text-wave-blue font-bold">
                    +{Math.floor(Math.random() * 500)} SOL
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Achievements & Gamification */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {achievements.map((achievement, idx) => (
            <div
              key={achievement.id}
              className={`border rounded-lg p-6 transition-all duration-300 ${
                achievement.active
                  ? 'bg-gradient-to-b from-action-green/20 to-deep-space border-action-green/50 animate-trading-pulse'
                  : 'bg-gradient-to-b from-ww-grey/10 to-deep-space border-ww-grey/20'
              }`}
            >
              <div className="text-4xl mb-2">{achievement.name.split(' ')[0]}</div>
              <h4 className="font-rajdhani font-bold mb-2 text-wave-blue">
                {achievement.name.split(' ').slice(1).join(' ')}
              </h4>
              <div
                className={`text-sm font-mono ${
                  achievement.active ? 'text-action-green' : 'text-ww-grey'
                }`}
              >
                {achievement.value}
              </div>
              {achievement.active && (
                <div className="mt-3 text-xs text-action-green animate-cyber-flicker">
                  ACTIVE ✓
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white py-4 rounded-lg font-rajdhani font-bold text-lg transition-all duration-300 hover:shadow-lg hover:shadow-red-500/50">
            🦞 SUPPORT WAVEX
          </button>
          <button className="bg-gradient-to-r from-wave-blue to-action-green hover:shadow-lg text-deep-space py-4 rounded-lg font-rajdhani font-bold text-lg transition-all duration-300 hover:shadow-action-green/50">
            📊 SPECTATE BATTLE
          </button>
          <button className="bg-gradient-to-r from-wave-blue to-wave-blue hover:from-ice-blue hover:to-wave-blue text-deep-space py-4 rounded-lg font-rajdhani font-bold text-lg transition-all duration-300 hover:shadow-lg hover:shadow-wave-blue/50">
            🦞 SUPPORT NOVA
          </button>
        </div>
      </div>
    </div>
  );
};

export default BattleArena;
