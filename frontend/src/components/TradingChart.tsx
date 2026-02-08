'use client';

import { useEffect, useRef, useState } from 'react';
import type { Trade } from '@/types';

interface TradingChartProps {
  battleId: number;
  trades: Trade[];
  artistAPool: string;
  artistBPool: string;
}

interface ChartDataPoint {
  time: number;
  artistAPool: number;
  artistBPool: number;
}

export function TradingChart({
  battleId,
  trades,
  artistAPool,
  artistBPool,
}: TradingChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Process trades into chart data points
  const chartData: ChartDataPoint[] = trades.reduce((acc, trade, index) => {
    const prevPoint = acc[acc.length - 1] || {
      time: new Date(trade.timestamp).getTime(),
      artistAPool: 0,
      artistBPool: 0,
    };

    const tradeAmount = parseFloat(trade.paymentAmount) / 1e18;
    const isBuy = trade.tradeType === 'buy';
    const multiplier = isBuy ? 1 : -1;

    const newPoint: ChartDataPoint = {
      time: new Date(trade.timestamp).getTime(),
      artistAPool: prevPoint.artistAPool + (trade.artistSide === 'A' ? tradeAmount * multiplier : 0),
      artistBPool: prevPoint.artistBPool + (trade.artistSide === 'B' ? tradeAmount * multiplier : 0),
    };

    return [...acc, newPoint];
  }, [] as ChartDataPoint[]);

  // Add current state as final point
  if (chartData.length > 0) {
    chartData.push({
      time: Date.now(),
      artistAPool: parseFloat(artistAPool) / 1e18,
      artistBPool: parseFloat(artistBPool) / 1e18,
    });
  }

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current?.parentElement) {
        setDimensions({
          width: canvasRef.current.parentElement.clientWidth,
          height: 300,
        });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size with device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.fillStyle = '#0d1321';
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);

    if (chartData.length < 2) {
      // No data yet
      ctx.fillStyle = '#989898';
      ctx.font = '14px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for trades...', dimensions.width / 2, dimensions.height / 2);
      return;
    }

    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
    const chartWidth = dimensions.width - padding.left - padding.right;
    const chartHeight = dimensions.height - padding.top - padding.bottom;

    // Calculate scales
    const timeMin = chartData[0].time;
    const timeMax = chartData[chartData.length - 1].time;
    const timeRange = timeMax - timeMin || 1;

    const maxPool = Math.max(
      ...chartData.map(d => Math.max(d.artistAPool, d.artistBPool)),
      0.01
    );

    const scaleX = (time: number) =>
      padding.left + ((time - timeMin) / timeRange) * chartWidth;
    const scaleY = (value: number) =>
      padding.top + chartHeight - (value / maxPool) * chartHeight;

    // Draw grid
    ctx.strokeStyle = 'rgba(126, 193, 251, 0.1)';
    ctx.lineWidth = 1;

    // Horizontal grid lines
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(dimensions.width - padding.right, y);
      ctx.stroke();

      // Y-axis labels
      const value = maxPool - (maxPool / 4) * i;
      ctx.fillStyle = '#989898';
      ctx.font = '11px Inter';
      ctx.textAlign = 'right';
      ctx.fillText(value.toFixed(3), padding.left - 8, y + 4);
    }

    // Draw Artist A line (wave-blue)
    ctx.beginPath();
    ctx.strokeStyle = '#7ec1fb';
    ctx.lineWidth = 2;
    chartData.forEach((point, index) => {
      const x = scaleX(point.time);
      const y = scaleY(point.artistAPool);
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Draw Artist A area fill
    ctx.beginPath();
    chartData.forEach((point, index) => {
      const x = scaleX(point.time);
      const y = scaleY(point.artistAPool);
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.lineTo(scaleX(chartData[chartData.length - 1].time), padding.top + chartHeight);
    ctx.lineTo(scaleX(chartData[0].time), padding.top + chartHeight);
    ctx.closePath();
    ctx.fillStyle = 'rgba(126, 193, 251, 0.1)';
    ctx.fill();

    // Draw Artist B line (action-green)
    ctx.beginPath();
    ctx.strokeStyle = '#95fe7c';
    ctx.lineWidth = 2;
    chartData.forEach((point, index) => {
      const x = scaleX(point.time);
      const y = scaleY(point.artistBPool);
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Draw Artist B area fill
    ctx.beginPath();
    chartData.forEach((point, index) => {
      const x = scaleX(point.time);
      const y = scaleY(point.artistBPool);
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.lineTo(scaleX(chartData[chartData.length - 1].time), padding.top + chartHeight);
    ctx.lineTo(scaleX(chartData[0].time), padding.top + chartHeight);
    ctx.closePath();
    ctx.fillStyle = 'rgba(149, 254, 124, 0.1)';
    ctx.fill();

    // Draw legend
    ctx.font = '12px Inter';
    ctx.textAlign = 'left';

    // Artist A legend
    ctx.fillStyle = '#7ec1fb';
    ctx.fillRect(padding.left, dimensions.height - 20, 12, 12);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Artist A', padding.left + 18, dimensions.height - 10);

    // Artist B legend
    ctx.fillStyle = '#95fe7c';
    ctx.fillRect(padding.left + 100, dimensions.height - 20, 12, 12);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Artist B', padding.left + 118, dimensions.height - 10);

  }, [chartData, dimensions, artistAPool, artistBPool]);

  return (
    <div className="chart-container p-4">
      <h3 className="font-rajdhani text-lg text-white mb-4">
        Live Trading Chart
      </h3>
      <canvas
        ref={canvasRef}
        style={{
          width: dimensions.width,
          height: dimensions.height,
          display: 'block',
        }}
      />
    </div>
  );
}
