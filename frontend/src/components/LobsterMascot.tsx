'use client';

import React from 'react';

interface LobsterMascotProps {
  color: 'red' | 'blue';
  side: 'left' | 'right';
  animated?: boolean;
  scale?: number;
}

const LobsterMascot: React.FC<LobsterMascotProps> = ({
  color = 'red',
  side = 'left',
  animated = true,
  scale = 1,
}) => {
  const isRed = color === 'red';
  const isLeft = side === 'left';

  return (
    <div
      className={`flex items-center justify-center ${isLeft ? '' : 'scale-x-[-1]'}`}
      style={{ transform: `scale(${scale})` }}
    >
      {/* Main body - Lobster head */}
      <svg
        viewBox="0 0 200 200"
        width={150}
        height={150}
        className={`${animated ? 'animate-lobster-bounce' : ''}`}
      >
        {/* Head */}
        <ellipse
          cx="100"
          cy="100"
          rx="60"
          ry="55"
          fill={isRed ? '#EF4444' : '#3B82F6'}
          stroke={isRed ? '#991B1B' : '#1E40AF'}
          strokeWidth="2"
        />

        {/* Eye left */}
        <circle
          cx="80"
          cy="85"
          r="8"
          fill="white"
          className={animated ? 'animate-pulse' : ''}
        />
        <circle cx="80" cy="85" r="5" fill="black" />

        {/* Eye right */}
        <circle
          cx="120"
          cy="85"
          r="8"
          fill="white"
          className={animated ? 'animate-pulse' : ''}
        />
        <circle cx="120" cy="85" r="5" fill="black" />

        {/* Mouth - aggressive grin */}
        <path
          d="M 90 115 Q 100 125 110 115"
          stroke="white"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />

        {/* Claw left - animated */}
        <g className={animated ? 'animate-lobster-bounce' : ''}>
          {/* Claw base */}
          <ellipse
            cx="50"
            cy="110"
            rx="15"
            ry="25"
            fill={isRed ? '#DC2626' : '#2563EB'}
            stroke={isRed ? '#991B1B' : '#1E40AF'}
            strokeWidth="2"
            transform="rotate(-30 50 110)"
          />
          {/* Upper claw piece */}
          <ellipse
            cx="35"
            cy="95"
            rx="12"
            ry="18"
            fill={isRed ? '#EF4444' : '#3B82F6'}
            stroke={isRed ? '#991B1B' : '#1E40AF'}
            strokeWidth="2"
            transform="rotate(-45 35 95)"
          />
          {/* Lower claw piece */}
          <ellipse
            cx="40"
            cy="120"
            rx="10"
            ry="16"
            fill={isRed ? '#DC2626' : '#2563EB'}
            stroke={isRed ? '#991B1B' : '#1E40AF'}
            strokeWidth="2"
            transform="rotate(-20 40 120)"
          />
        </g>

        {/* Claw right - animated */}
        <g className={animated ? 'animate-lobster-bounce' : ''} style={{ animationDelay: '0.1s' }}>
          {/* Claw base */}
          <ellipse
            cx="150"
            cy="110"
            rx="15"
            ry="25"
            fill={isRed ? '#DC2626' : '#2563EB'}
            stroke={isRed ? '#991B1B' : '#1E40AF'}
            strokeWidth="2"
            transform="rotate(30 150 110)"
          />
          {/* Upper claw piece */}
          <ellipse
            cx="165"
            cy="95"
            rx="12"
            ry="18"
            fill={isRed ? '#EF4444' : '#3B82F6'}
            stroke={isRed ? '#991B1B' : '#1E40AF'}
            strokeWidth="2"
            transform="rotate(45 165 95)"
          />
          {/* Lower claw piece */}
          <ellipse
            cx="160"
            cy="120"
            rx="10"
            ry="16"
            fill={isRed ? '#DC2626' : '#2563EB'}
            stroke={isRed ? '#991B1B' : '#1E40AF'}
            strokeWidth="2"
            transform="rotate(20 160 120)"
          />
        </g>

        {/* Body segments */}
        <g opacity="0.7">
          <circle cx="100" cy="150" r="8" fill={isRed ? '#991B1B' : '#1E40AF'} />
          <circle cx="85" cy="165" r="6" fill={isRed ? '#991B1B' : '#1E40AF'} />
          <circle cx="115" cy="165" r="6" fill={isRed ? '#991B1B' : '#1E40AF'} />
        </g>
      </svg>

      {/* Glow effect */}
      {animated && (
        <div
          className={`absolute inset-0 rounded-full animate-pulse ${
            isRed ? 'shadow-xl shadow-red-500/50' : 'shadow-xl shadow-blue-500/50'
          }`}
          style={{ width: '150px', height: '150px' }}
        />
      )}
    </div>
  );
};

export default LobsterMascot;
