/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { createAnthropic, resolveModel, modelId } from '@/lib/llm';
import { supabaseAdmin } from '@/app/lib/supabase-server';

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
const promptWithStyle = `${prompt}\n\nSTYLE GUIDANCE:\n${styleBlock}`;    

const msg = await anthropic.messages.create({
  model: opts.model,
  max_tokens: maxTokens,
  temperature: styleTemp ?? 0.6,
  messages: [
    { role: 'user', content: promptWithStyle }
  ]
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
        { 
  role: 'user',
  content:
    `Your previous output failed JSON validation:\n${feedback}\n\n` +
    `Return ONLY valid JSON that matches the required schema.\n\n` +
    `STYLE GUIDANCE (unchanged):\n${styleBlock}`
}
      ];
    }
  }
  throw lastErr ?? new Error('Validation failed');
}

type StyleId = 'conversational' | 'humorous' | 'touching' | 'inspiring' | 'dramatic' | 'reflective';

function styleConfig(style: string): { block: string; temperature: number } {
  const s = (style as StyleId) ?? 'conversational';
  switch (s) {
    case 'humorous':
      return {
        temperature: 0.85,
        block: [
          'STYLE = HUMOROUS',
          '- Light, witty, clever one-liners (no meanness).',
          '- Use playful analogies and surprising twists.',
          '- Keep jokes crisp; land a clean tag line.',
          '- Avoid inside jokes or niche references.',
        ].join('\n')
      };
    case 'touching':
      return {
        temperature: 0.7,
        block: [
          'STYLE = TOUCHING',
          '- Warm, heartfelt, empathetic.',
          '- Gentle pacing; short, sincere sentences.',
          '- Focus on shared human moments and connection.',
          '- Avoid melodrama; be genuine.',
        ].join('\n')
      };
    case 'inspiring':
      return {
        temperature: 0.8,
        block: [
          'STYLE = INSPIRING',
          '- Upbeat, motivational, forward-looking.',
          '- Use active voice and momentum.',
          '- One memorable, quotable line.',
          '- Avoid cliches; keep it fresh.',
        ].join('\n')
      };
    case 'dramatic':
      return {
        temperature: 0.9,
        block: [
          'STYLE = DRAMATIC',
          '- Bold, cinematic phrasing; high contrast.',
          '- Build tension, then release into the song.',
          '- Use vivid verbs; avoid purple prose.',
          '- One strong image; no more than one.',
        ].join('\n')
      };
    case 'reflective':
      return {
        temperature: 0.65,
        block: [
          'STYLE = REFLECTIVE',
          '- Thoughtful, contemplative, slightly poetic.',
          '- Calm cadence; precise language.',
          '- Tie the story to a broader takeaway.',
          '- Avoid rambling; keep it grounded.',
        ].join('\n')
      };
    case 'conversational':
    default:
      return {
        temperature: 0.7,
        block: [
          'STYLE = CONVERSATIONAL',
          '- Natural, friendly, relatable; talk like a friend.',
          '- Clear transitions; no corporate tone.',
          '- One crisp hook; keep it human.',
          '- Avoid filler like “um/uh/kind of.”',
        ].join('\n')
      };
  }
}

async function fetchLatestPersonalStyle() {
  const { data, error } = await supabaseAdmin
    .from('styles')
    .select('analysis')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  // analysis is the JSON we stored: { styleProfile, keyCharacteristics[], samplePhrases[], instructions }
  return data.analysis as {
    styleProfile: string;
    keyCharacteristics: string[];
    samplePhrases: string[];
    instructions: string;
  };
}

export async function POST(req: NextRequest) {
  const rid = Math.random().toString(36).slice(2, 8);
  const t0 = Date.now();

  try {
    const body = await req.json();
    const mode = (body?.mode as string | undefined)?.trim();
    const prompt = (body?.prompt as string | undefined) ?? '';
const style = (body?.style as string | undefined) ?? 'conversational';
const { block: styleBlock, temperature: styleTemp } = styleConfig(style);


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
    console.log(`[complete-json:${rid}] start mode=${mode} style=${style} model=${selectedModel}`);

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

const combinedPrompt = [
  prompt.trim(),
  '',
  '---',
  'Apply the following style guidance when writing the scripts:',
  styleBlock,
  '',
  'Requirements:',
  '- Generate 3 scripts with the exact timing bands requested by the user prompt.',
  '- Make the emotional bridge between the story and the song feel natural and specific.',
  '- Avoid repeating the same hook across the three lengths.',
].join('\n');

const data = await completeStrictJSON({
  anthropic,
  userPrompt: combinedPrompt,
  schema: zScriptResponse,
  example,
  maxTokens: 1800,
  temperature: styleTemp, // <-- per-style temperature
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

