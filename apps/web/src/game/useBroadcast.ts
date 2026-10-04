"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BroadcastFacts } from "./radioScript";
import { playBlob, stopAudio } from "./voiceChannel";

const KEY = "earthshare-radio";
export type RadioStatus = "idle" | "loading" | "playing" | "error";

/** Opt-in voice setting plus the decade debrief as a voiced radio broadcast via /api/broadcast. */
export function useBroadcast() {
  const [enabled, setEnabledState] = useState(false),
    [status, setStatus] = useState<RadioStatus>("idle");
  const abort = useRef<AbortController | null>(null),
    playingOwn = useRef(false);
  useEffect(() => {
    try {
      setEnabledState(localStorage.getItem(KEY) === "on");
    } catch {}
  }, []);
  const stop = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    if (playingOwn.current) stopAudio();
    playingOwn.current = false;
    setStatus("idle");
  }, []);
  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on);
    try {
      localStorage.setItem(KEY, on ? "on" : "off");
    } catch {}
  }, []);
  /** Fetches the broadcast now; if `after` is given, waits for it before playing (e.g. until the advisor finishes). */
  const speak = useCallback(
    async (facts: BroadcastFacts, after?: Promise<void>) => {
      stop();
      const ac = new AbortController();
      abort.current = ac;
      setStatus("loading");
      try {
        const res = await fetch("/api/broadcast", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ facts }),
          signal: ac.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (after) await after;
        if (ac.signal.aborted) return;
        playingOwn.current = true;
        await playBlob(blob, () => {
          if (abort.current !== ac) return;
          abort.current = null;
          playingOwn.current = false;
          setStatus("idle");
        });
        if (!ac.signal.aborted) setStatus("playing");
      } catch {
        if (!ac.signal.aborted) setStatus("error");
      }
    },
    [stop],
  );
  useEffect(() => stop, [stop]);
  return { enabled, setEnabled, status, speak, stop };
}
