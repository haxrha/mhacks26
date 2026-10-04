import { NextResponse } from "next/server";
import { guard, voiceFor } from "@/server/voice";
import {
  SPEAKERS,
  type Speaker,
  type ScriptLine,
  GROK_SYSTEM,
  cleanFacts,
  fallbackLines,
  grokPrompt,
  parseScript,
} from "@/game/radioScript";

export const runtime = "nodejs";

// Flow: browser sends game facts -> Grok writes the script -> ElevenLabs voices it, one voice per speaker.

// A non-reasoning model answers in ~1s; reasoning models (grok-4.7 etc.) take 5-10s for a 20-word blip.
const DEFAULT_GROK = "grok-4.20-0309-non-reasoning";

async function grokScript(prompt: string): Promise<ScriptLine[]> {
  const key = process.env.XAI_API_KEY;
  if (!key) return [];
  const model = process.env.XAI_MODEL || DEFAULT_GROK;
  try {
    const res = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: GROK_SYSTEM },
          { role: "user", content: prompt },
        ],
        temperature: 0.8,
        ...(model.includes("non-reasoning")
          ? {}
          : { reasoning: { effort: "low" } }),
        max_output_tokens: 600,
        store: false,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.error("Grok failed", res.status);
      return [];
    }
    const data = await res.json();
    const text: string =
      typeof data.output_text === "string"
        ? data.output_text
        : (data.output ?? [])
            .flatMap((o: { content?: { text?: string }[] }) => o.content ?? [])
            .map((c: { text?: string }) => c.text ?? "")
            .join("\n");
    return parseScript(text);
  } catch (error) {
    console.error("Grok error", error);
    return [];
  }
}

async function dialogue(lines: ScriptLine[], voice: (s: Speaker) => string) {
  return fetch("https://api.elevenlabs.io/v1/text-to-dialogue", {
    method: "POST",
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY!,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model_id: process.env.ELEVENLABS_MODEL || "eleven_v4",
      inputs: lines.map((l) => ({ text: l.text, voice_id: voice(l.speaker) })),
    }),
    signal: AbortSignal.timeout(40_000),
  });
}

export async function POST(req: Request) {
  const blocked = guard(req, "broadcast", 4, 30);
  if (blocked) return blocked;
  let facts;
  try {
    facts = cleanFacts((await req.json())?.facts);
  } catch {
    facts = null;
  }
  if (!facts)
    return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const written = await grokScript(grokPrompt(facts));
  const lines = written.length >= 1 ? written : fallbackLines(facts);
  const source = written.length >= 1 ? "grok" : "fallback";
  try {
    let upstream = await dialogue(lines, voiceFor);
    // A rejected voice id shouldn't silence the broadcast: retry with the anchor voice throughout.
    if (!upstream.ok && upstream.status < 500) {
      console.error("ElevenLabs rejected voices", upstream.status);
      upstream = await dialogue(lines, () => voiceFor("anchor"));
    }
    if (!upstream.ok || !upstream.body) {
      console.error("ElevenLabs dialogue failed", upstream.status);
      return NextResponse.json({ error: "Voice unavailable" }, { status: 502 });
    }
    return new Response(upstream.body, {
      headers: {
        "content-type": "audio/mpeg",
        "cache-control": "no-store",
        "x-script-source": source,
        "x-speakers": [...new Set(lines.map((l) => l.speaker))]
          .filter((s) => SPEAKERS.includes(s))
          .join(","),
      },
    });
  } catch (error) {
    console.error("ElevenLabs error", error);
    return NextResponse.json({ error: "Voice unavailable" }, { status: 502 });
  }
}
