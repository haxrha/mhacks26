"use client";
import { useEffect, useRef } from "react";
import { Radio, Volume2, VolumeX } from "lucide-react";
import { LEADER, broadcastFacts } from "@/game/broadcast";
import type { CivId, GameState } from "@/game/types";
import { useBroadcast } from "@/game/useBroadcast";
import {
  fetchSpeech,
  playBlob,
  setLineHandler,
  stopAudio,
} from "@/game/voiceChannel";

/**
 * Voice switch for the sidebar. When on:
 *  - the advisor reads each line of dialogue aloud as it appears (via the Narrator's line bus), and
 *  - the decade debrief is voiced as a radio blip, fetched when the "what happened" report begins
 *    and played once the advisor finishes the report, so the two never overlap.
 * Renders plain buttons so it inherits the sidebar's button styling.
 */
export default function RadioControl({
  state,
  civ,
}: {
  state: GameState;
  civ: CivId;
}) {
  const { enabled, setEnabled, status, speak, stop } = useBroadcast();
  const key =
    state.phase === "build" ? `${state.seed}:${state.round}:${civ}` : "";
  const played = useRef(""),
    keyRef = useRef(key),
    announced = useRef(false),
    finishAdvisor = useRef<() => void>(() => {});
  keyRef.current = key;

  // Advisor: voice each line as it comes on screen.
  useEffect(() => {
    if (!enabled) return;
    let timer: number | undefined;
    let seq = 0;
    setLineHandler(({ civ: speakerCiv, lines, index, silent }) => {
      stopAudio();
      window.clearTimeout(timer);
      const mine = ++seq;
      const last = index >= lines.length - 1;
      if (keyRef.current) announced.current = true;
      const done = () => last && finishAdvisor.current();
      if (silent) {
        window.clearTimeout(timer);
        done();
        return;
      }
      // The Narrator re-announces while a new script resets, so wait a beat before spending a request.
      timer = window.setTimeout(async () => {
        try {
          const blob = await fetchSpeech(LEADER[speakerCiv], lines[index]);
          if (mine !== seq) return;
          // Warm the cache for the next line so it starts without a pause.
          const next = lines[index + 1];
          if (next) void fetchSpeech(LEADER[speakerCiv], next).catch(() => {});
          await playBlob(blob, done);
        } catch {
          if (mine === seq) done();
        }
      }, 150);
    });
    return () => {
      window.clearTimeout(timer);
      setLineHandler(null);
      stopAudio();
    };
  }, [enabled]);

  // Radio blip: fetch at the start of the report, play after the advisor's last line.
  useEffect(() => {
    if (!key || !enabled) {
      played.current = "";
      stop();
      return;
    }
    if (played.current === key) return;
    played.current = key;
    announced.current = false;
    const advisorDone = new Promise<void>((resolve) => {
      finishAdvisor.current = resolve;
    });
    // No advisor speaking (already heard, or nothing announced)? Don't wait forever.
    const fallback = window.setTimeout(() => {
      if (!announced.current) finishAdvisor.current();
    }, 3000);
    void speak(broadcastFacts(state, civ), advisorDone);
    return () => window.clearTimeout(fallback);
    // `state` changes constantly; re-broadcast only for a new decade or a voice toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);

  return (
    <>
      <button aria-pressed={enabled} onClick={() => setEnabled(!enabled)}>
        {enabled ? <Volume2 size={15} /> : <VolumeX size={15} />} Voice:{" "}
        {enabled ? "on" : "off"}
      </button>
      {enabled && key && (
        <button
          aria-live="polite"
          onClick={() =>
            status === "playing" || status === "loading"
              ? stop()
              : void speak(broadcastFacts(state, civ))
          }
        >
          <Radio size={15} />{" "}
          {status === "loading"
            ? "Radio queued (stop)"
            : status === "playing"
              ? "Stop broadcast"
              : status === "error"
                ? "Radio unavailable, retry"
                : "Replay broadcast"}
        </button>
      )}
    </>
  );
}
