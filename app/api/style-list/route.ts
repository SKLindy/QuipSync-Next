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
  } catch (e: any) {
    console.error('[style-list] error:', e?.message || e);
    return NextResponse.json(
      { error: 'style-list failed', detail: e?.message ?? String(e) },
      { status: 400 }
    );
  }
}

