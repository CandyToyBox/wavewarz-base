/**
 * Supabase Vault Integration
 * Loads secrets from Supabase Vault at startup
 *
 * This allows secure storage of API keys in the database
 * instead of in environment files or code.
 */

import { Client } from 'pg';

// Secrets to load from Vault
// These should match the names you used when storing in Vault
const VAULT_SECRET_NAMES = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'ELEVENLABS_API_KEY',
  'CDP_API_KEY_ID',
  'CDP_API_KEY_SECRET',
  'CDP_WALLET_SECRET',
  'CDP_PROJECT_ID',
  'ADMIN_API_KEY',
  'ADMIN_PRIVATE_KEY',
  'WAVEWARZ_CONTRACT_ADDRESS',
  'WAVEWARZ_WALLET_ADDRESS',
] as const;

type VaultKey = (typeof VAULT_SECRET_NAMES)[number];

/**
 * Fetch a single secret from Vault
 * Supabase Vault typically uses the decrypted_secrets view
 */
async function fetchVaultSecret(
  client: Client,
  name: string
): Promise<string | null> {
  try {
    // Method 1: Using decrypted_secrets view (most common in Supabase)
    const res = await client.query(
      `SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1 LIMIT 1`,
      [name]
    );

    if (res.rows.length > 0 && res.rows[0].decrypted_secret) {
      return res.rows[0].decrypted_secret;
    }

    // Method 2: Try vault.get_secret function if view doesn't work
    try {
      const funcRes = await client.query(
        `SELECT (vault.get_secret($1)).secret as secret`,
        [name]
      );
      if (funcRes.rows.length > 0 && funcRes.rows[0].secret) {
        return funcRes.rows[0].secret;
      }
    } catch {
      // Function may not exist, that's ok
    }

    return null;
  } catch (error) {
    console.warn(`Failed to fetch vault secret "${name}":`, error);
    return null;
  }
}

/**
 * Load all secrets from Supabase Vault into process.env
 * Call this at application startup before initializing services
 */
export async function loadSecretsFromVault(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.warn('DATABASE_URL not set. Skipping Vault secret loading.');
    console.warn('Secrets will be read from environment variables instead.');
    return;
  }

  console.log('Loading secrets from Supabase Vault...');

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }, // Required for Supabase
  });

  try {
    await client.connect();
    console.log('Connected to Supabase for Vault access');

    let loadedCount = 0;
    let skippedCount = 0;

    for (const name of VAULT_SECRET_NAMES) {
      // Skip if already set in environment (allows local override)
      if (process.env[name]) {
        skippedCount++;
        continue;
      }

      const secret = await fetchVaultSecret(client, name);

      if (secret) {
        process.env[name] = secret;
        loadedCount++;
        console.log(`  ✓ Loaded: ${name}`);
      } else {
        console.warn(`  ⚠ Not found in Vault: ${name}`);
      }
    }

    console.log(
      `Vault loading complete: ${loadedCount} loaded, ${skippedCount} skipped (already in env)`
    );
  } catch (error) {
    console.error('Failed to load secrets from Vault:', error);
    console.warn('Falling back to environment variables');
  } finally {
    await client.end();
  }
}

/**
 * Check if Vault is accessible
 */
export async function checkVaultConnection(): Promise<boolean> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    return false;
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    // Check if vault schema exists
    const res = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.schemata WHERE schema_name = 'vault'
      ) as vault_exists
    `);

    return res.rows[0]?.vault_exists === true;
  } catch {
    return false;
  } finally {
    await client.end();
  }
}

/**
 * List all secrets stored in Vault (names only, not values)
 */
export async function listVaultSecrets(): Promise<string[]> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL required');
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    const res = await client.query(`
      SELECT name FROM vault.secrets ORDER BY name
    `);

    return res.rows.map((row) => row.name);
  } finally {
    await client.end();
  }
}

export default loadSecretsFromVault;
