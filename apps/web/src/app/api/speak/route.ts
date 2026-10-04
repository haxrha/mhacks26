import { NextResponse } from "next/server";
import { guard, isSpeaker, voiceFor } from "@/server/voice";

export const runtime = "nodejs";

// One advisor line in one voice. Natural-sounding model; the client prefetches the next line to hide its ~2s latency.
const MAX_CHARS = 500;
const MODEL = process.env.ELEVENLABS_SPEAK_MODEL || "eleven_v4";

export async function POST(req: Request) {
  const blocked = guard(req, "speak", 40, 200);
  if (blocked) return blocked;
  let body: { text?: unknown; speaker?: unknown } | null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const speaker = body?.speaker;
  if (!text || text.length > MAX_CHARS || !isSpeaker(speaker))
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const call = (voice: string) =>
    fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY!,
        "content-type": "application/json",
      },
      body: JSON.stringify({ text, model_id: MODEL }),
      signal: AbortSignal.timeout(15_000),
    });
  try {
    let upstream = await call(voiceFor(speaker));
    let served: string = speaker;
    // A rejected voice id shouldn't silence the advisor: retry with the anchor voice.
    if (!upstream.ok && upstream.status < 500 && speaker !== "anchor") {
      console.error("ElevenLabs rejected voice", speaker, upstream.status);
      upstream = await call(voiceFor("anchor"));
      served = "anchor-fallback";
    }
    if (!upstream.ok || !upstream.body) {
      console.error("ElevenLabs speak failed", upstream.status);
      return NextResponse.json({ error: "Voice unavailable" }, { status: 502 });
    }
    return new Response(upstream.body, {
      headers: {
        "content-type": "audio/mpeg",
        "cache-control": "no-store",
        "x-voice": served,
      },
    });
  } catch (error) {
    console.error("ElevenLabs speak error", error);
    return NextResponse.json({ error: "Voice unavailable" }, { status: 502 });
  }
}
