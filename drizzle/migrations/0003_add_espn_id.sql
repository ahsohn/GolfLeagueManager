-- Add espn_id column to golfers table for ESPN integration
ALTER TABLE golfers ADD COLUMN IF NOT EXISTS espn_id TEXT;
