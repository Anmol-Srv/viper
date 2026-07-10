// Public — no session required (see middleware.ts). Used by the template's `npm run doctor`
// (SPEC §2.3) to check the portal is reachable.
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true });
}
