import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { LoginResponse } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json<LoginResponse>(
        { success: false, error: 'Email is required' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    const [teamRows, configRows] = await Promise.all([
      sql`SELECT team_id, team_name, owner_email FROM teams WHERE LOWER(owner_email) = ${normalizedEmail}`,
      sql`SELECT value FROM config WHERE key = 'commissioner_emails'`,
    ]);

    if (teamRows.length === 0) {
      return NextResponse.json<LoginResponse>(
        { success: false, error: 'Email not found. Contact your commissioner.' },
        { status: 404 }
      );
    }

    const team = teamRows[0] as { team_id: number; team_name: string; owner_email: string };
    const commissionerEmails = (configRows[0]?.value as string) ?? '';
    const isCommissioner = commissionerEmails
      .toLowerCase()
      .split(',')
      .map((e) => e.trim())
      .includes(normalizedEmail);

    return NextResponse.json<LoginResponse>({ success: true, team, isCommissioner });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json<LoginResponse>(
      { success: false, error: 'Server error' },
      { status: 500 }
    );
  }
}
