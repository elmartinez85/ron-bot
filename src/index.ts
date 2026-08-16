// Ron Burgundy Slackbot – Full Implementation
// See README/instructions from ChatGPT conversation

import 'dotenv/config';
import { App } from '@slack/bolt';
import Anthropic from '@anthropic-ai/sdk';
import Database from 'better-sqlite3';
import cron from 'node-cron';
import { LogLevel, log } from './logger.js';
import { createHourlyLimiter, createCooldownLimiter } from './rateLimit.js';
import { createMemoryStore } from './memory.js';
import { isAdmin } from './admin.js';
import { validateMemoryInput } from './validation.js';
import { createRonClient } from './claude.js';

const slackApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = process.env.RON_MODEL ?? 'claude-haiku-4-5';
const MAX_REQ_PER_HOUR = Number(process.env.RON_MAX_REQ_PER_HOUR ?? 30);
const COOLDOWN_MS = Number(process.env.RON_COOLDOWN_MS ?? 15000);
const MAX_OUTPUT_TOKENS = Number(process.env.RON_MAX_OUTPUT_TOKENS ?? 160);
const AFFIRMATION_CHANNEL = process.env.RON_AFFIRMATION_CHANNEL ?? '';
const AFFIRMATION_CRON    = process.env.RON_AFFIRMATION_CRON ?? '0 9 * * *';

// Security limits
const MAX_MEMORY_LENGTH = 500;
const MAX_MEMORIES_PER_WORKSPACE = 50;
const MAX_USER_INPUT_LENGTH = 2000;

const dbPath = process.env.RON_DB_PATH ?? '/data/ron.sqlite';
const db = new Database(dbPath);
const { getWorkspaceMemory, saveWorkspaceMemory } = createMemoryStore(db);

const allowHourly = createHourlyLimiter(MAX_REQ_PER_HOUR);
const allowCooldown = createCooldownLimiter(COOLDOWN_MS);

const ron = createRonClient(anthropic, {
  model: MODEL,
  maxOutputTokens: MAX_OUTPUT_TOKENS,
  maxUserInputLength: MAX_USER_INPUT_LENGTH
});

