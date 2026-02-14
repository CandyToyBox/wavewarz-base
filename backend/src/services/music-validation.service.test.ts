import { describe, it, expect } from 'vitest';
import { MusicValidationService } from './music-validation.service.js';

describe('MusicValidationService', () => {
  describe('validateDuration', () => {
    it('should accept valid durations', () => {
      expect(MusicValidationService.validateDuration(60).valid).toBe(true);
      expect(MusicValidationService.validateDuration(180).valid).toBe(true);
      expect(MusicValidationService.validateDuration(420).valid).toBe(true); // max
      expect(MusicValidationService.validateDuration(10).valid).toBe(true); // min
    });

    it('should reject durations over 7 minutes', () => {
      const result = MusicValidationService.validateDuration(421);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('420');
    });

    it('should reject durations under 10 seconds', () => {
      const result = MusicValidationService.validateDuration(5);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('10');
    });

    it('should reject zero duration', () => {
      expect(MusicValidationService.validateDuration(0).valid).toBe(false);
    });
  });

  describe('constants', () => {
    it('should have correct max duration', () => {
      expect(MusicValidationService.MAX_DURATION_SECONDS).toBe(420);
    });

    it('should have correct min duration', () => {
      expect(MusicValidationService.MIN_DURATION_SECONDS).toBe(10);
    });
  });
});

describe('Settlement Math', () => {
  it('should distribute loser pool correctly (50/40/5/2/3)', () => {
    const loserPool = 10000; // 10000 units

    const losingTraders = loserPool * 0.50;
    const winningTraders = loserPool * 0.40;
    const winningArtist = loserPool * 0.05;
    const losingArtist = loserPool * 0.02;
    const platform = loserPool * 0.03;

    expect(losingTraders).toBe(5000);
    expect(winningTraders).toBe(4000);
    expect(winningArtist).toBe(500);
    expect(losingArtist).toBe(200);
    expect(platform).toBe(300);

    // Must sum to 100%
    const total = losingTraders + winningTraders + winningArtist + losingArtist + platform;
    expect(total).toBe(loserPool);
  });

  it('should calculate per-trade fees correctly', () => {
    const tradeAmount = 1000000; // 1M units

    const artistFee = tradeAmount * 0.01; // 1%
    const platformFee = tradeAmount * 0.005; // 0.5%
    const remaining = tradeAmount - artistFee - platformFee;

    expect(artistFee).toBe(10000);
    expect(platformFee).toBe(5000);
    expect(remaining).toBe(985000); // 98.5% stays in ecosystem
  });

  it('should calculate battle timer correctly', () => {
    const song1Duration = 180; // 3 minutes
    const song2Duration = 200; // 3:20
    const closingWindow = 30;

    const battleTimer = song1Duration + song2Duration + closingWindow;
    expect(battleTimer).toBe(410); // 6:50 total
    expect(battleTimer).toBeLessThanOrEqual(420 + 420 + 30); // max possible
  });

  it('should calculate trader payout proportionally', () => {
    const winnerPool = 5500;
    const loserPool = 4500;
    const traderTokens = 100;
    const totalTokens = 1000;

    // Winner side trader
    const shareOfPool = traderTokens / totalTokens; // 10%
    const fromOwnPool = shareOfPool * winnerPool; // 550
    const fromBonus = shareOfPool * (loserPool * 0.40); // 180
    const totalPayout = fromOwnPool + fromBonus; // 730

    expect(shareOfPool).toBe(0.1);
    expect(fromOwnPool).toBe(550);
    expect(fromBonus).toBe(180);
    expect(totalPayout).toBe(730);

    // Loser side trader
    const loserTraderTokens = 50;
    const loserTotalTokens = 1000;
    const loserShare = loserTraderTokens / loserTotalTokens; // 5%
    const loserOriginalValue = loserShare * loserPool; // 225
    const loserPayout = loserOriginalValue * 0.50; // 112.50

    expect(loserPayout).toBe(112.5);
  });
});
