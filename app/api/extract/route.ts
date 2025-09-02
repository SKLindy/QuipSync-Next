import { NextRequest, NextResponse } from 'next/server';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const url = (body?.url ?? '').toString();

    if (!/^https?:\/\/\S+$/i.test(url)) {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    // Use Node's global fetch; set a UA to avoid some paywalls/blocks
    const html = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; QuipSync Extractor/1.0)' }
    }).then(r => r.text());

    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    return NextResponse.json({ text: article?.textContent ?? '' });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'Extract failed', detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
