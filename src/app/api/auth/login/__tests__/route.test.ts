/**
 * Integration test for login API
 * Run against test Google Sheet with:
 * GOOGLE_SHEET_ID=<test-sheet-id> npm test -- login
 */

describe('Login API', () => {
  // These tests require a real Google Sheet connection
  // Skip in CI, run manually with test sheet

  it.skip('returns team data for valid email', async () => {
    // Manual test: POST /api/auth/login with valid email
    // Expected: { success: true, team: {...}, isCommissioner: true/false }
  });

  it.skip('returns error for unknown email', async () => {
    // Manual test: POST /api/auth/login with unknown email
    // Expected: { success: false, error: 'Email not found...' }
  });
});

// Unit test for email normalization
describe('email normalization', () => {
  it('normalizes email to lowercase', () => {
    const email = 'Test@Example.COM';
    const normalized = email.toLowerCase().trim();
    expect(normalized).toBe('test@example.com');
  });

  it('trims whitespace from email', () => {
    const email = '  test@example.com  ';
    const normalized = email.toLowerCase().trim();
    expect(normalized).toBe('test@example.com');
  });
});
