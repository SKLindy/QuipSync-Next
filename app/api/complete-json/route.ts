/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { createAnthropic, resolveModel, modelId } from '@/lib/llm';

const zScriptResponse = z.object({
  storyDetails: z.string().min(1),
  songAnalysis: z.string().min(1),
  whyThisWorks: z.string().min(1),
  scripts: z.array(z.object({
    script: z.string().min(1),
    deliveryNotes: z.string().min(1)
  })).length(3)
});

const zPersonalStyle = z.object({
  styleProfile: z.string().min(1),
  keyCharacteristics: z.array(z.string()).min(1),
  samplePhrases: z.array(z.string()).min(1),
  instructions: z.string().min(1)
});

function cleanToJson(raw: string) {
  const trimmed = raw.trim();
  const withoutFence = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  return withoutFence;
}

async function completeStrictJSON(opts: {
  anthropic: Anthropic,
  userPrompt: string,
  schema: z.ZodTypeAny,
  example: any,
  model: string,
  maxTokens?: number,
  temperature?: number,
  retries?: number
}) {

  const {
    anthropic,
    userPrompt,
    schema,
    example,
    maxTokens = 1600,
    temperature = 0.7,
    retries = 2
  } = opts;

  const system = `You MUST return ONLY valid JSON. No prose, no markdown fences.
Match this exact shape (keys and types). Do not add extra keys.

Example shape:
${JSON.stringify(example, null, 2)}`;

  let messages: Anthropic.Messages.MessageParam[] = [
    { role: 'user', content: `${system}\n\n${userPrompt}` }
  ];
  let lastErr: unknown = null;

  for (let i = 0; i <= retries; i++) {
    const msg = await anthropic.messages.create({
  model: opts.model,
  max_tokens: maxTokens,
  temperature,
  messages
});

    const text = (msg.content ?? [])
      .map((c: any) => c?.text || '')
      .join('');

    try {
      const parsed = JSON.parse(cleanToJson(text));
      const data = schema.parse(parsed);
      return data;
    } catch (err) {
      lastErr = err;
      const feedback = String((err as any)?.message ?? err).slice(0, 800);
      messages = [
        ...messages,
        { role: 'assistant', content: text },
        { role: 'user', content: `Your previous output failed JSON validation:\n${feedback}\n\nReturn ONLY valid JSON that matches the required shape.` }
      ];
    }
  }
  throw lastErr ?? new Error('Validation failed');
}

export async function POST(req: NextRequest) {
  const rid = Math.random().toString(36).slice(2, 8);
  const t0 = Date.now();

  try {
    const body = await req.json();
    const mode = (body?.mode as string | undefined)?.trim();
    const prompt = (body?.prompt as string | undefined) ?? '';

    if (!mode || !['script', 'style'].includes(mode)) {
      return NextResponse.json({ error: 'Invalid mode (use "script" or "style")' }, { status: 400 });
    }
    if (!prompt.trim()) {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Server missing ANTHROPIC_API_KEY' }, { status: 500 });
    }

    // Use our helper + model switch
    const anthropic = createAnthropic(apiKey);
    const selectedModel = resolveModel(process.env.CLAUDE_MODEL); // 'claude-3.5-sonnet' (default) or 'claude-3-opus'
    console.log(`[complete-json:${rid}] start mode=${mode} model=${selectedModel}`);

    if (mode === 'script') {
      const example = {
        storyDetails: 'Example summary',
        songAnalysis: 'Example analysis',
        whyThisWorks: 'Short rationale',
        scripts: [
          { script: 'Long script example', deliveryNotes: 'notes' },
          { script: 'Medium script example', deliveryNotes: 'notes' },
          { script: 'Short script example', deliveryNotes: 'notes' }
        ]
      };

      const data = await completeStrictJSON({
        anthropic,
        userPrompt: prompt,
        schema: zScriptResponse,
        example,
        maxTokens: 1800,
        temperature: 0.7,
        retries: 2,
        model: modelId(selectedModel)
      });

      console.log(`[complete-json:${rid}] done in ${Date.now() - t0}ms`);
      return NextResponse.json({ ok: true, data });
    }

    if (mode === 'style') {
      const example = {
        styleProfile: 'A cohesive description of the DJ persona',
        keyCharacteristics: ['witty', 'warm', 'punchy'],
        samplePhrases: ['let’s roll the windows down', 'right on cue'],
        instructions: 'Keep sentences tight, land a hook in first 3 lines.'
      };

      const data = await completeStrictJSON({
        anthropic,
        userPrompt: prompt,
        schema: zPersonalStyle,
        example,
        maxTokens: 1200,
        temperature: 0.5,
        retries: 2,
        model: modelId(selectedModel)
      });

      console.log(`[complete-json:${rid}] done in ${Date.now() - t0}ms`);
      return NextResponse.json({ ok: true, data });
    }

    // Fallback (shouldn’t hit because we validate `mode` above)
    return NextResponse.json({ error: 'Unhandled mode' }, { status: 400 });
  } catch (e: any) {
    console.error(`[complete-json:${rid}] error`, e);
    return NextResponse.json(
      { error: 'LLM JSON endpoint failed', detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}

