import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('getServiceClient', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns a client whose supabaseUrl matches the env var', async () => {
    const { getServiceClient } = await import('../server');
    const client = getServiceClient();
    expect(client).toBeDefined();
    expect((client as any).supabaseUrl).toBe('https://example.supabase.co');
  });

  it('throws if SUPABASE_URL is missing', async () => {
    vi.stubEnv('SUPABASE_URL', '');
    const { getServiceClient } = await import('../server');
    expect(() => getServiceClient()).toThrow(/SUPABASE_URL/);
  });

  it('throws if SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const { getServiceClient } = await import('../server');
    expect(() => getServiceClient()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});
