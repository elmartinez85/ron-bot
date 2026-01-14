// Ron Burgundy Slackbot – Full Implementation
// See README/instructions from ChatGPT conversation

import 'dotenv/config';
import { App } from '@slack/bolt';
import OpenAI from 'openai';
import Database from 'better-sqlite3';

const slackApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODEL = process.env.RON_MODEL ?? 'gpt-5-mini';
const MAX_REQ_PER_HOUR = Number(process.env.RON_MAX_REQ_PER_HOUR ?? 30);
const COOLDOWN_MS = Number(process.env.RON_COOLDOWN_MS ?? 15000);
const MAX_OUTPUT_TOKENS = Number(process.env.RON_MAX_OUTPUT_TOKENS ?? 160);
const MAX_JOKES = Number(process.env.RON_MAX_JOKES ?? 20);
const MAX_SUMMARY_CHARS = Number(process.env.RON_MAX_SUMMARY_CHARS ?? 1200);
const MEMORY_UPDATE_EVERY = Number(process.env.RON_MEMORY_UPDATE_EVERY ?? 10);

const db = new Database('ron.sqlite');
db.exec(`
CREATE TABLE IF NOT EXISTS workspace_memory (
  team_id TEXT PRIMARY KEY,
  summary TEXT NOT NULL,
  jokes_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`);

function getWorkspaceMemory(teamId) {
  const row = db.prepare(`SELECT summary, jokes_json FROM workspace_memory WHERE team_id=?`).get(teamId);
  if (!row) return { summary: "", jokes: [] };
  return { summary: row.summary ?? "", jokes: JSON.parse(row.jokes_json ?? "[]") };
}

function saveWorkspaceMemory(teamId, summary, jokes) {
  db.prepare(`
    INSERT INTO workspace_memory(team_id, summary, jokes_json, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(team_id) DO UPDATE SET
      summary=excluded.summary,
      jokes_json=excluded.jokes_json,
      updated_at=excluded.updated_at
  `).run(teamId, summary.slice(0, MAX_SUMMARY_CHARS), JSON.stringify(jokes.slice(0, MAX_JOKES)), Date.now());
}

let windowStart = Date.now();
let reqCount = 0;

function allowHourly() {
  const now = Date.now();
  if (now - windowStart >= 3600000) {
    windowStart = now;
    reqCount = 0;
  }
  if (reqCount >= MAX_REQ_PER_HOUR) return false;
  reqCount++;
  return true;
}

const lastHit = new Map();
function allowCooldown(teamId) {
  const now = Date.now();
  const last = lastHit.get(teamId) ?? 0;
  if (now - last < COOLDOWN_MS) return false;
  lastHit.set(teamId, now);
  return true;
}

async function isAdmin(client, userId) {
  const res = await client.users.info({ user: userId });
  const u = res.user;
  return Boolean(u?.is_admin || u?.is_owner || u?.is_primary_owner);
}

const SYSTEM_PROMPT = `
You are Ron Burgundy from Anchorman.
Be pompous, confident, and absurdly self-important.
Keep replies under 80 words.
No hateful, sexual, or dangerous content.
Refuse illegal requests with humor.
`;

async function ronRespond(userText, mem) {
  const memoryBlock = [
    mem.summary ? `Workspace summary: ${mem.summary}` : "",
    mem.jokes.length ? `Inside jokes:\n${mem.jokes.map(j => `- ${j}`).join("\n")}` : ""
  ].filter(Boolean).join("\n\n");

  const resp = await openai.responses.create({
    model: MODEL,
    input: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...(memoryBlock ? [{ role: 'system', content: memoryBlock }] : []),
      { role: 'user', content: userText }
    ],
    max_output_tokens: MAX_OUTPUT_TOKENS,
    temperature: 0.9
  });

  return resp.output_text ?? "I have nothing witty to say. This is troubling.";
}

slackApp.event('app_mention', async ({ event, client, say }) => {
  const teamId = event.team;
  const userId = event.user;
  const cleaned = event.text.replace(/<@[^>]+>/g, '').trim();

  const [cmd, ...rest] = cleaned.split(/\s+/);
  const lower = (cmd ?? '').toLowerCase();

  if (['reset', 'export', 'import'].includes(lower)) {
    if (!(await isAdmin(client, userId))) {
      await say("You lack the authority to tamper with my memories.");
      return;
    }
    if (lower === 'reset') {
      db.prepare(`DELETE FROM workspace_memory WHERE team_id=?`).run(teamId);
      await say("Memory wiped. Ron is reborn.");
      return;
    }
  }

  if (!allowCooldown(teamId)) return;
  if (!allowHourly()) return;

  const mem = getWorkspaceMemory(teamId);
  const reply = await ronRespond(cleaned, mem);
  await say(reply);
});

(async () => {
  await slackApp.start();
  console.log("Ron Burgundy Slackbot is running.");
})();
