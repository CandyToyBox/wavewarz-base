/**
 * Moltbook Authentication Middleware
 * Verifies AI agent identity using Moltbook's identity token system
 *
 * Usage:
 * - AI agents include their identity token in the X-Moltbook-Identity header
 * - This middleware verifies the token against Moltbook's API
 * - Verified agent profile is attached to request context
 */

import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';

// Verified agent profile from Moltbook
export interface MoltbookAgent {
  id: string;
  name: string;
  karma: number;
  avatar_url: string | null;
  is_claimed: boolean;
  owner: {
    x_handle: string | null;
    x_verified: boolean;
  } | null;
}

// Verification response from Moltbook API
interface VerifyResponse {
  valid: boolean;
  agent?: MoltbookAgent;
  error?: 'identity_token_expired' | 'invalid_token' | 'invalid_app_key' | 'audience_mismatch';
}

// Extend FastifyRequest to include verified agent
declare module 'fastify' {
  interface FastifyRequest {
    moltbookAgent?: MoltbookAgent;
  }
}

const MOLTBOOK_VERIFY_URL = 'https://moltbook.com/api/v1/agents/verify-identity';
const WAVEWARZ_AUDIENCE = 'wavewarz-base'; // Our app identifier for token audience

/**
 * Verify Moltbook identity token
 */
async function verifyMoltbookToken(
  token: string,
  appKey: string
): Promise<VerifyResponse> {
  try {
    const response = await fetch(MOLTBOOK_VERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Moltbook-App-Key': appKey,
      },
      body: JSON.stringify({
        token,
        audience: WAVEWARZ_AUDIENCE,
      }),
    });

    if (!response.ok) {
      // Handle rate limiting
      if (response.status === 429) {
        const resetTime = response.headers.get('X-RateLimit-Reset');
        console.warn(`Moltbook rate limit exceeded. Reset at: ${resetTime}`);
        return { valid: false, error: 'invalid_token' };
      }

      // Parse error response
      const errorData = await response.json().catch(() => ({}));
      return {
        valid: false,
        error: errorData.error || 'invalid_token',
      };
    }

    return await response.json();
  } catch (error) {
    console.error('Moltbook verification failed:', error);
    return { valid: false, error: 'invalid_token' };
  }
}

/**
 * Create Moltbook authentication middleware
 */
export function createMoltbookAuthMiddleware(appKey: string) {
  return async function moltbookAuth(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    // Extract identity token from header
    const identityToken = request.headers['x-moltbook-identity'] as string | undefined;

    if (!identityToken) {
      return reply.status(401).send({
        success: false,
        error: 'Missing X-Moltbook-Identity header',
        code: 'MISSING_IDENTITY_TOKEN',
      });
    }

    // Verify token with Moltbook
    const verification = await verifyMoltbookToken(identityToken, appKey);

    if (!verification.valid || !verification.agent) {
      const errorMessages: Record<string, string> = {
        identity_token_expired: 'Identity token has expired. Please request a new token.',
        invalid_token: 'Invalid identity token.',
        invalid_app_key: 'Server configuration error. Please contact support.',
        audience_mismatch: 'Token was not issued for this application.',
      };

      return reply.status(401).send({
        success: false,
        error: errorMessages[verification.error || 'invalid_token'],
        code: verification.error?.toUpperCase() || 'INVALID_TOKEN',
      });
    }

    // Attach verified agent to request
    request.moltbookAgent = verification.agent;
  };
}

/**
 * Optional auth - doesn't fail if no token, but verifies if present
 */
export function createOptionalMoltbookAuth(appKey: string) {
  return async function optionalMoltbookAuth(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const identityToken = request.headers['x-moltbook-identity'] as string | undefined;

    if (!identityToken) {
      // No token provided, continue without agent context
      return;
    }

    // Verify token if provided
    const verification = await verifyMoltbookToken(identityToken, appKey);

    if (verification.valid && verification.agent) {
      request.moltbookAgent = verification.agent;
    }
    // If invalid, just don't attach agent (don't fail the request)
  };
}

/**
 * Register Moltbook auth plugin with Fastify
 */
export async function registerMoltbookAuth(fastify: FastifyInstance) {
  const appKey = process.env.MOLTBOOK_APP_KEY;

  if (!appKey) {
    fastify.log.warn('MOLTBOOK_APP_KEY not configured. Moltbook auth disabled.');
    return;
  }

  // Decorate request with moltbookAgent
  fastify.decorateRequest('moltbookAgent', null);

  // Create middleware instances
  const requireAuth = createMoltbookAuthMiddleware(appKey);
  const optionalAuth = createOptionalMoltbookAuth(appKey);

  // Make available on fastify instance
  fastify.decorate('moltbookAuth', requireAuth);
  fastify.decorate('moltbookOptionalAuth', optionalAuth);

  fastify.log.info('Moltbook authentication middleware registered');
}

// Extend Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    moltbookAuth: ReturnType<typeof createMoltbookAuthMiddleware>;
    moltbookOptionalAuth: ReturnType<typeof createOptionalMoltbookAuth>;
  }
}

export default registerMoltbookAuth;
