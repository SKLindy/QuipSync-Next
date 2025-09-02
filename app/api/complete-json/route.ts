import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

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
      model: 'claude-3-5-sonnet-latest',
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
  try {
    const body = await req.json().catch(() => ({}));
    const mode = (body?.mode ?? '').toString();
    const prompt = (body?.prompt ?? '').toString();

    if (!['script', 'style'].includes(mode)) {
      return NextResponse.json({ error: 'Invalid mode (use "script" or "style")' }, { status: 400 });
    }
    if (!prompt) {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Server missing ANTHROPIC_API_KEY' }, { status: 500 });
    }

    const anthropic = new Anthropic({ apiKey });

    if (mode === 'script') {
      const example = {
        storyDetails: "string",
        songAnalysis: "string",
        whyThisWorks: "string",
        scripts: [
          { script: "string", deliveryNotes: "string" },
          { script: "string", deliveryNotes: "string" },
          { script: "string", deliveryNotes: "string" }
        ]
      };

      const data = await completeStrictJSON({
        anthropic,
        userPrompt: prompt,
        schema: zScriptResponse,
        example,
        maxTokens: 1800,
        temperature: 0.7,
        retries: 2
      });

      return NextResponse.json({ ok: true, data });
    }

    if (mode === 'style') {
      const example = {
        styleProfile: "string",
        keyCharacteristics: ["string"],
        samplePhrases: ["string"],
        instructions: "string"
      };

      const data = await completeStrictJSON({
        anthropic,
        userPrompt: prompt,
        schema: zPersonalStyle,
        example,
        maxTokens: 1200,
        temperature: 0.5,
        retries: 2
      });

      return NextResponse.json({ ok: true, data });
    }

    return NextResponse.json({ error: 'Unhandled mode' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'LLM JSON endpoint failed', detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
