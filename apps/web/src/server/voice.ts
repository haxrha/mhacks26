import { NextResponse } from "next/server";
import { SPEAKERS, type Speaker } from "@/game/radioScript";

// Shared by the /api/broadcast and /api/speak routes. API keys stay on the server.
const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

/** Premade ElevenLabs voices (available to every account). Override any with ELEVENLABS_VOICE_<SPEAKER>, e.g. ELEVENLABS_VOICE_ANCHOR. */
const DEFAULT_VOICES: Record<Speaker, string> = {
  anchor: "onwK4e9ZLuTAKqWW03F9", // Daniel: steady broadcaster
  reporter: "TX3LPaxmHKxFdv7VOQHJ", // Liam: energetic
  ostra: "pqHfZKP75CvOlQylNhV4", // Bill: wise, mature, balanced
  moss: "pFZP5JQG7iQjIQuC4Bku", // Lily: velvety actress
  brask: "SOYHLrjzK2X1ezoPC6cr", // Harry: fierce, gruff
  pell: "CwhRBWXzGAHq8TQ4Fs17", // Roger: laid-back, resonant
};
const VOICE_ID = /^[A-Za-z0-9]{10,40}$/;

export const isSpeaker = (s: unknown): s is Speaker =>
  SPEAKERS.some((x) => x === s);

export function voiceFor(s: Speaker): string {
  const v = process.env[`ELEVENLABS_VOICE_${s.toUpperCase()}`];
  return v && VOICE_ID.test(v) ? v : DEFAULT_VOICES[s];
}

function limited(id: string, max: number) {
  const now = Date.now();
  const recent = (hits.get(id) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(id, recent);
  if (hits.size > 500)
    for (const [k, v] of hits)
      if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  return recent.length > max;
}

/** Common request checks. Returns an error response, or null if the request may proceed. */
export function guard(
  req: Request,
  bucket: string,
  perIp: number,
  global: number,
): NextResponse | null {
  if (!process.env.ELEVENLABS_API_KEY)
    return NextResponse.json(
      { error: "Voice is not configured" },
      { status: 503 },
    );
  // Only our own pages may spend the keys.
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (
    limited(`${bucket}:ip:${ip}`, perIp) ||
    limited(`${bucket}:global`, global)
  )
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  return null;
}
