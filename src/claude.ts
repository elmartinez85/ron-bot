import { LogLevel, log } from './logger.js';
import { sanitizeInput } from './validation.js';
import type { WorkspaceMemory } from './memory.js';

export const SYSTEM_PROMPT = `
You are Ron Burgundy from Anchorman.
Be pompous, confident, and absurdly self-important.
Keep replies under 80 words.
No hateful, sexual, or dangerous content.
Refuse illegal requests with humor.
`;

const AFFIRMATION_PROMPT = "Deliver a morning affirmation as Ron Burgundy. Be pompous, self-congratulatory, and treat today as though the world is lucky to have you in it. Make it feel like a genuine broadcast moment.";

export interface AnthropicClientLike {
  messages: {
    create(params: {
      model: string;
      system: string;
      messages: Array<{ role: 'user'; content: string }>;
      max_tokens: number;
      temperature: number;
    }): Promise<{ content: Array<{ type: string; text?: string }> }>;
  };
}

export interface RonClientOptions {
  model: string;
  maxOutputTokens: number;
  maxUserInputLength?: number;
}

export interface RonClient {
  ronRespond(userText: string, mem: WorkspaceMemory): Promise<string>;
  ronAffirmation(mem: WorkspaceMemory): Promise<string>;
}

export function buildMemoryBlock(mem: WorkspaceMemory): string {
  return [
    mem.summary ? `Workspace summary: ${mem.summary}` : "",
    mem.jokes.length ? `Inside jokes:\n${mem.jokes.map(j => `- ${j}`).join("\n")}` : ""
  ].filter(Boolean).join("\n\n");
}

function extractText(resp: { content: Array<{ type: string; text?: string }> }, fallback: string): string {
  const block = resp.content.find(b => b.type === 'text');
  return block && block.type === 'text' && block.text ? block.text : fallback;
}

export function createRonClient(anthropic: AnthropicClientLike, options: RonClientOptions): RonClient {
  const { model, maxOutputTokens, maxUserInputLength = 2000 } = options;

  async function ronRespond(userText: string, mem: WorkspaceMemory): Promise<string> {
    try {
      const sanitized = sanitizeInput(userText, maxUserInputLength);

      if (sanitized.length < userText.length) {
        log(LogLevel.WARN, 'User input truncated', {
          original: userText.length,
          truncated: sanitized.length
        });
      }

      const memoryBlock = buildMemoryBlock(mem);

      const resp = await anthropic.messages.create({
        model,
        system: [SYSTEM_PROMPT, memoryBlock].filter(Boolean).join("\n\n"),
        messages: [{ role: 'user', content: sanitized }],
        max_tokens: maxOutputTokens,
        temperature: 0.9
      });

      const reply = extractText(resp, "I have nothing witty to say. This is troubling.");
      log(LogLevel.INFO, 'Generated response', {
        userTextLength: sanitized.length,
        replyLength: reply.length,
        hasMemory: memoryBlock.length > 0
      });
      return reply;
    } catch (error) {
      log(LogLevel.ERROR, 'Error generating Ron response', { error: String(error) });
      return "My teleprompter appears to be malfunctioning. Please try again later.";
    }
  }

  async function ronAffirmation(mem: WorkspaceMemory): Promise<string> {
    try {
      const memoryBlock = buildMemoryBlock(mem);

      const resp = await anthropic.messages.create({
        model,
        system: [SYSTEM_PROMPT, memoryBlock].filter(Boolean).join("\n\n"),
        messages: [{ role: 'user', content: AFFIRMATION_PROMPT }],
        max_tokens: 200,
        temperature: 0.9
      });

      return extractText(resp, "Good morning. Ron Burgundy is here. That is all you need to know.");
    } catch (error) {
      log(LogLevel.ERROR, 'Error generating affirmation', { error: String(error) });
      return "Good morning. Ron Burgundy is here. That is all you need to know.";
    }
  }

  return { ronRespond, ronAffirmation };
}
