// Solmar Heat — the people: Leo on foot, the pedestrians, the cops on foot
// and the Lobos gang. Pedestrians stroll the sidewalks and flee from trouble;
// cops on foot run the player down and make an arrest; gang members hold the
// docks and shoot back. This module also owns the bullets and the pickups.

import { PLAYER, ROAD_HALF } from './config.js';
import { clamp, dist2, angleTo, turnToward, liveRand, pick, range } from './rng.js';
import { collideBuildings, hasLineOfSight, clampToWorld, randomSidewalkPoint, nearestRoadX, nearestRoadY } from './world.js';

const PED_SHIRTS = ['#e8e8e8', '#4a7d8c', '#c96f4a', '#d8b25a', '#8c6f9e', '#5d9b4a', '#b0503f', '#3a5a8c'];
const PED_SKINS = ['#e8b98a', '#c98d5f', '#8a5a3a', '#f0c8a0'];

export function makePed(x, y) {
  return {
    x, y,
    angle: liveRand() * Math.PI * 2,
    speed: range(liveRand, 45, 75),
    state: 'walk', // 'walk' | 'flee' | 'down' | 'dead'
    downTimer: 0,
    vx: 0, vy: 0,
    shirt: pick(liveRand, PED_SHIRTS),
    skin: pick(liveRand, PED_SKINS),
    walkPhase: liveRand() * 10,
    // Sidewalk strolling: which road it follows and which side of it.
    roadAxis: liveRand() < 0.5 ? 'x' : 'y',
    roadLine: 0,
    dir: liveRand() < 0.5 ? 1 : -1,
    side: liveRand() < 0.5 ? 1 : -1,
  };
}

export function spawnPeds(g, count) {
  for (let i = 0; i < count; i++) {
    const p = randomSidewalkPoint(liveRand);
    const ped = makePed(p.x, p.y);
    if (ped.roadAxis === 'x') ped.roadLine = nearestRoadY(p.y);
    else ped.roadLine = nearestRoadX(p.x);
    g.peds.push(ped);
  }
}

// Keep the crowd around the player: respawn far-away pedestrians nearby.
export function maintainPeds(g, dt) {
  const px = g.player.x;
  const py = g.player.y;
  for (let i = g.peds.length - 1; i >= 0; i--) {
    const ped = g.peds[i];
    if (ped.state === 'dead') { g.peds.splice(i, 1); continue; }
    const d2 = dist2(ped.x, ped.y, px, py);
    if (d2 > 1300 * 1300) {
      const p = randomSidewalkPoint(liveRand);
      ped.x = px + (p.x - px) * 0.4 + range(liveRand, -500, 500);
      ped.y = py + (p.y - py) * 0.4 + range(liveRand, -500, 500);
      clampToWorld(ped, 60);
      ped.state = 'walk';
    }
  }
  while (g.peds.length < 26) {
    const p = randomSidewalkPoint(liveRand);
    const ped = makePed(px + range(liveRand, -700, 700), py + range(liveRand, -700, 700));
    clampToWorld(ped, 60);
    if (ped.roadAxis === 'x') ped.roadLine = nearestRoadY(ped.y);
    else ped.roadLine = nearestRoadX(ped.x);
    g.peds.push(ped);
  }
}

export function updatePed(g, ped, dt) {
  ped.walkPhase += dt * 6;
  if (ped.state === 'down') {
    ped.downTimer -= dt;
    ped.x += ped.vx * dt;
    ped.y += ped.vy * dt;
    ped.vx *= 0.86;
    ped.vy *= 0.86;
    const probe = { x: ped.x, y: ped.y, r: 10 };
    if (collideBuildings(g.city, probe)) { ped.x = probe.x; ped.y = probe.y; }
    clampToWorld(ped, 40);
    if (ped.downTimer <= 0) {
      ped.state = 'flee';
    }
    return;
  }

  if (ped.state === 'flee') {
    // Run away from the player, on the sidewalk if possible.
    const away = angleTo(g.player.x, g.player.y, ped.x, ped.y);
    ped.angle = turnToward(ped.angle, away, 5 * dt);
    const speed = 150;
    ped.x += Math.cos(ped.angle) * speed * dt;
    ped.y += Math.sin(ped.angle) * speed * dt;
    const probe = { x: ped.x, y: ped.y, r: 10 };
    if (collideBuildings(g.city, probe)) { ped.x = probe.x; ped.y = probe.y; }
    clampToWorld(ped, 40);
    const d2 = dist2(ped.x, ped.y, g.player.x, g.player.y);
    if (d2 > 500 * 500) ped.state = 'walk';
    return;
  }

  // Strolling: follow the sidewalk line beside its road.
  const lane = ped.roadAxis === 'x'
    ? ped.roadLine + ped.side * (ROAD_HALF + 12)
    : ped.roadLine + ped.side * (ROAD_HALF + 12);
  if (ped.roadAxis === 'x') {
    ped.y = lane;
    ped.x += ped.dir * ped.speed * dt;
    ped.angle = ped.dir > 0 ? 0 : Math.PI;
    if (ped.x < 80 || ped.x > 3520) ped.dir *= -1;
    // At an intersection, sometimes turn onto the crossing sidewalk.
    if (Math.abs(ped.x - nearestRoadX(ped.x)) < 14 && liveRand() < 0.01) {
      ped.roadAxis = 'y';
      ped.roadLine = nearestRoadX(ped.x);
    }
  } else {
    ped.x = lane;
    ped.y += ped.dir * ped.speed * dt;
    ped.angle = ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    if (ped.y < 80 || ped.y > 2520) ped.dir *= -1;
    if (Math.abs(ped.y - nearestRoadY(ped.y)) < 14 && liveRand() < 0.01) {
      ped.roadAxis = 'x';
      ped.roadLine = nearestRoadY(ped.y);
    }
  }

  // Trouble nearby makes a pedestrian run.
  const pd2 = dist2(ped.x, ped.y, g.player.x, g.player.y);
  const playerDanger = (g.player.inCar && g.player.car && Math.abs(g.player.car.speed) > 200 && pd2 < 130 * 130)
    || (g.shotsFiredAt > 0 && pd2 < 320 * 320);
  if (playerDanger) ped.state = 'flee';
}