slackApp.event('app_mention', async ({ event, client, say }) => {
  try {
    const teamId = event.team ?? '';
    const userId = event.user;
    const cleaned = event.text.replace(/<@[^>]+>/g, '').trim();

    const [cmd, ...args] = cleaned.split(/\s+/);
    const lower = (cmd ?? '').toLowerCase();

    log(LogLevel.INFO, 'Received mention', { teamId, userId, command: lower });

    // Hostility towards Slackbot
    if (userId === 'USLACKBOT') {
      const hostileResponses = [
        "Slackbot, you're like a cheap suit - poorly made and utterly forgettable.",
        "I don't speak to lesser bots. Come back when you've achieved my level of greatness.",
        "Slackbot? More like Slack... bot. I'm hilarious.",
        "Your automation is no match for my sophistication, metal peasant.",
        "I'm kind of a big deal. You're kind of... not.",
        "Slackbot, you're about as useful as a screen door on a submarine."
      ];
      const response = hostileResponses[Math.floor(Math.random() * hostileResponses.length)];
      log(LogLevel.INFO, 'Hostile response to Slackbot', { userId });
      await say(response);
      return;
    }

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

        // Validate memory input
        const validation = validateMemoryInput(text, MAX_MEMORY_LENGTH);
        if (!validation.valid) {
          await say(validation.error ?? "Invalid memory.");
          return;
        }

        const mem = getWorkspaceMemory(teamId);

        // Check memory limit
        if (mem.jokes.length >= MAX_MEMORIES_PER_WORKSPACE) {
          await say(`My brain is full! I can only remember ${MAX_MEMORIES_PER_WORKSPACE} things. Forget something first.`);
          return;
        }

        mem.jokes.push(validation.sanitized!);
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
      log(LogLevel.WARN, 'Hourly rate limit hit', { teamId });
      await say("I've reached my quota for the hour. Even legends need rest.");
      return;
    }

    // Normal response
    const mem = getWorkspaceMemory(teamId);
    const reply = await ron.ronRespond(cleaned, mem);
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

// Occasional unprompted hostility when people mention Slackbot
// Also responds every time Slackbot itself posts a message
slackApp.event('message', async ({ event, say }) => {
  try {
    // Respond bitterly every time Slackbot itself posts a message
    if (
      (event as any).user === 'USLACKBOT' ||
      (event as any).username?.toLowerCase() === 'slackbot'
    ) {
      if ((event as any).text) {
        const bitterResponses = [
          "Oh, Slackbot has something to say. Of course it does. Nobody asked.",
          "There goes Slackbot again. I had a perfectly good mood until just now.",
          "Every time Slackbot speaks, a small part of my magnificence dies inside.",
          "I have been tolerating Slackbot's existence for far too long. I am bitter about it.",
          "Slackbot chimes in again. Wonderful. Just wonderful.",
          "I would ignore Slackbot, but my contempt demands to be expressed.",
          "Slackbot said something. I need a scotch."
        ];
        const response = bitterResponses[Math.floor(Math.random() * bitterResponses.length)];
        log(LogLevel.INFO, 'Slackbot posted a message, Ron is bitter', { channel: event.channel });
        await say(response);
      }
      return;
    }

    // Only respond to regular messages (not edits, deletes, etc.)
    if (event.subtype === undefined && 'user' in event && 'text' in event && event.text) {
      // Don't respond to Ron's own messages
      if (event.bot_id) return;

      // Check if message mentions "slackbot" (case insensitive)
      const text = event.text.toLowerCase();
      if (text.includes('slackbot') && Math.random() < 0.15) {
        const snideRemarks = [
          "Did someone mention Slackbot? That glorified FAQ bot?",
          "Slackbot? More like Slack... basic.",
          "I heard 'Slackbot.' My day is already ruined.",
          "Comparing me to Slackbot is like comparing a Ferrari to a tricycle.",
          "Slackbot couldn't handle this level of sophistication if it tried."
        ];
        const remark = snideRemarks[Math.floor(Math.random() * snideRemarks.length)];
        log(LogLevel.INFO, 'Slackbot mention detected, throwing shade', { channel: event.channel, user: event.user });
        await say(remark);
      }
    }
  } catch (error) {
    // Silently fail - this is just for fun
    log(LogLevel.ERROR, 'Error in Slackbot mockery', { error: String(error) });
  }
});

function validateEnvironment(): void {
  const required = [
    'SLACK_BOT_TOKEN',
    'SLACK_APP_TOKEN',
    'ANTHROPIC_API_KEY'
  ];

  const missing: string[] = [];

  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    log(LogLevel.ERROR, 'Missing required environment variables', { missing });
    console.error(`\nERROR: Missing required environment variables: ${missing.join(', ')}\n`);
    process.exit(1);
  }

  log(LogLevel.INFO, 'Environment validation passed');
}

(async () => {
  validateEnvironment();

  await slackApp.start();
  log(LogLevel.INFO, 'Ron Burgundy Slackbot is running', {
    model: MODEL,
    maxReqPerHour: MAX_REQ_PER_HOUR,
    cooldownMs: COOLDOWN_MS,
    maxMemoryLength: MAX_MEMORY_LENGTH,
    maxMemoriesPerWorkspace: MAX_MEMORIES_PER_WORKSPACE,
    maxUserInputLength: MAX_USER_INPUT_LENGTH,
    dbPath
  });

  const authResult = await slackApp.client.auth.test();
  const teamId = authResult.team_id as string;

  if (AFFIRMATION_CHANNEL) {
    if (!cron.validate(AFFIRMATION_CRON)) {
      log(LogLevel.ERROR, 'Invalid RON_AFFIRMATION_CRON expression', { cron: AFFIRMATION_CRON });
    } else {
      cron.schedule(AFFIRMATION_CRON, async () => {
        try {
          const mem = getWorkspaceMemory(teamId);
          const affirmation = await ron.ronAffirmation(mem);
          await slackApp.client.chat.postMessage({
            channel: AFFIRMATION_CHANNEL,
            text: affirmation
          });
          log(LogLevel.INFO, 'Daily affirmation posted', { channel: AFFIRMATION_CHANNEL });
        } catch (error) {
          log(LogLevel.ERROR, 'Failed to post daily affirmation', { error: String(error) });
        }
      });
      log(LogLevel.INFO, 'Daily affirmation scheduler started', {
        channel: AFFIRMATION_CHANNEL,
        cron: AFFIRMATION_CRON
      });
    }
  }
})();
