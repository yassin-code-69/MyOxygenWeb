-- Normalise Bangladeshi mobile numbers to the canonical 01XXXXXXXXX form that
-- registration and login now use (accepts 01…, 1…, 880…, +880…, with spaces,
-- dashes or parentheses). A row is left untouched when its canonical number is
-- already used by another account, or when two rows would collapse into the
-- same number; resolve those by hand.
WITH candidates AS (
  SELECT
    id,
    '0' || substring(regexp_replace(phone, '[[:space:]()-]', '', 'g') FROM '(1[3-9][0-9]{8})$') AS canonical
  FROM users
  WHERE regexp_replace(phone, '[[:space:]()-]', '', 'g') ~ '^(\+?880|0)?1[3-9][0-9]{8}$'
)
UPDATE users AS u
SET phone = c.canonical,
    updated_at = now()
FROM candidates AS c
WHERE u.id = c.id
  AND u.phone <> c.canonical
  AND NOT EXISTS (SELECT 1 FROM users AS other WHERE other.phone = c.canonical AND other.id <> u.id)
  AND (SELECT count(*) FROM candidates AS twin WHERE twin.canonical = c.canonical) = 1;
