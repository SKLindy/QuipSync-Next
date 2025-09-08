import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

export async function GET() {
  try {
    // MVP: no auth — just return the latest created style if any
    const { data, error } = await supabaseAdmin
      .from('styles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('[style-list] supabase error:', error);
      return NextResponse.json({ error: 'DB read failed' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      personal: data && data.length ? [data[0]] : []
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[style-list] error:', message);
    return NextResponse.json(
      { error: 'style-list failed', detail: message },
      { status: 400 }
    );
  }
}

