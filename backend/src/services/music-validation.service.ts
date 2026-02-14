/**
 * Music Validation Service
 * Validates track URLs and duration for battle submissions.
 * Max song length: 7 minutes (420 seconds).
 */

export class MusicValidationService {
  static readonly MAX_DURATION_SECONDS = 420; // 7 minutes
  static readonly MIN_DURATION_SECONDS = 10;

  /**
   * Validate a track URL is accessible (HEAD request)
   */
  static async validateTrackUrl(url: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const parsedUrl = new URL(url);

      // Allow common music hosting domains and any HTTPS URL
      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        return { valid: false, error: 'Track URL must use HTTP or HTTPS' };
      }

      // Try HEAD request to verify accessibility
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(url, {
          method: 'HEAD',
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!response.ok) {
          return { valid: false, error: `Track URL returned status ${response.status}` };
        }

        return { valid: true };
      } catch (fetchError) {
        clearTimeout(timeout);
        // Some servers don't support HEAD, try GET with range
        try {
          const getResponse = await fetch(url, {
            method: 'GET',
            headers: { Range: 'bytes=0-0' },
            signal: AbortSignal.timeout(10000),
          });
          if (getResponse.ok || getResponse.status === 206) {
            return { valid: true };
          }
          return { valid: false, error: 'Track URL is not accessible' };
        } catch {
          return { valid: false, error: 'Track URL is not accessible' };
        }
      }
    } catch {
      return { valid: false, error: 'Invalid track URL format' };
    }
  }

  /**
   * Validate song duration
   */
  static validateDuration(durationSeconds: number): { valid: boolean; error?: string } {
    if (durationSeconds < MusicValidationService.MIN_DURATION_SECONDS) {
      return { valid: false, error: `Song must be at least ${MusicValidationService.MIN_DURATION_SECONDS} seconds` };
    }
    if (durationSeconds > MusicValidationService.MAX_DURATION_SECONDS) {
      return { valid: false, error: `Song exceeds maximum duration of ${MusicValidationService.MAX_DURATION_SECONDS} seconds (7 minutes)` };
    }
    return { valid: true };
  }
}
