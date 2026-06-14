import type { AudiusTrack } from '../types/index.js';

/**
 * Audius source service.
 *
 * v1 song source for the entry-queue model: pulls real tracks from the Audius
 * public catalog to seed a Quick Battle's two sides. Replaces SUNO (AI-gen) as
 * the locked source. Mirrors the SunoService shape (real client + Mock) so the
 * two are swap-in compatible where the lifecycle expects track URLs.
 *
 * Audius discovery is a peer network: resolve a live host from https://api.audius.co,
 * then hit /v1/tracks/* on it. No API key required for public reads.
 */
export class AudiusService {
  private readonly appName: string;
  private hostCache: { host: string; fetchedAt: number } | null = null;
  private readonly hostTtlMs = 5 * 60 * 1000;

  constructor(appName: string = 'wavewarz') {
    this.appName = appName;
  }

  /**
   * Resolve a healthy Audius discovery host (cached briefly).
   */
  private async getHost(): Promise<string> {
    const now = Date.now();
    if (this.hostCache && now - this.hostCache.fetchedAt < this.hostTtlMs) {
      return this.hostCache.host;
    }

    const res = await fetch('https://api.audius.co');
    if (!res.ok) throw new Error(`Audius host discovery failed: ${res.status}`);
    const body = (await res.json()) as { data: string[] };
    const host = body.data?.[0];
    if (!host) throw new Error('Audius host discovery returned no hosts');

    this.hostCache = { host, fetchedAt: now };
    return host;
  }

  private mapTrack(raw: any): AudiusTrack {
    return {
      trackId: raw.id,
      trackUrl: raw.permalink
        ? `https://audius.co${raw.permalink}`
        : `https://audius.co/tracks/${raw.id}`,
      streamUrl: `${raw.__host ?? ''}/v1/tracks/${raw.id}/stream?app_name=${this.appName}`,
      title: raw.title ?? 'Untitled',
      artistName: raw.user?.name ?? raw.user?.handle ?? 'Unknown',
      artistHandle: raw.user?.handle ?? '',
      durationSeconds: raw.duration ?? 0,
      sourcedAt: new Date(),
    };
  }

  /**
   * Pull a list of candidate tracks (trending by default) for the queue.
   */
  async pullTracks(limit: number = 10, genre?: string): Promise<AudiusTrack[]> {
    const host = await this.getHost();
    const params = new URLSearchParams({ app_name: this.appName, limit: String(limit) });
    if (genre) params.set('genre', genre);

    const res = await fetch(`${host}/v1/tracks/trending?${params.toString()}`);
    if (!res.ok) throw new Error(`Audius trending fetch failed: ${res.status}`);
    const body = (await res.json()) as { data: any[] };

    return (body.data ?? [])
      .filter((t) => t.is_streamable !== false && (t.duration ?? 0) > 0)
      .map((t) => this.mapTrack({ ...t, __host: host }));
  }

  /**
   * Source one battle pair: two distinct tracks for sides A and B.
   * v1 sources 1 pair; raise BATTLES_PER_CYCLE later to source more.
   */
  async pullBattlePair(genre?: string): Promise<[AudiusTrack, AudiusTrack]> {
    const tracks = await this.pullTracks(10, genre);
    if (tracks.length < 2) {
      throw new Error('Audius returned fewer than 2 streamable tracks');
    }
    return [tracks[0], tracks[1]];
  }
}

/**
 * Mock Audius service for development / testnet dry runs.
 * Returns deterministic streamable-looking tracks with no network call.
 */
export class MockAudiusService extends AudiusService {
  private counter = 0;

  override async pullTracks(limit: number = 10): Promise<AudiusTrack[]> {
    return Array.from({ length: limit }, () => {
      this.counter++;
      const n = this.counter;
      return {
        trackId: `mock-audius-${n}`,
        trackUrl: `https://audius.co/mockartist${n}/mock-track-${n}`,
        streamUrl: `https://example.com/mock-audius/${n}/stream`,
        title: `Mock Track ${n}`,
        artistName: `Mock Artist ${n}`,
        artistHandle: `mockartist${n}`,
        durationSeconds: 180,
        sourcedAt: new Date(),
      } satisfies AudiusTrack;
    });
  }

  override async pullBattlePair(): Promise<[AudiusTrack, AudiusTrack]> {
    const [a, b] = await this.pullTracks(2);
    return [a, b];
  }
}
