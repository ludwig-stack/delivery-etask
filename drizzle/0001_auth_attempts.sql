CREATE TABLE IF NOT EXISTS auth_attempts (identifier TEXT NOT NULL, at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS auth_attempts_identifier_at ON auth_attempts(identifier, at);
