import type Database from 'better-sqlite3';
import { LogLevel, log } from './logger.js';

export interface WorkspaceMemory {
  summary: string;
  jokes: string[];
}

export interface MemoryStore {
  getWorkspaceMemory(teamId: string): WorkspaceMemory;
  saveWorkspaceMemory(teamId: string, summary: string, jokes: string[]): void;
}

export function createMemoryStore(db: Database.Database): MemoryStore {
  db.exec(`
CREATE TABLE IF NOT EXISTS workspace_memory (
  team_id TEXT PRIMARY KEY,
  summary TEXT NOT NULL,
  jokes_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`);

  function getWorkspaceMemory(teamId: string): WorkspaceMemory {
    const row = db.prepare(`SELECT summary, jokes_json FROM workspace_memory WHERE team_id=?`).get(teamId) as { summary: string; jokes_json: string } | undefined;
    if (!row) return { summary: "", jokes: [] };

    try {
      const jokes = JSON.parse(row.jokes_json ?? "[]");
      if (!Array.isArray(jokes)) {
        log(LogLevel.WARN, 'Invalid jokes data, resetting', { teamId });
        return { summary: row.summary ?? "", jokes: [] };
      }
      return { summary: row.summary ?? "", jokes };
    } catch (error) {
      log(LogLevel.ERROR, 'Failed to parse jokes JSON', { teamId, error: String(error) });
      return { summary: row.summary ?? "", jokes: [] };
    }
  }

  function saveWorkspaceMemory(teamId: string, summary: string, jokes: string[]): void {
    db.prepare(`
      INSERT INTO workspace_memory(team_id, summary, jokes_json, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(team_id) DO UPDATE SET
        summary=excluded.summary,
        jokes_json=excluded.jokes_json,
        updated_at=excluded.updated_at
    `).run(teamId, summary, JSON.stringify(jokes), Date.now());

    log(LogLevel.INFO, 'Workspace memory updated', { teamId, summary: summary.substring(0, 50), jokesCount: jokes.length });
  }

  return { getWorkspaceMemory, saveWorkspaceMemory };
}
