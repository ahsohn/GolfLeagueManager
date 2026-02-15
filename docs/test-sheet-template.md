# Test Google Sheet Template

Create a Google Sheet with the following tabs. Share it with your service account email.

## Tab 1: Teams
| team_id | team_name | owner_email |
|---------|-----------|-------------|
| 1 | Test Team 1 | test1@example.com |
| 2 | Test Team 2 | test2@example.com |

## Tab 2: Golfers
| golfer_id | name |
|-----------|------|
| 101 | Scottie Scheffler |
| 102 | Rory McIlroy |
| 103 | Jon Rahm |
| 104 | Viktor Hovland |
| 105 | Xander Schauffele |
| 106 | Patrick Cantlay |
| 107 | Max Homa |
| 108 | Collin Morikawa |
| 109 | Jordan Spieth |
| 110 | Justin Thomas |
| 111 | Wyndham Clark |
| 112 | Ludvig Aberg |

## Tab 3: Rosters
| team_id | slot | golfer_id | times_used |
|---------|------|-----------|------------|
| 1 | 1 | 101 | 0 |
| 1 | 2 | 102 | 0 |
| 1 | 3 | 103 | 0 |
| 1 | 4 | 104 | 0 |
| 1 | 5 | 105 | 0 |
| 1 | 6 | 106 | 0 |
| 1 | 7 | 107 | 0 |
| 1 | 8 | 108 | 0 |
| 1 | 9 | 109 | 0 |
| 1 | 10 | 110 | 0 |
| 2 | 1 | 111 | 0 |
| 2 | 2 | 112 | 0 |

## Tab 4: Tournaments
| tournament_id | name | deadline | status |
|---------------|------|----------|--------|
| T001 | Test Tournament | 2026-03-01T23:59:00 | open |

## Tab 5: Lineups
| tournament_id | team_id | slot | fedex_points |
|---------------|---------|------|--------------|
(empty initially)

## Tab 6: Standings
| team_id | total_points |
|---------|--------------|
| 1 | 0 |
| 2 | 0 |

## Tab 7: WaiverLog
| timestamp | team_id | dropped_golfer | added_golfer | slot |
|-----------|---------|----------------|--------------|------|
(empty initially)

## Tab 8: SlotHistory
| team_id | golfer_id | original_slot |
|---------|-----------|---------------|
(empty initially - tracks original draft assignments)

## Tab 9: Config
| key | value |
|-----|-------|
| commissioner_emails | test1@example.com |
