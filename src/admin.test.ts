import { describe, it, expect, vi } from 'vitest';
import { isAdmin } from './admin.js';

function makeClient(user: Partial<{ is_admin: boolean; is_owner: boolean; is_primary_owner: boolean }> | undefined) {
  return {
    users: {
      info: vi.fn().mockResolvedValue({ user })
    }
  } as any;
}

describe('isAdmin', () => {
  it('returns true for an admin user', async () => {
    const client = makeClient({ is_admin: true });
    expect(await isAdmin(client, 'U1')).toBe(true);
  });

  it('returns true for a workspace owner', async () => {
    const client = makeClient({ is_owner: true });
    expect(await isAdmin(client, 'U1')).toBe(true);
  });

  it('returns false for a regular member', async () => {
    const client = makeClient({ is_admin: false, is_owner: false, is_primary_owner: false });
    expect(await isAdmin(client, 'U1')).toBe(false);
  });

  it('returns false when the Slack API call fails', async () => {
    const client = {
      users: {
        info: vi.fn().mockRejectedValue(new Error('network error'))
      }
    } as any;
    expect(await isAdmin(client, 'U1')).toBe(false);
  });
});
