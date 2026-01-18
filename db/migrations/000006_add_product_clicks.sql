-- Migration: Add product clicks tracking
-- Created: 2026-01-18

-- Create product_clicks table if it doesn't exist
CREATE TABLE IF NOT EXISTS product_clicks (
  product_id TEXT PRIMARY KEY,
  click_count BIGINT DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create function to atomically increment click count
CREATE OR REPLACE FUNCTION increment_gear_click(product_id_input TEXT)
RETURNS void AS $$
BEGIN
  INSERT INTO product_clicks (product_id, click_count, updated_at)
  VALUES (product_id_input, 1, NOW())
  ON CONFLICT (product_id)
  DO UPDATE SET
    click_count = product_clicks.click_count + 1,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Create index for faster sorting
CREATE INDEX IF NOT EXISTS idx_product_clicks_count ON product_clicks(click_count DESC);
