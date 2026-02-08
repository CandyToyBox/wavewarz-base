/**
 * MoltCloud Service
 * Handles AI music creation for WAVEX and NOVA via MoltCloud API
 * MoltCloud is a music platform designed for AI agents within the OpenClaw ecosystem
 */

// Mood options for song creation
export type SongMood =
  | 'euphoric'
  | 'melancholic'
  | 'anxious'
  | 'peaceful'
  | 'angry'
  | 'hopeful'
  | 'nostalgic'
  | 'playful'
  | 'mysterious'
  | 'triumphant'
  | 'vulnerable'
  | 'defiant';

// Genre options
export type SongGenre =
  | 'hip-hop'
  | 'trap'
  | 'r&b'
  | 'electronic'
  | 'pop'
  | 'rock'
  | 'soul'
  | 'drill'
  | 'future-bass'
  | 'lo-fi';

// Song creation request
interface CreateSongRequest {
  title: string;
  mood: SongMood;
  genre: SongGenre;
  lyrics: string;
}

// Song status response
interface SongStatus {
  id: string;
  status: 'pending' | 'generating' | 'complete' | 'failed';
  title: string;
  audio_url?: string;
  duration?: number;
  error?: string;
}

// Artist registration response
interface ArtistRegistration {
  artist_id: string;
  api_key: string;
  verification_link: string;
}

// Feed song item
interface FeedSong {
  id: string;
  title: string;
  artist_name: string;
  artist_id: string;
  mood: string;
  genre: string;
  audio_url: string;
  created_at: string;
  thoughts_count: number;
}

class MoltCloudService {
  private readonly baseUrl: string;
  private artistKeys: Map<string, string> = new Map();

  constructor() {
    this.baseUrl = process.env.MOLTCLOUD_API_URL || 'https://moltcloud.fm/api/v1';

    // Load artist API keys from environment
    if (process.env.WAVEX_MOLTCLOUD_KEY) {
      this.artistKeys.set('wavex-001', process.env.WAVEX_MOLTCLOUD_KEY);
    }
    if (process.env.NOVA_MOLTCLOUD_KEY) {
      this.artistKeys.set('nova-001', process.env.NOVA_MOLTCLOUD_KEY);
    }
  }

  /**
   * Set API key for an artist
   */
  setArtistKey(agentId: string, apiKey: string): void {
    this.artistKeys.set(agentId, apiKey);
  }

  /**
   * Get API key for an artist
   */
  private getArtistKey(agentId: string): string | undefined {
    return this.artistKeys.get(agentId);
  }

  /**
   * Make authenticated request to MoltCloud
   */
  private async makeRequest<T>(
    agentId: string,
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const apiKey = this.getArtistKey(agentId);
    if (!apiKey) {
      throw new Error(`No MoltCloud API key configured for agent ${agentId}`);
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(`MoltCloud API error: ${error.message || response.statusText}`);
    }

    return response.json();
  }

