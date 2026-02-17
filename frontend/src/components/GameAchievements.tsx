'use client';

import React, { useState, useEffect } from 'react';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  unlocked: boolean;
  unlockedAt?: Date;
  progress?: number;
  maxProgress?: number;
}

interface GameAchievementsProps {
  achievements?: Achievement[];
  showUnlockedOnly?: boolean;
}

const rarityColors = {
  common: 'from-gray-400 to-gray-600 border-gray-500',
  rare: 'from-blue-400 to-blue-600 border-blue-500',
  epic: 'from-purple-400 to-purple-600 border-purple-500',
  legendary: 'from-yellow-400 to-yellow-600 border-yellow-500',
};

const rarityGlow = {
  common: 'shadow-gray-500/50',
  rare: 'shadow-blue-500/50',
  epic: 'shadow-purple-500/50',
  legendary: 'shadow-yellow-500/50',
};

const rarityText = {
  common: 'text-gray-300',
  rare: 'text-blue-300',
  epic: 'text-purple-300',
  legendary: 'text-yellow-300',
};

const GameAchievements: React.FC<GameAchievementsProps> = ({
  achievements = [
    {
      id: 'first-trade',
      name: '🦞 First Trade',
      description: 'Execute your first trade',
      icon: '🦞',
      rarity: 'common',
      unlocked: true,
      unlockedAt: new Date(),
    },
    {
      id: 'hot-hand',
      name: '🔥 Hot Hand',
      description: 'Win 5 trades in a row',
      icon: '🔥',
      rarity: 'rare',
      unlocked: true,
      progress: 5,
      maxProgress: 5,
    },
    {
      id: 'whale-hunter',
      name: '🐋 Whale Hunter',
      description: 'Trade 10,000 SOL',
      icon: '🐋',
      rarity: 'epic',
      unlocked: false,
      progress: 5230,
      maxProgress: 10000,
    },
    {
      id: 'lobster-lord',
      name: '👑 Lobster Lord',
      description: 'Reach #1 on leaderboard',
      icon: '👑',
      rarity: 'legendary',
      unlocked: false,
      progress: 45,
      maxProgress: 100,
    },
    {
      id: 'music-lover',
      name: '🎵 Music Lover',
      description: 'Watch 10 complete battles',
      icon: '🎵',
      rarity: 'rare',
      unlocked: true,
      progress: 10,
      maxProgress: 10,
    },
    {
      id: 'trading-guru',
      name: '💎 Trading Guru',
      description: 'Win 50 battles',
      icon: '💎',
      rarity: 'epic',
      unlocked: false,
      progress: 12,
      maxProgress: 50,
    },
  ],
  showUnlockedOnly = false,
}) => {
  const [displayedAchievements, setDisplayedAchievements] = useState<Achievement[]>(
    achievements
  );

  useEffect(() => {
    setDisplayedAchievements(
      showUnlockedOnly
        ? achievements.filter(a => a.unlocked)
        : achievements
    );
  }, [achievements, showUnlockedOnly]);

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {displayedAchievements.map(achievement => (
          <div
            key={achievement.id}
            className={`relative overflow-hidden rounded-lg border-2 ${
              achievement.unlocked
                ? `bg-gradient-to-br ${rarityColors[achievement.rarity]} shadow-lg ${rarityGlow[achievement.rarity]}`
                : 'bg-gradient-to-br from-gray-700 to-gray-900 border-gray-600 opacity-50'
            } p-4 transition-all duration-300 hover:scale-105`}
          >
            {/* Background glow */}
            {achievement.unlocked && (
              <div
                className={`absolute inset-0 opacity-10 animate-pulse ${
                  achievement.rarity === 'legendary' ? 'animate-glow-flash' : ''
                }`}
              />
            )}

            {/* Content */}
            <div className="relative z-10">
              {/* Icon and Lock */}
              <div className="flex justify-between items-start mb-3">
                <div className="text-4xl">{achievement.icon}</div>
                {!achievement.unlocked && (
                  <div className="text-2xl">🔒</div>
                )}
                {achievement.unlocked && achievement.rarity === 'legendary' && (
                  <div className="text-2xl animate-pulse">⭐</div>
                )}
              </div>

              {/* Name */}
              <h3 className="font-rajdhani font-bold text-lg mb-1 text-white">
                {achievement.name.split(' ').slice(1).join(' ')}
              </h3>

              {/* Rarity Badge */}
              <div
                className={`text-xs font-mono font-bold mb-2 ${rarityText[achievement.rarity]}`}
              >
                {achievement.rarity.toUpperCase()}
              </div>

              {/* Description */}
              <p className="text-sm text-white/80 mb-3">
                {achievement.description}
              </p>

              {/* Progress Bar */}
              {achievement.progress !== undefined && achievement.maxProgress !== undefined && (
                <div className="mb-2">
                  <div className="w-full bg-black/30 rounded-full h-2 overflow-hidden border border-white/20">
                    <div
                      className={`h-full bg-gradient-to-r ${
                        rarityColors[achievement.rarity].split(' ')[0]
                      } ${
                        rarityColors[achievement.rarity].split(' ')[1]
                      } transition-all duration-300 ${
                        achievement.unlocked ? 'animate-trading-pulse' : ''
                      }`}
                      style={{
                        width: `${(achievement.progress / achievement.maxProgress) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="text-xs text-white/60 mt-1 text-center font-mono">
                    {achievement.progress} / {achievement.maxProgress}
                  </div>
                </div>
              )}

              {/* Unlock Info */}
              {achievement.unlocked && achievement.unlockedAt && (
                <div className="text-xs text-white/50 italic mt-2 border-t border-white/20 pt-2">
                  Unlocked {achievement.unlockedAt.toLocaleDateString()}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Stats Footer */}
      <div className="mt-8 pt-6 border-t border-wave-blue/20">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-action-green">
              {achievements.filter(a => a.unlocked).length}
            </div>
            <div className="text-sm text-ww-grey">Unlocked</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-wave-blue">
              {achievements.length}
            </div>
            <div className="text-sm text-ww-grey">Total</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-purple-400">
              {achievements.filter(a => a.rarity === 'epic' || a.rarity === 'legendary').length}
            </div>
            <div className="text-sm text-ww-grey">Rare+</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-yellow-400">
              {Math.round(
                (achievements.filter(a => a.unlocked).length / achievements.length) * 100
              )}%
            </div>
            <div className="text-sm text-ww-grey">Complete</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameAchievements;
