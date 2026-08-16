import { describe, it, expect, vi } from 'vitest';
import { buildMemoryBlock, createRonClient } from './claude.js';
import type { WorkspaceMemory } from './memory.js';

describe('buildMemoryBlock', () => {
  it('returns empty string when there is no summary or jokes', () => {
    expect(buildMemoryBlock({ summary: '', jokes: [] })).toBe('');
  });

  it('includes the summary when present', () => {
    expect(buildMemoryBlock({ summary: 'a chill team', jokes: [] })).toBe('Workspace summary: a chill team');
  });

  it('includes jokes as a bulleted list', () => {
    const block = buildMemoryBlock({ summary: '', jokes: ['joke one', 'joke two'] });
    expect(block).toBe('Inside jokes:\n- joke one\n- joke two');
  });

  it('combines summary and jokes', () => {
    const block = buildMemoryBlock({ summary: 'a chill team', jokes: ['joke one'] });
    expect(block).toBe('Workspace summary: a chill team\n\nInside jokes:\n- joke one');
  });
});

function makeAnthropic(text: string) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text }] })
    }
  };
}

describe('createRonClient', () => {
  const emptyMem: WorkspaceMemory = { summary: '', jokes: [] };

  describe('ronRespond', () => {
    it('returns the text from the Anthropic response', async () => {
      const anthropic = makeAnthropic('Well that escalated quickly.');
      const ron = createRonClient(anthropic as any, { model: 'claude-haiku-4-5', maxOutputTokens: 160 });

      const reply = await ron.ronRespond('tell me a joke', emptyMem);

      expect(reply).toBe('Well that escalated quickly.');
    });

    it('passes model, max_tokens, and user message to the Anthropic client', async () => {
      const anthropic = makeAnthropic('reply');
      const ron = createRonClient(anthropic as any, { model: 'claude-haiku-4-5', maxOutputTokens: 160 });

      await ron.ronRespond('hello there', emptyMem);

      expect(anthropic.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-haiku-4-5',
          max_tokens: 160,
          messages: [{ role: 'user', content: 'hello there' }]
        })
      );
    });

    it('returns a fallback line when the Anthropic call throws', async () => {
      const anthropic = {
        messages: { create: vi.fn().mockRejectedValue(new Error('boom')) }
      };
      const ron = createRonClient(anthropic as any, { model: 'claude-haiku-4-5', maxOutputTokens: 160 });

      const reply = await ron.ronRespond('hello', emptyMem);

      expect(reply).toBe('My teleprompter appears to be malfunctioning. Please try again later.');
    });

    it('truncates user input beyond the max input length', async () => {
      const anthropic = makeAnthropic('reply');
      const ron = createRonClient(anthropic as any, { model: 'claude-haiku-4-5', maxOutputTokens: 160, maxUserInputLength: 5 });

      await ron.ronRespond('this is way too long', emptyMem);

      expect(anthropic.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: 'user', content: 'this ' }]
        })
      );
    });
  });

  describe('ronAffirmation', () => {
    it('returns the text from the Anthropic response', async () => {
      const anthropic = makeAnthropic('Today is going to be legendary.');
      const ron = createRonClient(anthropic as any, { model: 'claude-haiku-4-5', maxOutputTokens: 160 });

      const reply = await ron.ronAffirmation(emptyMem);

      expect(reply).toBe('Today is going to be legendary.');
    });

    it('returns a fallback line when the Anthropic call throws', async () => {
      const anthropic = {
        messages: { create: vi.fn().mockRejectedValue(new Error('boom')) }
      };
      const ron = createRonClient(anthropic as any, { model: 'claude-haiku-4-5', maxOutputTokens: 160 });

      const reply = await ron.ronAffirmation(emptyMem);

      expect(reply).toBe('Good morning. Ron Burgundy is here. That is all you need to know.');
    });
  });
});
