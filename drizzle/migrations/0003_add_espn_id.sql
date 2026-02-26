-- Add ESPN athlete ID to golfers table
-- This enables matching golfers to ESPN data by ID instead of name

ALTER TABLE golfers ADD COLUMN espn_id TEXT;

-- Index for lookups by ESPN ID
CREATE INDEX idx_golfers_espn_id ON golfers(espn_id);
