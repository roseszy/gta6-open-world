// Solmar Heat — the story. Leo Cruz rolls into Solmar City broke, and the
// fixer Mara Voss has work for him. Four missions in a row, each with an
// objective on the HUD and the minimap, dialogue from Mara, and a cash reward.
// After the last one the city is Leo's: taxi fares keep the money coming.

import { PLACES, REWARDS } from './config.js';
import { dist2, liveRand, pick, range } from './rng.js';
import { makeGangMember } from './people.js';

export const STORY = {
  hero: 'Leo Cruz',
  fixer: 'Mara Voss',
  city: 'Solmar City',
  intro: 'Leo Cruz just rolled into Solmar City with $40 and a dead phone. The fixer Mara Voss has work — if he can drive.',
};

function marker(x, y, label, color) {
  return { x, y, label, color: color || '#e8c33a' };
}

export function missionList() {
  return [
    {
      id: 1,
      title: 'Wheels Up',
      briefing: 'Mara: "First rule of Solmar — wheels are everything. Take any car on the street and bring it to my garage."',
      reward: REWARDS.mission1,
    },
    {
      id: 2,
      title: 'Hot Delivery',
      briefing: 'Mara: "Three packages, three corners of town, two and a half minutes. The buyers do not wait, Leo."',
      reward: REWARDS.mission2,
    },
    {
      id: 3,
      title: 'The Pickup',
      briefing: 'Mara: "My friend Eddie is waiting at the east plaza. Fetch him, bring him to the safehouse — and the cops are already looking."',
      reward: REWARDS.mission3,
    },
    {
      id: 4,
      title: 'Turf War',
      briefing: 'Mara: "The Lobos took the docks. Clear them out, Leo. Then come home. Bring a gun."',
      reward: REWARDS.mission4,
    },
  ];
}

// A mission's live state lives on the game object (g.mission). These
// functions run it: start sets it up, update drives it forward.
export function startMission(g, index) {
  const defs = missionList();
  const def = defs[index];
  g.mission = {
    index,
    def,
    stage: 0,
    timer: 0,
    markers: [],
    objective: '',
    done: false,
    failed: false,
  };
  g.say(def.briefing, 6);
  g.audio.pickup();

  if (index === 0) {
    g.mission.markers = [marker(PLACES.garage.x, PLACES.garage.y, 'Garage')];
    g.mission.objective = 'Steal a car (E) and drive to the garage';
  } else if (index === 1) {
    g.mission.timer = 150;
    g.mission.deliveries = [
      { ...PLACES.deliveryA, done: false },
      { ...PLACES.deliveryB, done: false },
      { ...PLACES.deliveryC, done: false },
    ];
    g.mission.markers = g.mission.deliveries.map((d) => marker(d.x, d.y, 'Drop'));
    g.mission.objective = 'Deliver 3 packages — 0/3';
  } else if (index === 2) {
    g.mission.markers = [marker(PLACES.eddieSpot.x, PLACES.eddieSpot.y, 'Eddie')];
    g.mission.objective = 'Pick up Eddie at the east plaza';
    g.eddie = { x: PLACES.eddieSpot.x, y: PLACES.eddieSpot.y, state: 'wait' };
  } else if (index === 3) {
    g.gang = [];
    const spots = [
      { x: PLACES.docks.x - 90, y: PLACES.docks.y - 60 },
      { x: PLACES.docks.x + 70, y: PLACES.docks.y - 40 },
      { x: PLACES.docks.x - 40, y: PLACES.docks.y + 70 },
      { x: PLACES.docks.x + 100, y: PLACES.docks.y + 50 },
    ];
    for (const s of spots) g.gang.push(makeGangMember(s.x, s.y));
    g.mission.markers = [marker(PLACES.docks.x, PLACES.docks.y, 'Docks', '#d83a2e')];
    g.mission.objective = 'Clear the Lobos from the docks — 0/4';
  }
}

function completeMission(g) {
  const m = g.mission;
  m.done = true;
  g.player.money += m.def.reward;
  g.floatText(g.player.x, g.player.y - 30, `+$${m.def.reward}`, '#7de07d');
  g.say(`Mission complete: ${m.def.title} — $${m.def.reward} earned.`, 5);
  g.audio.missionDone();
  g.missionsDone = m.index + 1;
  g.saveGame();
  g.mission = null;
  // A short breather, then the next job calls.
  g.nextMissionIn = 6;
}

function failMission(g, why) {
  const m = g.mission;
  m.failed = true;
  g.say(`Mission failed: ${why} Talk to Mara to try again.`, 6);
  g.audio.missionFail();
  g.mission = null;
  g.nextMissionIn = 8;
}

