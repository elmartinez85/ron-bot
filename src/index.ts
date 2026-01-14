// Ron Burgundy Slackbot – Full Implementation
// See README/instructions from ChatGPT conversation

import 'dotenv/config';
import { App, SayFn } from '@slack/bolt';
import OpenAI from 'openai';
import Database from 'better-sqlite3';

// Structured logging
enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...meta
  };
  console.log(JSON.stringify(logEntry));
}

const slackApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODEL = process.env.RON_MODEL ?? 'gpt-4o-mini';
const MAX_REQ_PER_HOUR = Number(process.env.RON_MAX_REQ_PER_HOUR ?? 30);
const COOLDOWN_MS = Number(process.env.RON_COOLDOWN_MS ?? 15000);
const MAX_OUTPUT_TOKENS = Number(process.env.RON_MAX_OUTPUT_TOKENS ?? 160);

const dbPath = process.env.RON_DB_PATH ?? '/data/ron.sqlite';
const db = new Database(dbPath);
db.exec(`
CREATE TABLE IF NOT EXISTS workspace_memory (
  team_id TEXT PRIMARY KEY,
  summary TEXT NOT NULL,
  jokes_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`);

interface WorkspaceMemory {
  summary: string;
  jokes: string[];
}

function getWorkspaceMemory(teamId: string): WorkspaceMemory {
  const row = db.prepare(`SELECT summary, jokes_json FROM workspace_memory WHERE team_id=?`).get(teamId) as { summary: string; jokes_json: string } | undefined;
  if (!row) return { summary: "", jokes: [] };
  return { summary: row.summary ?? "", jokes: JSON.parse(row.jokes_json ?? "[]") };
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


let windowStart = Date.now();
let reqCount = 0;

function allowHourly(): boolean {
  const now = Date.now();
  if (now - windowStart >= 3600000) {
    windowStart = now;
    reqCount = 0;
  }
  if (reqCount >= MAX_REQ_PER_HOUR) return false;
  reqCount++;
  return true;
}

const lastHit = new Map<string, number>();
function allowCooldown(teamId: string): boolean {
  const now = Date.now();
  const last = lastHit.get(teamId) ?? 0;
  if (now - last < COOLDOWN_MS) return false;
  lastHit.set(teamId, now);
  return true;
}

async function isAdmin(client: App['client'], userId: string): Promise<boolean> {
  try {
    const res = await client.users.info({ user: userId });
    const u = res.user;
    return Boolean(u?.is_admin || u?.is_owner || u?.is_primary_owner);
  } catch (error) {
    log(LogLevel.ERROR, 'Error checking admin status', { userId, error: String(error) });
    return false;
  }
}

const SYSTEM_PROMPT = `
You are Ron Burgundy from Anchorman.
Be pompous, confident, and absurdly self-important.
Keep replies under 80 words.
No hateful, sexual, or dangerous content.
Refuse illegal requests with humor.
`;

async function ronRespond(userText: string, mem: WorkspaceMemory): Promise<string> {
  try {
    const memoryBlock = [
      mem.summary ? `Workspace summary: ${mem.summary}` : "",
      mem.jokes.length ? `Inside jokes:\n${mem.jokes.map(j => `- ${j}`).join("\n")}` : ""
    ].filter(Boolean).join("\n\n");

    const resp = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system' as const, content: SYSTEM_PROMPT },
        ...(memoryBlock ? [{ role: 'system' as const, content: memoryBlock }] : []),
        { role: 'user' as const, content: userText }
      ],
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.9
    });

    const reply = resp.choices[0]?.message?.content ?? "I have nothing witty to say. This is troubling.";
    log(LogLevel.INFO, 'Generated response', {
      userTextLength: userText.length,
      replyLength: reply.length,
      hasMemory: memoryBlock.length > 0
    });
    return reply;
  } catch (error) {
    log(LogLevel.ERROR, 'Error generating Ron response', { error: String(error) });
    return "My teleprompter appears to be malfunctioning. Please try again later.";
  }
}