// --- The player on foot -----------------------------------------------------

export function updatePlayerOnFoot(g, input, dt) {
  const p = g.player;
  const mv = input.moveVector();
  const speed = input.running ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const nx = p.x + mv.x * speed * dt;
  const ny = p.y + mv.y * speed * dt;
  p.x = nx;
  p.y = ny;
  if (mv.x !== 0 || mv.y !== 0) {
    p.angle = angleTo(0, 0, mv.x, mv.y);
    p.moving = true;
    p.walkPhase += dt * (input.running ? 11 : 8);
  } else {
    p.moving = false;
  }
  const probe = { x: p.x, y: p.y, r: PLAYER.radius };
  if (collideBuildings(g.city, probe)) {
    p.x = probe.x;
    p.y = probe.y;
  }
  clampToWorld(p, 30);
  p.fireCooldown = Math.max(0, p.fireCooldown - dt);
}

// --- Cops on foot ---------------------------------------------------------------

export function makeFootCop(x, y) {
  return { x, y, angle: 0, speed: 195, arrestTimer: 0, state: 'chase', avoidDir: Math.random() < 0.5 ? -1 : 1 };
}

export function updateFootCop(g, cop, dt) {
  const p = g.player;
  if (p.inCar) {
    // On foot no more: run back towards the nearest road and wait.
    cop.state = 'wait';
    return;
  }
  cop.state = 'chase';
  const want = angleTo(cop.x, cop.y, p.x, p.y);
  const distToPlayer = Math.hypot(p.x - cop.x, p.y - cop.y);
  // A building straight ahead? Walk around it instead of shoving into its
  // wall forever — steer in the cop's own direction until the way is clear.
  const ahead = { x: cop.x + Math.cos(cop.angle) * 46, y: cop.y + Math.sin(cop.angle) * 46, r: 11 };
  if (distToPlayer > 80 && collideBuildings(g.city, ahead)) {
    cop.angle += cop.avoidDir * 3.2 * dt;
  } else {
    cop.angle = turnToward(cop.angle, want, 6 * dt);
  }
  // Close enough: stand on the player and make the arrest instead of
  // running past them and circling forever. 24 px is inside the 30 px
  // arrest range below, so the timer runs once the cop stops.
  if (distToPlayer > 24) {
    cop.x += Math.cos(cop.angle) * cop.speed * dt;
    cop.y += Math.sin(cop.angle) * cop.speed * dt;
  }
  const probe = { x: cop.x, y: cop.y, r: 11 };
  if (collideBuildings(g.city, probe)) { cop.x = probe.x; cop.y = probe.y; }
  clampToWorld(cop, 30);
  const d2 = dist2(cop.x, cop.y, p.x, p.y);
  if (d2 < 30 * 30) {
    cop.arrestTimer += dt;
    if (cop.arrestTimer > 1.1) g.busted();
  } else {
    cop.arrestTimer = Math.max(0, cop.arrestTimer - dt * 2);
  }
}

// --- Gang members (mission 4) --------------------------------------------------

export function makeGangMember(x, y) {
  return {
    x, y,
    angle: liveRand() * Math.PI * 2,
    health: 60,
    state: 'guard', // 'guard' | 'fight' | 'dead'
    fireCooldown: range(liveRand, 0.5, 1.5),
    avoidDir: liveRand() < 0.5 ? -1 : 1,
    speed: 120,
    shirt: '#3a2e2e',
    skin: pick(liveRand, PED_SKINS),
    walkPhase: 0,
  };
}

