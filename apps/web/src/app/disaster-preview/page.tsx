"use client";

// TEMPORARY VISUAL TEST HARNESS. Delete this route when disaster review is done.
// Uses the real renderer with synthetic state, without storage or SpacetimeDB.
import { useEffect, useMemo, useState } from "react";
import WorldMap from "@/components/WorldMap";
import WorldStage from "@/components/WorldStage";
import { CIVS, EVENTS } from "@/game/content";
import { createGame } from "@/game/engine";
import { ensureHazard } from "@/game/disasters";
import { CIV_IDS, type CivId, type EventId } from "@/game/types";
import { OCEAN } from "@/game/worldRender";

const CASES: {
  event: EventId;
  civ: CivId;
  note: string;
  label?: string;
  also?: EventId[];
}[] = [
  {
    event: "tsunami",
    civ: "archipelago",
    note: "A local, angled wave washes inland across this region's coast.",
  },
  {
    event: "mega_tsunami",
    civ: "archipelago",
    note: "Catastrophic world-wide inundation: boats are swept away, structures collapse and forests are flattened. In the main game this kills all four civilizations and ends the world. Natural rolls require +2°C warming and a rare offshore-earthquake escalation; the visual preview bypasses those rules.",
  },
  {
    event: "earthquake",
    civ: "petrostate",
    note: "Connected fault cracks, rising dust and localized shaking.",
  },
  {
    event: "small_quake",
    civ: "heartland",
    note: "A smaller fault and weaker tremor localized to this region.",
  },
  {
    event: "hurricane",
    civ: "archipelago",
    note: "A travelling cyclone collects ships and roofs along its looping track, leaving flooded coasts and damage.",
  },
  {
    event: "tornado",
    civ: "petrostate",
    note: "A travelling funnel collects objects along a smooth looping track and leaves wreckage behind.",
  },
  {
    event: "wildfire",
    civ: "enclave",
    note: "Irregular tree groups ignite. About 30% of adjacent fuel can catch every five seconds. Pause the sequence to watch it spread.",
  },
  {
    event: "tornado",
    civ: "enclave",
    label: "Fire tornado",
    also: ["wildfire"],
    note: "The funnel turns fiery when a tornado overlaps an active wildfire; burning debris spreads across its path.",
  },
  {
    event: "hurricane",
    civ: "enclave",
    label: "Fire hurricane",
    also: ["wildfire"],
    note: "A stylized fire-storm combination: glowing spiral arms and burning debris. This is a game effect, not a normal weather category.",
  },
  {
    event: "spill",
    civ: "archipelago",
    note: "An oil slick pools around a leaking fuel barrel and drifts through connected water.",
  },
  {
    event: "volcano",
    civ: "heartland",
    note: "A volcanic cone erupts with branching lava, an ash plume and ejected embers. Damage persists across rounds.",
  },
  {
    event: "flood",
    civ: "enclave",
    note: "Muddy water spreads from connected river banks; forests and marsh slow the reach.",
  },
  {
    event: "dam_failure",
    civ: "heartland",
    note: "The dam breaks and a broad destructive pulse advances downstream.",
  },
  {
    event: "sea_rise",
    civ: "archipelago",
    note: "A strong coastal surge pushes water and foam farther inland.",
  },
  {
    event: "landslide",
    civ: "heartland",
    note: "A downhill fan of earth, moving boulders and debris replaces the old cracks.",
  },
  {
    event: "drought",
    civ: "petrostate",
    note: "Broad dry zones with intense cracked-soil patches and partly exposed channels.",
  },
];

