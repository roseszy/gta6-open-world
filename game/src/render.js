// Solmar Heat — everything the eye sees, drawn on one canvas.
// The world is drawn in world coordinates under the camera transform; the
// HUD lives in the DOM and the minimap in its own small canvas (hud.js).
// Only what the camera can see is drawn, so a big city stays cheap.

import { WORLD_W, WORLD_H, ROAD_XS, ROAD_YS, ROAD_W, ROAD_HALF, COLORS } from './config.js';
import { clamp } from './rng.js';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function inView(v, x, y, pad) {
  return x > v.camX - pad && x < v.camX + v.w / v.zoom + pad
    && y > v.camY - pad && y < v.camY + v.h / v.zoom + pad;
}

// --- Ground and streets ------------------------------------------------------

function drawGround(ctx, g, v) {
  const x0 = v.camX - 40;
  const y0 = v.camY - 40;
  const x1 = v.camX + v.w / v.zoom + 40;
  const y1 = v.camY + v.h / v.zoom + 40;

  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

  // Beach and water along the east edge.
  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(Math.max(x0, g.city.beach.x0), y0, x1 - Math.max(x0, g.city.beach.x0), y1 - y0);
  ctx.fillStyle = COLORS.water;
  ctx.fillRect(Math.max(x0, g.city.beach.waterX0), y0, x1 - Math.max(x0, g.city.beach.waterX0), y1 - y0);

  // Parks and the plaza.
  for (const park of g.city.parks) {
    ctx.fillStyle = COLORS.park;
    ctx.fillRect(park.x0, park.y0, park.x1 - park.x0, park.y1 - park.y0);
  }
  if (g.city.specials.plaza) {
    const p = g.city.specials.plaza;
    ctx.fillStyle = COLORS.plaza;
    ctx.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
  }
  if (g.city.specials.docks) {
    const d = g.city.specials.docks;
    ctx.fillStyle = '#8a8f96';
    ctx.fillRect(d.x - d.w / 2, d.y - d.h / 2, d.w, d.h);
    // Shipping containers stacked on the docks.
    ctx.fillStyle = '#b0503f';
    ctx.fillRect(d.x - d.w / 2 + 24, d.y - d.h / 2 + 24, 90, 34);
    ctx.fillStyle = '#4a7d8c';
    ctx.fillRect(d.x - d.w / 2 + 24, d.y - d.h / 2 + 70, 90, 34);
    ctx.fillStyle = '#d8b25a';
    ctx.fillRect(d.x + d.w / 2 - 120, d.y - d.h / 2 + 24, 90, 34);
  }

  // Sidewalks (a pale border), then the asphalt, then the markings.
  for (const rx of ROAD_XS) {
    ctx.fillStyle = COLORS.sidewalk;
    ctx.fillRect(rx - ROAD_HALF - 14, y0, ROAD_W + 28, y1 - y0);
  }
  for (const ry of ROAD_YS) {
    ctx.fillStyle = COLORS.sidewalk;
    ctx.fillRect(x0, ry - ROAD_HALF - 14, x1 - x0, ROAD_W + 28);
  }
  for (const rx of ROAD_XS) {
    ctx.fillStyle = COLORS.road;
    ctx.fillRect(rx - ROAD_HALF, y0, ROAD_W, y1 - y0);
  }
  for (const ry of ROAD_YS) {
    ctx.fillStyle = COLORS.road;
    ctx.fillRect(x0, ry - ROAD_HALF, x1 - x0, ROAD_W);
  }
  // Centre dashes.
  ctx.fillStyle = COLORS.roadLine;
  for (const rx of ROAD_XS) {
    for (let y = Math.floor(y0 / 44) * 44; y < y1; y += 44) {
      ctx.fillRect(rx - 2, y, 4, 22);
    }
  }
  for (const ry of ROAD_YS) {
    for (let x = Math.floor(x0 / 44) * 44; x < x1; x += 44) {
      ctx.fillRect(x, ry - 2, 22, 4);
    }
  }
  // Crosswalks at every intersection.
  ctx.fillStyle = COLORS.crosswalk;
  for (const rx of ROAD_XS) {
    for (const ry of ROAD_YS) {
      for (let i = -2; i <= 2; i++) {
        ctx.fillRect(rx + i * 16 - 5, ry - ROAD_HALF - 8, 10, 16);
        ctx.fillRect(rx + i * 16 - 5, ry + ROAD_HALF - 8, 10, 16);
      }
    }
  }
}

