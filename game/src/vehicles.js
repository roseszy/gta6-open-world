// Solmar Heat — cars: the player's drive, the traffic and the police.
// One car object serves all three: a type from the roster, a position, an
// angle and a speed, plus a role that decides who steers it. Traffic follows
// the road grid and queues behind the car ahead; police chase the player and
// ram; the player's car answers the keys with drift on the handbrake.

import { CAR_TYPES, ROAD_XS, ROAD_YS, ROAD_HALF } from './config.js';
import { clamp, lerp, angleDiff, turnToward, dist2, liveRand, pick, range } from './rng.js';
import { collideBuildings, clampToWorld, randomRoadPoint } from './world.js';

export function makeCar(type, x, y, angle) {
  const def = CAR_TYPES[type];
  return {
    type,
    def,
    x, y,
    angle,
    speed: 0,
    color: pick(liveRand, def.colors),
    role: 'parked', // 'parked' | 'traffic' | 'police' | 'player'
    health: 100,
    cruise: range(liveRand, 70, 120),
    lane: 0,
    axis: 'x',
    dir: 1,
    stuckTimer: 0,
    reverseTimer: 0,
    smoke: 0,
  };
}

// A car drives on the right of its road: the lane offset follows the side
// of the road its direction of travel puts on the right.
export function laneOffset(axis, dir) {
  if (axis === 'x') return dir > 0 ? 22 : -22;
  return dir > 0 ? -22 : 22;
}

export function carRadius(car) {
  return car.def.len * 0.5;
}

// --- The player's car -------------------------------------------------------

export function updatePlayerCar(g, car, input, dt) {
  const def = car.def;
  const throttle = (input.down('KeyW') || input.down('ArrowUp')) ? 1 : 0;
  const braking = (input.down('KeyS') || input.down('ArrowDown')) ? 1 : 0;
  const steer = (input.down('KeyA') || input.down('ArrowLeft') ? -1 : 0)
    + (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0);

  if (throttle) car.speed += def.accel * dt;
  if (braking) {
    if (car.speed > 20) car.speed -= def.accel * 1.6 * dt;
    else car.speed -= def.reverse * dt * 0.9;
  }
  if (!throttle && !braking) {
    car.speed -= Math.sign(car.speed) * 90 * dt;
    if (Math.abs(car.speed) < 8) car.speed = 0;
  }
  if (input.handbrake) {
    car.speed -= Math.sign(car.speed) * 320 * dt;
    if (Math.abs(car.speed) < 12) car.speed = 0;
  }
  car.speed = clamp(car.speed, -def.reverse, def.topSpeed);

  const speed01 = Math.min(1, Math.abs(car.speed) / def.topSpeed);
  const steerAuthority = clamp(Math.abs(car.speed) / 90, 0, 1) * (car.speed < 0 ? -1 : 1);
  const turnRate = def.turn * (input.handbrake ? 1.7 : 1) * steerAuthority;
  car.angle += steer * turnRate * dt;

  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const before = { x: car.x, y: car.y };
  car.x = nx;
  car.y = ny;
  clampToWorld(car, 40);

  const probe = { x: car.x, y: car.y, r: car.def.wid * 0.62 };
  if (collideBuildings(g.city, probe)) {
    car.x = probe.x;
    car.y = probe.y;
    const impact = Math.abs(car.speed);
    if (impact > 140) {
      car.health -= (impact - 140) * 0.12;
      g.audio.crash();
      g.shake = Math.min(10, impact * 0.02);
      g.addParticles(car.x, car.y, 10, '#c9c9c9');
      if (car.health <= 0) car.smoke = 1;
    }
    car.speed *= 0.45;
  }

  // Skid marks when the handbrake is on at speed, or when turning hard fast.
  if ((input.handbrake && Math.abs(car.speed) > 120) || (Math.abs(steer) > 0 && speed01 > 0.75)) {
    const bx = car.x - Math.cos(car.angle) * car.def.len * 0.42;
    const by = car.y - Math.sin(car.angle) * car.def.len * 0.42;
    g.addSkid(bx, by, car.angle);
  }

  // Hitting a pedestrian while driving is a crime, and it hurts.
  for (const ped of g.peds) {
    if (ped.state === 'down') continue;
    const rr = car.def.wid * 0.6 + 10;
    if (dist2(car.x, car.y, ped.x, ped.y) < rr * rr && Math.abs(car.speed) > 40) {
      ped.state = 'down';
      ped.downTimer = 3;
      ped.vx = Math.cos(car.angle) * 220;
      ped.vy = Math.sin(car.angle) * 220;
      g.addParticles(ped.x, ped.y, 8, '#d83a2e');
      g.commitCrime('hitPed', ped.x, ped.y);
      car.speed *= 0.82;
    }
  }
  return Math.hypot(car.x - before.x, car.y - before.y);
}

