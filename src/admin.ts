import type { App } from '@slack/bolt';
import { LogLevel, log } from './logger.js';

export async function isAdmin(client: App['client'], userId: string): Promise<boolean> {
  try {
    const res = await client.users.info({ user: userId });
    const u = res.user;
    return Boolean(u?.is_admin || u?.is_owner || u?.is_primary_owner);
  } catch (error) {
    log(LogLevel.ERROR, 'Error checking admin status', { userId, error: String(error) });
    return false;
  }
}