// --- Buildings and trees -------------------------------------------------------

function drawBuildings(ctx, g, v) {
  for (const b of g.city.buildings) {
    if (!inView(v, b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h))) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = COLORS.buildingEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    // Roof detail: a lighter inner panel and a vent.
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(b.x + 10, b.y + 10, b.w - 20, b.h - 20);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x + b.w / 2 - 8, b.y + b.h / 2 - 8, 16, 16);
    if (b.special === 'hospital') {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 34px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('H', b.x + b.w / 2, b.y + b.h / 2);
    } else if (b.special === 'police') {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PD', b.x + b.w / 2, b.y + b.h / 2);
    }
  }
  for (const t of g.city.trees) {
    if (!inView(v, t.x, t.y, 30)) continue;
    ctx.fillStyle = '#6b4a2a';
    ctx.fillRect(t.x - 2, t.y - 2, 4, 8);
    ctx.fillStyle = '#3f7d33';
    ctx.beginPath();
    ctx.arc(t.x, t.y - 6, t.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5d9b4a';
    ctx.beginPath();
    ctx.arc(t.x - 3, t.y - 9, t.r * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- Cars ----------------------------------------------------------------------

function drawCar(ctx, car, time) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(2, 4, car.def.len * 0.52, car.def.wid * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  // Wheels.
  ctx.fillStyle = '#1a1a1a';
  const wl = car.def.len * 0.32;
  const ww = car.def.wid * 0.5;
  ctx.fillRect(-wl, -ww - 3, 12, 6);
  ctx.fillRect(wl - 4, -ww - 3, 12, 6);
  ctx.fillRect(-wl, ww - 3, 12, 6);
  ctx.fillRect(wl - 4, ww - 3, 12, 6);
  // Body.
  ctx.fillStyle = car.color;
  roundRect(ctx, -car.def.len / 2, -car.def.wid / 2, car.def.len, car.def.wid, 7);
  ctx.fill();
  // Windshield and rear window.
  ctx.fillStyle = 'rgba(20,30,44,0.85)';
  roundRect(ctx, car.def.len * 0.08, -car.def.wid / 2 + 4, car.def.len * 0.2, car.def.wid - 8, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(20,30,44,0.55)';
  roundRect(ctx, -car.def.len * 0.32, -car.def.wid / 2 + 4, car.def.len * 0.14, car.def.wid - 8, 3);
  ctx.fill();

  if (car.type === 'police') {
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(-6, -car.def.wid / 2, 12, car.def.wid);
    // Flashing light bar.
    const phase = Math.floor(time * 3) % 2 === 0;
    ctx.fillStyle = phase ? '#ff2e2e' : '#2e6fff';
    ctx.fillRect(-4, -car.def.wid / 2 - 2, 8, 7);
    ctx.fillStyle = phase ? '#2e6fff' : '#ff2e2e';
    ctx.fillRect(-4, car.def.wid / 2 - 5, 8, 7);
  } else if (car.type === 'taxi') {
    ctx.fillStyle = '#20242c';
    for (let i = 0; i < 5; i++) ctx.fillRect(-car.def.len / 2 + 8 + i * 8, -3, 5, 6);
    ctx.fillStyle = '#e8c33a';
    ctx.fillRect(-6, -car.def.wid / 2 - 4, 12, 5);
  }
  // Smoke from a dying car.
  if (car.health < 35 && car.health > 0) {
    ctx.fillStyle = 'rgba(120,120,120,0.5)';
    ctx.beginPath();
    ctx.arc(-car.def.len * 0.3, 0, 8 + Math.sin(time * 6) * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// --- People ----------------------------------------------------------------------

function drawPerson(ctx, x, y, angle, shirt, skin, walkPhase, moving) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(1, 3, 11, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  const bob = moving ? Math.sin(walkPhase) * 1.5 : 0;
  ctx.rotate(angle);
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.arc(0, bob * 0.3, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(4, bob * 0.3, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawDownedPed(ctx, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  ctx.rotate(ped.angle + Math.PI / 2);
  ctx.fillStyle = ped.shirt;
  ctx.beginPath();
  ctx.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.skin;
  ctx.beginPath();
  ctx.arc(12, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// --- Markers, effects, bullets ---------------------------------------------------

function drawMarkers(ctx, g, time) {
  const list = [];
  if (g.mission) list.push(...g.mission.markers);
  if (g.fare) {
    const f = g.fare;
    list.push({ x: f.stage === 0 ? f.from.x : f.to.x, y: f.stage === 0 ? f.from.y : f.to.y, label: f.stage === 0 ? 'Fare' : 'Drop-off', color: '#7de07d' });
  }
  for (const mk of list) {
    const pulse = 1 + Math.sin(time * 4) * 0.12;
    ctx.strokeStyle = mk.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(mk.x, mk.y, 26 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = mk.color;
    ctx.beginPath();
    ctx.arc(mk.x, mk.y, 6, 0, Math.PI * 2);
    ctx.fill();
    // A beam so the marker reads from far away.
    ctx.fillStyle = mk.color + '44';
    ctx.fillRect(mk.x - 3, mk.y - 90, 6, 90);
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = mk.color;
    ctx.fillText(mk.label, mk.x, mk.y - 96);
  }
}

function drawEffects(ctx, g) {
  // Skid marks.
  ctx.strokeStyle = 'rgba(20,20,20,0.4)';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (const s of g.skids) {
    ctx.globalAlpha = Math.max(0, s.life / 6);
    ctx.beginPath();
    ctx.moveTo(s.x - Math.cos(s.angle) * 8, s.y - Math.sin(s.angle) * 8);
    ctx.lineTo(s.x + Math.cos(s.angle) * 8, s.y + Math.sin(s.angle) * 8);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Particles.
  for (const pt of g.particles) {
    ctx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;
  // Bullets as short tracers.
  ctx.strokeStyle = '#ffe14d';
  ctx.lineWidth = 3;
  for (const b of g.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  // Floating score text.
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of g.floats) {
    ctx.globalAlpha = clamp(f.life / 1.4, 0, 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

function drawPickups(ctx, g, time) {
  for (const pk of g.pickups) {
    if (pk.respawn > 0) continue;
    const bob = Math.sin(pk.bob) * 3;
    if (pk.kind === 'health') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(pk.x - 11, pk.y - 11 + bob, 22, 22);
      ctx.fillStyle = '#2fae4e';
      ctx.fillRect(pk.x - 3, pk.y - 8 + bob, 6, 16);
      ctx.fillRect(pk.x - 8, pk.y - 3 + bob, 16, 6);
    } else {
      ctx.fillStyle = '#2fae4e';
      ctx.beginPath();
      ctx.arc(pk.x, pk.y + bob, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', pk.x, pk.y + bob + 1);
    }
  }
}

// --- The frame -------------------------------------------------------------------

export function drawWorld(ctx, g, view) {
  const { w, h } = view;
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  const zoom = view.zoom;
  ctx.scale(zoom, zoom);
  ctx.translate(-view.camX, -view.camY);

  drawGround(ctx, g, view);
  drawBuildings(ctx, g, view);

  // Skid marks and pickups sit on the street.
  ctx.strokeStyle = 'rgba(20,20,20,0.4)';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (const s of g.skids) {
    ctx.globalAlpha = Math.max(0, s.life / 6);
    ctx.beginPath();
    ctx.moveTo(s.x - Math.cos(s.angle) * 8, s.y - Math.sin(s.angle) * 8);
    ctx.lineTo(s.x + Math.cos(s.angle) * 8, s.y + Math.sin(s.angle) * 8);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  drawPickups(ctx, g, g.time);

  drawMarkers(ctx, g, g.time);

  // Cars: the player's first so traffic draws over it when overlapping.
  const cars = [...g.cars].sort((a, b) => a.y - b.y);
  for (const car of cars) {
    if (!inView(view, car.x, car.y, 80)) continue;
    drawCar(ctx, car, g.time);
  }

  // People.
  for (const ped of g.peds) {
    if (!inView(view, ped.x, ped.y, 40)) continue;
    if (ped.state === 'down') drawDownedPed(ctx, ped);
    else drawPerson(ctx, ped.x, ped.y, ped.angle, ped.shirt, ped.skin, ped.walkPhase, ped.state !== 'walk' ? true : true);
  }
  for (const m of g.gang) {
    if (m.state === 'dead') {
      drawDownedPed(ctx, { x: m.x, y: m.y, angle: m.angle, shirt: '#3a2e2e', skin: m.skin });
      continue;
    }
    if (!inView(view, m.x, m.y, 40)) continue;
    drawPerson(ctx, m.x, m.y, m.angle, '#3a2e2e', m.skin, m.walkPhase, m.state === 'fight');
    // Red bandana.
    ctx.fillStyle = '#d83a2e';
    ctx.beginPath();
    ctx.arc(m.x + Math.cos(m.angle) * 4, m.y + Math.sin(m.angle) * 4, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (g.eddie && g.eddie.state === 'wait') {
    drawPerson(ctx, g.eddie.x, g.eddie.y, -Math.PI / 2, '#e8c33a', '#e8b98a', g.time * 3, false);
  }
  for (const cop of g.footCops) {
    if (!inView(view, cop.x, cop.y, 40)) continue;
    drawPerson(ctx, cop.x, cop.y, cop.angle, '#20242c', '#e8b98a', g.time * 8, true);
    ctx.fillStyle = '#20242c';
    ctx.beginPath();
    ctx.arc(cop.x, cop.y - 2, 7, Math.PI, 0);
    ctx.fill();
  }

  // The player: on foot a walker, in a car already drawn with the cars.
  const p = g.player;
  if (!p.inCar) {
    drawPerson(ctx, p.x, p.y, p.angle, '#2e6f8e', '#e8b98a', p.walkPhase, p.moving);
    // Pistol in hand, aimed at the mouse.
    ctx.strokeStyle = '#20242c';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(p.angle) * 8, p.y + Math.sin(p.angle) * 8);
    ctx.lineTo(p.x + Math.cos(p.aimAngle) * 20, p.y + Math.sin(p.aimAngle) * 20);
    ctx.stroke();
  }

  drawEffects(ctx, g);

  ctx.restore();

  // Screen-edge arrow towards the active mission marker.
  const target = g.mission && g.mission.markers.length > 0 ? g.mission.markers[0]
    : g.fare ? { x: g.fare.stage === 0 ? g.fare.from.x : g.fare.to.x, y: g.fare.stage === 0 ? g.fare.from.y : g.fare.to.y }
    : null;
  if (target && g.state === 'playing') {
    const sx = (target.x - view.camX) * zoom;
    const sy = (target.y - view.camY) * zoom;
    if (sx < 60 || sx > w - 60 || sy < 60 || sy > h - 60) {
      const cx = clamp(sx, 70, w - 70);
      const cy = clamp(sy, 90, h - 90);
      const ang = Math.atan2(sy - cy, sx - cx);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      ctx.fillStyle = '#e8c33a';
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-10, -11);
      ctx.lineTo(-10, 11);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}
