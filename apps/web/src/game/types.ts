export const CIV_IDS = [
  "petrostate",
  "heartland",
  "enclave",
  "archipelago",
] as const;
export type CivId = (typeof CIV_IDS)[number];
export const RESOURCES = [
  "food",
  "water",
  "energy",
  "materials",
  "money",
  "innovation",
] as const;
export type Resource = (typeof RESOURCES)[number];
export type Stock = Record<Resource, number>;
export type Terrain =
  | "farmland"
  | "forest"
  | "wetland"
  | "mangrove"
  | "mountain"
  | "desert"
  | "oil"
  | "volcanic"
  | "delta"
  | "urban"
  | "sea";
export type Carrier =
  "river" | "wind" | "current" | "coast" | "fault" | "local";
export type DisasterId =
  | "flood"
  | "dam_failure"
  | "hurricane"
  | "earthquake"
  | "tsunami"
  | "volcano"
  | "drought"
  | "heatwave"
  | "wildfire"
  | "spill"
  | "smog"
  | "sea_rise"
  | "landslide"
  | "grid_failure"
  | "pandemic"
  | "supply_shock";
export interface Tile {
  id: string;
  q: number;
  r: number;
  owner: CivId | null;
  terrain: Terrain;
  coastal: boolean;
  fault: boolean;
  building?: string;
  hp: number;
  disruption: number;
  effect?: DisasterId;
  buildingCause?: string;
}
export interface Civ {
  id: CivId;
  resources: Stock;
  wellbeing: number;
  population: number;
  techs: string[];
  ap: number;
  reserves: number;
  emissions: number;
  accord: boolean;
  aided: boolean;
  embargo?: Resource;
  tariff?: CivId;
  shipping: "open" | "tax" | "block";
  diversion: boolean;
  relations: Record<CivId, number>;
}
export interface Edge {
  id: string;
  from: CivId;
  to: CivId;
  carrier: Carrier;
  weight: number;
  decay: number;
}
export interface Hazard {
  id: string;
  type: DisasterId;
  source: CivId;
  amount: number;
  causeId: string;
}
export interface Flow {
  id: string;
  from: CivId;
  to: CivId;
  carrier: Carrier;
  type: DisasterId;
  amount: number;
  causeId: string;
  caption: string;
}
export interface Ledger {
  hazardId: string;
  incoming: number;
  impact: number;
  buffered: number;
  transmitted: number;
  dissipated: number;
  region: CivId;
}
export interface Damage {
  civ: CivId;
  type: DisasterId;
  severity: number;
  losses: Partial<Stock>;
  tileIds: string[];
  causeId: string;
}
export interface News {
  id: string;
  round: number;
  title: string;
  detail: string;
  tone: "good" | "bad" | "info";
  causeId?: string;
}
export interface Deal {
  id: string;
  from: CivId;
  to: CivId;
  give: Resource;
  receive: Resource;
  amount: number;
  remaining: number;
}
export interface Snapshot {
  round: number;
  climate: number;
  ocean: number;
  trust: number;
  prices: Stock;
}
export interface QuizAnswer {
  questionId: string;
  correct: boolean;
  ms: number;
}
export interface QuizSession {
  civ: CivId;
  type: DisasterId;
  questions: string[];
  answers: QuizAnswer[];
  lifelineUsed: boolean;
  tier?: "rapid" | "solid" | "slow";
}
export type Phase = "planning" | "flows" | "quiz" | "debrief" | "ended";
export interface GameState {
  version: 1;
  seed: number;
  round: number;
  phase: Phase;
  mode: "solo" | "hotseat";
  player: CivId;
  civs: Record<CivId, Civ>;
  tiles: Tile[];
  climate: number;
  ocean: number;
  trust: number;
  aquifer: number;
  prices: Stock;
  marketStock: Stock;
  priceHistory: Stock[];
  wind: "WE" | "EW";
  flows: Flow[];
  ledgers: Ledger[];
  damages: Damage[];
  news: News[];
  deals: Deal[];
  history: Snapshot[];
  quizzes: QuizSession[];
  usedQuestions: string[];
  forecast: "private" | "shared" | "sold" | "hidden";
  accordStreak: number;
  outcome?: "collapse" | "concordat" | "prosperity";
  nextCause: number;
}
export type Action =
  | { type: "build"; civ: CivId; tile: string; building: string }
  | { type: "convert"; civ: CivId; tile: string }
  | { type: "repair"; civ: CivId; tile: string }
  | { type: "research"; civ: CivId; tech: string }
  | {
      type: "market";
      civ: CivId;
      resource: Resource;
      amount: number;
      buy: boolean;
    }
  | {
      type: "trade";
      civ: CivId;
      target: CivId;
      give: Resource;
      receive: Resource;
      amount: number;
      recurring: boolean;
    }
  | {
      type: "aid";
      civ: CivId;
      target: CivId;
      resource: Resource;
      amount: number;
    }
  | { type: "embargo"; civ: CivId; resource: Resource }
  | { type: "tariff"; civ: CivId; target: CivId }
  | { type: "shipping"; civ: CivId; policy: "open" | "tax" | "block" }
  | { type: "divert"; civ: CivId }
  | { type: "opensource"; civ: CivId; tech: string }
  | { type: "license"; civ: CivId; target: CivId; tech: string }
  | { type: "accord"; civ: CivId }
  | { type: "forecast"; civ: CivId; policy: "shared" | "sold" | "hidden" };
export interface Question {
  id: string;
  types: DisasterId[];
  difficulty: 1 | 2 | 3;
  prompt: string;
  options: string[];
  correct: number;
  explanation: string;
  source: string;
  sourceLabel: string;
}
