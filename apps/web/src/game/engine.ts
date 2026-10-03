import { clone } from "./clone";
import {
  BUILDINGS,
  CIVS,
  createTiles,
  DISASTERS,
  EDGES,
  stock,
  TECHS,
  TERRAIN,
} from "./content";
import { QUESTIONS } from "./questions";
import {
  type Action,
  CIV_IDS,
  type CivId,
  type Damage,
  type DisasterId,
  type GameState,
  type Hazard,
  type Question,
  RESOURCES,
  type Resource,
  type Stock,
  type Tile,
} from "./types";

export const clamp = (n: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, n));
const round2 = (n: number) => Math.round(n * 100) / 100;
export function random(s: GameState): number {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return s.seed / 4294967296;
}
function cause(s: GameState) {
  return `r${s.round}-c${s.nextCause++}`;
}
function news(
  s: GameState,
  title: string,
  detail: string,
  tone: "good" | "bad" | "info" = "info",
  causeId?: string,
) {
  s.news.push({ id: cause(s), round: s.round, title, detail, tone, causeId });
}
function bound(s: GameState) {
  s.climate = round2(clamp(s.climate, 0, 5));
  s.ocean = round2(clamp(s.ocean));
  s.trust = round2(clamp(s.trust));
  s.aquifer = clamp(s.aquifer);
  for (const id of CIV_IDS) {
    const c = s.civs[id];
    c.wellbeing = clamp(c.wellbeing);
    for (const r of RESOURCES)
      c.resources[r] = round2(clamp(c.resources[r], 0, 9999));
    for (const other of CIV_IDS) c.relations[other] = clamp(c.relations[other]);
  }
}
export function createGame(
  player: CivId = "heartland",
  mode: "solo" | "hotseat" = "solo",
  seed = 260926,
): GameState {
  const civs = Object.fromEntries(
    CIV_IDS.map((id) => [
      id,
      {
        id,
        resources: { ...CIVS[id].start },
        population: id === "enclave" ? 14 : 10,
        wellbeing: 78,
        techs: [],
        ap: 3,
        reserves: 60,
        emissions: 0,
        accord: false,
        aided: false,
        shipping: "open",
        diversion: false,
        relations: Object.fromEntries(CIV_IDS.map((other) => [other, 55])),
      },
    ]),
  ) as unknown as GameState["civs"];
  const s: GameState = {
    version: 1,
    seed,
    round: 1,
    phase: "planning",
    mode,
    player,
    civs,
    tiles: createTiles(),
    climate: 0.35,
    ocean: 94,
    trust: 55,
    aquifer: 100,
    prices: stock({
      food: 2,
      water: 2,
      energy: 2.5,
      materials: 3,
      money: 1,
      innovation: 4,
    }),
    marketStock: stock({
      food: 70,
      water: 55,
      energy: 65,
      materials: 60,
      innovation: 30,
      money: 1000,
    }),
    priceHistory: [],
    wind: "WE",
    flows: [],
    ledgers: [],
    damages: [],
    news: [],
    deals: [],
    history: [],
    quizzes: [],
    usedQuestions: [],
    forecast: "private",
    accordStreak: 0,
    nextCause: 1,
  };
  news(
    s,
    "One world. Four futures.",
    "Every civilization has three actions per decade. Build prosperity, but keep warming below +3°C. Cooperation can earn a shared Concordat victory.",
  );
  income(s, false);
  snapshot(s);
  return s;
}
export function yields(s: GameState, tile: Tile): Stock {
  if (!tile.owner || tile.disruption > 0) return stock();
  const c = s.civs[tile.owner];
  const result = stock(TERRAIN[tile.terrain].yield);
  if (tile.terrain === "oil") {
    result.energy *= c.reserves / 60;
    if (c.reserves <= 0) result.money = 0;
  }
  if (tile.terrain === "sea" || tile.terrain === "mangrove")
    result.food *= (s.ocean / 100) * (c.techs.includes("ecology") ? 1.25 : 1);
  if (tile.terrain === "farmland") {
    if (c.techs.includes("irrigation")) result.water *= 0.5;
    if (c.techs.includes("soil")) result.food++;
  }
  if (tile.building && tile.hp > 0) {
    const def = BUILDINGS[tile.building];
    const factor = tile.hp / 100;
    // Fossil infrastructure needs fuel reserves; electric facilities need a working grid.
    const powered =
      !Object.values(def.yields).some((n) => n < 0) || c.resources.energy >= 2;
    if (powered)
      for (const r of RESOURCES)
        result[r] +=
          (def.yields[r] ?? 0) *
          factor *
          (tile.building === "rig" ? c.reserves / 60 : 1);
    if (tile.building === "solar" && tile.terrain === "desert")
      result.energy += 2 * factor;
  }
  if (["petrostate", "heartland"].includes(tile.owner) && result.water > 0)
    result.water *= s.aquifer / 100;
  if (
    tile.owner === "enclave" &&
    s.civs.heartland.diversion &&
    result.water > 0
  )
    result.water *= 0.4;
  result.innovation *= CIVS[tile.owner].rate;
  return result;
}
export function projectedIncome(s: GameState, id: CivId): Stock {
  const result = stock({ money: 4, innovation: 2 * CIVS[id].rate });
  for (const t of s.tiles.filter((t) => t.owner === id)) {
    const y = yields(s, t);
    for (const r of RESOURCES) result[r] += y[r];
  }
  result.food -= s.civs[id].population * 0.55;
  result.water -= s.civs[id].population * 0.45;
  result.energy -= 2;
  if (s.civs[id].techs.includes("water")) result.water += 2;
  return result;
}
function income(s: GameState, consume = true) {
  for (const id of CIV_IDS) {
    const c = s.civs[id],
      net = projectedIncome(s, id);
    for (const r of RESOURCES) {
      const value = consume ? net[r] : Math.max(0, net[r]);
      if (
        c.resources[r] + value < 0 &&
        ["food", "water", "energy"].includes(r)
      ) {
        c.wellbeing -= Math.min(14, Math.abs(c.resources[r] + value) * 2);
        news(
          s,
          `${CIVS[id].name}: ${r} shortage`,
          "Imports, emergency reserves or aid are needed. Wellbeing falls when essential demand is unmet.",
          "bad",
        );
      }
      c.resources[r] += value;
    }
    if (c.resources.food > 5 && c.resources.water > 4) {
      c.wellbeing += 2;
      if (consume && c.wellbeing >= 80)
        c.population = Math.min(24, c.population + 0.5);
    } else if (consume && c.wellbeing < 50)
      c.population = Math.max(5, c.population - 0.25);
    if (id !== "heartland") c.resources.food *= 0.95;
    const oilTiles = s.tiles.filter(
      (t) => t.owner === id && t.terrain === "oil" && !t.disruption,
    ).length;
    const rigs = s.tiles.filter(
      (t) =>
        t.owner === id && t.building === "rig" && t.hp > 0 && !t.disruption,
    ).length;
    c.emissions =
      c.reserves > 0
        ? (oilTiles * 0.045 + rigs * (BUILDINGS.rig.emissions ?? 0)) *
          (c.techs.includes("carbon") ? 0.55 : 1)
        : 0;
    c.reserves = Math.max(0, c.reserves - oilTiles * 1.7 - rigs * 2);
    s.climate += c.emissions;
    if (consume && c.emissions > 0.1) {
      s.trust -= 1;
      s.civs.archipelago.relations[id] -= 4;
      s.civs.heartland.relations[id] -= 2;
    }
    const sanctuaries = s.tiles.filter(
      (t) =>
        t.owner === id &&
        t.building === "restoration" &&
        t.hp > 0 &&
        !t.disruption,
    ).length;
    s.climate -= sanctuaries * 0.045 * (c.techs.includes("ecology") ? 2 : 1);
    s.ocean += sanctuaries;
    const farms = s.tiles.filter(
      (t) => t.owner === id && t.terrain === "farmland",
    ).length;
    s.ocean -= farms * (c.techs.includes("soil") ? 0.08 : 0.18);
    s.ocean -=
      s.tiles.filter(
        (t) => t.owner === id && t.building === "desal" && !t.disruption,
      ).length * 0.3;
    if (c.diversion) {
      c.resources.water += 4;
      s.aquifer -= 4;
    }
  }
  s.climate -= s.tiles.filter((t) => t.terrain === "forest").length * 0.007;
  s.aquifer += 2;
  bound(s);
}
export function techCost(s: GameState, civ: CivId, tech: string) {
  return Math.ceil(TECHS[tech].cost * (TECHS[tech].affinity === civ ? 0.7 : 1));
}
function canPay(s: GameState, id: CivId, cost: Partial<Stock>) {
  return RESOURCES.every((r) => s.civs[id].resources[r] >= (cost[r] ?? 0));
}
function pay(s: GameState, id: CivId, cost: Partial<Stock>) {
  for (const r of RESOURCES) s.civs[id].resources[r] -= cost[r] ?? 0;
}
export function marketQuote(
  s: GameState,
  id: CivId,
  resource: Resource,
  amount: number,
  buy: boolean,
): number {
  const trustFee = (100 - s.trust) / 500;
  let rate = s.prices[resource] * (buy ? 1.08 + trustFee : 0.92 - trustFee);
  if (id === "enclave") rate *= buy ? 0.9 : 1.1;
  if (id === "petrostate" && resource === "energy" && !buy) rate *= 1.2;
  if (!buy && CIV_IDS.some((other) => s.civs[other].tariff === id))
    rate *= 0.75;
  if (id === "petrostate" && !buy && s.civs.archipelago.shipping === "tax")
    rate *= 0.8;
  return round2(rate * amount);
}
export function actionError(s: GameState, a: Action): string | null {
  if (s.phase !== "planning") return "Actions are available during planning.";
  if (!CIV_IDS.includes(a.civ)) return "Unknown civilization.";
  const c = s.civs[a.civ];
  if (a.type !== "forecast" && c.ap < 1)
    return "No action points left this decade.";
  if ("target" in a && (!CIV_IDS.includes(a.target) || a.target === a.civ))
    return "Choose another civilization.";
  if (a.type === "build") {
    const tile = s.tiles.find((t) => t.id === a.tile),
      def = BUILDINGS[a.building];
    if (!tile || tile.owner !== a.civ || !def)
      return "Select a tile in your territory.";
    if (tile.building) return "This tile already has infrastructure.";
    if (tile.disruption) return "Repair this disrupted tile first.";
    if (!def.terrains.includes(tile.terrain))
      return "This terrain cannot support that building.";
    if (def.civ && def.civ !== a.civ)
      return "This is another civilization’s unique infrastructure.";
    if (def.tech && !c.techs.includes(def.tech))
      return `Research ${TECHS[def.tech].name} first.`;
    if (!canPay(s, a.civ, def.cost))
      return "Insufficient construction resources.";
  }
  if (a.type === "research") {
    const t = TECHS[a.tech];
    if (!t) return "Unknown technology.";
    if (c.techs.includes(a.tech)) return "Already researched.";
    if (t.requires && !c.techs.includes(t.requires))
      return `Requires ${TECHS[t.requires].name}.`;
    if (c.resources.innovation < techCost(s, a.civ, a.tech))
      return "Not enough insight.";
  }
  if (a.type === "repair" || a.type === "convert") {
    const t = s.tiles.find((t) => t.id === a.tile);
    if (!t || t.owner !== a.civ) return "Select your own tile.";
    if (
      a.type === "convert" &&
      (t.building ||
        !["forest", "wetland", "mangrove", "oil"].includes(t.terrain))
    )
      return "Only undeveloped forests, wetlands, mangroves and oil fields can be converted.";
    if (a.type === "repair" && !t.disruption && t.hp === 100)
      return "This tile is already healthy.";
    if (
      !canPay(s, a.civ, {
        money: a.type === "repair" && a.civ === "archipelago" ? 3 : 6,
        materials: 2,
      })
    )
      return "Need credits and 2 materials.";
  }
  if (a.type === "market" || a.type === "trade" || a.type === "aid") {
    if (!Number.isInteger(a.amount) || a.amount < 1 || a.amount > 30)
      return "Quantity must be a whole number from 1 to 30.";
    if (a.type === "market") {
      if (a.resource === "money") return "Credits are the market currency.";
      if (
        a.civ === "petrostate" &&
        !a.buy &&
        s.civs.archipelago.shipping === "block"
      )
        return "The strait is blocked. Negotiate with the Tidehaven.";
      if (!a.buy && c.embargo === a.resource)
        return "Lift your embargo before exporting.";
      if (a.buy && s.marketStock[a.resource] < a.amount)
        return "The market has insufficient stock.";
      if (
        a.buy
          ? c.resources.money <
            marketQuote(s, a.civ, a.resource, a.amount, true)
          : c.resources[a.resource] < a.amount
      )
        return "Insufficient funds or resources.";
    } else {
      const resource = a.type === "trade" ? a.give : a.resource;
      if (c.resources[resource] < a.amount)
        return "You cannot send resources you do not have.";
      if (a.type === "trade") {
        const other = s.civs[a.target];
        if (a.give === a.receive) return "Choose two different resources.";
        if (other.resources[a.receive] < a.amount)
          return "Your partner does not have that stock.";
        if (other.embargo === a.receive || c.embargo === a.give)
          return "An embargo blocks this deal.";
        if (
          s.mode === "solo" &&
          a.target !== s.player &&
          (other.relations[a.civ] < 25 ||
            s.prices[a.give] * 1.4 < s.prices[a.receive])
        )
          return "Partner declines: improve relations or offer a more valuable resource.";
        if (
          (a.civ === "petrostate" || a.target === "petrostate") &&
          s.civs.archipelago.shipping === "block"
        )
          return "Blocked shipping prevents this exchange.";
      }
    }
  }
  if (a.type === "embargo" && a.resource === "money")
    return "Credits cannot be embargoed.";
  if (a.type === "shipping" && a.civ !== "archipelago")
    return "Only the Tidehaven controls the strait.";
  if (a.type === "divert" && a.civ !== "heartland")
    return "Only Highland Hold controls the headwaters.";
  if (
    a.type === "forecast" &&
    (a.civ !== "enclave" || s.forecast !== "private")
  )
    return "Only Verdant Reach can publish its private forecast once per decade.";
  if (a.type === "opensource" || a.type === "license") {
    if (!c.techs.includes(a.tech)) return "Research the technology first.";
    if (
      a.type === "opensource" &&
      CIV_IDS.every((id) => s.civs[id].techs.includes(a.tech))
    )
      return "Every civilization already has this technology.";
    if (
      a.type === "license" &&
      (s.civs[a.target].techs.includes(a.tech) ||
        s.civs[a.target].resources.money < 10)
    )
      return "Partner already owns this technology or cannot pay 10 credits.";
  }
  if (a.type === "accord" && c.accord)
    return "Your civilization has already signed.";
  return null;
}
export function applyAction(
  state: GameState,
  a: Action,
): { state: GameState; error: string | null } {
  const error = actionError(state, a);
  if (error) return { state, error };
  const s = clone(state),
    c = s.civs[a.civ],
    name = CIVS[a.civ].name,
    cid = cause(s);
  if (a.type !== "forecast") c.ap--;
  switch (a.type) {
    case "build": {
      const t = s.tiles.find((t) => t.id === a.tile)!;
      pay(s, a.civ, BUILDINGS[a.building].cost);
      t.building = a.building;
      t.hp = 100;
      t.buildingCause = cid;
      news(
        s,
        `${name} builds ${BUILDINGS[a.building].name}`,
        BUILDINGS[a.building].description,
        "good",
        cid,
      );
      break;
    }
    case "research":
      c.resources.innovation -= techCost(s, a.civ, a.tech);
      c.techs.push(a.tech);
      news(
        s,
        `${name} unlocks ${TECHS[a.tech].name}`,
        TECHS[a.tech].description,
        "good",
        cid,
      );
      break;
    case "repair": {
      const t = s.tiles.find((t) => t.id === a.tile)!;
      pay(s, a.civ, { money: a.civ === "archipelago" ? 3 : 6, materials: 2 });
      t.hp = 100;
      t.disruption = 0;
      t.effect = undefined;
      news(
        s,
        `${name} restores a region`,
        "Infrastructure is repaired and production resumes.",
        "good",
        cid,
      );
      break;
    }
    case "convert": {
      const t = s.tiles.find((t) => t.id === a.tile)!;
      pay(s, a.civ, { money: 6, materials: 2 });
      const old = t.terrain;
      t.terrain =
        old === "oil" ? "desert" : old === "mangrove" ? "urban" : "farmland";
      s.climate += old === "oil" ? -0.08 : 0.12;
      if (old === "mangrove") s.ocean -= 4;
      if (old === "forest") c.resources.materials += 5;
      news(
        s,
        `${name} converts ${TERRAIN[old].name}`,
        old === "oil"
          ? "A fossil field is decommissioned. Build solar to replace its energy."
          : "Yields rise immediately, but a natural hazard buffer is lost.",
        "info",
        cid,
      );
      break;
    }
    case "market": {
      const quote = marketQuote(s, a.civ, a.resource, a.amount, a.buy);
      c.resources[a.resource] += a.buy ? a.amount : -a.amount;
      c.resources.money += a.buy ? -quote : quote;
      s.marketStock[a.resource] += a.buy ? -a.amount : a.amount;
      s.prices[a.resource] = round2(
        clamp(
          s.prices[a.resource] *
            (a.buy ? 1 + a.amount / 180 : 1 - a.amount / 220),
          0.5,
          15,
        ),
      );
      if (
        !a.buy &&
        a.civ === "petrostate" &&
        s.civs.archipelago.shipping === "tax"
      )
        s.civs.archipelago.resources.money += quote * 0.2;
      news(
        s,
        `${name} ${a.buy ? "imports" : "exports"} ${a.amount} ${a.resource}`,
        `${quote.toFixed(1)} credits exchanged. Market inventories and prices respond to the order.`,
        "info",
        cid,
      );
      break;
    }
    case "trade": {
      exchange(s, a.civ, a.target, a.give, a.receive, a.amount);
      s.trust += 2;
      c.relations[a.target] += 4;
      s.civs[a.target].relations[a.civ] += 4;
      if (a.recurring)
        s.deals.push({
          id: cid,
          from: a.civ,
          to: a.target,
          give: a.give,
          receive: a.receive,
          amount: a.amount,
          remaining: 2,
        });
      news(
        s,
        `${name} signs a trade deal with ${CIVS[a.target].name}`,
        `${a.amount} ${a.give} for ${a.amount} ${a.receive}${a.recurring ? ", repeated for two more decades" : ""}.`,
        "good",
        cid,
      );
      break;
    }
    case "aid":
      c.resources[a.resource] -= a.amount;
      s.civs[a.target].resources[a.resource] += a.amount;
      s.civs[a.target].aided = true;
      s.civs[a.target].wellbeing += 3;
      s.civs[a.target].relations[a.civ] += 12;
      s.trust += c.techs.includes("response") ? 10 : 5;
      news(
        s,
        `${name} lends a helping hand`,
        `${CIVS[a.target].name} receives ${a.amount} ${a.resource} and a 50/50 response lifeline.`,
        "good",
        cid,
      );
      break;
    case "embargo":
      c.embargo = c.embargo === a.resource ? undefined : a.resource;
      s.trust += c.embargo ? -8 : 3;
      news(
        s,
        `${name} ${c.embargo ? "withholds" : "releases"} ${a.resource}`,
        "Reduced supply raises prices. Withholding critical resources damages global trust.",
        "bad",
        cid,
      );
      break;
    case "tariff":
      c.tariff = c.tariff === a.target ? undefined : a.target;
      s.civs[a.target].relations[a.civ] -= 8;
      s.trust -= 3;
      news(
        s,
        `${name} changes its carbon tariff`,
        `${CIVS[a.target].name} exports face a 25% discount while the tariff is active.`,
        "info",
        cid,
      );
      break;
    case "shipping":
      c.shipping = a.policy;
      s.trust += a.policy === "open" ? 3 : -6;
      s.civs.petrostate.relations[a.civ] += a.policy === "open" ? 8 : -12;
      news(
        s,
        `${name}: shipping ${a.policy}`,
        a.policy === "block"
          ? "Forge Dominion exports and bilateral shipments are blocked."
          : a.policy === "tax"
            ? "Forge Dominion market exports pay an island transit levy."
            : "The strait is open for trade.",
        "info",
        cid,
      );
      break;
    case "divert":
      c.diversion = !c.diversion;
      s.trust += c.diversion ? -6 : 3;
      s.civs.enclave.relations[a.civ] += c.diversion ? -10 : 5;
      news(
        s,
        `${name} ${c.diversion ? "diverts" : "restores"} river water`,
        "Upstream diversion improves local water stocks but reduces delta water yield and drains the aquifer.",
        "info",
        cid,
      );
      break;
    case "opensource":
      for (const id of CIV_IDS)
        if (!s.civs[id].techs.includes(a.tech)) s.civs[id].techs.push(a.tech);
      s.trust += 10;
      news(
        s,
        `${name} opens ${TECHS[a.tech].name} to the world`,
        "Every civilization gains the technology. Climate benefits come from using it.",
        "good",
        cid,
      );
      break;
    case "license":
      s.civs[a.target].resources.money -= 10;
      c.resources.money += 10;
      s.civs[a.target].techs.push(a.tech);
      s.trust += 2;
      news(
        s,
        `${name} licenses ${TECHS[a.tech].name}`,
        `${CIVS[a.target].name} pays 10 credits for the technology.`,
        "good",
        cid,
      );
      break;
    case "accord":
      c.accord = true;
      s.trust += 4;
      news(
        s,
        `${name} signs the Concordat`,
        "All four signatures, no coercive policies, and low emissions for three consecutive decades earn a shared victory.",
        "good",
        cid,
      );
      break;
    case "forecast":
      s.forecast = a.policy;
      s.trust += a.policy === "shared" ? 5 : a.policy === "hidden" ? -4 : -1;
      if (a.policy === "sold") c.resources.money += 8;
      news(
        s,
        `${name} ${a.policy === "shared" ? "shares" : a.policy === "sold" ? "sells" : "withholds"} the outlook`,
        "The forecast describes probabilities, not guarantees. Geological hazards do not scale with warming.",
        "info",
        cid,
      );
      break;
  }
  bound(s);
  return { state: s, error: null };
}
function exchange(
  s: GameState,
  from: CivId,
  to: CivId,
  give: Resource,
  receive: Resource,
  amount: number,
) {
  s.civs[from].resources[give] -= amount;
  s.civs[to].resources[give] += amount;
  s.civs[to].resources[receive] -= amount;
  s.civs[from].resources[receive] += amount;
}

