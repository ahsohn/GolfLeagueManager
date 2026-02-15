import { parseTeams, parseGolfers, parseRosters } from '../data';

describe('parseTeams', () => {
  it('parses team rows into Team objects', () => {
    const rows = [
      ['team_id', 'team_name', 'owner_email'], // header
      ['1', "Tiger's Army", 'john@example.com'],
      ['2', 'Eagle Eye', 'jane@example.com'],
    ];

    const teams = parseTeams(rows);

    expect(teams).toEqual([
      { team_id: 1, team_name: "Tiger's Army", owner_email: 'john@example.com' },
      { team_id: 2, team_name: 'Eagle Eye', owner_email: 'jane@example.com' },
    ]);
  });

  it('returns empty array for empty data', () => {
    expect(parseTeams([])).toEqual([]);
    expect(parseTeams([['team_id', 'team_name', 'owner_email']])).toEqual([]);
  });
});

describe('parseGolfers', () => {
  it('parses golfer rows into Golfer objects', () => {
    const rows = [
      ['golfer_id', 'name'],
      ['101', 'Scottie Scheffler'],
      ['102', 'Rory McIlroy'],
    ];

    const golfers = parseGolfers(rows);

    expect(golfers).toEqual([
      { golfer_id: 101, name: 'Scottie Scheffler' },
      { golfer_id: 102, name: 'Rory McIlroy' },
    ]);
  });
});

describe('parseRosters', () => {
  it('parses roster rows into RosterEntry objects', () => {
    const rows = [
      ['team_id', 'slot', 'golfer_id', 'times_used'],
      ['1', '1', '101', '3'],
      ['1', '2', '102', '0'],
    ];

    const rosters = parseRosters(rows);

    expect(rosters).toEqual([
      { team_id: 1, slot: 1, golfer_id: 101, times_used: 3 },
      { team_id: 1, slot: 2, golfer_id: 102, times_used: 0 },
    ]);
  });
});
