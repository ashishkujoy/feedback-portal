-- Baseline: extensions the schema relies on.
-- citext: case-insensitive text, used for users.email (unique regardless of case) from 3.1.
CREATE EXTENSION IF NOT EXISTS citext;
