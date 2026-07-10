// ponytail: thin, provider-agnostic facade — every field the app touches for its database goes
// through list()/insert() below. The concrete client (Insforge REST, today) lives entirely in
// this one file, so swapping providers later is a single-file change; callers never change.

const BASE_URL = process.env.INSFORGE_URL;
const API_KEY = process.env.INSFORGE_API_KEY;

type Row = Record<string, unknown>;

function assertConfigured(): void {
  if (!BASE_URL || !API_KEY) {
    throw new Error(
      'Database not configured — open the Database tab on this project in Viper, then see docs/db.md.',
    );
  }
}

/** Lists rows from `table`, optionally filtered by exact-match query params. */
export async function list(table: string, filter: Record<string, string> = {}): Promise<Row[]> {
  assertConfigured();

  const params = new URLSearchParams(filter);
  const res = await fetch(`${BASE_URL}/${table}?${params}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
    cache: 'no-store',
  });
  if (res.status === 404) return []; // table doesn't exist yet — not an error, just empty
  if (!res.ok) throw new Error(`Database error (${res.status}) listing ${table}`);
  return res.json();
}

/** Inserts a row into `table`. Returns the created row. */
export async function insert(table: string, row: Row): Promise<Row> {
  assertConfigured();

  const res = await fetch(`${BASE_URL}/${table}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Database error (${res.status}) inserting into ${table}`);
  return res.json();
}
