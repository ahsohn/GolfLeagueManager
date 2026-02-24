import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const dbUrl = process.env.DATABASE_URL || 'NOT SET';
  // Only show the host part for security
  const match = dbUrl.match(/@([^/]+)/);
  const host = match ? match[1] : 'unknown';

  return NextResponse.json({
    db_host: host,
    has_url: !!process.env.DATABASE_URL
  });
}
