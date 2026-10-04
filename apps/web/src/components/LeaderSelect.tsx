"use client";
import { useEffect, useState, type ReactNode } from "react";
import { CIVS } from "@/game/content";
import type { CivId } from "@/game/types";

/** Arcade "player select" screen from the Civilizations artboard (assets/reference/civilizations.png). */
interface Leader {
  civ: CivId;
  sprite: string;
  size: [number, number];
  role: string;
  name: string;
  title: string;
  color: string;
  ability: [string, string];
  exposure: string;
  pollution: number;
  resilience: number;
}
export const LEADERS: Leader[] = [
  {
    civ: "heartland",
    sprite: "ostra",
    size: [29, 46],
    role: "DAM KEEPER",
    name: "LORAX",
    title: "THE LORAX",
    color: "#a07ad6",
    ability: [
      "Headwaters",
      "ore and sheep from the high pastures, and the river starts here.",
    ],
    exposure:
      "smog drifts in, and the dam sits on the fault. If he lets the water go, everyone downstream feels it.",
    pollution: 2,
    resilience: 3,
  },
  {
    civ: "enclave",
    sprite: "moss",
    size: [28, 46],
    role: "GROVE ELDER",
    name: "MOSS",
    title: "ELDER MOSS",
    color: "#7fd65a",
    ability: ["Old growth", "wood and wheat from the forests and fields."],
    exposure: "floods from upstream, wildfires, and no ore of her own.",
    pollution: 1,
    resilience: 4,
  },
  {
    civ: "petrostate",
    sprite: "brask",
    size: [26, 44],
    role: "FOREMAN",
    name: "BRASK",
    title: "FOREMAN BRASK",
    color: "#f08a3c",
    ability: ["Industry", "brick and ore, and a kiln already burning."],
    exposure: "droughts and smog. His smoke lands on his neighbors.",
    pollution: 5,
    resilience: 2,
  },
  {
    civ: "archipelago",
    sprite: "pell",
    size: [29, 46],
    role: "HARBORMASTER",
    name: "TUNG TUNG TUNG SAHUR",
    title: "TUNG TUNG TUNG SAHUR",
    color: "#46d6d0",
    ability: ["Harbor", "wheat and sheep from the rich delta."],
    exposure:
      "quakes, storms and every spill that rides the current to his shore.",
    pollution: 2,
    resilience: 2,
  },
];

/** Home yield per cycle (0–2) shown as 1–5 bars. */
const bars = (perCycle: number) => Math.min(5, 1 + perCycle * 2);

function Bar({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="ls-stat" aria-label={`${label} ${value} of 5`}>
      <span>{label}</span>
      <i>
        {[0, 1, 2, 3, 4].map((n) => (
          <b
            key={n}
            className={n < value ? "on" : ""}
            style={n < value && tone ? { background: tone } : undefined}
          />
        ))}
      </i>
    </div>
  );
}

