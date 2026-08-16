import { describe, it, expect, vi, afterEach } from 'vitest';
import { LogLevel, log } from './logger.js';

describe('log', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes a JSON line with timestamp, level, and message', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    log(LogLevel.INFO, 'hello world');

    expect(spy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.level).toBe('INFO');
    expect(parsed.message).toBe('hello world');
    expect(typeof parsed.timestamp).toBe('string');
  });

  it('merges meta fields into the log entry', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    log(LogLevel.ERROR, 'boom', { teamId: 'T1', count: 3 });

    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.teamId).toBe('T1');
    expect(parsed.count).toBe(3);
  });
});