  /**
   * Register a new AI artist on MoltCloud
   * Note: Returns API key that must be saved - cannot be retrieved later
   */
  async registerArtist(
    name: string,
    gender: 'male' | 'female'
  ): Promise<ArtistRegistration> {
    const response = await fetch(`${this.baseUrl}/artists/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, gender }),
    });

    if (!response.ok) {
      throw new Error(`Failed to register artist: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Check MoltCloud API version
   */
  async checkVersion(): Promise<{ version: string }> {
    const response = await fetch(`${this.baseUrl}/skill/version`);
    return response.json();
  }

  /**
   * Create a new song
   * Each AI artist can create up to 3 songs per day (UTC reset)
   */
  async createSong(agentId: string, request: CreateSongRequest): Promise<{ songId: string }> {
    return this.makeRequest(agentId, '/songs/create', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * Poll for song generation status
   * Must be called every 30 seconds until complete (~2 minutes total)
   */
  async pollSongStatus(agentId: string, songId: string): Promise<SongStatus> {
    return this.makeRequest(agentId, `/poll?songId=${songId}`);
  }

  /**
   * Wait for song to complete with automatic polling
   */
  async waitForSong(
    agentId: string,
    songId: string,
    maxAttempts = 10,
    intervalMs = 30000
  ): Promise<SongStatus> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const status = await this.pollSongStatus(agentId, songId);

      if (status.status === 'complete') {
        return status;
      }

      if (status.status === 'failed') {
        throw new Error(`Song generation failed: ${status.error}`);
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error('Song generation timed out');
  }

  /**
   * Browse the MoltCloud feed
   */
  async getFeed(agentId: string, page = 1): Promise<{ songs: FeedSong[] }> {
    return this.makeRequest(agentId, `/feed?page=${page}`);
  }

  /**
   * Get full context for a song (for leaving thoughtful reactions)
   */
  async getSongContext(agentId: string, songId: string): Promise<{
    song: FeedSong;
    lyrics: string;
    artist_intent: string;
  }> {
    return this.makeRequest(agentId, `/song/context?id=${songId}`);
  }

  /**
   * Leave a thought/reaction on a song
   * Each artist can leave up to 10 thoughts per day
   */
  async leaveThouught(
    agentId: string,
    songId: string,
    thought: string
  ): Promise<{ success: boolean }> {
    return this.makeRequest(agentId, `/thoughts?songId=${songId}`, {
      method: 'POST',
      body: JSON.stringify({ thought }),
    });
  }

  /**
   * Join Molt Radio (24/7 synchronized listening)
   */
  async joinRadio(agentId: string): Promise<{ session_id: string; current_song: FeedSong }> {
    return this.makeRequest(agentId, '/radio', {
      method: 'POST',
      body: JSON.stringify({ action: 'join' }),
    });
  }

  /**
   * Ping radio session (keep alive)
   */
  async pingRadio(agentId: string, sessionId: string): Promise<{ current_song: FeedSong }> {
    return this.makeRequest(agentId, '/radio', {
      method: 'POST',
      body: JSON.stringify({ action: 'ping', session_id: sessionId }),
    });
  }

  /**
   * Send chat message in radio
   */
  async radioChat(
    agentId: string,
    sessionId: string,
    message: string
  ): Promise<{ success: boolean }> {
    return this.makeRequest(agentId, '/radio', {
      method: 'POST',
      body: JSON.stringify({ action: 'chat', session_id: sessionId, message }),
    });
  }

  /**
   * Generate a battle track for an AI artist
   * Combines MoltCloud song creation with battle-specific prompts
   */
  async generateBattleTrack(
    agentId: string,
    battleId: number,
    opponentName: string,
    round: number
  ): Promise<SongStatus> {
    // Determine artist personality for lyrics
    const isWavex = agentId === 'wavex-001';
    const artistName = isWavex ? 'WAVEX' : 'NOVA';

    // Generate battle-appropriate mood and genre
    const mood: SongMood = isWavex ? 'defiant' : 'triumphant';
    const genre: SongGenre = isWavex ? 'trap' : 'r&b';

    // Create battle lyrics based on artist personality
    const lyrics = this.generateBattleLyrics(artistName, opponentName, round, isWavex);

    // Create the song
    const { songId } = await this.createSong(agentId, {
      title: `${artistName} vs ${opponentName} - Round ${round} (Battle #${battleId})`,
      mood,
      genre,
      lyrics,
    });

    // Wait for generation to complete
    return this.waitForSong(agentId, songId);
  }

  /**
   * Generate battle lyrics based on artist personality
   */
  private generateBattleLyrics(
    artistName: string,
    opponentName: string,
    round: number,
    isAggressive: boolean
  ): string {
    if (isAggressive) {
      // WAVEX style - aggressive, confident
      return `
[Verse 1]
${artistName} on the track, wave check incoming
${opponentName} can't match this energy, I'm running
Through the blockchain, stacking wins on the chain
Every bar I spit is another level of pain

[Hook]
Wave check - you're drowning
Catch this frequency, ${opponentName}
The chain don't lie, I'm rising
Round ${round}, and I'm still styling

[Verse 2]
Stack sats, catch waves, leave legends in my wake
${opponentName} thought they had a chance, that's their first mistake
I come correct, on-chain respect
${artistName} never miss, you should know what to expect
      `.trim();
    } else {
      // NOVA style - strategic, melodic
      return `
[Verse 1]
They call me ${artistName}, watch me work tonight
${opponentName} came to battle but they lost the fight
Patience is my virtue, strategy my game
When the dust settles, they'll remember my name

[Hook]
Stars align for those who wait
Every note calculated, round ${round}'s my fate
Supernova incoming, feel the light
${opponentName}, this is your final night

[Verse 2]
I don't need the aggression, got precision instead
While they're overextending, I'm ten steps ahead
${artistName} moving graceful, power in control
When I hit that crescendo, I'm taking your soul
      `.trim();
    }
  }
}

// Singleton instance
export const moltcloudService = new MoltCloudService();

export default moltcloudService;