export default function LeaderSelect({
  choice,
  setChoice,
  mode,
  onConfirm,
  children,
}: {
  choice: CivId;
  setChoice: (civ: CivId) => void;
  mode: "solo" | "hotseat";
  onConfirm: (civ: CivId) => void;
  children?: ReactNode;
}) {
  const [cursor, setCursor] = useState(
    Math.max(
      0,
      LEADERS.findIndex((l) => l.civ === choice),
    ),
  );
  const [picks, setPicks] = useState<CivId[]>([]);
  const [more, setMore] = useState(false);
  const seats = mode === "hotseat" ? 4 : 1;
  const chooser = Math.min(picks.length + 1, seats);
  const leader = LEADERS[cursor];
  const civ = CIVS[leader.civ];

  useEffect(() => setPicks((p) => p.slice(0, seats)), [seats]);
  useEffect(() => {
    if (picks[0]) setChoice(picks[0]);
  }, [picks]);

  function pick(i: number) {
    const id = LEADERS[i].civ;
    setCursor(i);
    if (mode === "solo") {
      setPicks([id]);
      setChoice(id);
      return;
    }
    if (picks.includes(id) || picks.length >= seats) return;
    setPicks([...picks, id]);
  }
  function confirm() {
    const civ = picks[0] ?? leader.civ;
    setChoice(civ);
    onConfirm(civ);
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "Escape" && more) {
        setMore(false);
        return;
      }
      if (el.closest("input, textarea, select, .ls-options")) return;
      if (e.key === "ArrowRight") setCursor((c) => (c + 1) % 4);
      else if (e.key === "ArrowLeft") setCursor((c) => (c + 3) % 4);
      else if (e.key === "Enter" && !el.closest("button")) pick(cursor);
      else if (e.key === "Backspace") setPicks((p) => p.slice(0, -1));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const badge = (id: CivId) => {
    const seat = picks.indexOf(id);
    if (seat >= 0) return `${seat + 1}P`;
    return mode === "solo" && picks.length ? "AI" : "OPEN";
  };

  return (
    <main className="leader-select">
      <header className="ls-header">
        <div className="ls-closeup" aria-hidden="true">
          <img src={`/assets/leaders/${leader.sprite}-portrait.png`} alt="" />
        </div>
        <div className="ls-title">
          <h1>CHOOSE YOUR LEADER</h1>
          <span className="ls-chooser" style={{ background: leader.color }}>
            {picks.length >= seats ? "READY" : `PLAYER ${chooser} CHOOSING`}
          </span>
          <p className="ls-narration">
            Snow melts. The river rises. Four peoples share one valley, and
            every choice flows downstream. Who will you lead?
          </p>
        </div>
      </header>

      <section className="ls-stage" aria-label="Leaders">
        {LEADERS.map((l, i) => {
          const b = badge(l.civ);
          const taken = b.endsWith("P");
          return (
            <button
              key={l.civ}
              className={`ls-column ${i === cursor ? "highlight" : ""}`}
              style={{ "--civ": l.color } as React.CSSProperties}
              aria-pressed={taken}
              aria-label={`${l.title}, ${CIVS[l.civ].name}. ${taken ? `Picked by player ${b}` : "Open"}`}
              onMouseEnter={() => setCursor(i)}
              onFocus={() => setCursor(i)}
              onClick={() => pick(i)}
            >
              <i className="ls-diamond" />
              <small>{l.role}</small>
              <strong className={l.name.length > 10 ? "ls-long" : ""}>
                {l.name}
              </strong>
              <em>{CIVS[l.civ].name}</em>
              <span className="ls-figure">
                {i === cursor && (
                  <svg
                    className="ls-brackets"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <path d="M0 14V0H14M86 0H100V14M100 86V100H86M14 100H0V86" />
                  </svg>
                )}
                <span className="ls-sprite">
                  {i === cursor && picks.length < seats && (
                    <span className="ls-cursor">{chooser}P</span>
                  )}
                  <img
                    src={`/assets/leaders/${l.sprite}.png`}
                    width={l.size[0] * 5}
                    height={l.size[1] * 5}
                    style={{ "--rows": l.size[1] } as React.CSSProperties}
                    alt=""
                  />
                </span>
              </span>
              <span className="ls-zig" aria-hidden="true" />
              <span className={`ls-badge ${taken ? "taken" : ""}`}>
                <span>{b}</span>
              </span>
            </button>
          );
        })}
      </section>

      <section
        className="ls-info"
        style={{ "--civ": leader.color } as React.CSSProperties}
      >
        <img
          className="ls-portrait"
          src={`/assets/leaders/${leader.sprite}-portrait.png`}
          alt={leader.title}
        />
        <div className="ls-copy">
          <h2>
            {leader.title} - <span>{civ.name.toUpperCase()}</span>
          </h2>
          <p>
            <b>{leader.ability[0]}:</b> {leader.ability[1]}
          </p>
          <p>
            <b className="exposed">Exposed:</b> {leader.exposure}
          </p>
        </div>
        <div className="ls-stats">
          <Bar label="SHEEP" value={bars(civ.base.sheep)} />
          <Bar label="WHEAT" value={bars(civ.base.wheat)} />
          <Bar label="WOOD" value={bars(civ.base.wood)} />
          <Bar label="BRICK" value={bars(civ.base.brick)} />
          <Bar label="ORE" value={bars(civ.base.ore)} />
          <Bar label="POLLUTION" value={leader.pollution} tone="#b8a43e" />
        </div>
        <div className="ls-confirm">
          <button className="primary" onClick={confirm}>
            CONFIRM
          </button>
          <small>◀ ▶ BROWSE · ENTER PICK</small>
          {children && (
            <button
              className="ls-more-toggle"
              aria-expanded={more}
              aria-controls="ls-options"
              onClick={() => setMore(!more)}
            >
              {more ? "CLOSE OPTIONS" : "OPTIONS"} ·{" "}
              {mode === "solo" ? "SOLO" : "HOT-SEAT"}
            </button>
          )}
        </div>
      </section>

      {children && more && (
        <section
          id="ls-options"
          className="ls-options"
          role="dialog"
          aria-label="Game options"
        >
          {children}
        </section>
      )}
    </main>
  );
}