export function hazardProbability(s: GameState, type: DisasterId, civ: CivId) {
  const d = DISASTERS[type];
  if (!d.regions.includes(civ)) return 0;
  let p = d.base * (d.climateDriven ? 1 + s.climate * 0.65 : 1);
  if (type === "spill" || type === "smog")
    p *=
      s.civs[civ].emissions > 0
        ? 1 +
          s.tiles.filter((t) => t.owner === civ && t.building === "rig")
            .length *
            0.8
        : 0;
  if (type === "drought") p *= 1 + (100 - s.aquifer) / 100;
  return Math.min(0.55, p);
}
function vulnerable(tile: Tile, type: DisasterId) {
  if (["earthquake"].includes(type)) return tile.fault;
  if (["hurricane", "tsunami", "sea_rise"].includes(type)) return tile.coastal;
  if (["flood", "dam_failure"].includes(type))
    return ["farmland", "delta", "wetland"].includes(tile.terrain);
  if (type === "landslide")
    return ["mountain", "delta", "wetland"].includes(tile.terrain);
  if (type === "drought")
    return ["farmland", "desert", "delta"].includes(tile.terrain);
  if (type === "wildfire")
    return ["forest", "farmland", "urban"].includes(tile.terrain);
  if (type === "spill") return tile.coastal || tile.terrain === "sea";
  if (type === "grid_failure" || type === "heatwave" || type === "pandemic")
    return tile.terrain === "urban" || !!tile.building;
  return tile.terrain !== "sea";
}
function mitigation(s: GameState, civ: CivId, type: DisasterId) {
  const c = s.civs[civ],
    owned = s.tiles.filter((t) => t.owner === civ && t.hp > 0 && !t.disruption);
  let m = 1;
  if (c.techs.includes("forecast")) m *= 0.85;
  if (type === "earthquake" && c.techs.includes("seismic")) m *= 0.5;
  if (type === "drought") {
    if (c.techs.includes("irrigation")) m *= 0.7;
    if (c.techs.includes("crops")) m *= 0.6;
  }
  if (type === "heatwave" && c.techs.includes("crops")) m *= 0.6;
  if (
    ["heatwave", "grid_failure"].includes(type) &&
    (c.techs.includes("storage") || owned.some((t) => t.building === "storage"))
  )
    m *= 0.65;
  if (
    ["drought", "supply_shock"].includes(type) &&
    owned.some((t) => t.building === "reserve")
  )
    m *= 0.65;
  if (type === "spill" && c.techs.includes("ecology")) m *= 0.7;
  if (type === "wildfire" && c.techs.includes("soil")) m *= 0.8;
  return m;
}
function applyDamage(
  s: GameState,
  h: Hazard,
  civ: CivId,
  amount: number,
  pending: Hazard[],
) {
  const d = DISASTERS[h.type],
    c = s.civs[civ],
    power = amount * mitigation(s, civ, h.type);
  const tiles = s.tiles.filter((t) => t.owner === civ && vulnerable(t, h.type));
  if (tiles.length === 0 || power < 0.25) return;
  const count = Math.min(tiles.length, Math.max(1, Math.ceil(power / 4)));
  const ordered = [...tiles].sort((a, b) =>
    a.building === "dam"
      ? -1
      : b.building === "dam"
        ? 1
        : a.id.localeCompare(b.id),
  );
  const losses: Partial<Stock> = {};
  for (const r of RESOURCES) {
    const lost = Math.min(c.resources[r], (d.losses[r] ?? 0) * power);
    losses[r] = lost;
    c.resources[r] -= lost;
  }
  const shelter = s.tiles.some(
    (t) => t.owner === civ && t.building === "shelter" && t.hp > 0,
  );
  c.wellbeing -= power * (shelter ? 0.5 : 1);
  const duration = Math.max(
    0,
    (power > 12 ? 3 : power > 6 ? 2 : 1) -
      (c.techs.includes("response") ? 1 : 0),
  );
  for (const t of ordered.slice(0, count)) {
    t.disruption = Math.max(t.disruption, duration);
    t.effect = h.type;
    if (t.building)
      t.hp = Math.max(0, t.hp - power * (h.type === "earthquake" ? 9 : 4));
    if (h.type === "earthquake" && t.building === "dam" && t.hp < 35) {
      const chainCause = t.buildingCause ?? h.causeId;
      t.building = undefined;
      t.hp = 100;
      pending.push({
        id: cause(s),
        type: "dam_failure",
        source: civ,
        amount: amount * 1.7,
        causeId: chainCause,
      });
      news(
        s,
        "Fault → dam failure → downstream flood",
        `${CIVS[civ].name}’s dam failed under shaking. Stored water becomes a new river hazard, attributed to the dam’s construction.`,
        "bad",
        chainCause,
      );
    }
  }
  if (h.type === "spill") s.ocean -= power * 0.9;
  if (h.type === "wildfire") s.climate += power * 0.005;
  if (h.type === "drought") s.aquifer -= power;
  s.damages.push({
    civ,
    type: h.type,
    severity: power,
    losses,
    tileIds: ordered.slice(0, count).map((t) => t.id),
    causeId: h.causeId,
  });
  news(
    s,
    `${d.name} hits ${CIVS[civ].name}`,
    `${count} region${count === 1 ? "" : "s"} disrupted for up to ${duration} decade${duration === 1 ? "" : "s"}. ${d.mitigation}`,
    "bad",
    h.causeId,
  );
}
// Each region accounts for every unit: impact + stored/buffered + sent + dissipated.
// Outgoing edge weights are normalized, so branching never creates extra hazard mass.
export function propagate(s: GameState, initial: Hazard[]) {
  const pending = [...initial];
  while (pending.length) {
    const h = pending.shift()!,
      def = DISASTERS[h.type];
    const queue: Array<{
      civ: CivId;
      amount: number;
      visited: CivId[];
      causeId: string;
    }> = [{ civ: h.source, amount: h.amount, visited: [], causeId: h.causeId }];
    while (queue.length) {
      const { civ, amount, visited, causeId } = queue.shift()!;
      const owned = s.tiles.filter((t) => t.owner === civ);
      const buffer =
        def.carrier === "river"
          ? owned.filter((t) => t.terrain === "wetland").length * 0.12
          : def.carrier === "wind"
            ? owned.filter((t) => t.terrain === "forest").length * 0.06
            : def.carrier === "coast"
              ? owned.filter((t) => t.terrain === "mangrove").length * 0.12
              : 0;
      const barrier = owned.find(
        (t) =>
          t.hp > 0 &&
          (def.carrier === "river"
            ? t.building === "levee"
            : def.carrier === "coast"
              ? t.building === "seawall"
              : false),
      );
      const buffered = amount * Math.min(0.55, buffer);
      const available = amount - buffered;
      let edges = EDGES.filter((e) => e.carrier === def.carrier)
        .map((e) =>
          def.carrier === "wind" && s.wind === "EW"
            ? { ...e, from: e.to, to: e.from }
            : e,
        )
        .filter((e) => e.from === civ && ![...visited, civ].includes(e.to));
      if (def.carrier === "local") edges = [];
      const impact =
        available *
        (edges.length ? (barrier ? 0.2 : 0.55) : barrier ? 0.25 : 1);
      const remainder = available - impact;
      applyDamage(s, { ...h, causeId }, civ, impact, pending);
      let transmitted = 0,
        dissipated = 0;
      const totalWeight = edges.reduce((sum, e) => sum + e.weight, 0);
      for (const e of edges) {
        const allocated = (remainder * e.weight) / totalWeight;
        const sent = allocated * (1 - e.decay);
        dissipated += allocated - sent;
        if (sent < 0.25) {
          dissipated += sent;
          continue;
        }
        transmitted += sent;
        const nextCause = barrier?.buildingCause ?? causeId;
        const caption = `${CIVS[civ].name}${barrier ? "’s " + BUILDINGS[barrier.building!].name + " redirects" : " →"} ${sent.toFixed(1)} ${def.name.toLowerCase()} → ${CIVS[e.to].name}`;
        s.flows.push({
          id: cause(s),
          from: civ,
          to: e.to,
          carrier: e.carrier,
          type: h.type,
          amount: sent,
          causeId: nextCause,
          caption,
        });
        queue.push({
          civ: e.to,
          amount: sent,
          visited: [...visited, civ],
          causeId: nextCause,
        });
      }
      if (!edges.length) dissipated += remainder;
      s.ledgers.push({
        hazardId: h.id,
        region: civ,
        incoming: amount,
        impact,
        buffered,
        transmitted,
        dissipated,
      });
    }
  }
  bound(s);
}
function processDeals(s: GameState) {
  s.deals = s.deals.filter((deal) => {
    const a = s.civs[deal.from],
      b = s.civs[deal.to];
    if (
      a.resources[deal.give] < deal.amount ||
      b.resources[deal.receive] < deal.amount ||
      a.embargo === deal.give ||
      b.embargo === deal.receive ||
      ((deal.from === "petrostate" || deal.to === "petrostate") &&
        s.civs.archipelago.shipping === "block")
    ) {
      s.trust -= 6;
      a.relations[deal.to] -= 8;
      b.relations[deal.from] -= 8;
      news(
        s,
        "A recurring trade agreement breaks",
        `${CIVS[deal.from].name} and ${CIVS[deal.to].name} could not honor their shipment. Trust falls.`,
        "bad",
        deal.id,
      );
      return false;
    }
    exchange(s, deal.from, deal.to, deal.give, deal.receive, deal.amount);
    s.trust += 2;
    deal.remaining--;
    return deal.remaining > 0;
  });
}
function updateMarket(s: GameState) {
  const bases = stock({
    food: 2,
    water: 2,
    energy: 2.5,
    materials: 3,
    money: 1,
    innovation: 4,
  });
  for (const r of RESOURCES.filter((r) => r !== "money")) {
    const supply = CIV_IDS.reduce(
      (n, id) =>
        n +
        (s.civs[id].embargo === r
          ? 0
          : Math.max(0, projectedIncome(s, id)[r]) *
            (id === "petrostate" && s.civs.archipelago.shipping === "block"
              ? 0
              : 1)),
      0,
    );
    const scarcity = CIV_IDS.reduce(
      (n, id) => n + (s.civs[id].resources[r] < 8 ? 1 : 0),
      0,
    );
    const embargoes = CIV_IDS.filter((id) => s.civs[id].embargo === r).length;
    const shock = s.damages.reduce((n, d) => n + (d.losses[r] ?? 0), 0);
    s.marketStock[r] = clamp(
      s.marketStock[r] + supply * 0.7 - 8 - shock * 0.15,
      0,
      160,
    );
    const target =
      bases[r] *
      (1 +
        scarcity * 0.2 +
        embargoes * 0.4 +
        shock / 35 +
        (60 - s.marketStock[r]) / 100);
    s.prices[r] = round2(clamp(s.prices[r] * 0.6 + target * 0.4, 0.5, 15));
  }
  s.priceHistory.push({ ...s.prices });
}
export function resolveRound(
  state: GameState,
  forced?: Array<{ type: DisasterId; source: CivId; amount: number }>,
): GameState {
  if (state.phase !== "planning") return state;
  let s = clone(state);
  if (s.mode === "solo") s = runBots(s);
  s.flows = [];
  s.ledgers = [];
  s.damages = [];
  s.quizzes = [];
  processDeals(s);
  s.wind = random(s) < 0.25 ? "EW" : "WE";
  const hazards: Hazard[] = [];
  if (forced)
    for (const h of forced) {
      const id = cause(s);
      hazards.push({ ...h, id, causeId: id });
    }
  else
    for (const [type, def] of Object.entries(DISASTERS))
      for (const civ of def.regions)
        if (random(s) < hazardProbability(s, type as DisasterId, civ)) {
          const id = cause(s);
          const amount =
            8 + random(s) * 15 + (def.climateDriven ? s.climate * 2 : 0);
          hazards.push({
            id,
            type: type as DisasterId,
            source: civ,
            amount,
            causeId: id,
          });
          // Offshore seismic displacement is a probabilistic cascade, not every quake.
          if (type === "earthquake" && amount > 18 && random(s) < 0.45)
            hazards.push({
              id: cause(s),
              type: "tsunami",
              source: civ,
              amount: amount * 0.8,
              causeId: id,
            });
        }
  propagate(s, hazards);
  updateMarket(s);
  if (!hazards.length)
    news(
      s,
      "A quiet decade, not a safe planet",
      "No major disaster this decade. Invest in prevention while the world gives you breathing room.",
      "good",
    );
  for (const id of CIV_IDS) {
    const hit = s.damages
      .filter((d) => d.civ === id)
      .sort((a, b) => b.severity - a.severity)[0];
    if (!hit) continue;
    const pool = QUESTIONS.filter(
      (q) => q.types.includes(hit.type) && !s.usedQuestions.includes(q.id),
    );
    const count = hit.severity > 6 ? 3 : 2;
    // Choose without replacement; exhausted pools never repeat within a game.
    const selected: Question[] = [];
    while (pool.length && selected.length < count)
      selected.push(pool.splice(Math.floor(random(s) * pool.length), 1)[0]);
    if (selected.length) {
      s.usedQuestions.push(...selected.map((q) => q.id));
      s.quizzes.push({
        civ: id,
        type: hit.type,
        questions: selected.map((q) => q.id),
        answers: [],
        lifelineUsed: false,
      });
    }
  }
  s.phase = "flows";
  bound(s);
  return s;
}
export function advanceFlows(state: GameState): GameState {
  if (state.phase !== "flows") return state;
  let s = clone(state);
  s.phase = s.quizzes.length ? "quiz" : "debrief";
  if (s.mode === "solo") {
    for (const session of s.quizzes.filter((q) => q.civ !== s.player)) {
      for (const id of session.questions) {
        const q = QUESTIONS.find((item) => item.id === id)!;
        const correct = random(s) < (session.civ === "enclave" ? 0.8 : 0.65);
        const ms = Math.floor(4000 + random(s) * 9000);
        s = answerQuiz(
          s,
          session.civ,
          correct ? q.correct : (q.correct + 1) % 4,
          ms,
        );
      }
    }
  }
  return s;
}
export function answerQuiz(
  state: GameState,
  civ: CivId,
  option: number,
  ms: number,
  lifeline = false,
): GameState {
  if (state.phase !== "quiz") return state;
  const s = clone(state),
    session = s.quizzes.find((q) => q.civ === civ && !q.tier);
  if (!session) return state;
  const q = QUESTIONS.find(
    (q) => q.id === session.questions[session.answers.length],
  );
  if (!q) return state;
  session.lifelineUsed ||= lifeline;
  session.answers.push({
    questionId: q.id,
    correct: option === q.correct && ms <= 15000,
    ms,
  });
  if (session.answers.length === session.questions.length) {
    const correct = session.answers.filter((a) => a.correct).length;
    session.tier =
      correct === session.answers.length &&
      session.answers.filter((a) => a.ms < 8000).length >=
        Math.ceil(session.answers.length / 2)
        ? "rapid"
        : correct > session.answers.length / 2
          ? "solid"
          : "slow";
    const reduction =
      session.tier === "rapid" ? 2 : session.tier === "solid" ? 1 : 0;
    const refund =
      session.tier === "rapid" ? 0.25 : session.tier === "solid" ? 0.1 : 0;
    const damaged = new Set<string>();
    for (const d of s.damages.filter((d) => d.civ === civ)) {
      for (const r of RESOURCES)
        s.civs[civ].resources[r] += (d.losses[r] ?? 0) * refund;
      d.tileIds.forEach((id) => damaged.add(id));
    }
    for (const t of s.tiles.filter((t) => damaged.has(t.id)))
      t.disruption = Math.max(0, t.disruption - reduction);
    news(
      s,
      `${CIVS[civ].name}: ${session.tier} response`,
      `${correct}/${session.answers.length} correct. Disruption reduced by ${reduction}; ${(refund * 100).toFixed(0)}% of resource losses recovered. Hazard flows remain unchanged.`,
      refund ? "good" : "info",
    );
  }
  if (s.quizzes.every((q) => q.tier)) s.phase = "debrief";
  bound(s);
  return s;
}
function snapshot(s: GameState) {
  s.history.push({
    round: s.round,
    climate: s.climate,
    ocean: s.ocean,
    trust: s.trust,
    prices: { ...s.prices },
  });
}
export function nextRound(state: GameState): GameState {
  if (state.phase !== "debrief") return state;
  const s = clone(state);
  const compliant = CIV_IDS.every((id) => {
    const c = s.civs[id];
    return (
      c.accord &&
      !c.embargo &&
      !c.tariff &&
      c.shipping === "open" &&
      !c.diversion &&
      c.emissions < 0.1
    );
  });
  s.accordStreak = compliant ? s.accordStreak + 1 : 0;
  if (s.climate >= 3 || s.accordStreak >= 3 || s.round >= 10) {
    s.phase = "ended";
    s.outcome =
      s.climate >= 3
        ? "collapse"
        : s.accordStreak >= 3
          ? "concordat"
          : "prosperity";
    snapshot(s);
    return s;
  }
  // Current disruption is consumed by the next income step before decrementing.
  s.round++;
  income(s);
  for (const t of s.tiles) {
    t.disruption = Math.max(0, t.disruption - 1);
    if (!t.disruption) t.effect = undefined;
  }
  for (const id of CIV_IDS) {
    s.civs[id].ap = 3;
    s.civs[id].aided = false;
  }
  s.phase = "planning";
  s.forecast = "private";
  s.flows = [];
  s.damages = [];
  s.quizzes = [];
  snapshot(s);
  if (s.climate >= 3) {
    s.phase = "ended";
    s.outcome = "collapse";
  }
  return s;
}
export function score(s: GameState, id: CivId) {
  const c = s.civs[id];
  // Fixed valuations avoid rewarding an embargo-induced endgame price spike.
  const inventory =
    Math.min(c.resources.food, 100) * 0.8 +
    Math.min(c.resources.water, 80) * 0.7 +
    Math.min(c.resources.energy, 80) * 0.7 +
    Math.min(c.resources.materials, 100) * 1.1;
  const infrastructure = s.tiles
    .filter((t) => t.owner === id && t.building && t.hp > 0)
    .reduce((n, t) => n + (6 * t.hp) / 100, 0);
  return Math.round(
    (c.resources.money +
      c.wellbeing * 2 +
      c.population * 3 +
      c.techs.length * 8 +
      infrastructure +
      inventory) *
      Math.max(0.2, 1 - c.emissions * 2) *
      (0.5 + s.ocean / 200),
  );
}
export function runBots(state: GameState): GameState {
  let s = state;
  for (const id of CIV_IDS.filter((id) => id !== s.player)) {
    if (id === "enclave" && s.forecast === "private")
      s = applyAction(s, {
        type: "forecast",
        civ: id,
        policy: s.trust < 35 ? "sold" : "shared",
      }).state;
    for (let turn = 0; turn < 3 && s.civs[id].ap > 0; turn++) {
      const c = s.civs[id];
      const actions: Action[] = [];
      const essentials: Resource[] = ["food", "water", "energy"];
      for (const r of essentials)
        if (
          c.resources[r] < 8 ||
          c.resources[r] + projectedIncome(s, id)[r] < 4
        )
          actions.push({
            type: "market",
            civ: id,
            resource: r,
            amount: 8,
            buy: true,
          });
      const broken = s.tiles.find(
        (t) => t.owner === id && (t.hp < 65 || t.disruption > 1),
      );
      if (broken) actions.push({ type: "repair", civ: id, tile: broken.id });
      if (
        id === "archipelago" &&
        s.civs.petrostate.emissions > 0.12 &&
        c.relations.petrostate < 50 &&
        c.shipping === "open"
      )
        actions.push({ type: "shipping", civ: id, policy: "tax" });
      if (
        id === "archipelago" &&
        s.civs.petrostate.emissions > 0.12 &&
        c.relations.petrostate < 25 &&
        s.climate > 1 &&
        c.shipping === "tax"
      )
        actions.push({ type: "shipping", civ: id, policy: "block" });
      if (
        id === "archipelago" &&
        s.civs.petrostate.emissions < 0.08 &&
        c.shipping !== "open"
      )
        actions.push({ type: "shipping", civ: id, policy: "open" });
      if (
        id === "enclave" &&
        s.climate > 1.1 &&
        s.civs.petrostate.emissions > 0.12 &&
        !c.tariff
      )
        actions.push({ type: "tariff", civ: id, target: "petrostate" });
      if (id === "enclave" && c.tariff && s.civs[c.tariff].emissions < 0.08)
        actions.push({ type: "tariff", civ: id, target: c.tariff });
      if (
        id === "petrostate" &&
        c.relations.archipelago < 30 &&
        !c.embargo &&
        c.resources.energy > 30 &&
        s.round > 2
      )
        actions.push({ type: "embargo", civ: id, resource: "energy" });
      if (
        id === "petrostate" &&
        c.embargo &&
        (c.relations.archipelago > 50 || c.resources.money < 10)
      )
        actions.push({ type: "embargo", civ: id, resource: c.embargo });
      const victim = CIV_IDS.find(
        (other) =>
          other !== id &&
          s.civs[other].wellbeing < 55 &&
          c.relations[other] > 45,
      );
      if (victim && c.resources.food > 20)
        actions.push({
          type: "aid",
          civ: id,
          target: victim,
          resource: "food",
          amount: 5,
        });
      if (s.round >= 6 && s.trust > 58 && !c.accord && c.emissions < 0.1)
        actions.push({ type: "accord", civ: id });
      const branch =
        id === "petrostate"
          ? ["solar", "storage", "carbon"]
          : id === "heartland"
            ? ["irrigation", "soil", "crops"]
            : id === "enclave"
              ? ["water", "urban", "forecast"]
              : ["seismic", "ecology", "response"];
      for (const tech of branch)
        if (!c.techs.includes(tech))
          actions.push({ type: "research", civ: id, tech });
      const priorities =
        id === "petrostate"
          ? ["solar", "wind", "restoration"]
          : id === "heartland"
            ? ["restoration", "farm", "wind"]
            : id === "enclave"
              ? ["vertical", "desal", "storage", "lab"]
              : ["geothermal", "restoration", "shelter"];
      for (const building of priorities) {
        const tile = s.tiles.find(
          (t) =>
            t.owner === id &&
            !t.building &&
            !t.disruption &&
            BUILDINGS[building].terrains.includes(t.terrain),
        );
        if (tile)
          actions.push({ type: "build", civ: id, tile: tile.id, building });
      }
      if (id === "petrostate" && c.techs.includes("solar")) {
        const oil = s.tiles.find(
          (t) => t.owner === id && t.terrain === "oil" && !t.building,
        );
        if (oil) actions.push({ type: "convert", civ: id, tile: oil.id });
      }
      for (const r of RESOURCES.filter((r) => r !== "money"))
        if (c.resources[r] > 25)
          actions.push({
            type: "market",
            civ: id,
            resource: r,
            amount: 10,
            buy: false,
          });
      const chosen = actions.find((a) => !actionError(s, a));
      if (!chosen) break;
      s = applyAction(s, chosen).state;
    }
  }
  return s;
}
export function demoGame(): GameState {
  let s = createGame("heartland", "hotseat", 42);
  s = applyAction(s, {
    type: "build",
    civ: "heartland",
    tile: "t4-0",
    building: "dam",
  }).state;
  s = applyAction(s, {
    type: "build",
    civ: "enclave",
    tile: "t7-3",
    building: "seawall",
  }).state;
  s = applyAction(s, {
    type: "build",
    civ: "petrostate",
    tile: "t0-3",
    building: "rig",
  }).state;
  return resolveRound(s, [
    { type: "earthquake", source: "archipelago", amount: 36 },
    { type: "spill", source: "petrostate", amount: 22 },
    { type: "hurricane", source: "enclave", amount: 24 },
  ]);
}
