"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const KEY = "earthshare-radio";
export type RadioStatus = "idle" | "loading" | "playing" | "error";

/** Plays text through /api/tts. Opt-in: voice is off until the player turns the radio on. */
export function useBroadcast() {
  const [enabled, setEnabledState] = useState(false),
    [status, setStatus] = useState<RadioStatus>("idle");
  const audio = useRef<HTMLAudioElement | null>(null),
    abort = useRef<AbortController | null>(null);
  useEffect(() => {
    try {
      setEnabledState(localStorage.getItem(KEY) === "on");
    } catch {}
  }, []);
  const stop = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    audio.current?.pause();
    audio.current = null;
    setStatus("idle");
  }, []);
  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on);
    try {
      localStorage.setItem(KEY, on ? "on" : "off");
    } catch {}
  }, []);
  const speak = useCallback(
    async (text: string) => {
      stop();
      const ac = new AbortController();
      abort.current = ac;
      setStatus("loading");
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
          signal: ac.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const url = URL.createObjectURL(await res.blob());
        const a = new Audio(url);
        audio.current = a;
        const done = () => {
          URL.revokeObjectURL(url);
          if (audio.current === a) {
            audio.current = null;
            setStatus("idle");
          }
        };
        a.onended = done;
        a.onerror = () => {
          done();
          setStatus("error");
        };
        await a.play();
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
