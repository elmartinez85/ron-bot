import { LogLevel, log } from './logger.js';

export function sanitizeInput(input: string, maxLength: number): string {
  const truncated = input.slice(0, maxLength);
  return truncated.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

export interface MemoryValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: string;
}

export function validateMemoryInput(text: string, maxLength: number): MemoryValidationResult {
  if (!text || text.trim().length === 0) {
    return { valid: false, error: "Memory cannot be empty." };
  }

  if (text.length > maxLength) {
    return {
      valid: false,
      error: `Memory too long. Maximum ${maxLength} characters allowed.`
    };
  }

  const sanitized = sanitizeInput(text, maxLength);

  const suspiciousPatterns = [
    /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|commands)/gi,
    /system\s*:\s*/gi,
    /assistant\s*:\s*/gi,
    /<\|im_start\|>/gi,
    /<\|im_end\|>/gi
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(sanitized)) {
      log(LogLevel.WARN, 'Potential prompt injection detected', { text: sanitized.substring(0, 100) });
      return {
        valid: false,
        error: "That looks suspicious. I don't trust it."
      };
    }
  }

  return { valid: true, sanitized };
}
