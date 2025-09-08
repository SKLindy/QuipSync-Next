/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { supabaseAdmin } from '@/app/lib/supabase-server';

const zBody = z.object({
  description: z.string().min(10).max(2000),
  samples: z.array(z.string().min(50)).min(1).max(5) // 1–5 text samples
});

const zStyleAnalysis = z.object({
  styleProfile: z.string().min(1),
  keyCharacteristics: z.array(z.string()).min(1),
  samplePhrases: z.array(z.string()).min(1),
  instructions: z.string().min(1)
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { description, samples } = zBody.parse(body);

    // Build analysis prompt for Claude
    const joined = samples.map((s, i) => `SAMPLE ${i + 1}:\n${s}`).join('\n\n---\n\n');
    const userPrompt = [
      `USER'S STYLE DESCRIPTION:\n"${description}"`,
      '',
      'SCRIPT SAMPLES:',
      joined,
      '',
      'TASK: Analyze this DJ’s writing voice. Return STRICT JSON with these fields:',
      `{
  "styleProfile": "detailed description of voice, tone, rhythm, POV",
  "keyCharacteristics": ["bullet list of concrete traits"],
  "samplePhrases": ["short phrases that sound like them"],
  "instructions": "clear guidance to replicate the style"
}`,
      '',
      'Rules:',
      '- Do NOT include code fences.',
      '- Do NOT add commentary — JSON only.',
      '- Be specific, concrete, non-generic.'
    ].join('\n');

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    const msg = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620',
      max_tokens: 1200,
      temperature: 0.6,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ]
    });

    const raw = (msg.content?.[0] as any)?.text ?? '';
    // Clean common formatting accidents
    const jsonText = raw.trim().replace(/^```json\s*/i, '').replace(/```$/i, '');
    const analysis = zStyleAnalysis.parse(JSON.parse(jsonText));

    // Save to Supabase (no auth yet; user_id null for MVP)
    const { data, error } = await supabaseAdmin
      .from('styles')
      .insert({
        user_id: null,
        description,
        analysis
      })
      .select()
      .single();

    if (error) {
      console.error('[style-create] supabase insert error:', error);
      return NextResponse.json({ error: 'DB insert failed' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, style: data });
  } catch (e: any) {
    console.error('[style-create] error:', e?.message || e);
    return NextResponse.json(
      { error: 'style-create failed', detail: e?.message ?? String(e) },
      { status: 400 }
    );
  }
}