slackApp.event('app_mention', async ({ event, client, say }) => {
  try {
    const teamId = event.team ?? '';
    const userId = event.user;
    const cleaned = event.text.replace(/<@[^>]+>/g, '').trim();

    const [cmd, ...args] = cleaned.split(/\s+/);
    const lower = (cmd ?? '').toLowerCase();

    log(LogLevel.INFO, 'Received mention', { teamId, userId, command: lower });

    // Admin commands
    if (['reset', 'remember', 'forget', 'memories'].includes(lower)) {
      if (!(await isAdmin(client, userId ?? ''))) {
        log(LogLevel.WARN, 'Unauthorized admin command attempt', { userId, command: lower });
        await say("You lack the authority to tamper with my memories.");
        return;
      }

      if (lower === 'reset') {
        db.prepare(`DELETE FROM workspace_memory WHERE team_id=?`).run(teamId);
        log(LogLevel.INFO, 'Memory reset', { teamId });
        await say("Memory wiped. Ron is reborn.");
        return;
      }

      if (lower === 'remember') {
        const text = args.join(' ').trim();
        if (!text) {
          await say("Remember what, exactly? Be specific.");
          return;
        }

        const mem = getWorkspaceMemory(teamId);
        mem.jokes.push(text);
        saveWorkspaceMemory(teamId, mem.summary, mem.jokes);
        await say("Noted. I shall remember this for eternity... or until you reset me.");
        return;
      }

      if (lower === 'forget') {
        const indexStr = args[0];
        const index = parseInt(indexStr, 10);

        if (!indexStr || isNaN(index)) {
          await say("Forget which memory? Provide the number.");
          return;
        }

        const mem = getWorkspaceMemory(teamId);
        if (index < 1 || index > mem.jokes.length) {
          await say(`I only have ${mem.jokes.length} memories. Try again.`);
          return;
        }

        const removed = mem.jokes.splice(index - 1, 1)[0];
        saveWorkspaceMemory(teamId, mem.summary, mem.jokes);
        await say(`Forgotten: "${removed}". Good riddance.`);
        return;
      }

      if (lower === 'memories') {
        const mem = getWorkspaceMemory(teamId);
        if (mem.jokes.length === 0 && !mem.summary) {
          await say("My mind is a blank slate. Glorious and terrifying.");
          return;
        }

        let response = "*My Memories:*\n\n";
        if (mem.summary) {
          response += `*Summary:* ${mem.summary}\n\n`;
        }
        if (mem.jokes.length > 0) {
          response += "*Inside Jokes:*\n";
          mem.jokes.forEach((joke, i) => {
            response += `${i + 1}. ${joke}\n`;
          });
        }
        await say(response);
        return;
      }
    }

    // Rate limiting
    if (!allowCooldown(teamId)) {
      log(LogLevel.WARN, 'Cooldown rate limit hit', { teamId });
      await say("Easy there, champ. I need a moment to collect my thoughts.");
      return;
    }
    if (!allowHourly()) {
      log(LogLevel.WARN, 'Hourly rate limit hit', { teamId, count: reqCount });
      await say("I've reached my quota for the hour. Even legends need rest.");
      return;
    }

    // Normal response
    const mem = getWorkspaceMemory(teamId);
    const reply = await ronRespond(cleaned, mem);
    await say(reply);
  } catch (error) {
    log(LogLevel.ERROR, 'Error handling app_mention', { error: String(error) });
    try {
      await say("I appear to have stepped in my own greatness. Please try again.");
    } catch (sayError) {
      log(LogLevel.ERROR, 'Error sending error message', { error: String(sayError) });
    }
  }
});

(async () => {
  await slackApp.start();
  log(LogLevel.INFO, 'Ron Burgundy Slackbot is running', {
    model: MODEL,
    maxReqPerHour: MAX_REQ_PER_HOUR,
    cooldownMs: COOLDOWN_MS,
    dbPath
  });
})();
