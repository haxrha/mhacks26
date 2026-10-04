"use client";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { CIVS } from "@/game/content";
import { LEADERS, leaderArt } from "@/game/leaders";
import type { CivId } from "@/game/types";

const CHARS_PER_SECOND = 40;
const MOUTH_MS = 120;

/**
 * Stardew-style dialogue: your civilization's advisor speaks, typing each line out while their
 * portrait talks (mouth opens and closes, head bobs). Click, Enter or Space finishes the line,
 * then advances. After the last line the `actions` (if any) appear, otherwise "Got it" calls onDone.
 */
export default function Narrator({
  civ,
  eyebrow,
  lines,
  children,
  actions,
  skipAction,
  onDone,
  className = "",
}: {
  civ: CivId;
  eyebrow?: string;
  lines: string[];
  children?: ReactNode;
  actions?: ReactNode;
  skipAction?: ReactNode;
  onDone?: () => void;
  className?: string;
}) {
  const leader = LEADERS[civ];
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(0);
  const [mouth, setMouth] = useState(false);
  const still = useRef(false);
  const line = lines[Math.min(index, lines.length - 1)] ?? "";
  const typing = shown < line.length;
  const last = index >= lines.length - 1;

  useEffect(() => {
    still.current =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  }, []);
  // A new script (e.g. the next flow caption) starts from the top.
  const script = lines.join("\n");
  useEffect(() => {
    setIndex(0);
    setShown(0);
  }, [script]);
  useEffect(() => {
    setShown(still.current ? line.length : 0);
  }, [index, line]);
  useEffect(() => {
    if (!typing) {
      setMouth(false);
      return;
    }
    // Time-based, so a throttled background tab catches up instead of crawling.
    const start = performance.now() - (shown * 1000) / CHARS_PER_SECOND;
    const type = window.setInterval(
      () =>
        setShown(
          Math.min(
            line.length,
            Math.floor(((performance.now() - start) * CHARS_PER_SECOND) / 1000),
          ),
        ),
      1000 / CHARS_PER_SECOND,
    );
    const talk = window.setInterval(() => setMouth((m) => !m), MOUTH_MS);
    return () => {
      window.clearInterval(type);
      window.clearInterval(talk);
    };
  }, [typing, line]);

  const advance = () => {
    if (typing) setShown(line.length);
    else if (!last) setIndex((i) => i + 1);
    else if (!actions) onDone?.();
  };

  return (
    <section
      className={`narrator ${typing ? "is-talking" : ""} ${className}`}
      aria-label={`${leader.name} speaks`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, a")) return;
        advance();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          if ((e.target as HTMLElement).closest("button, a")) return;
          e.preventDefault();
          advance();
        }
      }}
      tabIndex={0}
    >
      <div className="narrator-text">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <p aria-hidden="true">
          {line.slice(0, shown)}
          {typing && <i className="narrator-caret">▌</i>}
        </p>
        <p className="sr-only" aria-live="polite">
          {line}
        </p>
        {!typing && last && children}
        <div className="narrator-actions">
          {skipAction}
          {typing ? (
            <span className="narrator-hint">Click to skip</span>
          ) : !last ? (
            <button className="narrator-next" onClick={advance}>
              ▶ Next{" "}
              <small>
                {index + 1}/{lines.length}
              </small>
            </button>
          ) : (
            (actions ??
            (onDone && (
              <button className="primary" onClick={onDone}>
                ▶ Got it
              </button>
            )))
          )}
        </div>
      </div>
      <figure className="narrator-portrait">
        <div className="narrator-face">
          <img src={leaderArt(civ)} alt="" draggable={false} />
          <img
            src={leaderArt(civ, true)}
            alt=""
            draggable={false}
            className={mouth ? "open" : ""}
          />
        </div>
        <figcaption style={{ borderColor: leader.color }}>
          <b>{leader.name}</b>
          <small style={{ color: leader.color }}>{CIVS[civ].name}</small>
        </figcaption>
      </figure>
    </section>
  );
}
