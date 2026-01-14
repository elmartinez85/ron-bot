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

function getWorkspaceMemory(teamId) {
  const row = db.prepare(`SELECT summary, jokes_json FROM workspace_memory WHERE team_id=?`).get(teamId);
  if (!row) return { summary: "", jokes: [] };
  return { summary: row.summary ?? "", jokes: JSON.parse(row.jokes_json ?? "[]") };
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
  try {
    const res = await client.users.info({ user: userId });
    const u = res.user;
    return Boolean(u?.is_admin || u?.is_owner || u?.is_primary_owner);
  } catch (error) {
    console.error('Error checking admin status:', error);
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

async function ronRespond(userText, mem) {
  try {
    const memoryBlock = [
      mem.summary ? `Workspace summary: ${mem.summary}` : "",
      mem.jokes.length ? `Inside jokes:\n${mem.jokes.map(j => `- ${j}`).join("\n")}` : ""
    ].filter(Boolean).join("\n\n");

    const resp = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...(memoryBlock ? [{ role: 'system', content: memoryBlock }] : []),
        { role: 'user', content: userText }
      ],
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.9
    });

    return resp.choices[0]?.message?.content ?? "I have nothing witty to say. This is troubling.";
  } catch (error) {
    console.error('Error generating Ron response:', error);
    return "My teleprompter appears to be malfunctioning. Please try again later.";
  }
}

slackApp.event('app_mention', async ({ event, client, say }) => {
  try {
    const teamId = event.team;
    const userId = event.user;
    const cleaned = event.text.replace(/<@[^>]+>/g, '').trim();

    const [cmd] = cleaned.split(/\s+/);
    const lower = (cmd ?? '').toLowerCase();

    if (lower === 'reset') {
      if (!(await isAdmin(client, userId))) {
        await say("You lack the authority to tamper with my memories.");
        return;
      }
      db.prepare(`DELETE FROM workspace_memory WHERE team_id=?`).run(teamId);
      await say("Memory wiped. Ron is reborn.");
      return;
    }

    if (!allowCooldown(teamId)) {
      await say("Easy there, champ. I need a moment to collect my thoughts.");
      return;
    }
    if (!allowHourly()) {
      await say("I've reached my quota for the hour. Even legends need rest.");
      return;
    }

    const mem = getWorkspaceMemory(teamId);
    const reply = await ronRespond(cleaned, mem);
    await say(reply);
  } catch (error) {
    console.error('Error handling app_mention:', error);
    try {
      await say("I appear to have stepped in my own greatness. Please try again.");
    } catch (sayError) {
      console.error('Error sending error message:', sayError);
    }
  }
});

(async () => {
  await slackApp.start();
  console.log("Ron Burgundy Slackbot is running.");
})();
