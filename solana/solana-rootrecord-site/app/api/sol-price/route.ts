import { NextResponse } from 'next/server';

import { fetchJupiterSolUsd } from '@/lib/ecosystemJupUsd';

export async function GET() {
  try {
    const usd = await fetchJupiterSolUsd({ cache: 'no-store' });
    return NextResponse.json(
      { ok: true as const, usd },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
        },
      },
    );
  } catch {
    return NextResponse.json({ ok: false as const }, { status: 502 });
  }
}