// --- Traffic -----------------------------------------------------------------

export function spawnTraffic(g, count) {
  const types = ['sedan', 'sedan', 'taxi', 'van', 'sport', 'truck'];
  for (let i = 0; i < count; i++) {
    const p = randomRoadPoint(liveRand);
    const type = pick(liveRand, types);
    const car = makeCar(type, p.x, p.y, 0);
    car.role = 'traffic';
    car.axis = p.axis;
    car.dir = liveRand() < 0.5 ? 1 : -1;
    car.lane = laneOffset(car.axis, car.dir);
    car.angle = car.axis === 'x' ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    if (car.axis === 'x') car.y = nearestRoadYFor(car.y) + car.lane;
    else car.x = nearestRoadXFor(car.x) + car.lane;
    car.speed = car.cruise * range(liveRand, 0.7, 1);
    g.cars.push(car);
  }
}

function nearestRoadYFor(y) {
  let best = ROAD_YS[0];
  for (const ry of ROAD_YS) if (Math.abs(ry - y) < Math.abs(best - y)) best = ry;
  return best;
}
function nearestRoadXFor(x) {
  let best = ROAD_XS[0];
  for (const rx of ROAD_XS) if (Math.abs(rx - x) < Math.abs(best - x)) best = rx;
  return best;
}

// Is there a car ahead of `car` in its lane, within `range`?
function carAhead(g, car, rangePx) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let best = null;
  let bestD = rangePx;
  for (const other of g.cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const forward = dx * fx + dy * fy;
    if (forward <= 0 || forward > bestD) continue;
    const side = Math.abs(-dx * fy + dy * fx);
    if (side < 34) { best = other; bestD = forward; }
  }
  return best;
}

export function updateTrafficCar(g, car, dt) {
  // Keep to the lane: snap the off-axis coordinate onto its road line.
  if (car.axis === 'x') car.y = lerp(car.y, nearestRoadYFor(car.y) + car.lane, Math.min(1, dt * 4));
  else car.x = lerp(car.x, nearestRoadXFor(car.x) + car.lane, Math.min(1, dt * 4));

  const ahead = carAhead(g, car, 95);
  const target = ahead ? 0 : car.cruise;
  car.speed += clamp(target - car.speed, -260 * dt, 150 * dt);

  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  car.x += fx * car.speed * dt;
  car.y += fy * car.speed * dt;

  // At an intersection, sometimes turn onto the crossing road.
  const nearX = nearestRoadXFor(car.x);
  const nearY = nearestRoadYFor(car.y);
  const onCrossing = car.axis === 'x'
    ? Math.abs(car.x - nearX) < 26 && Math.abs(car.y - nearY) < 30
    : Math.abs(car.y - nearY) < 26 && Math.abs(car.x - nearX) < 30;
  if (onCrossing && liveRand() < 0.012) {
    if (car.axis === 'x') {
      car.axis = 'y';
      car.dir = liveRand() < 0.5 ? 1 : -1;
      car.x = nearX + laneOffset('y', car.dir);
      car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      car.axis = 'x';
      car.dir = liveRand() < 0.5 ? 1 : -1;
      car.y = nearY + laneOffset('x', car.dir);
      car.angle = car.dir > 0 ? 0 : Math.PI;
    }
    car.lane = laneOffset(car.axis, car.dir);
  }

  // World edge: turn around rather than leave town.
  if (car.x < 90 || car.x > 3510 || car.y < 90 || car.y > 2510) {
    car.dir *= -1;
    car.angle += Math.PI;
    car.lane = laneOffset(car.axis, car.dir);
  }
  clampToWorld(car, 60);
}

