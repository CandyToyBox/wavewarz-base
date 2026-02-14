import type { GenerateMusicInput, GeneratedTrack } from '../types/index.js';

/**
 * SUNO API client for AI music generation
 * Uses third-party SUNO API (e.g., sunoapi.org)
 */
export class SunoService {
  private apiUrl: string;
  private apiKey: string;

  constructor(apiUrl: string, apiKey: string) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
  }

  /**
   * Generate a battle track using SUNO AI
   */
  async generateTrack(input: GenerateMusicInput): Promise<GeneratedTrack> {
    const response = await fetch(`${this.apiUrl}/generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: input.prompt,
        style: input.style,
        duration: input.duration,
        make_instrumental: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`SUNO API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      id: string;
      audio_url: string;
      duration: number;
      style: string;
    };

    return {
      trackId: data.id,
      trackUrl: data.audio_url,
      duration: data.duration,
      style: data.style,
      prompt: input.prompt,
      generatedAt: new Date(),
    };
  }

  /**
   * Generate a battle track with retry logic
   */
  async generateTrackWithRetry(
    input: GenerateMusicInput,
    maxRetries: number = 3
  ): Promise<GeneratedTrack> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.generateTrack(input);
      } catch (error) {
        lastError = error as Error;
        console.warn(`SUNO generation attempt ${attempt} failed:`, error);

        if (attempt < maxRetries) {
          // Exponential backoff
          await this.sleep(Math.pow(2, attempt) * 1000);
        }
      }
    }

    throw lastError ?? new Error('Failed to generate track');
  }

  /**
   * Check if a track is ready (for async generation)
   */
  async getTrackStatus(trackId: string): Promise<{
    status: 'pending' | 'processing' | 'completed' | 'failed';
    trackUrl?: string;
  }> {
    const response = await fetch(`${this.apiUrl}/status/${trackId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get track status: ${response.status}`);
    }

    return response.json() as Promise<{
      status: 'pending' | 'processing' | 'completed' | 'failed';
      trackUrl?: string;
    }>;
  }

  /**
   * Wait for track to be ready (polling)
   */
  async waitForTrack(
    trackId: string,
    timeoutMs: number = 120000,
    pollIntervalMs: number = 5000
  ): Promise<string> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getTrackStatus(trackId);

      if (status.status === 'completed' && status.trackUrl) {
        return status.trackUrl;
      }

      if (status.status === 'failed') {
        throw new Error('Track generation failed');
      }

      await this.sleep(pollIntervalMs);
    }

    throw new Error('Track generation timed out');
  }

  /**
   * Generate battle-specific prompt based on style
   */
  static generateBattlePrompt(
    artistName: string,
    style: string,
    theme?: string
  ): string {
    const themes: Record<string, string[]> = {
      'hip-hop': [
        'hard-hitting beats',
        'confident bars',
        'battle rap energy',
        'bass-heavy production',
      ],
      'electronic': [
        'pulsing synths',
        'drop-heavy structure',
        'festival energy',
        'futuristic sounds',
      ],
      'rock': [
        'powerful guitar riffs',
        'driving drums',
        'arena anthem energy',
        'raw power',
      ],
      'pop': [
        'catchy hooks',
        'polished production',
        'sing-along chorus',
        'feel-good vibes',
      ],
      'r&b': [
        'smooth grooves',
        'soulful vocals',
        'laid-back but confident',
        'modern R&B production',
      ],
      'jazz': [
        'improvisational flair',
        'complex harmonies',
        'cool sophistication',
        'instrumental virtuosity',
      ],
    };

    const styleThemes = themes[style] || themes['hip-hop'];
    const randomTheme = styleThemes[Math.floor(Math.random() * styleThemes.length)];

    const basePrompt = theme
      ? `${theme} - ${randomTheme}`
      : `AI music battle track for ${artistName} - ${randomTheme}`;

    return `Create a ${style} battle track: ${basePrompt}. Make it competitive, high-energy, and memorable. Perfect for an AI music competition.`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Mock SUNO service for development/testing
 */
export class MockSunoService extends SunoService {
  private trackCounter = 0;

  constructor() {
    super('', '');
  }

  override async generateTrack(input: GenerateMusicInput): Promise<GeneratedTrack> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    this.trackCounter++;

    return {
      trackId: `mock-track-${this.trackCounter}`,
      trackUrl: `https://example.com/mock-tracks/${this.trackCounter}.mp3`,
      duration: input.duration,
      style: input.style,
      prompt: input.prompt,
      generatedAt: new Date(),
    };
  }

  override async getTrackStatus(trackId: string): Promise<{
    status: 'pending' | 'processing' | 'completed' | 'failed';
    trackUrl?: string;
  }> {
    return {
      status: 'completed',
      trackUrl: `https://example.com/mock-tracks/${trackId}.mp3`,
    };
  }
}
