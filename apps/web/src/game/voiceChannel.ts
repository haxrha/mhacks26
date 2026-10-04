import type { CivId } from "./types";

/**
 * One shared audio channel plus a line bus, so the advisor reading dialogue and the radio
 * broadcast never talk over each other. Client-only.
 */

export interface LinePayload {
  civ: CivId;
  lines: string[];
  /** Index of the line now on screen. */
  index: number;
  /** The player skipped ahead to this line: show it, but stay quiet. */
  silent?: boolean;
}
let handler: ((line: LinePayload) => void) | null = null;
/** The voice layer registers here; null switches it off. */
export const setLineHandler = (h: ((line: LinePayload) => void) | null) => {
  handler = h;
};
/** Called by the Narrator whenever a line comes on screen. A no-op unless voice is on. */
export const announceLine = (line: LinePayload) => handler?.(line);

let el: HTMLAudioElement | null = null;
let objectUrl = "";
const release = () => {
  if (el) {
    el.onended = el.onerror = null;
    el.pause();
  }
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  el = null;
  objectUrl = "";
};
export const stopAudio = () => release();
/**
 * Plays a blob, interrupting whatever is playing. `onEnd` runs when it finishes or fails,
 * but not when something else interrupts it. Rejects if the browser blocks playback.
 */
export async function playBlob(blob: Blob, onEnd?: () => void) {
  release();
  const url = URL.createObjectURL(blob);
  const a = new Audio(url);
  el = a;
  objectUrl = url;
  const finish = () => {
    if (el !== a) return;
    release();
    onEnd?.();
  };
  a.onended = finish;
  a.onerror = finish;
  try {
    await a.play();
  } catch (error) {
    finish();
    throw error;
  }
}

const cache = new Map<string, Blob>();
/** One line of dialogue in one speaker's voice, cached so replays are instant. */
export async function fetchSpeech(
  speaker: string,
  text: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const key = `${speaker}:${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const res = await fetch("/api/speak", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ speaker, text }),
    signal,
  });
  if (!res.ok) throw new Error(String(res.status));
  const blob = await res.blob();
  if (cache.size >= 60) cache.delete(cache.keys().next().value!);
  cache.set(key, blob);
  return blob;
}
