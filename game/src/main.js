// Solmar Heat — the game itself: state, the loop, the camera, the wanted
// system, entering and stealing cars, being busted or wasted, and saving.
// Everything else (world, cars, people, missions, rendering, HUD, sound)
// lives in its own module; this file wires them together.

import { WORLD_W, WORLD_H, PLAYER, WANTED, PLACES, CAR_TYPES } from './config.js';
import { clamp, lerp, dist2, angleTo, liveRand, pick, range } from './rng.js';
import { buildCity, clampToWorld, randomRoadPoint, nearestRoadX, nearestRoadY } from './world.js';
import { AudioSys } from './audio.js';
import { Input } from './input.js';
import {
  makeCar, spawnTraffic, updatePlayerCar, updateTrafficCar,
  updatePoliceCar, resolveCarCollisions, carRadius,
} from './vehicles.js';
import {
  makePed, spawnPeds, maintainPeds, updatePed, updatePlayerOnFoot,
  makeFootCop, updateFootCop, updateGangMember, updateBullets,
  makePickup, updatePickups,
} from './people.js';
import { startMission, updateMission, startFare, updateFare, STORY } from './missions.js';
import { drawWorld } from './render.js';
import { Hud } from './hud.js';
import { saveGameData, loadGameData, hasSave, clearSave } from './save.js';

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.city = buildCity();
    this.audio = new AudioSys();
    this.input = new Input(canvas);
    this.hud = new Hud(document);
    this.state = 'menu';
    this.time = 0;
    this.view = { w: window.innerWidth, h: window.innerHeight, camX: 0, camY: 0, zoom: 1 };
    this.cam = { x: 0, y: 0, zoom: 1 };
    this.shake = 0;
    this.resetWorld();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.input.onFirstGesture = () => this.audio.ensure();
  }

  resetWorld() {
    this.player = {
      x: PLACES.playerStart.x, y: PLACES.playerStart.y,
      angle: -Math.PI / 2, aimAngle: 0,
      health: PLAYER.health, money: 40,
      inCar: false, car: null,
      moving: false, walkPhase: 0, fireCooldown: 0,
    };
    this.cars = [];
    this.peds = [];
    this.footCops = [];
    this.gang = [];
    this.bullets = [];
    this.particles = [];
    this.skids = [];
    this.floats = [];
    this.pickups = [
      makePickup('health', PLACES.hospital.x, PLACES.hospital.y + 90),
      makePickup('money', 2025, 2025),
    ];
    this.wanted = 0;
    this.wantedQuiet = 0;
    this.wantedDecay = 0;
    this.mission = null;
    this.missionsDone = 0;
    this.nextMissionIn = 0;
    this.fare = null;
    this.fareCooldown = 0;
    this.eddie = null;
    this.shotsFiredAt = 0;
    this.policeSpawnTimer = 0;

    // Parked cars around the starting streets, plus live traffic.
    const parkedSpots = [
      { x: 1575, y: 1125 - 78, type: 'sedan' },
      { x: 1575 + 78, y: 1125, type: 'taxi' },
      { x: 1125, y: 1125 - 78, type: 'van' },
      { x: 2025, y: 1575 + 78, type: 'sport' },
      { x: 675, y: 1575 - 78, type: 'sedan' },
    ];
    for (const s of parkedSpots) {
      const car = makeCar(s.type, s.x, s.y, s.type === 'sedan' ? 0 : Math.PI / 2);
      car.role = 'parked';
      this.cars.push(car);
    }
    spawnTraffic(this, 26);
    spawnPeds(this, 26);
  }

  resize() {
    this.view.w = window.innerWidth;
    this.view.h = window.innerHeight;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  // --- Small verbs the other modules call ---------------------------------

  say(text, seconds) { this.hud.say(text, seconds); }

  floatText(x, y, text, color) {
    this.floats.push({ x, y, text, color, life: 1.4 });
  }

  addParticles(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      const a = liveRand() * Math.PI * 2;
      const sp = range(liveRand, 40, 190);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: range(liveRand, 0.3, 0.8), maxLife: 0.8, color,
      });
    }
  }

  addSkid(x, y, angle) {
    this.skids.push({ x, y, angle, life: 6 });
    if (this.skids.length > 240) this.skids.splice(0, this.skids.length - 240);
  }

  fireBullet(x, y, angle, speed, from) {
    this.bullets.push({
      x, y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: 1.1, from,
    });
    if (from === 'player') {
      this.shotsFiredAt = 0.6;
      this.addParticles(x + Math.cos(angle) * 18, y + Math.sin(angle) * 18, 3, '#ffe14d');
    }
  }

  damagePlayer(amount) {
    if (this.state !== 'playing') return;
    this.player.health -= amount;
    this.shake = Math.min(8, this.shake + 3);
    if (this.player.health <= 0) this.wasted();
  }

  // --- Wanted ------------------------------------------------------------------

  addWanted(stars) {
    this.wanted = clamp(this.wanted + stars, 0, WANTED.maxStars);
    this.wantedQuiet = 0;
    this.wantedDecay = 0;
  }

  commitCrime(kind, x, y) {
    const stars = WANTED[kind] || 0;
    if (stars > 0) this.addWanted(stars);
    // Nearby pedestrians run from the scene.
    for (const ped of this.peds) {
      if (ped.state === 'walk' && dist2(ped.x, ped.y, x, y) < 300 * 300) ped.state = 'flee';
    }
  }

  spawnPolice(n) {
    for (let i = 0; i < n; i++) {
      const p = randomRoadPoint(liveRand);
      // Off-screen-ish, but not absurdly far: 500-800 px from the player.
      let x = this.player.x + (liveRand() < 0.5 ? -1 : 1) * range(liveRand, 500, 800);
      let y = this.player.y + (liveRand() < 0.5 ? -1 : 1) * range(liveRand, 400, 700);
      x = clamp(x, 120, WORLD_W - 120);
      y = clamp(y, 120, WORLD_H - 120);
      const car = makeCar('police', x, y, angleTo(x, y, this.player.x, this.player.y));
      car.role = 'police';
      car.speed = 200;
      this.cars.push(car);
    }
  }

  updateWanted(dt) {
    const policeCars = this.cars.filter((c) => c.role === 'police').length;
    const wantCars = this.wanted > 0 ? Math.min(1 + this.wanted, 5) : 0;
    this.policeSpawnTimer -= dt;
    if (policeCars < wantCars && this.policeSpawnTimer <= 0) {
      this.spawnPolice(wantCars - policeCars);
      this.policeSpawnTimer = 2.5;
    }
    // Far-away police cars that lost the player despawn once the heat is off.
    if (this.wanted === 0) {
      for (let i = this.cars.length - 1; i >= 0; i--) {
        const c = this.cars[i];
        if (c.role === 'police' && dist2(c.x, c.y, this.player.x, this.player.y) > 1100 * 1100) {
          this.cars.splice(i, 1);
        }
      }
      // Foot cops walk off too.
      for (let i = this.footCops.length - 1; i >= 0; i--) {
        if (dist2(this.footCops[i].x, this.footCops[i].y, this.player.x, this.player.y) > 900 * 900) {
          this.footCops.splice(i, 1);
        }
      }
    }
    // Foot cops join the chase while the player is on foot and wanted.
    if (this.wanted > 0 && !this.player.inCar) {
      const wantCops = Math.min(this.wanted, 3);
      if (this.footCops.length < wantCops && this.policeSpawnTimer <= 0) {
        const a = liveRand() * Math.PI * 2;
        let x = clamp(this.player.x + Math.cos(a) * 420, 120, WORLD_W - 120);
        let y = clamp(this.player.y + Math.sin(a) * 420, 120, WORLD_H - 120);
        // Start on a road, never inside a building lot.
        if (Math.abs(x - nearestRoadX(x)) < Math.abs(y - nearestRoadY(y))) x = nearestRoadX(x);
        else y = nearestRoadY(y);
        this.footCops.push(makeFootCop(x, y));
        this.policeSpawnTimer = 2.5;
      }
    }
    // Decay: quiet for a while, out of every cop's sight, and the heat fades.
    if (this.wanted > 0) {
      this.wantedQuiet += dt;
      let seen = false;
      for (const c of this.cars) {
        if (c.role === 'police' && dist2(c.x, c.y, this.player.x, this.player.y) < 450 * 450) { seen = true; break; }
      }
      if (!seen) {
        for (const cop of this.footCops) {
          if (dist2(cop.x, cop.y, this.player.x, this.player.y) < 350 * 350) { seen = true; break; }
        }
      }
      if (!seen && this.wantedQuiet > WANTED.decayQuietSeconds) {
        this.wantedDecay += dt;
        if (this.wantedDecay > WANTED.decayStepSeconds) {
          this.wanted -= 1;
          this.wantedDecay = 0;
          this.wantedQuiet = 0;
        }
      } else if (seen) {
        this.wantedQuiet = 0;
        this.wantedDecay = 0;
      }
    }
    this.audio.setSiren(policeCars > 0);
  }

  // --- Busted / wasted -----------------------------------------------------------

  busted() {
    if (this.state !== 'playing') return;
    this.state = 'busted';
    this.audio.busted();
    this.audio.setSiren(false);
    const fine = Math.min(this.player.money, 100);
    this.player.money -= fine;
    this.showEnd('BUSTED', `The Solmar PD caught you. Fine: $${fine}.`, 'Back on the streets');
  }

  wasted() {
    if (this.state !== 'playing') return;
    this.state = 'wasted';
    this.audio.busted();
    this.audio.setSiren(false);
    const lost = Math.min(this.player.money, 150);
    this.player.money -= lost;
    this.showEnd('WASTED', `You wake up at St. Marina Hospital. Bill: $${lost}.`, 'Back on the streets');
  }

  showEnd(title, text, buttonText) {
    const overlay = document.getElementById('end-screen');
    document.getElementById('end-title').textContent = title;
    document.getElementById('end-text').textContent = text;
    document.getElementById('end-button').textContent = buttonText;
    overlay.classList.remove('hidden');
  }

  respawn() {
    document.getElementById('end-screen').classList.add('hidden');
    const wasBusted = this.state === 'busted';
    this.player.health = PLAYER.health;
    this.wanted = 0;
    this.footCops = [];
    // Impound the police cars: they drive off.
    this.cars = this.cars.filter((c) => c.role !== 'police');
    if (this.player.inCar) {
      this.player.car.role = 'parked';
      this.player.car.speed = 0;
      this.player.inCar = false;
      this.player.car = null;
    }
    const spot = wasBusted ? PLACES.policeStation : PLACES.hospital;
    this.player.x = spot.x;
    this.player.y = spot.y + 90;
    this.player.angle = -Math.PI / 2;
    this.state = 'playing';
    this.saveGame();
  }

  // --- Cars: enter, exit, steal ----------------------------------------------------

  nearestCar(maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of this.cars) {
      if (car.role === 'player') continue;
      const d = Math.hypot(car.x - this.player.x, car.y - this.player.y);
      if (d < bestD) { best = car; bestD = d; }
    }
    return best;
  }

  tryEnterExitCar() {
    const p = this.player;
    if (p.inCar) {
      // Step out beside the car.
      const car = p.car;
      car.role = 'parked';
      car.speed = 0;
      p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
      p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
      p.angle = car.angle;
      p.inCar = false;
      p.car = null;
      this.audio.setEngine(0, false);
      return;
    }
    const car = this.nearestCar(52);
    if (!car) return;
    if (car.role === 'traffic') {
      this.commitCrime('stealCar', car.x, car.y);
      this.say('You stole the car! The owner will call it in...', 3);
    } else if (car.role === 'police') {
      this.commitCrime('stealCar', car.x, car.y);
      this.addWanted(1);
      this.say('You stole a police cruiser! Bold move, Leo.', 3);
    }
    car.role = 'player';
    p.car = car;
    p.inCar = true;
    p.x = car.x;
    p.y = car.y;
  }

  // --- Shooting ---------------------------------------------------------------------

  tryShoot() {
    const p = this.player;
    if (p.inCar || p.fireCooldown > 0 || this.state !== 'playing') return;
    p.fireCooldown = 0.28;
    const wx = this.view.camX + this.input.mouse.x / this.view.zoom;
    const wy = this.view.camY + this.input.mouse.y / this.view.zoom;
    const angle = angleTo(p.x, p.y, wx, wy);
    p.aimAngle = angle;
    this.fireBullet(p.x + Math.cos(angle) * 18, p.y + Math.sin(angle) * 18, angle, 640, 'player');
    this.audio.gunshot();
    this.shake = Math.min(5, this.shake + 1);
  }

  // --- Save / load --------------------------------------------------------------------

  saveGame() {
    saveGameData({
      money: this.player.money,
      missionsDone: this.missionsDone,
      health: this.player.health,
      x: this.player.x,
      y: this.player.y,
      savedAt: Date.now(),
    });
  }

  loadSave() {
    const data = loadGameData();
    if (!data) return false;
    this.player.money = data.money ?? 40;
    this.missionsDone = data.missionsDone ?? 0;
    this.player.health = data.health ?? PLAYER.health;
    this.player.x = data.x ?? PLACES.playerStart.x;
    this.player.y = data.y ?? PLACES.playerStart.y;
    return true;
  }

  startGame(fresh) {
    this.audio.ensure();
    if (fresh) {
      clearSave();
      this.resetWorld();
    } else {
      this.resetWorld();
      this.loadSave();
    }
    document.getElementById('menu-screen').classList.add('hidden');
    document.getElementById('pause-screen').classList.add('hidden');
    document.getElementById('end-screen').classList.add('hidden');
    this.state = 'playing';
    this.say(STORY.intro, 7);
    this.nextMissionIn = 4;
  }

  // --- The frame -------------------------------------------------------------------------

  update(dt) {
    this.time += dt;
    this.shotsFiredAt = Math.max(0, this.shotsFiredAt - dt);
    // The HUD belongs to active play; the menu shows the city bare.
    document.getElementById('hud').style.visibility =
      (this.state === 'playing' || this.state === 'paused') ? 'visible' : 'hidden';

    // Traffic and pedestrians live even behind the menu.
    for (const car of this.cars) {
      if (car.role === 'traffic') updateTrafficCar(this, car, dt);
      else if (car.role === 'police') updatePoliceCar(this, car, dt);
    }
    resolveCarCollisions(this);
    for (const ped of this.peds) updatePed(this, ped, dt);
    maintainPeds(this, dt);

    if (this.state === 'menu') {
      // A slow pan across the city behind the title screen.
      this.cam.x = 1200 + Math.sin(this.time * 0.05) * 500;
      this.cam.y = 900 + Math.cos(this.time * 0.04) * 300;
      this.cam.zoom = 0.8;
      return;
    }
    if (this.state !== 'playing') return;

    const input = this.input;
    const p = this.player;

    // Pause.
    if (input.pressed('Escape')) {
      this.state = 'paused';
      document.getElementById('pause-screen').classList.remove('hidden');
      return;
    }
    if (input.pressed('KeyM')) {
      const muted = this.audio.toggleMute();
      this.say(muted ? 'Sound off (M to turn back on)' : 'Sound on', 2);
    }
    if (input.pressed('KeyE')) this.tryEnterExitCar();

    // Aim follows the mouse while on foot. A click is edge-triggered too:
    // a tap shorter than one frame still fires one shot.
    if (!p.inCar) {
      const wx = this.view.camX + input.mouse.x / this.view.zoom;
      const wy = this.view.camY + input.mouse.y / this.view.zoom;
      p.aimAngle = angleTo(p.x, p.y, wx, wy);
      if (input.mouse.down || input.consumeClicked()) this.tryShoot();
      updatePlayerOnFoot(this, input, dt);
    } else {
      input.consumeClicked(); // a click made while driving is spent, not queued
      updatePlayerCar(this, p.car, input, dt);
      p.x = p.car.x;
      p.y = p.car.y;
      p.angle = p.car.angle;
      // Mara's garage repairs a damaged car.
      if (dist2(p.car.x, p.car.y, PLACES.garage.x, PLACES.garage.y) < 80 * 80) {
        p.car.health = Math.min(100, p.car.health + 25 * dt);
      }
      if (p.car.health <= 0) {
        p.car.speed = 0;
        p.car.smoke = 1;
        if (liveRand() < dt * 2) this.addParticles(p.car.x, p.car.y, 2, '#888');
      }
    }

    // The car the player just left keeps rolling a touch, then stops.
    for (const car of this.cars) {
      if (car.role === 'parked' && Math.abs(car.speed) > 1) {
        car.speed *= 0.94;
        car.x += Math.cos(car.angle) * car.speed * dt;
        car.y += Math.sin(car.angle) * car.speed * dt;
      }
    }

    for (const cop of this.footCops) updateFootCop(this, cop, dt);
    for (const m of this.gang) updateGangMember(this, m, dt);
    updateBullets(this, dt);
    updatePickups(this, dt);
    updateMission(this, dt);
    updateFare(this, dt);
    this.updateWanted(dt);

    // Next mission call.
    if (!this.mission && this.missionsDone < 4) {
      this.nextMissionIn -= dt;
      if (this.nextMissionIn <= 0) {
        startMission(this, this.missionsDone);
      }
    }
    // Fares after the story.
    if (!this.mission && this.missionsDone >= 4 && !this.fare) {
      this.fareCooldown -= dt;
      if (this.fareCooldown <= 0) startFare(this);
    }

    // Effects.
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.skids.length - 1; i >= 0; i--) {
      this.skids[i].life -= dt;
      if (this.skids[i].life <= 0) this.skids.splice(i, 1);
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.y -= 34 * dt;
      f.life -= dt;
      if (f.life <= 0) this.floats.splice(i, 1);
    }

    // Audio follows the drive.
    const driving = p.inCar && p.car;
    this.audio.setEngine(driving ? Math.abs(p.car.speed) / p.car.def.topSpeed : 0, !!driving);
    this.audio.updateSiren(dt);

    // Camera follows the player, eased, with a wider view while driving.
    // The view may hang a little past the world's edge (it is just more
    // grass) so the player stays centred even on the boundary roads.
    const targetZoom = p.inCar ? 0.82 : 1;
    this.cam.zoom = lerp(this.cam.zoom, targetZoom, Math.min(1, dt * 2));
    const vw = this.view.w / this.cam.zoom;
    const vh = this.view.h / this.cam.zoom;
    const tx = clamp(p.x - vw / 2, -150, Math.max(-150, WORLD_W - vw + 150));
    const ty = clamp(p.y - vh / 2, -150, Math.max(-150, WORLD_H - vh + 150));
    this.cam.x = lerp(this.cam.x, tx, Math.min(1, dt * 5));
    this.cam.y = lerp(this.cam.y, ty, Math.min(1, dt * 5));
    this.shake = Math.max(0, this.shake - dt * 22);

    this.hud.update(this, dt);
  }

  render() {
    const v = this.view;
    v.camX = this.cam.x + (this.shake > 0 ? (liveRand() - 0.5) * this.shake : 0);
    v.camY = this.cam.y + (this.shake > 0 ? (liveRand() - 0.5) * this.shake : 0);
    v.zoom = this.cam.zoom;
    drawWorld(this.ctx, this, v);
  }
}

