ALTER TABLE plot_private.plot_twitch_markets ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE plot_private.plot_twitch_markets ADD COLUMN IF NOT EXISTS outcome_labels jsonb;
