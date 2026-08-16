import { describe, it, expect } from 'vitest';
import { createHourlyLimiter, createCooldownLimiter } from './rateLimit.js';

describe('createHourlyLimiter', () => {
  it('allows requests up to the max per hour', () => {
    let now = 0;
    const allow = createHourlyLimiter(2, () => now);
    expect(allow()).toBe(true);
    expect(allow()).toBe(true);
  });

  it('blocks requests once the hourly max is reached', () => {
    let now = 0;
    const allow = createHourlyLimiter(2, () => now);
    allow();
    allow();
    expect(allow()).toBe(false);
  });

  it('resets the count after the window elapses', () => {
    let now = 0;
    const allow = createHourlyLimiter(1, () => now);
    expect(allow()).toBe(true);
    expect(allow()).toBe(false);
    now += 3600000;
    expect(allow()).toBe(true);
  });
});

describe('createCooldownLimiter', () => {
  it('allows the first request for a team', () => {
    let now = 1_000_000;
    const allow = createCooldownLimiter(15000, () => now);
    expect(allow('T1')).toBe(true);
  });

  it('blocks a second request within the cooldown window', () => {
    let now = 1_000_000;
    const allow = createCooldownLimiter(15000, () => now);
    allow('T1');
    now += 1000;
    expect(allow('T1')).toBe(false);
  });

  it('allows a request after the cooldown elapses', () => {
    let now = 1_000_000;
    const allow = createCooldownLimiter(15000, () => now);
    allow('T1');
    now += 15000;
    expect(allow('T1')).toBe(true);
  });

  it('tracks cooldowns independently per team', () => {
    let now = 1_000_000;
    const allow = createCooldownLimiter(15000, () => now);
    allow('T1');
    expect(allow('T2')).toBe(true);
  });
});