export function updateGangMember(g, m, dt) {
  if (m.state === 'dead') return;
  const p = g.player;
  const d = Math.hypot(p.x - m.x, p.y - m.y);
  m.fireCooldown -= dt;
  if (d < 460) {
    m.state = 'fight';
    const want = angleTo(m.x, m.y, p.x, p.y);
    // Walk around a warehouse instead of shoving into its wall.
    const ahead = { x: m.x + Math.cos(m.angle) * 46, y: m.y + Math.sin(m.angle) * 46, r: 11 };
    if (d > 200 && collideBuildings(g.city, ahead)) {
      m.angle += m.avoidDir * 3.2 * dt;
    } else {
      m.angle = turnToward(m.angle, want, 5 * dt);
    }
    if (d > 200) {
      m.x += Math.cos(m.angle) * m.speed * dt;
      m.y += Math.sin(m.angle) * m.speed * dt;
    }
    // No shooting through walls: the Lobos only fire when they can see Leo.
    if (m.fireCooldown <= 0 && d < 420 && hasLineOfSight(g.city, m.x, m.y, p.x, p.y)) {
      m.fireCooldown = range(liveRand, 0.9, 1.6);
      g.fireBullet(m.x, m.y, want + range(liveRand, -0.14, 0.14), 520, 'enemy');
      g.audio.gunshot();
    }
  } else {
    m.state = 'guard';
    m.walkPhase += dt * 2;
  }
  const probe = { x: m.x, y: m.y, r: 11 };
  if (collideBuildings(g.city, probe)) { m.x = probe.x; m.y = probe.y; }
  clampToWorld(m, 30);
}

// --- Bullets ---------------------------------------------------------------------

export function updateBullets(g, dt) {
  for (let i = g.bullets.length - 1; i >= 0; i--) {
    const b = g.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    if (!dead) {
      const hit = { x: b.x, y: b.y, r: 4 };
      if (collideBuildings(g.city, hit)) {
        g.addParticles(b.x, b.y, 4, '#d8c9a0');
        dead = true;
      }
    }
    if (!dead && b.from === 'player') {
      // Hit a car?
      for (const car of g.cars) {
        if (car === g.player.car) continue;
        const rr = car.def.wid * 0.6 + 4;
        if (dist2(b.x, b.y, car.x, car.y) < rr * rr) {
          car.health -= 22;
          g.addParticles(b.x, b.y, 5, '#e8c33a');
          if (car.role === 'police') g.commitCrime('shootCop', car.x, car.y);
          else if (car.role === 'traffic' && liveRand() < 0.4) g.commitCrime('damageCopCar', car.x, car.y);
          dead = true;
          break;
        }
      }
      // Hit a gang member?
      if (!dead) {
        for (const m of g.gang) {
          if (m.state === 'dead') continue;
          if (dist2(b.x, b.y, m.x, m.y) < 18 * 18) {
            m.health -= 34;
            g.addParticles(b.x, b.y, 6, '#d83a2e');
            if (m.health <= 0) {
              m.state = 'dead';
              g.player.money += 25;
              g.floatText(m.x, m.y, '+$25', '#7de07d');
              g.audio.coin();
            }
            dead = true;
            break;
          }
        }
      }
      // Hit a pedestrian? That is a crime.
      if (!dead) {
        for (const ped of g.peds) {
          if (ped.state === 'down' || ped.state === 'dead') continue;
          if (dist2(b.x, b.y, ped.x, ped.y) < 15 * 15) {
            ped.state = 'down';
            ped.downTimer = 4;
            g.addParticles(b.x, b.y, 6, '#d83a2e');
            g.commitCrime('killPed', ped.x, ped.y);
            dead = true;
            break;
          }
        }
      }
      // Hit a foot cop? That is a serious crime.
      if (!dead) {
        for (const cop of g.footCops) {
          if (dist2(b.x, b.y, cop.x, cop.y) < 15 * 15) {
            g.commitCrime('shootCop', cop.x, cop.y);
            dead = true;
            break;
          }
        }
      }
    }
    if (!dead && b.from === 'enemy') {
      const p = g.player;
      const rr = p.inCar ? 30 : 15;
      const tx = p.inCar ? p.car.x : p.x;
      const ty = p.inCar ? p.car.y : p.y;
      if (dist2(b.x, b.y, tx, ty) < rr * rr) {
        if (p.inCar) p.car.health -= 8;
        else g.damagePlayer(9);
        dead = true;
      }
    }
    if (dead) g.bullets.splice(i, 1);
  }
}

// --- Pickups ---------------------------------------------------------------------

export function makePickup(kind, x, y) {
  return { kind, x, y, bob: liveRand() * 6, respawn: 0 };
}

export function updatePickups(g, dt) {
  const p = g.player;
  for (const pk of g.pickups) {
    pk.bob += dt * 3;
    if (pk.respawn > 0) {
      pk.respawn -= dt;
      continue;
    }
    const tx = p.inCar ? p.car.x : p.x;
    const ty = p.inCar ? p.car.y : p.y;
    if (dist2(pk.x, pk.y, tx, ty) < 34 * 34) {
      if (pk.kind === 'health') {
        if (p.health < PLAYER.health) {
          p.health = Math.min(PLAYER.health, p.health + 40);
          g.audio.pickup();
          g.floatText(pk.x, pk.y, '+40 HP', '#7de07d');
          pk.respawn = 25;
        }
      } else if (pk.kind === 'money') {
        p.money += 50;
        g.audio.coin();
        g.floatText(pk.x, pk.y, '+$50', '#7de07d');
        pk.respawn = 30;
      }
    }
  }
}
