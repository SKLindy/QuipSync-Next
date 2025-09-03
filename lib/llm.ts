import Anthropic from '@anthropic-ai/sdk';

export type ClaudeModel = 'claude-3.5-sonnet' | 'claude-3-opus';

export function resolveModel(envValue?: string): ClaudeModel {
  const v = (envValue || '').toLowerCase().trim();
  if (v === 'opus' || v === 'claude-3-opus') return 'claude-3-opus';
  // default to Sonnet
  return 'claude-3.5-sonnet';
}

export function modelId(m: ClaudeModel): string {
  // Map friendly names to current API IDs
  switch (m) {
    case 'claude-3-opus':
      return 'claude-3-opus-latest';
    case 'claude-3.5-sonnet':
    default:
      return 'claude-3-5-sonnet-latest';
  }
}

export function createAnthropic(apiKey: string) {
  return new Anthropic({ apiKey });
}
