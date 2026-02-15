import { NextRequest, NextResponse } from 'next/server';
import { getSheetData, SHEET_NAMES } from '@/lib/sheets';
import { parseTeams, parseConfig, getConfigValue } from '@/lib/data';
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

    // Get teams
    const teamsData = await getSheetData(SHEET_NAMES.TEAMS);
    const teams = parseTeams(teamsData);
    const team = teams.find(
      (t) => t.owner_email.toLowerCase() === normalizedEmail
    );

    if (!team) {
      return NextResponse.json<LoginResponse>(
        { success: false, error: 'Email not found. Contact your commissioner.' },
        { status: 404 }
      );
    }

    // Check if commissioner
    const configData = await getSheetData(SHEET_NAMES.CONFIG);
    const configs = parseConfig(configData);
    const commissionerEmails = getConfigValue(configs, 'commissioner_emails') || '';
    const isCommissioner = commissionerEmails
      .toLowerCase()
      .split(',')
      .map((e) => e.trim())
      .includes(normalizedEmail);

    return NextResponse.json<LoginResponse>({
      success: true,
      team,
      isCommissioner,
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json<LoginResponse>(
      { success: false, error: 'Server error' },
      { status: 500 }
    );
  }
}
