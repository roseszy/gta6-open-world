// Solmar Heat — the city itself.
// Solmar City is a fixed grid: roads every 450 px, blocks between them holding
// pastel buildings, two parks, a plaza, a hospital, a police station and the
// docks. The layout is built once from a seed, so the city is the same on
// every visit. This module also answers the questions the rest of the game
// keeps asking: is this point on a road, inside a building, on a sidewalk?

import { WORLD_W, WORLD_H, ROAD_XS, ROAD_YS, ROAD_HALF, COLORS, PLACES } from './config.js';
import { mulberry32, pick, range, rangeInt, chance } from './rng.js';

const ROOFS = [COLORS.roofA, COLORS.roofB, COLORS.roofC, COLORS.roofD, COLORS.roofE];

export function buildCity(seed = 20261123) {
  const rand = mulberry32(seed);
  const buildings = [];
  const trees = [];
  const parks = [];
  const specials = {};

  // Blocks are the cells between neighbouring roads. A block spans from one
  // road's far edge to the next road's near edge.
  const blockXs = [];
  for (let i = 0; i < ROAD_XS.length - 1; i++) {
    blockXs.push({ x0: ROAD_XS[i] + ROAD_HALF + 14, x1: ROAD_XS[i + 1] - ROAD_HALF - 14 });
  }
  const blockYs = [];
  for (let j = 0; j < ROAD_YS.length - 1; j++) {
    blockYs.push({ y0: ROAD_YS[j] + ROAD_HALF + 14, y1: ROAD_YS[j + 1] - ROAD_HALF - 14 });
  }

  // Hand-picked special blocks so the missions have landmarks to point at.
  const specialBlocks = {
    '1,0': 'hospital', // block column 1, row 0
    '4,2': 'police', // police station
    '2,3': 'park', // central park
    '5,1': 'park', // east park
    '0,4': 'plaza', // west plaza
    '6,4': 'docks', // south-east docks
  };

  for (let bi = 0; bi < blockXs.length; bi++) {
    for (let bj = 0; bj < blockYs.length; bj++) {
      const bx = blockXs[bi];
      const by = blockYs[bj];
      const key = `${bi},${bj}`;
      const kind = specialBlocks[key] || 'buildings';
      const cx = (bx.x0 + bx.x1) / 2;
      const cy = (by.y0 + by.y1) / 2;

      if (kind === 'park') {
        parks.push({ x0: bx.x0, y0: by.y0, x1: bx.x1, y1: by.y1 });
        for (let t = 0; t < 14; t++) {
          trees.push({ x: range(rand, bx.x0 + 20, bx.x1 - 20), y: range(rand, by.y0 + 20, by.y1 - 20), r: range(rand, 9, 15) });
        }
        continue;
      }
      if (kind === 'plaza') {
        specials.plaza = { x: cx, y: cy, w: bx.x1 - bx.x0, h: by.y1 - by.y0 };
        for (let t = 0; t < 6; t++) {
          trees.push({ x: range(rand, bx.x0 + 24, bx.x1 - 24), y: range(rand, by.y0 + 24, by.y1 - 24), r: range(rand, 8, 12) });
        }
        continue;
      }
      if (kind === 'docks') {
        specials.docks = { x: cx, y: cy, w: bx.x1 - bx.x0, h: by.y1 - by.y0 };
        continue;
      }
      if (kind === 'hospital' || kind === 'police') {
        const w = Math.min(190, bx.x1 - bx.x0 - 40);
        const h = Math.min(130, by.y1 - by.y0 - 40);
        buildings.push({
          x: cx - w / 2, y: cy - h / 2, w, h,
          color: kind === 'hospital' ? COLORS.hospital : COLORS.police,
          special: kind,
        });
        specials[kind] = { x: cx, y: cy, w, h };
        continue;
      }

      // Ordinary block: one to four buildings, each with a roof colour.
      const count = chance(rand, 0.45) ? 1 : chance(rand, 0.6) ? 2 : 4;
      if (count === 1) {
        const w = range(rand, 170, bx.x1 - bx.x0 - 30);
        const h = range(rand, 130, by.y1 - by.y0 - 30);
        buildings.push({ x: cx - w / 2, y: cy - h / 2, w, h, color: pick(rand, ROOFS), special: null });
      } else if (count === 2) {
        const split = chance(rand, 0.5);
        for (let k = 0; k < 2; k++) {
          const w = split ? (bx.x1 - bx.x0) / 2 - 24 : range(rand, 130, bx.x1 - bx.x0 - 30);
          const h = split ? range(rand, 120, by.y1 - by.y0 - 30) : (by.y1 - by.y0) / 2 - 24;
          const x = split ? bx.x0 + 12 + k * ((bx.x1 - bx.x0) / 2) : cx - w / 2;
          const y = split ? cy - h / 2 : by.y0 + 12 + k * ((by.y1 - by.y0) / 2);
          buildings.push({ x, y, w, h, color: pick(rand, ROOFS), special: null });
        }
      } else {
        const cw = (bx.x1 - bx.x0) / 2 - 22;
        const ch = (by.y1 - by.y0) / 2 - 22;
        for (let kx = 0; kx < 2; kx++) {
          for (let ky = 0; ky < 2; ky++) {
            buildings.push({
              x: bx.x0 + 12 + kx * (cw + 20),
              y: by.y0 + 12 + ky * (ch + 20),
              w: cw, h: ch,
              color: pick(rand, ROOFS), special: null,
            });
          }
        }
      }
      // A street tree or two on ordinary blocks.
      if (chance(rand, 0.5)) {
        trees.push({ x: range(rand, bx.x0 + 16, bx.x1 - 16), y: range(rand, by.y0 + 16, by.y1 - 16), r: range(rand, 8, 12) });
      }
    }
  }

  // The beach: a sand strip with water along the whole east edge.
  const beach = { x0: 3440, x1: WORLD_W, waterX0: 3520 };

  return { buildings, trees, parks, specials, beach, blockXs, blockYs, seed };
}