export default function DisasterPreview() {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [restart, setRestart] = useState(0);
  const [scrub, setScrub] = useState<number | undefined>();
  const current = CASES[index];
  const step = (direction: number) => {
    setScrub(undefined);
    setIndex((n) => (n + direction + CASES.length) % CASES.length);
    setRestart((n) => n + 1);
  };
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(
      () => {
        setIndex((n) => (n + 1) % CASES.length);
        setRestart((n) => n + 1);
      },
      current.event === "tsunami" || current.event === "mega_tsunami"
        ? (((current.event === "tsunami"
            ? OCEAN.tsunami.frames
            : OCEAN.tsunami.largeFrames) +
            OCEAN.tsunami.restFrames) /
            OCEAN.timelineFps) *
            1000 +
            2000
        : 35_000,
    );
    return () => window.clearTimeout(timer);
  }, [index, restart, playing, current.event]);
  const state = useMemo(() => {
    const s = createGame(current.civ, "solo", 260926 + restart * 7919);
    s.phase = "build";
    s.climate = 0.4;
    s.news = [];
    s.minorEvents = {};
    s.scheduled = [];
    for (const civ of CIV_IDS) {
      s.events[civ] = { type: "heatwave", loss: {} };
      s.civs[civ].choice = 0; // Hides all other events in the real renderer.
      s.civs[civ].hazards = [];
    }
    s.events[current.civ] = { type: current.event, loss: {}, severity: 2 };
    s.civs[current.civ].choice = 2;
    ensureHazard(s, current.civ, s.events[current.civ]);
    for (const type of current.also ?? [])
      s.civs[current.civ].hazards!.push({
        type,
        severity: 2,
        remaining: 3,
        containment: 0,
        started: 1,
        origin: current.civ,
        destroyed: 0,
      });
    if (current.event === "dam_failure") {
      for (const civ of ["enclave", "petrostate", "archipelago"] as const) {
        s.events[civ] = { type: "flood", loss: {} };
        s.civs[civ].choice = 2;
      }
    }
    return s;
  }, [current, restart]);
  return (
    <div className="game-layout world-view disaster-preview">
      <aside className="sidebar">
        <a className="brand" href="/">
          rising waters.
        </a>
        <div className="sidebar-bottom">
          <a href="/">Return to game</a>
        </div>
      </aside>
      <div className="main-area">
        <WorldStage>
          <WorldMap
            key={`${index}:${restart}`}
            state={state}
            initialZoom={0.9}
            showEventMarkers={false}
            previewFrame={scrub}
            onSelect={() => {}}
          />
          <section
            className="narrator-docked"
            aria-label="Disaster preview controls"
            style={{
              position: "absolute",
              zIndex: 8,
              padding: 16,
              background: "#efe2bc",
              color: "#2a1a0e",
              border: "4px solid #8a5a32",
              boxShadow: "5px 5px #1a120a",
              width: "min(360px, calc(100% - 32px))",
            }}
          >
            <b>
              VISUAL TEST · {index + 1}/{CASES.length} ·{" "}
              {current.label ?? EVENTS[current.event].name}
            </b>
            <p style={{ margin: "8px 0", fontSize: 22 }} aria-live="polite">
              {CIVS[current.civ].name}: {current.note}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => step(-1)}>← Previous</button>
              <button onClick={() => step(1)}>Next →</button>
              <button
                aria-pressed={playing}
                onClick={() => setPlaying((p) => !p)}
              >
                {playing ? "Pause sequence" : "Auto-play"}
              </button>
              <button
                onClick={() => {
                  setScrub(undefined);
                  setRestart((n) => n + 1);
                }}
              >
                Replay effect
              </button>
              <select
                aria-label="Preview disaster"
                value={index}
                onChange={(e) => {
                  setIndex(Number(e.target.value));
                  setScrub(undefined);
                  setRestart((n) => n + 1);
                }}
                style={{
                  minHeight: 44,
                  fontSize: 20,
                  color: "#2a1a0e",
                  background: "#f7d9a0",
                }}
              >
                {CASES.map((c, n) => (
                  <option key={`${c.event}:${n}`} value={n}>
                    {c.label ?? EVENTS[c.event].name}
                  </option>
                ))}
              </select>
            </div>
            <label style={{ display: "block", marginTop: 12, fontSize: 20 }}>
              Inspect animation:{" "}
              {scrub === undefined
                ? "live"
                : `${(scrub / 6).toFixed(1)} seconds`}
              <input
                type="range"
                aria-label="Animation frame"
                min={0}
                max={300}
                value={scrub ?? 0}
                onChange={(e) => {
                  setPlaying(false);
                  setScrub(Number(e.target.value));
                }}
                style={{ display: "block", width: "100%", minHeight: 44 }}
              />
            </label>
            <p style={{ margin: "8px 0 0", fontSize: 20 }}>
              Automatic sequence waits for the tsunami aftermath; other
              disasters run for 35 seconds. Your saved game is untouched.
            </p>
          </section>
        </WorldStage>
      </div>
    </div>
  );
}
