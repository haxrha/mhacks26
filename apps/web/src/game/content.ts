import { clone } from "./clone";
import civData from "../../../../src/data/civs.json";
import buildingData from "../../../../src/data/buildings.json";
import techData from "../../../../src/data/techs.json";
import terrainData from "../../../../src/data/terrain.json";
import eventData from "../../../../src/data/events.json";
import edgeData from "../../../../src/data/edges.json";
import resourceData from "../../../../src/data/resources.json";
import mapData from "../../../../src/data/map.json";
import {
  type Carrier,
  type CivId,
  type DisasterId,
  type Edge,
  type Resource,
  type Stock,
  type Terrain,
  type Tile,
} from "./types";
export const stock = (values: Partial<Stock> = {}): Stock => ({
  food: 0,
  water: 0,
  energy: 0,
  materials: 0,
  money: 0,
  innovation: 0,
  ...values,
});
export interface BuildingDef {
  name: string;
  icon: string;
  cost: Partial<Stock>;
  yields: Partial<Stock>;
  terrains: Terrain[];
  description: string;
  tech?: string;
  civ?: CivId;
  emissions?: number;
}
export interface DisasterDef {
  name: string;
  icon: string;
  carrier: Carrier;
  base: number;
  climateDriven: boolean;
  regions: CivId[];
  losses: Partial<Stock>;
  color: string;
  lesson: string;
  mitigation: string;
  source: string;
}
export const RESOURCE_META = resourceData as Record<
  Resource,
  { name: string; icon: string; color: string }
>;
export const CIVS = civData as Record<
  CivId,
  {
    name: string;
    title: string;
    color: string;
    crest: string;
    description: string;
    strength: string;
    weakness: string;
    rate: number;
    start: Stock;
  }
>;
export const TERRAIN = terrainData as Record<
  Terrain,
  {
    name: string;
    color: string;
    glyph: string;
    yield: Partial<Stock>;
    note: string;
  }
>;
export const BUILDINGS = buildingData as Record<string, BuildingDef>;
export const TECHS = techData as Record<
  string,
  {
    name: string;
    branch: string;
    cost: number;
    requires?: string;
    description: string;
    affinity: CivId;
  }
>;
export const DISASTERS = eventData as Record<DisasterId, DisasterDef>;
export const EDGES = edgeData as Edge[];
export const createTiles = (): Tile[] => clone(mapData) as Tile[];
