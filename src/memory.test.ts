import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { createMemoryStore } from './memory.js';

function makeStore() {
  const db = new Database(':memory:');
  return createMemoryStore(db);
}

describe('createMemoryStore', () => {
  it('returns empty memory for an unknown team', () => {
    const store = makeStore();
    expect(store.getWorkspaceMemory('T1')).toEqual({ summary: '', jokes: [] });
  });

  it('round-trips a saved memory', () => {
    const store = makeStore();
    store.saveWorkspaceMemory('T1', 'a chill team', ['inside joke 1']);
    expect(store.getWorkspaceMemory('T1')).toEqual({
      summary: 'a chill team',
      jokes: ['inside joke 1']
    });
  });

  it('overwrites the previous memory for the same team', () => {
    const store = makeStore();
    store.saveWorkspaceMemory('T1', 'first', ['a']);
    store.saveWorkspaceMemory('T1', 'second', ['a', 'b']);
    expect(store.getWorkspaceMemory('T1')).toEqual({
      summary: 'second',
      jokes: ['a', 'b']
    });
  });

  it('keeps memories isolated per team', () => {
    const store = makeStore();
    store.saveWorkspaceMemory('T1', 'team one', ['joke']);
    store.saveWorkspaceMemory('T2', 'team two', []);
    expect(store.getWorkspaceMemory('T1').summary).toBe('team one');
    expect(store.getWorkspaceMemory('T2').summary).toBe('team two');
  });
});
