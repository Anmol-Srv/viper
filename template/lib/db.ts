// ponytail: minimal REST wrapper around Insforge, untested against a live instance.
// Swap in the real Insforge SDK/query builder once the schema is known — the two
// functions below are the whole surface area, so callers won't need to change.

const BASE_URL = process.env.INSFORGE_URL;
const API_KEY = process.env.INSFORGE_API_KEY;

type Row = Record<string, unknown>;

/** Lists rows from `table`, optionally filtered by exact-match query params. */
export async function list(table: string, filter: Record<string, string> = {}): Promise<Row[]> {
  if (!BASE_URL || !API_KEY) return []; // dev fallback: no db configured yet

  const params = new URLSearchParams(filter);
  const res = await fetch(`${BASE_URL}/${table}?${params}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
    cache: 'no-store',
  });
  if (!res.ok) return [];
  return res.json();
}

/** Inserts a row into `table`. Returns the created row, or null if the db isn't configured. */
export async function insert(table: string, row: Row): Promise<Row | null> {
  if (!BASE_URL || !API_KEY) return null;

  const res = await fetch(`${BASE_URL}/${table}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) return null;
  return res.json();
}
