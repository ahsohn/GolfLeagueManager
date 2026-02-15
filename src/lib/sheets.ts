import { google } from 'googleapis';

export const SHEET_NAMES = {
  TEAMS: 'Teams',
  GOLFERS: 'Golfers',
  ROSTERS: 'Rosters',
  TOURNAMENTS: 'Tournaments',
  LINEUPS: 'Lineups',
  STANDINGS: 'Standings',
  WAIVER_LOG: 'WaiverLog',
  SLOT_HISTORY: 'SlotHistory',
  CONFIG: 'Config',
} as const;

export async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  return sheets;
}

export function getSheetId() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) {
    throw new Error('GOOGLE_SHEET_ID environment variable not set');
  }
  return sheetId;
}

export async function getSheetData(sheetName: string): Promise<string[][]> {
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${sheetName}!A:Z`,
  });
  return response.data.values || [];
}

export async function appendSheetRow(sheetName: string, values: (string | number)[]): Promise<void> {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: getSheetId(),
    range: `${sheetName}!A:Z`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [values],
    },
  });
}

export async function updateSheetRow(
  sheetName: string,
  rowIndex: number,
  values: (string | number | null)[]
): Promise<void> {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${sheetName}!A${rowIndex}:Z${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [values],
    },
  });
}