// --- Police cars ---------------------------------------------------------------

export function updatePoliceCar(g, car, dt) {
  const target = g.player.inCar ? g.player.car : g.player;
  const want = Math.atan2(target.y - car.y, target.x - car.x);
  const d = Math.hypot(target.x - car.x, target.y - car.y);

  if (car.reverseTimer > 0) {
    car.reverseTimer -= dt;
    car.speed = -120;
    car.angle += 0.4 * dt;
  } else {
    const maxTurn = 2.9 * dt * clamp(Math.abs(car.speed) / 120, 0.25, 1);
    car.angle = turnToward(car.angle, want, maxTurn);
    const cruise = d > 700 ? car.def.topSpeed : d > 260 ? 320 : 240;
    car.speed += clamp(cruise - car.speed, -300 * dt, 260 * dt);
  }

  const px = car.x;
  const py = car.y;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  clampToWorld(car, 40);

  const probe = { x: car.x, y: car.y, r: car.def.wid * 0.62 };
  if (collideBuildings(g.city, probe)) {
    car.x = probe.x;
    car.y = probe.y;
    car.speed *= 0.4;
    car.stuckTimer += dt;
    if (car.stuckTimer > 1.4) {
      car.reverseTimer = 0.9;
      car.stuckTimer = 0;
      car.angle += Math.PI * 0.5;
    }
  } else {
    car.stuckTimer = Math.max(0, car.stuckTimer - dt * 2);
  }
  if (Math.hypot(car.x - px, car.y - py) < 2 && Math.abs(car.speed) > 60) {
    car.stuckTimer += dt;
  }

  // Ramming the player's car: damage, shake and a shove.
  if (g.player.inCar) {
    const pc = g.player.car;
    const rr = carRadius(car) + carRadius(pc);
    if (dist2(car.x, car.y, pc.x, pc.y) < rr * rr * 0.8) {
      pc.health -= 4 * dt * 10;
      g.shake = Math.min(9, g.shake + 2);
      if (liveRand() < dt * 2) g.audio.crash();
    }
  }
}

// --- Car vs car ------------------------------------------------------------------

// Car vs car: positional separation runs every frame, but the crash itself
// (damage, sound, speed exchange) fires once per overlap — a pile-up that
// lasts a second must not drain a car's health sixty times.
const activeOverlaps = new Set();

export function resolveCarCollisions(g) {
  const cars = g.cars;
  const seen = new Set();
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      const rr = (a.def.len + b.def.len) * 0.32;
      const d2 = dist2(a.x, a.y, b.x, b.y);
      if (d2 >= rr * rr || d2 < 0.01) continue;
      const key = `${i}:${j}`;
      seen.add(key);
      const d = Math.sqrt(d2);
      const nx = (b.x - a.x) / d;
      const ny = (b.y - a.y) / d;
      const overlap = (rr - d) / 2;
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      b.x += nx * overlap;
      b.y += ny * overlap;
      if (!activeOverlaps.has(key)) {
        // First frame of this crash: exchange speed and take damage.
        const relSpeed = Math.abs(a.speed - b.speed);
        if (relSpeed > 120) {
          a.health -= relSpeed * 0.05;
          b.health -= relSpeed * 0.05;
          g.addParticles((a.x + b.x) / 2, (a.y + b.y) / 2, 6, '#d8d8d8');
          if (a === g.player.car || b === g.player.car) {
            g.audio.crash();
            g.shake = Math.min(8, g.shake + 3);
          }
        }
        const avg = (a.speed + b.speed) / 2;
        a.speed = avg * 0.85;
        b.speed = avg * 0.85;
      }
    }
  }
  activeOverlaps.clear();
  for (const k of seen) activeOverlaps.add(k);
}
