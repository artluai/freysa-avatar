CREATE TABLE IF NOT EXISTS voice_clients (
  client_hash TEXT NOT NULL,
  day TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  bonus_unlocked INTEGER NOT NULL DEFAULT 0 CHECK (bonus_unlocked IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (client_hash, day)
);

CREATE TABLE IF NOT EXISTS voice_ips (
  ip_hash TEXT NOT NULL,
  day TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ip_hash, day)
);

CREATE TABLE IF NOT EXISTS rate_limits (
  rate_key TEXT NOT NULL,
  window INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (rate_key, window)
);

CREATE INDEX IF NOT EXISTS idx_voice_clients_day ON voice_clients(day);
CREATE INDEX IF NOT EXISTS idx_voice_ips_day ON voice_ips(day);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window);