// --- Queries the game asks about the city ---------------------------------

export function onRoad(city, x, y) {
  for (const rx of ROAD_XS) {
    if (Math.abs(x - rx) <= ROAD_HALF) return true;
  }
  for (const ry of ROAD_YS) {
    if (Math.abs(y - ry) <= ROAD_HALF) return true;
  }
  return false;
}

export function nearestRoadX(x) {
  let best = ROAD_XS[0];
  for (const rx of ROAD_XS) if (Math.abs(rx - x) < Math.abs(best - x)) best = rx;
  return best;
}

export function nearestRoadY(y) {
  let best = ROAD_YS[0];
  for (const ry of ROAD_YS) if (Math.abs(ry - y) < Math.abs(best - y)) best = ry;
  return best;
}

// Push a circle out of every building it overlaps. Returns true if it hit.
// True when no building stands between two points — sampled along the
// segment, so a shooter cannot fire through a warehouse wall.
export function hasLineOfSight(city, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const d = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(d / 10));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (collideBuildings(city, { x: x0 + dx * t, y: y0 + dy * t, r: 2 })) return false;
  }
  return true;
}

export function collideBuildings(city, circle) {
  let hit = false;
  for (const b of city.buildings) {
    const nx = Math.max(b.x, Math.min(circle.x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(circle.y, b.y + b.h));
    const dx = circle.x - nx;
    const dy = circle.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < circle.r * circle.r) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (circle.r - d) / d;
        circle.x += dx * push;
        circle.y += dy * push;
      } else {
        // Dead centre inside the building: shove out along the short axis.
        const left = circle.x - b.x;
        const right = b.x + b.w - circle.x;
        const top = circle.y - b.y;
        const bottom = b.y + b.h - circle.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) circle.x = b.x - circle.r;
        else if (m === right) circle.x = b.x + b.w + circle.r;
        else if (m === top) circle.y = b.y - circle.r;
        else circle.y = b.y + b.h + circle.r;
      }
    }
  }
  return hit;
}

export function pointInBuilding(city, x, y) {
  for (const b of city.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

// A random point on a road (for spawning traffic), away from buildings.
export function randomRoadPoint(rand) {
  if (chance(rand, 0.5)) {
    return { x: pick(rand, ROAD_XS) + range(rand, -28, 28), y: range(rand, 120, WORLD_H - 120), axis: 'y' };
  }
  return { x: range(rand, 120, WORLD_W - 120), y: pick(rand, ROAD_YS) + range(rand, -28, 28), axis: 'x' };
}

// A random point on a sidewalk beside a road (for pedestrians).
export function randomSidewalkPoint(rand) {
  if (chance(rand, 0.5)) {
    const rx = pick(rand, ROAD_XS);
    return { x: rx + (chance(rand, 0.5) ? ROAD_HALF + 12 : -ROAD_HALF - 12), y: range(rand, 120, WORLD_H - 120) };
  }
  const ry = pick(rand, ROAD_YS);
  return { x: range(rand, 120, WORLD_W - 120), y: ry + (chance(rand, 0.5) ? ROAD_HALF + 12 : -ROAD_HALF - 12) };
}

export function clampToWorld(p, margin = 30) {
  p.x = Math.max(margin, Math.min(WORLD_W - margin, p.x));
  p.y = Math.max(margin, Math.min(WORLD_H - margin, p.y));
}

export { PLACES };
