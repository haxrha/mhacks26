"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  Compass,
  Download,
  Globe2,
  Handshake,
  History,
  Leaf,
  Play,
  Radio,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import {
  BUILDINGS,
  CIVS,
  DISASTERS,
  RESOURCE_META,
  TECHS,
  TERRAIN,
} from "@/game/content";
import {
  actionError,
  advanceFlows,
  answerQuiz,
  applyAction,
  createGame,
  demoGame,
  hazardProbability,
  marketQuote,
  nextRound,
  projectedIncome,
  resolveRound,
  score,
  techCost,
  yields,
} from "@/game/engine";
import { QUESTIONS } from "@/game/questions";
import {
  Action,
  CIV_IDS,
  CivId,
  DisasterId,
  GameState,
  RESOURCES,
  Resource,
  Tile,
} from "@/game/types";
import LeaderSelect from "./LeaderSelect";
import WorldMap from "./WorldMap";
import Narrator from "./Narrator";
import { decadeLine, introLines } from "@/game/leaders";
import { useWorld } from "@/game/useWorld";

type Tab =
  "world" | "market" | "technology" | "diplomacy" | "almanac" | "timeline";
const SAVE_KEY = "earthshare-v1";
const fmt = (n: number) => (Number.isInteger(n) ? n.toString() : n.toFixed(1));
function Costs({ cost }: { cost: Partial<Record<Resource, number>> }) {
  return (
    <span className="costs">
      {Object.entries(cost).map(([r, n]) => (
        <span key={r} style={{ color: RESOURCE_META[r as Resource].color }}>
          {RESOURCE_META[r as Resource].icon} {fmt(n!)}
        </span>
      ))}
    </span>
  );
}
function Meter({
  label,
  value,
  max = 100,
  color,
  detail,
}: {
  label: string;
  value: number;
  max?: number;
  color: string;
  detail: string;
}) {
  return (
    <div className="global-meter">
      <div>
        <span>{label}</span>
        <b style={{ color }}>
          {max === 3 ? `+${value.toFixed(2)}°C` : `${Math.round(value)}%`}
        </b>
      </div>
      <div className="meter-track">
        <i
          style={{
            width: `${Math.min(100, (value / max) * 100)}%`,
            background: color,
          }}
        />
      </div>
      <small>{detail}</small>
    </div>
  );
}
function Trend({
  values,
  color = "#a6c486",
}: {
  values: number[];
  color?: string;
}) {
  const max = Math.max(...values, 1),
    min = Math.min(...values, 0);
  return (
    <svg
      viewBox="0 0 150 36"
      className="sparkline"
      aria-label="Historical trend"
    >
      <polyline
        points={values
          .map(
            (v, i) =>
              `${(i * 150) / Math.max(1, values.length - 1)},${32 - ((v - min) / (max - min || 1)) * 28}`,
          )
          .join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="2"
      />
    </svg>
  );
}

export default function Game() {
  const [state, setState] = useState<GameState | null>(null),
    [loaded, setLoaded] = useState(false),
    [resume, setResume] = useState<GameState | null>(null),
    [choice, setChoice] = useState<CivId>("heartland"),
    [mode, setMode] = useState<"solo" | "hotseat">("solo"),
    [seed, setSeed] = useState("260926");
  const [tab, setTab] = useState<Tab>("world"),
    [selected, setSelected] = useState<string>(),
    [active, setActive] = useState<CivId>("heartland"),
    [toast, setToast] = useState(""),
    [help, setHelp] = useState(false),
    [flowIndex, setFlowIndex] = useState(0),
    [briefed, setBriefed] = useState<string>(),
    [importError, setImportError] = useState("");
  const world = useWorld(setState);
  const [roomCode, setRoomCode] = useState("");
  const online = !!world.roomId;
  const onlineQuiz = state?.quizzes.find(
    (q) => q.civ === world.civilization && !q.tier,
  );
  const onlineQuestion = onlineQuiz?.questions[onlineQuiz.answers.length];
  useEffect(() => {
    if (onlineQuestion) void world.begin(onlineQuestion);
  }, [onlineQuestion, world.roomId]);
  useEffect(() => {
    if (world.error) setToast(world.error);
  }, [world.error]);
  const inGame = state !== null;
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [tab, inGame]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (validSave(s)) setResume(s);
      }
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (state)
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      } catch {
        setToast(
          "Browser storage is unavailable. Export a save to keep your progress.",
        );
      }
  }, [state]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    setFlowIndex(0);
  }, [state?.round, state?.phase]);
  useEffect(() => {
    if (state?.phase !== "flows" || !state.flows.length) return;
    const timer = setInterval(
      () => setFlowIndex((i) => Math.min(i + 1, state.flows.length - 1)),
      2800,
    );
    return () => clearInterval(timer);
  }, [state?.phase, state?.flows.length]);
  const act = useCallback(
    (a: Action) => {
      if (online) {
        void world.act(a);
        return;
      }
      setState((s) => {
        if (!s) return s;
        const result = applyAction(s, a);
        setToast(result.error ?? "Action committed. Your world is changing.");
        return result.state;
      });
    },
    [online, world.revision, world.roomId],
  );
  function start(demo = false, civ: CivId = choice) {
    world.disconnect();
    const s = demo ? demoGame() : createGame(civ, mode, Number(seed) || 260926);
    setState(s);
    setActive(s.player);
    setSelected(undefined);
    setTab("world");
  }
  function exportSave() {
    if (!state) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `earthshare-decade-${state.round}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  async function importSave(file?: File) {
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw Error("Save is too large.");
      const data = JSON.parse(await file.text());
      if (!validSave(data))
        throw Error("This is not a valid Earthshare v1 save.");
      setState(data);
      setActive(data.player);
      setImportError("");
    } catch (e) {
      setImportError((e as Error).message);
    }
  }
  if (!state)
    return (
      <>
        <LeaderSelect
          choice={choice}
          setChoice={setChoice}
          mode={mode}
          onConfirm={(civ) => start(false, civ)}
        >
          <div className="ls-option-group">
            <b>GAME</b>
            <div className="segmented">
              <button
                className={mode === "solo" ? "active" : ""}
                onClick={() => setMode("solo")}
              >
                Solo + 3 AI neighbors
              </button>
              <button
                className={mode === "hotseat" ? "active" : ""}
                onClick={() => setMode("hotseat")}
              >
                4-player hot-seat
              </button>
            </div>
            <label className="seed-label">
              World seed{" "}
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
              />
            </label>
            <div className="setup-footer">
              <button onClick={() => start(true)}>
                <Play size={14} /> Disaster-chain demo
              </button>
              {loaded && resume && (
                <button
                  onClick={() => {
                    setState(resume);
                    setActive(resume.player);
                  }}
                >
                  Resume decade {resume.round} <ChevronRight size={14} />
                </button>
              )}
              <button onClick={() => setHelp(true)}>
                How to play <ArrowUpRight size={14} />
              </button>
            </div>
            <label className="import-label">
              Import a saved world{" "}
              <input
                type="file"
                accept=".json"
                onChange={(e) => importSave(e.target.files?.[0])}
              />
            </label>
            {importError && (
              <p role="alert" className="error">
                {importError}
              </p>
            )}
          </div>
          <div className="ls-option-group online-setup">
            <b>PLAY A SHARED WORLD</b>
            <p>
              Live rooms use SpacetimeDB. You claim the leader you picked;
              unclaimed civilizations become AI neighbors.
            </p>
            <label>
              Room code{" "}
              <input
                aria-label="Room code"
                maxLength={6}
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
              />
            </label>
            <div className="setup-footer">
              <button
                onClick={() => {
                  const id = Array.from(
                    crypto.getRandomValues(new Uint8Array(6)),
                    (n) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[n % 32],
                  ).join("");
                  setRoomCode(id);
                  void world.connect(
                    id,
                    choice,
                    Number(seed) || 260926,
                    mode === "solo",
                  );
                }}
              >
                Create {mode === "solo" ? "saved solo" : "multiplayer"} world
              </button>
              <button onClick={() => void world.connect(roomCode, choice)}>
                Join / reconnect
              </button>
            </div>
            <span role="status">{world.status}</span>
            {world.error && (
              <p role="alert" className="error">
                {world.error}
              </p>
            )}
          </div>
        </LeaderSelect>
        {help && <Help onClose={() => setHelp(false)} />}
      </>
    );
  const civId = online
      ? world.civilization!
      : state.mode === "solo"
        ? state.player
        : active,
    civ = state.civs[civId],
    meta = CIVS[civId],
    tile = state.tiles.find((t) => t.id === selected),
    income = projectedIncome(state, civId);
  const roundNews = state.news
    .filter((n) => n.round === state.round)
    .slice(-7)
    .reverse();
  const phaseLabels = {
    planning: "Plan your decade",
    flows: "Watch the ripple effects",
    quiz: "Emergency response",
    debrief: "Decade debrief",
    ended: "Your world, remembered",
  };
  // Your civilization's advisor narrates the game to you.
  const narrator: CivId = (online && world.civilization) || state.player;
  return (
    <main
      className={`game-app ${tab === "world" ? "world-view" : "window-view"}`}
    >
      <aside className="sidebar">
        <a
          href="/"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            setHelp(true);
          }}
        >
          <Leaf size={26} />
          <span>
            earthshare<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="world-label">
          <i className="live-dot" /> WORLD{" "}
          {state.seed.toString(16).slice(0, 6).toUpperCase()}
        </div>
        <nav aria-label="Game sections">
          {(
            [
              ["world", "The world", Globe2],
              ["market", "World exchange", TrendingUp],
              ["technology", "Technology", Sparkles],
              ["diplomacy", "Diplomacy", Handshake],
              ["almanac", "Field guide", BookOpen],
              ["timeline", "Our footprint", History],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              aria-label={label}
              title={label}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {tab === id && <i />}
            </button>
          ))}
        </nav>
        <div className="sidebar-commons">
          <span className="eyebrow">THE COMMONS</span>
          <Meter
            label="Global warming"
            value={state.climate}
            max={3}
            color={state.climate > 2 ? "#e4a17d" : "#dbc793"}
            detail="+3°C means a collective loss"
          />
          <Meter
            label="Ocean vitality"
            value={state.ocean}
            color="#85c3b7"
            detail="Healthy seas, thriving fisheries"
          />
          <Meter
            label="Global trust"
            value={state.trust}
            color="#b5b5db"
            detail="Cooperation lowers trade friction"
          />
        </div>
        <div className="sidebar-bottom">
          <button onClick={() => setHelp(true)}>
            <BookOpen size={15} /> How to play
          </button>
          <button onClick={exportSave}>
            <Download size={15} /> Export save
          </button>
          <button
            onClick={() => {
              setResume(state);
              world.disconnect();
              setState(null);
            }}
          >
            <RotateCcw size={15} /> Back to setup
          </button>
          <span>LOCAL WORLD · AUTOSAVED</span>
        </div>
      </aside>
      <div className="main-area">
        <header className="game-header">
          <div>
            <span className="eyebrow">
              DECADE {String(state.round).padStart(2, "0")} / 10{" "}
              <span className="header-separator">/</span>{" "}
              {2026 + (state.round - 1) * 10}
            </span>
            <h1>
              {phaseLabels[state.phase]}
              <span className="header-leaf">❧</span>
            </h1>
          </div>
          <div className="header-actions">
            <span className="mode-pill">
              {online
                ? `ROOM ${world.roomId} · ${world.seats.filter((s) => s.ready).length}/${world.seats.length} READY`
                : state.mode === "solo"
                  ? "SOLO PRACTICE"
                  : "HOT-SEAT PRACTICE"}
            </span>
            {state.phase === "planning" && (
              <button
                className="primary"
                onClick={() => {
                  setSelected(undefined);
                  setTab("world");
                  if (online) void world.ready();
                  else setState(resolveRound(state));
                }}
              >
                {online ? "Lock my plan" : "Resolve decade"}{" "}
                <ArrowRight size={17} />
              </button>
            )}
          </div>
        </header>
        <div className="civ-bar">
          <div className="civ-identity">
            <span className="crest" style={{ color: meta.color }}>
              {meta.crest}
            </span>
            <div>
              {state.mode === "hotseat" && !online ? (
                <select
                  aria-label="Active civilization"
                  value={active}
                  onChange={(e) => {
                    setActive(e.target.value as CivId);
                    setSelected(undefined);
                  }}
                >
                  {CIV_IDS.map((id) => (
                    <option key={id} value={id}>
                      {CIVS[id].name}
                    </option>
                  ))}
                </select>
              ) : (
                <b>{meta.name}</b>
              )}
              <small>{meta.title}</small>
            </div>
          </div>
          <div className="ap">
            <span>
              {Array.from({ length: 3 }, (_, i) => (
                <i key={i} className={i < civ.ap ? "available" : ""} />
              ))}
            </span>
            <b>{civ.ap} actions left</b>
          </div>
          <div className="wellbeing">
            <span>Wellbeing</span>
            <b>
              {Math.round(civ.wellbeing)}
              <small>/100</small>
            </b>
          </div>
        </div>
        <div className="resource-strip">
          {RESOURCES.map((r) => (
            <div key={r} className="resource">
              <span
                className="resource-icon"
                style={{ color: RESOURCE_META[r].color }}
              >
                {RESOURCE_META[r].icon}
              </span>
              <div>
                <small>{RESOURCE_META[r].name}</small>
                <b>{fmt(civ.resources[r])}</b>
              </div>
              <span
                className={income[r] >= 0 ? "positive" : "negative"}
                title="Projected net income next decade"
              >
                {income[r] >= 0 ? "+" : ""}
                {fmt(income[r])}
                <small>/decade</small>
              </span>
            </div>
          ))}
        </div>
        <div className="mobile-commons">
          <span>
            Warming <b>+{state.climate.toFixed(2)}°C</b>
          </span>
          <span>
            Ocean <b>{Math.round(state.ocean)}%</b>
          </span>
          <span>
            Trust <b>{Math.round(state.trust)}%</b>
          </span>
          <button aria-label="How to play" onClick={() => setHelp(true)}>
            <BookOpen size={15} />
          </button>
          <button aria-label="Export save" onClick={exportSave}>
            <Download size={15} />
          </button>
          <button
            aria-label="Back to setup"
            onClick={() => {
              setResume(state);
              world.disconnect();
              setState(null);
            }}
          >
            <RotateCcw size={15} />
          </button>
        </div>
        <div className="content-area">
          {state.phase === "ended" ? (
            <Endgame
              state={state}
              onRestart={() => {
                setResume(state);
                world.disconnect();
                setState(null);
              }}
            />
          ) : (
            <>
              {state.phase === "planning" &&
                briefed !== `${state.seed}:${state.round}` && (
                  <Narrator
                    civ={narrator}
                    className="narrator-docked"
                    eyebrow={`DECADE ${String(state.round).padStart(2, "0")} / ${state.round === 1 ? "YOUR ADVISOR" : "BRIEFING"}`}
                    lines={
                      state.round === 1
                        ? introLines(narrator)
                        : [decadeLine(state.round, state.climate, state.ocean)]
                    }
                    onDone={() => setBriefed(`${state.seed}:${state.round}`)}
                  />
                )}
              {state.phase === "flows" && (
                <Narrator
                  civ={narrator}
                  className="narrator-docked"
                  eyebrow={`THE RIPPLE EFFECT · ${
                    state.flows.length
                      ? `${Math.min(flowIndex + 1, state.flows.length)} / ${state.flows.length} FLOWS`
                      : "NO CROSS-BORDER FLOWS"
                  }`}
                  lines={[
                    state.flows[flowIndex]
                      ? `Look! ${state.flows[flowIndex].caption}`
                      : "The decade passed without anything crossing a border. Local impacts are recorded, and the world exchange has repriced.",
                  ]}
                  actions={
                    <button
                      className="primary"
                      disabled={online && !world.isHost}
                      onClick={() =>
                        online
                          ? void world.advance()
                          : setState(advanceFlows(state))
                      }
                    >
                      Emergency response <ArrowRight size={16} />
                    </button>
                  }
                />
              )}
              {state.phase === "debrief" && (
                <Debrief
                  state={state}
                  civ={narrator}
                  onNext={() =>
                    online ? void world.advance() : setState(nextRound(state))
                  }
                />
              )}
              {tab === "world" && (
                <div className="world-layout">
                  <section>
                    <div className="section-heading">
                      <div>
                        <span className="eyebrow">
                          GEOGRAPHY IS DESTINY. UNTIL YOU CHANGE IT.
                        </span>
                        <h2>A living, connected planet</h2>
                      </div>
                      <span className="pill light">
                        {state.tiles.filter((t) => t.disruption > 0).length}{" "}
                        disrupted regions
                      </span>
                    </div>
                    <WorldMap
                      state={state}
                      selected={selected}
                      onSelect={(t) => setSelected(t.id)}
                      flowIndex={flowIndex}
                    />
                    <div className="map-legend">
                      {[
                        "forest",
                        "farmland",
                        "wetland",
                        "mountain",
                        "urban",
                        "sea",
                      ].map((t) => (
                        <span key={t}>
                          <i
                            style={{
                              background: TERRAIN[t as Tile["terrain"]].color,
                            }}
                          />
                          {TERRAIN[t as Tile["terrain"]].name}
                        </span>
                      ))}
                    </div>
                    <div className="world-insight">
                      <Leaf size={24} />
                      <div>
                        <b>Nature is infrastructure.</b>
                        <p>
                          Forests, wetlands and mangroves protect you for free.
                          Converting them earns more today and exposes your
                          world tomorrow.
                        </p>
                      </div>
                      <button
                        onClick={() => setTab("almanac")}
                        aria-label="Explore nature in the field guide"
                      >
                        <ArrowUpRight size={20} />
                      </button>
                    </div>
                  </section>
                  <aside className="right-column">
                    {tile ? (
                      <RegionPanel
                        state={state}
                        tile={tile}
                        civId={civId}
                        act={act}
                        onClose={() => setSelected(undefined)}
                      />
                    ) : (
                      <div className="region-placeholder">
                        <span className="eyebrow">YOUR NEXT MOVE</span>
                        <Compass size={38} />
                        <h3>Great futures start small.</h3>
                        <p>
                          Select a castle, then a district to inspect its
                          yields, build infrastructure, or restore a disrupted
                          region.
                        </p>
                        <div className="tip">
                          <b>First-decade idea</b>
                          <p>
                            {civId === "heartland"
                              ? "Research drip irrigation, then protect a wetland with a nature sanctuary."
                              : civId === "petrostate"
                                ? "Sell surplus energy and research solar before oil reserves deplete."
                                : civId === "enclave"
                                  ? "Import food and research circular water to reduce your dependence."
                                  : "Research seismic engineering and turn geothermal heat into clean power."}
                          </p>
                        </div>
                      </div>
                    )}
                    <Forecast state={state} civId={civId} act={act} />
                    <NewsFeed items={roundNews} />
                  </aside>
                </div>
              )}
              {tab === "market" && (
                <Market state={state} civId={civId} act={act} />
              )}
              {tab === "technology" && (
                <Technology state={state} civId={civId} act={act} />
              )}
              {tab === "diplomacy" && (
                <Diplomacy state={state} civId={civId} act={act} />
              )}
              {tab === "almanac" && <Almanac />}
              {tab === "timeline" && <Timeline state={state} />}
            </>
          )}
        </div>
        <footer className="game-footer">
          <span>
            <i className="live-dot" />{" "}
            {online
              ? `Room ${world.roomId} · revision ${world.revision} · ${world.status}`
              : "Practice saved on this device"}
          </span>
          <span>The world does not end at your borders.</span>
          <span>
            Warming +{state.climate.toFixed(2)}°C · Ocean{" "}
            {Math.round(state.ocean)}% · Trust {Math.round(state.trust)}%
          </span>
        </footer>
      </div>
      {state.phase === "quiz" && (!online || onlineQuiz) && (
        <Quiz
          state={state}
          ownCiv={online ? world.civilization : undefined}
          onAnswer={(id, index, ms, lifeline) => {
            if (online && onlineQuestion) {
              const question = QUESTIONS.find((q) => q.id === onlineQuestion)!;
              return world
                .answer(onlineQuestion, index, lifeline)
                .then((ok) => {
                  if (ok)
                    setToast(
                      `${index === question.correct ? "Correct" : "Recovery lesson"}: ${question.explanation}`,
                    );
                  return ok;
                });
            } else
              setState((s) => (s ? answerQuiz(s, id, index, ms, lifeline) : s));
          }}
        />
      )}
      {online && state.phase === "quiz" && !onlineQuiz && (
        <div className="waiting-banner" role="status">
          Waiting for other civilizations to finish emergency responses.
        </div>
      )}
      {help && <Help onClose={() => setHelp(false)} />}{" "}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );
}

function RegionPanel({
  state,
  tile,
  civId,
  act,
  onClose,
}: {
  state: GameState;
  tile: Tile;
  civId: CivId;
  act: (a: Action) => void;
  onClose: () => void;
}) {
  const terrain = TERRAIN[tile.terrain],
    own = tile.owner === civId,
    y = yields(state, tile);
  const options = Object.entries(BUILDINGS).filter(
    ([, b]) => b.terrains.includes(tile.terrain) && (!b.civ || b.civ === civId),
  );
  return (
    <section className="region-panel">
      <div className="section-heading">
        <span className="eyebrow">
          REGION {tile.id.replace("t", "").toUpperCase()}
        </span>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close region"
        >
          <X size={17} />
        </button>
      </div>
      <div className="terrain-preview" style={{ background: terrain.color }}>
        {terrain.glyph}
        <span>
          {tile.fault
            ? "FAULT ZONE"
            : tile.coastal
              ? "COASTAL REGION"
              : "INLAND REGION"}
        </span>
      </div>
      <h3>{terrain.name}</h3>
      <span className="owner-tag">
        {tile.owner ? CIVS[tile.owner].name : "International waters"}
      </span>
      <p>{terrain.note}</p>
      <Costs
        cost={Object.fromEntries(
          RESOURCES.filter((r) => y[r] !== 0).map((r) => [r, y[r]]),
        )}
      />
      {tile.disruption > 0 && (
        <div className="warning">
          Disrupted for {tile.disruption} decade{tile.disruption > 1 ? "s" : ""}
          . Production is paused.
        </div>
      )}
      {tile.building && (
        <div className="built-card">
          <b>
            {BUILDINGS[tile.building].icon} {BUILDINGS[tile.building].name}
          </b>
          <p>
            Integrity {Math.round(tile.hp)}% ·{" "}
            {BUILDINGS[tile.building].description}
          </p>
        </div>
      )}
      {own && state.phase === "planning" && (
        <>
          <h4>
            {tile.building ? "Manage region" : "Develop this region"}{" "}
            <span>1 AP / ACTION</span>
          </h4>
          {!tile.building &&
            options.map(([id, b]) => {
              const a: Action = {
                type: "build",
                civ: civId,
                tile: tile.id,
                building: id,
              };
              const error = actionError(state, a);
              return (
                <button
                  className="build-option"
                  key={id}
                  disabled={!!error}
                  title={error ?? b.description}
                  onClick={() => act(a)}
                >
                  <span className="build-icon">{b.icon}</span>
                  <span>
                    <b>{b.name}</b>
                    <Costs cost={b.cost} />
                    {error && <small className="locked-reason">{error}</small>}
                  </span>
                  <ChevronRight size={15} />
                </button>
              );
            })}
          {!tile.building &&
            ["forest", "wetland", "mangrove", "oil"].includes(tile.terrain) && (
              <button
                className="secondary full"
                disabled={
                  !!actionError(state, {
                    type: "convert",
                    civ: civId,
                    tile: tile.id,
                  })
                }
                onClick={() =>
                  act({ type: "convert", civ: civId, tile: tile.id })
                }
              >
                {tile.terrain === "oil"
                  ? "Decommission oil field"
                  : "Convert for higher yields"}{" "}
                · 6 credits
              </button>
            )}
          {(tile.disruption > 0 || tile.hp < 100) && (
            <button
              className="primary full"
              disabled={
                !!actionError(state, {
                  type: "repair",
                  civ: civId,
                  tile: tile.id,
                })
              }
              onClick={() => act({ type: "repair", civ: civId, tile: tile.id })}
            >
              Restore · {civId === "archipelago" ? 3 : 6} credits + 2 materials
            </button>
          )}
        </>
      )}
      {!own && (
        <small className="muted">
          You can inspect this region. Its owner controls development.
        </small>
      )}
    </section>
  );
}
function Forecast({
  state,
  civId,
  act,
}: {
  state: GameState;
  civId: CivId;
  act: (a: Action) => void;
}) {
  const visible =
    civId === "enclave" ||
    state.forecast === "shared" ||
    state.forecast === "sold";
  const threats = Object.entries(DISASTERS)
    .flatMap(([id, d]) =>
      d.regions.map((civ) => ({
        id: id as DisasterId,
        civ,
        p: hazardProbability(state, id as DisasterId, civ),
      })),
    )
    .sort((a, b) => b.p - a.p)
    .slice(0, 3);
  return (
    <section className="forecast-card">
      <span className="eyebrow">
        <Radio size={13} /> CLIMATE INTELLIGENCE
      </span>
      <h3>{visible ? "The coming decade" : "The outlook is private"}</h3>
      {visible ? (
        threats.map((t) => (
          <div className="forecast-row" key={`${t.id}${t.civ}`}>
            <span>
              {DISASTERS[t.id].icon} {DISASTERS[t.id].name}
              <small>{CIVS[t.civ].name}</small>
            </span>
            <b>{Math.round(t.p * 100)}%</b>
          </div>
        ))
      ) : (
        <p>
          Verdant Reach controls the forecast. A shared outlook helps everyone
          plan.
        </p>
      )}
      {civId === "enclave" &&
        state.phase === "planning" &&
        state.forecast === "private" && (
          <div className="button-row">
            {(["shared", "sold", "hidden"] as const).map((policy) => (
              <button
                key={policy}
                onClick={() => act({ type: "forecast", civ: civId, policy })}
              >
                {policy === "shared"
                  ? "Share +trust"
                  : policy === "sold"
                    ? "Sell +8 credits"
                    : "Hide"}
              </button>
            ))}
          </div>
        )}
      <small className="muted">
        Probabilities are estimates, never promises.
      </small>
    </section>
  );
}
function NewsFeed({ items }: { items: GameState["news"] }) {
  return (
    <section className="news-feed">
      <span className="eyebrow">WORLD DISPATCHES</span>
      {items.map((n) => (
        <article key={n.id}>
          <i className={`news-dot ${n.tone}`} />
          <div>
            <b>{n.title}</b>
            <p>{n.detail}</p>
          </div>
        </article>
      ))}
    </section>
  );
}

function Market({
  state,
  civId,
  act,
}: {
  state: GameState;
  civId: CivId;
  act: (a: Action) => void;
}) {
  const [amount, setAmount] = useState(5);
  return (
    <section className="tab-page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">THE ECONOMY IS A SHARED ECOSYSTEM</span>
          <h2>The world exchange</h2>
          <p>
            Disasters, stockpiles, embargoes and your own orders move prices.
            Buy what you need; export what your neighbors cannot make.
          </p>
        </div>
        <label className="quantity">
          Order size{" "}
          <input
            aria-label="Market order size"
            type="number"
            min="1"
            max="30"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
        </label>
      </div>
      <div className="market-grid">
        {RESOURCES.filter((r) => r !== "money").map((r) => (
          <article className="market-card" key={r}>
            <div className="section-heading">
              <span
                className="resource-icon"
                style={{ color: RESOURCE_META[r].color }}
              >
                {RESOURCE_META[r].icon}
              </span>
              <span className="pill light">
                {Math.floor(state.marketStock[r])} available
              </span>
            </div>
            <h3>{RESOURCE_META[r].name}</h3>
            <div className="market-price">
              {state.prices[r].toFixed(2)}
              <small>credits / unit</small>
            </div>
            <Trend
              values={[state.prices[r], ...state.priceHistory.map((p) => p[r])]}
              color={RESOURCE_META[r].color}
            />
            <p>
              Your stock: <b>{fmt(state.civs[civId].resources[r])}</b>
            </p>
            <div className="trade-buttons">
              {[true, false].map((buy) => {
                const a: Action = {
                  type: "market",
                  civ: civId,
                  resource: r,
                  amount,
                  buy,
                };
                const error = actionError(state, a);
                return (
                  <button
                    key={String(buy)}
                    className={buy ? "primary" : "secondary"}
                    disabled={!!error}
                    title={error ?? "One action point"}
                    onClick={() => act(a)}
                  >
                    {buy ? "Buy" : "Sell"} {amount}
                    <small>
                      {marketQuote(state, civId, r, amount, buy).toFixed(1)}{" "}
                      credits
                    </small>
                  </button>
                );
              })}
            </div>
            <button
              className="text-button"
              disabled={
                !!actionError(state, {
                  type: "embargo",
                  civ: civId,
                  resource: r,
                })
              }
              onClick={() => act({ type: "embargo", civ: civId, resource: r })}
            >
              {state.civs[civId].embargo === r
                ? "Lift export embargo"
                : "Withhold from market"}{" "}
              <ArrowUpRight size={14} />
            </button>
          </article>
        ))}
      </div>
      <div className="world-insight">
        <TrendingUp size={25} />
        <div>
          <b>A shortage somewhere is a price signal everywhere.</b>
          <p>
            Market spreads grow when trust falls. Verdant Reach enjoys lower
            trade friction; Forge Dominion receives a premium on energy exports,
            unless tariffs or the strait intervene.
          </p>
        </div>
      </div>
    </section>
  );
}
function Technology({
  state,
  civId,
  act,
}: {
  state: GameState;
  civId: CivId;
  act: (a: Action) => void;
}) {
  return (
    <section className="tab-page">
      <span className="eyebrow">INVENT A DIFFERENT FUTURE</span>
      <h2>Progress with a purpose</h2>
      <p>
        Technology changes the decisions you can make. Specialize with your
        civilization’s 30% research discount, or share discoveries to accelerate
        everyone’s transition.
      </p>
      <div className="tech-branches">
        {["Energy", "Land", "Cities", "Resilience"].map((branch) => (
          <section key={branch} className="tech-branch">
            <div className="branch-heading">
              <Sparkles size={18} />
              <h3>{branch}</h3>
            </div>
            {Object.entries(TECHS)
              .filter(([, t]) => t.branch === branch)
              .map(([id, t], i) => {
                const owned = state.civs[civId].techs.includes(id),
                  a: Action = { type: "research", civ: civId, tech: id },
                  error = actionError(state, a);
                return (
                  <article
                    key={id}
                    className={`tech-card ${owned ? "researched" : ""}`}
                  >
                    <span className="eyebrow">
                      TIER {i + 1}{" "}
                      {t.affinity === civId ? "· CLASS AFFINITY" : ""}
                    </span>
                    <h4>{t.name}</h4>
                    <p>{t.description}</p>
                    {t.requires && (
                      <small>Requires {TECHS[t.requires].name}</small>
                    )}
                    <button
                      className={owned ? "secondary" : "primary"}
                      disabled={owned || !!error}
                      title={error ?? "Research for 1 AP"}
                      onClick={() => act(a)}
                    >
                      {owned ? (
                        <>
                          <ShieldCheck size={15} /> Researched
                        </>
                      ) : (
                        <>
                          ✧ {techCost(state, civId, id)} insight{" "}
                          <ChevronRight size={15} />
                        </>
                      )}
                    </button>
                    {owned && (
                      <button
                        className="text-button"
                        disabled={
                          state.phase !== "planning" ||
                          state.civs[civId].ap === 0 ||
                          CIV_IDS.every((c) => state.civs[c].techs.includes(id))
                        }
                        onClick={() =>
                          act({ type: "opensource", civ: civId, tech: id })
                        }
                      >
                        Open-source to everyone ↗
                      </button>
                    )}
                  </article>
                );
              })}
          </section>
        ))}
      </div>
    </section>
  );
}

function Diplomacy({
  state,
  civId,
  act,
}: {
  state: GameState;
  civId: CivId;
  act: (a: Action) => void;
}) {
  const [target, setTarget] = useState<CivId>(
      CIV_IDS.find((id) => id !== civId)!,
    ),
    [give, setGive] = useState<Resource>("food"),
    [receive, setReceive] = useState<Resource>("energy"),
    [amount, setAmount] = useState(5),
    [recurring, setRecurring] = useState(false);
  useEffect(() => {
    if (target === civId) setTarget(CIV_IDS.find((id) => id !== civId)!);
  }, [civId, target]);
  const c = state.civs[civId],
    trade: Action = {
      type: "trade",
      civ: civId,
      target,
      give,
      receive,
      amount,
      recurring,
    },
    aid: Action = { type: "aid", civ: civId, target, resource: give, amount };
  return (
    <section className="tab-page">
      <span className="eyebrow">YOUR NEIGHBORS ARE YOUR FUTURE</span>
      <h2>Competition. Cooperation. Consequences.</h2>
      <p>
        AI neighbors trade on value and trust. Helping hands build durable
        relationships; coercion buys leverage at a cost.
      </p>
      <div className="diplomacy-grid">
        {CIV_IDS.filter((id) => id !== civId).map((id) => (
          <button
            className={`neighbor-card ${target === id ? "chosen" : ""}`}
            key={id}
            onClick={() => setTarget(id)}
          >
            <span className="crest" style={{ color: CIVS[id].color }}>
              {CIVS[id].crest}
            </span>
            <h3>{CIVS[id].name}</h3>
            <span className="relationship">
              {state.civs[id].relations[civId] >= 65
                ? "Trusted partner"
                : state.civs[id].relations[civId] < 35
                  ? "Hostile rival"
                  : "Pragmatic neighbor"}
            </span>
            <p>{CIVS[id].weakness}</p>
            <div>
              <span>
                Wellbeing <b>{Math.round(state.civs[id].wellbeing)}</b>
              </span>
              <span>
                Emissions <b>{state.civs[id].emissions.toFixed(2)}</b>
              </span>
            </div>
          </button>
        ))}
      </div>
      <div className="diplomacy-workspace">
        <section className="deal-builder">
          <h3>A deal with {CIVS[target].name}</h3>
          <div className="deal-fields">
            <label>
              You offer
              <select
                value={give}
                onChange={(e) => setGive(e.target.value as Resource)}
              >
                {RESOURCES.map((r) => (
                  <option value={r} key={r}>
                    {RESOURCE_META[r].name}
                  </option>
                ))}
              </select>
            </label>
            <ArrowRight size={20} />
            <label>
              You receive
              <select
                value={receive}
                onChange={(e) => setReceive(e.target.value as Resource)}
              >
                {RESOURCES.map((r) => (
                  <option value={r} key={r}>
                    {RESOURCE_META[r].name} (
                    {Math.floor(state.civs[target].resources[r])} available)
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quantity
              <input
                type="number"
                min="1"
                max="30"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            </label>
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
            />{" "}
            Repeat for three decades; missed shipments cost trust.
          </label>
          {actionError(state, trade) && (
            <p className="muted">{actionError(state, trade)}</p>
          )}
          <div className="button-row">
            <button
              className="primary"
              disabled={!!actionError(state, trade)}
              onClick={() => act(trade)}
            >
              Commit resource swap
            </button>
            <button
              className="secondary"
              disabled={!!actionError(state, aid)}
              onClick={() => act(aid)}
            >
              Send as aid instead
            </button>
          </div>
          <p className="small-text">
            Aid sends your offered resource without asking for payment. It
            restores wellbeing and grants one response lifeline.
          </p>
          <h4>License a discovery</h4>
          <div className="button-row">
            {c.techs
              .filter((t) => !state.civs[target].techs.includes(t))
              .map((tech) => (
                <button
                  key={tech}
                  disabled={
                    !!actionError(state, {
                      type: "license",
                      civ: civId,
                      target,
                      tech,
                    })
                  }
                  onClick={() =>
                    act({ type: "license", civ: civId, target, tech })
                  }
                >
                  {TECHS[tech].name} · 10 credits
                </button>
              ))}
            {!c.techs.length && (
              <span className="muted">
                Research a technology to license it.
              </span>
            )}
          </div>
        </section>
        <section className="policy-panel">
          <h3>Statecraft</h3>
          <p>
            Policies persist until you change them. Every policy costs one
            action.
          </p>
          <button
            className="secondary full"
            disabled={
              !!actionError(state, { type: "tariff", civ: civId, target })
            }
            onClick={() => act({ type: "tariff", civ: civId, target })}
          >
            {c.tariff === target ? "Remove" : "Apply"} carbon tariff on{" "}
            {CIVS[target].name}
          </button>
          {civId === "archipelago" && (
            <>
              <h4>The shipping strait</h4>
              <div className="button-row">
                {(["open", "tax", "block"] as const).map((policy) => (
                  <button
                    key={policy}
                    className={c.shipping === policy ? "selected-policy" : ""}
                    disabled={state.phase !== "planning" || c.ap === 0}
                    onClick={() =>
                      act({ type: "shipping", civ: civId, policy })
                    }
                  >
                    {policy}
                  </button>
                ))}
              </div>
            </>
          )}
          {civId === "heartland" && (
            <button
              className="secondary full"
              disabled={state.phase !== "planning" || c.ap === 0}
              onClick={() => act({ type: "divert", civ: civId })}
            >
              {c.diversion
                ? "Restore downstream flow"
                : "Divert water from the delta"}
            </button>
          )}
          <div className="concordat">
            <Handshake size={24} />
            <h4>The Earthshare Concordat</h4>
            <p>
              All four must sign, keep emissions below 0.10 per decade, and end
              embargoes, tariffs, diversion and shipping restrictions for three
              consecutive decades.
            </p>
            <div className="signature-row">
              {CIV_IDS.map((id) => (
                <span
                  key={id}
                  title={CIVS[id].name}
                  className={state.civs[id].accord ? "signed" : ""}
                >
                  {CIVS[id].crest}
                </span>
              ))}
            </div>
            <small>{state.accordStreak} / 3 compliant decades</small>
            <button
              className="primary full"
              disabled={!!actionError(state, { type: "accord", civ: civId })}
              onClick={() => act({ type: "accord", civ: civId })}
            >
              {c.accord ? "Your signature is recorded" : "Sign the Concordat"}
            </button>
          </div>
        </section>
      </div>
      {state.deals.length > 0 && (
        <section className="active-deals">
          <h3>Active agreements</h3>
          {state.deals.map((d) => (
            <p key={d.id}>
              {CIVS[d.from].name} ↔ {CIVS[d.to].name}: {d.amount} {d.give} /{" "}
              {d.receive} · {d.remaining} shipments remaining
            </p>
          ))}
        </section>
      )}
    </section>
  );
}

function Almanac() {
  const [filter, setFilter] = useState("all");
  return (
    <section className="tab-page">
      <span className="eyebrow">KNOWLEDGE IS A RESILIENCE STRATEGY</span>
      <h2>The field guide</h2>
      <p>
        Sixteen distinct hazard systems. Understand their carriers, prepare
        before they arrive, and learn from the consequences. Game numbers are
        teaching abstractions, not real-world forecasts.
      </p>
      <div className="filter-pills">
        {["all", "river", "wind", "coast", "fault", "current", "local"].map(
          (c) => (
            <button
              key={c}
              className={filter === c ? "active" : ""}
              onClick={() => setFilter(c)}
            >
              {c === "all" ? "All hazards" : c}
            </button>
          ),
        )}
      </div>
      <div className="almanac-grid">
        {Object.entries(DISASTERS)
          .filter(([, d]) => filter === "all" || d.carrier === filter)
          .map(([id, d]) => (
            <article key={id} className="hazard-card">
              <div className="section-heading">
                <span className="hazard-icon" style={{ color: d.color }}>
                  {d.icon}
                </span>
                <span className="pill light">
                  {d.climateDriven ? "WARMING AMPLIFIED" : "INDEPENDENT RISK"}
                </span>
              </div>
              <h3>{d.name}</h3>
              <p>{d.lesson}</p>
              <div className="mitigation">
                <ShieldCheck size={16} />
                <span>{d.mitigation}</span>
              </div>
              <a href={d.source} target="_blank" rel="noreferrer">
                Explore the science <ArrowUpRight size={14} />
              </a>
            </article>
          ))}
      </div>
      <div className="world-insight">
        <BookOpen size={26} />
        <div>
          <b>{QUESTIONS.length} questions. Learning that pays forward.</b>
          <p>
            A strong response recovers up to 25% of resource losses and two
            decades of disruption. It cannot change downstream flows or erase
            the consequences for your neighbors.
          </p>
        </div>
      </div>
    </section>
  );
}
function Timeline({ state }: { state: GameState }) {
  return (
    <section className="tab-page">
      <span className="eyebrow">EVERY DECISION LEAVES A TRACE</span>
      <h2>Our footprint</h2>
      <div className="history-charts">
        {(
          [
            ["Warming", state.history.map((h) => h.climate), "#c09363"],
            ["Ocean health", state.history.map((h) => h.ocean), "#5faaa2"],
            ["Global trust", state.history.map((h) => h.trust), "#9c97c5"],
          ] as const
        ).map(([label, values, color]) => (
          <article key={label}>
            <h3>{label}</h3>
            <Trend values={[...values]} color={color} />
            <span>Decade 1 → {state.round}</span>
          </article>
        ))}
      </div>
      <div className="timeline">
        {state.news
          .slice()
          .reverse()
          .map((n) => (
            <article key={n.id}>
              <span className="timeline-decade">
                {String(n.round).padStart(2, "0")}
              </span>
              <div>
                <span className="eyebrow">
                  {n.causeId ? `CAUSE ${n.causeId}` : "WORLD DISPATCH"}
                </span>
                <h4>{n.title}</h4>
                <p>{n.detail}</p>
              </div>
              <i className={`news-dot ${n.tone}`} />
            </article>
          ))}
      </div>
    </section>
  );
}
function Debrief({
  state,
  civ,
  onNext,
}: {
  state: GameState;
  civ: CivId;
  onNext: () => void;
}) {
  const biggest = [...state.damages].sort((a, b) => b.severity - a.severity)[0],
    d = biggest ? DISASTERS[biggest.type] : null;
  return (
    <Narrator
      civ={civ}
      className="narrator-docked"
      eyebrow={`DECADE ${state.round} / LESSONS FROM THE COMMONS`}
      lines={[
        d
          ? `${d.name}: the consequence is connected. ${d.lesson}`
          : "A quiet decade. Prevention rarely makes headlines, so use this breathing room to invest in clean power, resilient systems and trusted relationships.",
      ]}
      actions={
        <button className="primary" onClick={onNext}>
          {state.round >= 10 || state.climate >= 3
            ? "See your legacy"
            : "Begin next decade"}{" "}
          <ArrowRight size={17} />
        </button>
      }
    >
      <div className="debrief-stats">
        <span>
          <b>{state.damages.length}</b> regional impacts
        </span>
        <span>
          <b>{state.flows.length}</b> cross-border flows
        </span>
        <span>
          <b>{state.quizzes.filter((q) => q.tier === "rapid").length}</b> rapid
          responses
        </span>
        {d && (
          <a href={d.source} target="_blank" rel="noreferrer">
            Read the real-world science ↗
          </a>
        )}
      </div>
    </Narrator>
  );
}
function Endgame({
  state,
  onRestart,
}: {
  state: GameState;
  onRestart: () => void;
}) {
  const ranking = CIV_IDS.map((id) => ({ id, score: score(state, id) })).sort(
    (a, b) => b.score - a.score,
  );
  return (
    <section className="endgame">
      <div className="end-emblem">
        {state.outcome === "collapse"
          ? "⌁"
          : state.outcome === "concordat"
            ? "❧"
            : "✧"}
      </div>
      <span className="eyebrow">YOUR LEGACY / DECADE {state.round}</span>
      <h2>
        {state.outcome === "collapse"
          ? "No one wins on a broken planet."
          : state.outcome === "concordat"
            ? "Four futures. One shared victory."
            : "A world shaped by your choices."}
      </h2>
      <p>
        {state.outcome === "collapse"
          ? "Warming crossed +3°C. Follow the timeline below to see which decisions moved the world toward collapse."
          : state.outcome === "concordat"
            ? "The Concordat held for three decades. Cooperation became a winning strategy."
            : "Prosperity matters. So does the world that makes it possible. Scores reward wellbeing, technology, infrastructure and lower emissions."}
      </p>
      <div className="ranking">
        {ranking.map((r, i) => (
          <article key={r.id}>
            <span>{i + 1}</span>
            <b style={{ color: CIVS[r.id].color }}>
              {CIVS[r.id].crest} {CIVS[r.id].name}
            </b>
            <strong>{r.score}</strong>
          </article>
        ))}
      </div>
      <button className="primary" onClick={onRestart}>
        Start another future <ArrowRight size={17} />
      </button>
      <Timeline state={state} />
    </section>
  );
}

function Quiz({
  state,
  ownCiv,
  onAnswer,
}: {
  state: GameState;
  ownCiv?: CivId;
  onAnswer: (
    civ: CivId,
    index: number,
    ms: number,
    lifeline: boolean,
  ) => void | Promise<boolean>;
}) {
  const session = state.quizzes.find(
    (q) => !q.tier && (!ownCiv || q.civ === ownCiv),
  )!;
  const question = QUESTIONS.find(
    (q) => q.id === session.questions[session.answers.length],
  )!;
  const [remaining, setRemaining] = useState(15),
    [feedback, setFeedback] = useState<number | null>(null),
    [hidden, setHidden] = useState<number[]>([]),
    [used, setUsed] = useState(false);
  const usedRef = useRef(false);
  const started = useRef(0),
    locked = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commit = useCallback(
    (option: number) => {
      if (locked.current) return;
      locked.current = true;
      const elapsed = Math.max(0, Date.now() - started.current);
      setFeedback(option);
      if (ownCiv) {
        Promise.resolve(
          onAnswer(session.civ, option, elapsed, usedRef.current),
        ).then((ok) => {
          if (ok === false) {
            locked.current = false;
            setFeedback(null);
          }
        });
        return;
      }
      timer.current = setTimeout(() => {
        onAnswer(
          session.civ,
          option,
          option === -1 ? 15001 : elapsed,
          usedRef.current,
        );
        setFeedback(null);
      }, 2100);
    },
    [onAnswer, session.civ, used],
  );
  useEffect(() => {
    started.current = Date.now();
    locked.current = false;
    setRemaining(15);
    setFeedback(null);
    setHidden([]);
    setUsed(session.lifelineUsed);
    usedRef.current = session.lifelineUsed;
    const interval = setInterval(() => {
      const left = Math.max(0, 15 - (Date.now() - started.current) / 1000);
      setRemaining(left);
      if (left === 0) commit(-1);
    }, 100);
    return () => {
      clearInterval(interval);
      if (timer.current) clearTimeout(timer.current);
    }; // Reset only for a new question, not each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id]);
  function lifeline() {
    if (used || locked.current) return;
    setHidden(
      question.options
        .map((_, i) => i)
        .filter((i) => i !== question.correct)
        .slice(0, 2),
    );
    setUsed(true);
    usedRef.current = true;
  }
  return (
    <div className="modal-backdrop">
      <section
        className="quiz-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quiz-title"
      >
        <div className="section-heading">
          <span className="eyebrow">
            {CIVS[session.civ].name.toUpperCase()} / EMERGENCY RESPONSE
          </span>
          <div className="quiz-timer">
            <b>{Math.ceil(remaining)}</b>
          </div>
        </div>
        <span className="pill">
          {DISASTERS[session.type].icon} {DISASTERS[session.type].name} ·
          Question {session.answers.length + 1}/{session.questions.length}
        </span>
        <h2 id="quiz-title">{question.prompt}</h2>
        <p className="quiz-subtitle">
          Your knowledge accelerates recovery. Prevention still matters most.
        </p>
        <div className="quiz-options">
          {question.options.map((option, i) => (
            <button
              autoFocus={i === 0}
              key={option}
              disabled={feedback !== null || hidden.includes(i)}
              className={
                feedback !== null
                  ? i === question.correct
                    ? "correct"
                    : i === feedback
                      ? "incorrect"
                      : ""
                  : ""
              }
              onClick={() => commit(i)}
            >
              <span>{String.fromCharCode(65 + i)}</span>
              {hidden.includes(i) ? "Removed by mutual aid" : option}
              {feedback !== null && i === question.correct && (
                <ShieldCheck size={18} />
              )}
            </button>
          ))}
        </div>
        {feedback !== null && (
          <div className="answer-feedback" role="status">
            <b>
              {feedback === question.correct
                ? "That’s right."
                : feedback === -1
                  ? "Time’s up."
                  : "A lesson for next time."}
            </b>
            <p>{question.explanation}</p>
            <a href={question.source} target="_blank" rel="noreferrer">
              Source: {question.sourceLabel} ↗
            </a>
          </div>
        )}
        <div className="quiz-footer">
          <button
            className="secondary"
            disabled={
              !state.civs[session.civ].aided || used || feedback !== null
            }
            onClick={lifeline}
          >
            <Handshake size={15} />{" "}
            {used ? "Lifeline used" : "Mutual-aid 50/50"}
          </button>
          <span>
            {session.answers.filter((a) => a.correct).length} correct · up to
            25% recovery
          </span>
        </div>
        <div className="quiz-progress">
          {session.questions.map((id, i) => (
            <i
              key={id}
              className={
                i < session.answers.length
                  ? "complete"
                  : i === session.answers.length
                    ? "current"
                    : ""
              }
            />
          ))}
        </div>
        {state.mode === "hotseat" && (
          <p className="small-text">
            Pass the screen to {CIVS[session.civ].name}. Other players can look
            away.
          </p>
        )}
      </section>
    </div>
  );
}
function Help({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop">
      <section
        className="help-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
      >
        <button
          className="close-modal"
          onClick={onClose}
          aria-label="Close instructions"
        >
          <X />
        </button>
        <Leaf size={32} />
        <span className="eyebrow">WELCOME TO THE COMMONS</span>
        <h2 id="help-title">Build well. Think downstream.</h2>
        <ol>
          <li>
            <b>Plan with three actions.</b> Select hexes to build or restore.
            Research unlocks new options. Buy essentials and sell surplus.
          </li>
          <li>
            <b>Work with your neighbors.</b> Trade, send aid, license or share
            technology. AI partners may refuse unfair deals. Aggressive policies
            affect trust and supply.
          </li>
          <li>
            <b>Resolve the decade.</b> AI neighbors act; hazards roll using the
            seed. Rivers, winds, currents, coasts and faults carry consequences
            across borders.
          </li>
          <li>
            <b>Respond and learn.</b> Affected civilizations answer 2–3 timed
            questions. Good answers accelerate recovery; aid unlocks a 50/50
            lifeline.
          </li>
          <li>
            <b>Leave a legacy.</b> After ten decades, sustainable prosperity
            wins. Everyone loses at +3°C. All four can win together through a
            compliant Concordat.
          </li>
        </ol>
        <p>
          Levees and seawalls redirect risk. Nature can buffer it. Geological
          hazards are independent of warming. Your browser autosaves; export
          your world to keep a portable copy.
        </p>
        <button className="primary full" onClick={onClose}>
          Let’s build a better future <ArrowRight size={17} />
        </button>
      </section>
    </div>
  );
}

function validSave(value: unknown): value is GameState {
  if (!value || typeof value !== "object") return false;
  const s = value as GameState;
  return (
    s.version === 1 &&
    Number.isInteger(s.round) &&
    s.round >= 1 &&
    s.round <= 10 &&
    Number.isFinite(s.seed) &&
    CIV_IDS.includes(s.player) &&
    ["solo", "hotseat"].includes(s.mode) &&
    ["planning", "flows", "quiz", "debrief", "ended"].includes(s.phase) &&
    ["climate", "ocean", "trust", "aquifer"].every((key) =>
      Number.isFinite(s[key as keyof GameState]),
    ) &&
    CIV_IDS.every(
      (id) =>
        s.civs?.[id] &&
        RESOURCES.every((r) => Number.isFinite(s.civs[id].resources?.[r])) &&
        Array.isArray(s.civs[id].techs) &&
        s.civs[id].techs.every((t) => TECHS[t]),
    ) &&
    Array.isArray(s.tiles) &&
    s.tiles.length === 56 &&
    s.tiles.every(
      (t) =>
        TERRAIN[t.terrain] &&
        (!t.building || BUILDINGS[t.building]) &&
        (!t.owner || CIV_IDS.includes(t.owner)) &&
        Number.isFinite(t.disruption),
    ) &&
    [
      "news",
      "flows",
      "history",
      "deals",
      "quizzes",
      "usedQuestions",
      "priceHistory",
      "damages",
      "ledgers",
    ].every((k) => Array.isArray(s[k as keyof GameState])) &&
    RESOURCES.every(
      (r) =>
        Number.isFinite(s.prices?.[r]) && Number.isFinite(s.marketStock?.[r]),
    ) &&
    s.quizzes.every(
      (q) =>
        CIV_IDS.includes(q.civ) &&
        q.questions.every((id) => QUESTIONS.some((item) => item.id === id)) &&
        Array.isArray(q.answers),
    )
  );
}