export function updateMission(g, dt) {
  const m = g.mission;
  if (!m) return;
  const p = g.player;

  if (m.index === 0) {
    if (p.inCar && dist2(p.car.x, p.car.y, PLACES.garage.x, PLACES.garage.y) < 70 * 70) {
      completeMission(g);
    }
  } else if (m.index === 1) {
    m.timer -= dt;
    if (m.timer <= 0) {
      failMission(g, 'Out of time on the deliveries.');
      return;
    }
    const tx = p.inCar ? p.car.x : p.x;
    const ty = p.inCar ? p.car.y : p.y;
    let done = 0;
    for (const d of m.deliveries) {
      if (!d.done && dist2(tx, ty, d.x, d.y) < 60 * 60) {
        d.done = true;
        g.audio.coin();
        g.floatText(d.x, d.y, 'Delivered', '#7de07d');
      }
      if (d.done) done++;
    }
    m.markers = m.deliveries.filter((d) => !d.done).map((d) => marker(d.x, d.y, 'Drop'));
    m.objective = `Deliver 3 packages — ${done}/3 (${Math.ceil(m.timer)}s)`;
    if (done === 3) completeMission(g);
  } else if (m.index === 2) {
    if (m.stage === 0) {
      const tx = p.inCar ? p.car.x : p.x;
      const ty = p.inCar ? p.car.y : p.y;
      if (dist2(tx, ty, PLACES.eddieSpot.x, PLACES.eddieSpot.y) < 60 * 60) {
        m.stage = 1;
        g.eddie.state = 'riding';
        g.say('Eddie: "Finally! Drive, Leo — the cops are onto us!"', 5);
        g.addWanted(2);
        g.spawnPolice(2);
        g.mission.markers = [marker(PLACES.safehouse.x, PLACES.safehouse.y, 'Safehouse', '#7de07d')];
        g.mission.objective = 'Lose the cops and reach the safehouse';
      }
    } else if (m.stage === 1) {
      const tx = p.inCar ? p.car.x : p.x;
      const ty = p.inCar ? p.car.y : p.y;
      if (dist2(tx, ty, PLACES.safehouse.x, PLACES.safehouse.y) < 70 * 70) {
        g.eddie = null;
        completeMission(g);
      }
    }
  } else if (m.index === 3) {
    const alive = g.gang.filter((gm) => gm.state !== 'dead').length;
    const killed = 4 - alive;
    m.objective = `Clear the Lobos from the docks — ${killed}/4`;
    if (alive === 0 && m.stage === 0) {
      m.stage = 1;
      g.say('Mara: "The docks are ours. Come back to my office, Leo."', 5);
      g.mission.markers = [marker(PLACES.maraOffice.x, PLACES.maraOffice.y, "Mara's", '#7de07d')];
      m.objective = "Return to Mara's office";
    }
    if (m.stage === 1) {
      const tx = p.inCar ? p.car.x : p.x;
      const ty = p.inCar ? p.car.y : p.y;
      if (dist2(tx, ty, PLACES.maraOffice.x, PLACES.maraOffice.y) < 70 * 70) {
        g.say('Mara: "Solmar is yours now, Leo. The city pays those who drive it."', 6);
        completeMission(g);
      }
    }
  }
}

// --- Taxi fares: the post-story money loop --------------------------------

export function startFare(g) {
  const spots = [
    { x: 675, y: 675 }, { x: 2025, y: 1125 }, { x: 1125, y: 1575 },
    { x: 2925, y: 675 }, { x: 1575, y: 2475 }, { x: 2475, y: 225 },
  ];
  const from = pick(liveRand, spots);
  const to = pick(liveRand, spots.filter((s) => s !== from));
  g.fare = {
    stage: 0,
    from, to,
    pay: range(liveRand, 40, 90) | 0,
  };
  g.say(`Fare: pick up the passenger at the marker, then drive them across town. Pays $${g.fare.pay}.`, 5);
}

export function updateFare(g, dt) {
  const f = g.fare;
  if (!f) return;
  const p = g.player;
  const tx = p.inCar ? p.car.x : p.x;
  const ty = p.inCar ? p.car.y : p.y;
  if (f.stage === 0) {
    if (dist2(tx, ty, f.from.x, f.from.y) < 60 * 60) {
      f.stage = 1;
      g.say('Passenger: "Take me across town, and step on it!"', 4);
    }
  } else if (dist2(tx, ty, f.to.x, f.to.y) < 60 * 60) {
    p.money += f.pay;
    g.floatText(tx, ty - 30, `+$${f.pay}`, '#7de07d');
    g.audio.coin();
    g.fare = null;
    g.fareCooldown = 10;
  }
}
