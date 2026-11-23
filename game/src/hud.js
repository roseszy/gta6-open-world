// Solmar Heat — the HUD: health, money, wanted stars, objective, dialogue
// and the minimap. The HUD is DOM so its text stays crisp, and the minimap
// is its own small canvas drawn from the same world the game renders.

import { ROAD_XS, ROAD_YS, WORLD_W, WORLD_H } from './config.js';

export class Hud {
  constructor(doc) {
    this.doc = doc;
    this.healthFill = doc.getElementById('health-fill');
    this.healthText = doc.getElementById('health-text');
    this.moneyText = doc.getElementById('money');
    this.starsBox = doc.getElementById('stars');
    this.objectiveBox = doc.getElementById('objective');
    this.dialogBox = doc.getElementById('dialog');
    this.speedBox = doc.getElementById('speed');
    this.minimap = doc.getElementById('minimap');
    this.mm = this.minimap.getContext('2d');
    this.dialogTimer = 0;
    this.dialogQueue = [];
  }

  say(text, seconds) {
    this.dialogQueue.push({ text, seconds });
  }

  update(g, dt) {
    // Dialogue lines queue up and show one at a time.
    if (this.dialogTimer > 0) {
      this.dialogTimer -= dt;
      if (this.dialogTimer <= 0) this.dialogBox.classList.add('hidden');
    }
    if (this.dialogTimer <= 0 && this.dialogQueue.length > 0) {
      const line = this.dialogQueue.shift();
      this.dialogBox.textContent = line.text;
      this.dialogBox.classList.remove('hidden');
      this.dialogTimer = line.seconds;
    }

    const p = g.player;
    const hp = Math.max(0, Math.round(p.health));
    this.healthFill.style.width = `${hp}%`;
    this.healthFill.style.background = hp > 50 ? '#4caf50' : hp > 25 ? '#e8a33a' : '#d83a2e';
    this.healthText.textContent = `${hp}`;
    this.moneyText.textContent = `$${p.money}`;

    // Wanted stars.
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < g.wanted ? '★' : '☆';
    this.starsBox.textContent = stars;
    this.starsBox.classList.toggle('hot', g.wanted > 0);

    // Mission objective.
    if (g.mission) {
      this.objectiveBox.textContent = `◆ ${g.mission.def.title} — ${g.mission.objective}`;
      this.objectiveBox.classList.remove('hidden');
    } else if (g.fare) {
      const f = g.fare;
      this.objectiveBox.textContent = f.stage === 0 ? '◆ Fare — pick up the passenger' : '◆ Fare — drive to the drop-off';
      this.objectiveBox.classList.remove('hidden');
    } else if (g.missionsDone >= 4) {
      this.objectiveBox.textContent = '◆ Story complete — free roam. Fares keep coming.';
      this.objectiveBox.classList.remove('hidden');
    } else {
      this.objectiveBox.textContent = '◆ Talk to Mara — next mission coming up';
      this.objectiveBox.classList.remove('hidden');
    }

    // Speedometer, only while driving.
    if (p.inCar && p.car) {
      const kmh = Math.round(Math.abs(p.car.speed) * 0.32);
      this.speedBox.textContent = `${kmh} km/h · ${p.car.def.name}`;
      this.speedBox.classList.remove('hidden');
    } else {
      this.speedBox.classList.add('hidden');
    }

    this.drawMinimap(g);
  }

  drawMinimap(g) {
    const c = this.mm;
    const W = this.minimap.width;
    const H = this.minimap.height;
    const sx = W / WORLD_W;
    const sy = H / WORLD_H;

    c.fillStyle = '#2c3a2a';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#5d9b4a';
    c.fillRect(0, 0, W, H);
    // Water on the east edge.
    c.fillStyle = '#3f9fd8';
    c.fillRect(W - 6, 0, 6, H);
    // Roads.
    c.strokeStyle = '#4a4642';
    c.lineWidth = 3;
    for (const rx of ROAD_XS) {
      c.beginPath();
      c.moveTo(rx * sx, 0);
      c.lineTo(rx * sx, H);
      c.stroke();
    }
    for (const ry of ROAD_YS) {
      c.beginPath();
      c.moveTo(0, ry * sy);
      c.lineTo(W, ry * sy);
      c.stroke();
    }
    // Mission markers.
    const marks = [];
    if (g.mission) marks.push(...g.mission.markers.map((m) => ({ x: m.x, y: m.y, color: m.color })));
    if (g.fare) {
      const f = g.fare;
      marks.push({ x: f.stage === 0 ? f.from.x : f.to.x, y: f.stage === 0 ? f.from.y : f.to.y, color: '#7de07d' });
    }
    for (const m of marks) {
      c.fillStyle = m.color;
      c.beginPath();
      c.arc(m.x * sx, m.y * sy, 4, 0, Math.PI * 2);
      c.fill();
    }
    // Traffic as pale dots, police as red dots.
    for (const car of g.cars) {
      if (car.role === 'police') {
        c.fillStyle = '#ff4d4d';
        c.beginPath();
        c.arc(car.x * sx, car.y * sy, 3, 0, Math.PI * 2);
        c.fill();
      } else if (car.role === 'traffic') {
        c.fillStyle = 'rgba(255,255,255,0.75)';
        c.fillRect(car.x * sx - 1, car.y * sy - 1, 2, 2);
      }
    }
    // The player: a yellow arrow pointing where it faces.
    const p = g.player;
    const px = p.inCar ? p.car.x : p.x;
    const py = p.inCar ? p.car.y : p.y;
    const pa = p.inCar ? p.car.angle : p.angle;
    c.save();
    c.translate(px * sx, py * sy);
    c.rotate(pa);
    c.fillStyle = '#ffe14d';
    c.beginPath();
    c.moveTo(7, 0);
    c.lineTo(-5, -5);
    c.lineTo(-5, 5);
    c.closePath();
    c.fill();
    c.restore();
    // View frame.
    c.strokeStyle = 'rgba(255,255,255,0.5)';
    c.lineWidth = 1;
    c.strokeRect(0.5, 0.5, W - 1, H - 1);
  }
}
