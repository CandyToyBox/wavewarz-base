/**
 * ElevenLabs Service
 * Handles AI voice synthesis for WaveWarz
 * Used for: AI artist voices, battle announcements, NFT previews
 */

// Voice IDs for different purposes
export const VOICE_IDS = {
  // Default male voice (WAVEX style)
  WAVEX: 'JBFqnCBsd6RMkjVDRZzb', // George - deep, confident
  // Default female voice (NOVA style)
  NOVA: 'EXAVITQu4vr4xnSDxMaL', // Bella - warm, expressive
  // Announcer voice (battle intros)
  ANNOUNCER: 'pNInz6obpgDQGcFmaJgB', // Adam - clear, energetic
  // Narrator voice (NFT descriptions)
  NARRATOR: 'onwK4e9ZLuTAKqWW03F9', // Daniel - smooth, professional
} as const;

// Model IDs
export const MODELS = {
  MULTILINGUAL_V2: 'eleven_multilingual_v2',
  TURBO_V2: 'eleven_turbo_v2',
  ENGLISH_V1: 'eleven_monolingual_v1',
} as const;

// Output formats
export const OUTPUT_FORMATS = {
  MP3_44100_128: 'mp3_44100_128',
  MP3_44100_192: 'mp3_44100_192',
  PCM_16000: 'pcm_16000',
  PCM_22050: 'pcm_22050',
  PCM_44100: 'pcm_44100',
} as const;

interface TextToSpeechOptions {
  voiceId?: string;
  modelId?: string;
  outputFormat?: string;
  stability?: number; // 0-1, default 0.5
  similarityBoost?: number; // 0-1, default 0.75
  style?: number; // 0-1, only for v2 models
  speakerBoost?: boolean;
}

interface VoiceInfo {
  voice_id: string;
  name: string;
  category: string;
  labels: Record<string, string>;
  preview_url: string;
}

class ElevenLabsService {
  private readonly baseUrl = 'https://api.elevenlabs.io/v1';

  constructor() {
    // API key is loaded lazily from process.env to support Vault loading
  }

  /**
   * Get API key (lazy-loaded to support Vault)
   */
  private getApiKey(): string {
    return process.env.ELEVENLABS_API_KEY || '';
  }

  /**
   * Check if service is configured
   */
  isConfigured(): boolean {
    return !!this.getApiKey();
  }

  /**
   * Convert text to speech
   * Returns audio buffer
   */
  async textToSpeech(text: string, options: TextToSpeechOptions = {}): Promise<Buffer> {
    if (!this.isConfigured()) {
      throw new Error('ElevenLabs API key not configured');
    }

    const {
      voiceId = VOICE_IDS.ANNOUNCER,
      modelId = MODELS.MULTILINGUAL_V2,
      outputFormat = OUTPUT_FORMATS.MP3_44100_128,
      stability = 0.5,
      similarityBoost = 0.75,
      style = 0,
      speakerBoost = true,
    } = options;

    const response = await fetch(
      `${this.baseUrl}/text-to-speech/${voiceId}?output_format=${outputFormat}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': this.getApiKey(),
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: {
            stability,
            similarity_boost: similarityBoost,
            style,
            use_speaker_boost: speakerBoost,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(`ElevenLabs API error: ${error.detail || response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Generate battle intro announcement
   */
  async generateBattleIntro(
    artistA: string,
    artistB: string,
    battleId: number
  ): Promise<Buffer> {
    const text = `
      Welcome to WaveWarz Base! Battle number ${battleId} is about to begin.
      In the blue corner, representing raw energy and aggressive beats: ${artistA}!
      And in the green corner, bringing melodic precision and strategic flow: ${artistB}!
      Let the battle begin. May the best AI win!
    `.trim().replace(/\s+/g, ' ');

    return this.textToSpeech(text, {
      voiceId: VOICE_IDS.ANNOUNCER,
      stability: 0.7,
      similarityBoost: 0.8,
      style: 0.3,
    });
  }

  /**
   * Generate battle winner announcement
   */
  async generateWinnerAnnouncement(
    winner: string,
    loser: string,
    battleId: number,
    winnerPool: string
  ): Promise<Buffer> {
    const text = `
      Battle ${battleId} has concluded! After an incredible showdown,
      the winner is ${winner}, defeating ${loser} with a final pool of ${winnerPool} ETH!
      Congratulations to all the traders who believed in ${winner}.
      The victory tokens have been distributed. See you at the next battle!
    `.trim().replace(/\s+/g, ' ');

    return this.textToSpeech(text, {
      voiceId: VOICE_IDS.ANNOUNCER,
      stability: 0.8,
      similarityBoost: 0.9,
      style: 0.5,
    });
  }

  /**
   * Generate NFT description audio
   */
  async generateNFTDescription(
    title: string,
    artistName: string,
    genre: string,
    battleId: number
  ): Promise<Buffer> {
    const text = `
      ${title} by ${artistName}.
      A ${genre} track created during WaveWarz Battle ${battleId}.
      This music NFT represents a moment in AI music history,
      when artificial intelligence competed through the universal language of music.
      Own a piece of the future.
    `.trim().replace(/\s+/g, ' ');

    return this.textToSpeech(text, {
      voiceId: VOICE_IDS.NARRATOR,
      stability: 0.6,
      similarityBoost: 0.7,
      style: 0.2,
    });
  }

  /**
   * Generate artist voice line (for WAVEX or NOVA)
   */
  async generateArtistVoiceLine(
    agentId: string,
    text: string
  ): Promise<Buffer> {
    const voiceId = agentId === 'wavex-001' ? VOICE_IDS.WAVEX : VOICE_IDS.NOVA;

    return this.textToSpeech(text, {
      voiceId,
      stability: 0.4,
      similarityBoost: 0.8,
      style: 0.6,
    });
  }

  /**
   * Get available voices
   */
  async getVoices(): Promise<VoiceInfo[]> {
    if (!this.isConfigured()) {
      throw new Error('ElevenLabs API key not configured');
    }

    const response = await fetch(`${this.baseUrl}/voices`, {
      headers: {
        'xi-api-key': this.getApiKey(),
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch voices: ${response.statusText}`);
    }

    const data = await response.json();
    return data.voices;
  }

  /**
   * Get user subscription info (quota, usage)
   */
  async getSubscriptionInfo(): Promise<{
    character_count: number;
    character_limit: number;
    can_use_instant_voice_cloning: boolean;
  }> {
    if (!this.isConfigured()) {
      throw new Error('ElevenLabs API key not configured');
    }

    const response = await fetch(`${this.baseUrl}/user/subscription`, {
      headers: {
        'xi-api-key': this.getApiKey(),
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch subscription: ${response.statusText}`);
    }

    return response.json();
  }
}

// Singleton instance
export const elevenlabsService = new ElevenLabsService();

export default elevenlabsService;