// --- Boot ---------------------------------------------------------------------------

const canvas = document.getElementById('game');
const game = new Game(canvas);

document.getElementById('start-button').addEventListener('click', () => game.startGame(true));
const continueButton = document.getElementById('continue-button');
if (hasSave()) {
  continueButton.classList.remove('hidden');
  continueButton.addEventListener('click', () => game.startGame(false));
}
document.getElementById('resume-button').addEventListener('click', () => {
  document.getElementById('pause-screen').classList.add('hidden');
  game.state = 'playing';
});
document.getElementById('save-button').addEventListener('click', () => {
  game.saveGame();
  game.say('Game saved.', 2);
});
document.getElementById('restart-button').addEventListener('click', () => {
  document.getElementById('pause-screen').classList.add('hidden');
  game.startGame(true);
});
document.getElementById('menu-button').addEventListener('click', () => {
  document.getElementById('pause-screen').classList.add('hidden');
  document.getElementById('menu-screen').classList.remove('hidden');
  game.state = 'menu';
});
document.getElementById('end-button').addEventListener('click', () => game.respawn());

let last = performance.now();
function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  try {
    game.update(dt);
    game.render();
  } catch (err) {
    window.__solmarError = String(err && err.stack ? err.stack : err);
    throw err;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__solmarReady = true;

// A small staging hook for screenshots and tests: it only moves the game
// into states a player can reach, then the live game renders the shot.
window.SOLMAR_DEBUG = {
  game,
  start() { game.startGame(true); },
  setWanted(n) { game.wanted = n; game.wantedQuiet = 0; },
  teleport(x, y) {
    game.player.x = x;
    game.player.y = y;
    if (game.player.inCar && game.player.car) {
      game.player.car.x = x;
      game.player.car.y = y;
    }
    game.cam.x = x - game.view.w / 2;
    game.cam.y = y - game.view.h / 2;
  },
  giveCar(type) {
    const car = makeCar(type || 'sport', game.player.x + 40, game.player.y, 0);
    car.role = 'player';
    game.cars.push(car);
    game.player.car = car;
    game.player.inCar = true;
    game.player.x = car.x;
    game.player.y = car.y;
    return car;
  },
  startMission(i) { startMission(game, i); },
  state() {
    return {
      state: game.state,
      wanted: game.wanted,
      money: game.player.money,
      health: Math.round(game.player.health),
      inCar: game.player.inCar,
      cars: game.cars.length,
      peds: game.peds.length,
      mission: game.mission ? game.mission.def.title : null,
    };
  },
};
