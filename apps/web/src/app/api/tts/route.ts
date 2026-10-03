import { NextResponse } from "next/server";

export const runtime = "nodejs";

// ELEVENLABS_API_KEY stays on the server: never prefix it with NEXT_PUBLIC_.
const MAX_CHARS = 1200;
const DEFAULT_VOICE = "JBFqnCBsd6RMkjVDRZzb";
const MODEL = "eleven_flash_v2_5";
const WINDOW_MS = 60_000;
const PER_IP = 6;
const GLOBAL = 40;
const hits = new Map<string, number[]>();

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

export async function POST(req: Request) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key)
    return NextResponse.json(
      { error: "Voice is not configured" },
      { status: 503 },
    );
  // Only our own pages may spend the key.
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (limited(`ip:${ip}`, PER_IP) || limited("global", GLOBAL))
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  let text: unknown;
  try {
    text = (await req.json())?.text;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (typeof text !== "string" || !text.trim() || text.length > MAX_CHARS)
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const configured = process.env.ELEVENLABS_VOICE_ID;
  const voice =
    configured && /^[A-Za-z0-9]{10,40}$/.test(configured)
      ? configured
      : DEFAULT_VOICE;
  try {
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({ text, model_id: MODEL }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!upstream.ok || !upstream.body) {
      console.error("ElevenLabs TTS failed", upstream.status);
      return NextResponse.json({ error: "Voice unavailable" }, { status: 502 });
    }
    return new Response(upstream.body, {
      headers: { "content-type": "audio/mpeg", "cache-control": "no-store" },
    });
  } catch (error) {
    console.error("ElevenLabs TTS error", error);
    return NextResponse.json({ error: "Voice unavailable" }, { status: 502 });
  }
}
