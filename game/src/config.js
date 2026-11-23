// Solmar Heat — shared tuning and world constants.
// One place for every number the rest of the game agrees on: the city grid,
// the car roster, the player, the wanted system and the mission rewards.

export const WORLD_W = 3600;
export const WORLD_H = 2600;

// City grid: roads run every ROAD_GAP pixels, ROAD_W wide. The first road
// centre sits half a gap from the world edge, so blocks are square.
export const ROAD_GAP = 450;
export const ROAD_W = 110;
export const ROAD_HALF = ROAD_W / 2;

export const ROAD_XS = [225, 675, 1125, 1575, 2025, 2475, 2925, 3375];
export const ROAD_YS = [225, 675, 1125, 1575, 2025, 2475];

// Sun-soaked coastal palette: warm asphalt, pale sidewalks, pastel blocks.
export const COLORS = {
  grass: '#7fae5a',
  sand: '#e8d29a',
  water: '#3f9fd8',
  road: '#4a4642',
  roadLine: '#e8d44d',
  sidewalk: '#cfc4ae',
  curb: '#9a8f7a',
  crosswalk: '#e8e4d8',
  park: '#5d9b4a',
  plaza: '#b8a888',
  roofA: '#c96f4a',
  roofB: '#4a7d8c',
  roofC: '#d8b25a',
  roofD: '#8c6f9e',
  roofE: '#b0503f',
  buildingEdge: '#00000033',
  hospital: '#e8e8e8',
  police: '#3a5a8c',
};

export const CAR_TYPES = {
  sedan:  { name: 'Sedan',  topSpeed: 330, accel: 220, reverse: 130, turn: 2.6, len: 52, wid: 26, colors: ['#c94f43', '#4a7d8c', '#d8b25a', '#7a8a99'] },
  taxi:   { name: 'Taxi',   topSpeed: 320, accel: 210, reverse: 125, turn: 2.6, len: 52, wid: 26, colors: ['#e8c33a'] },
  van:    { name: 'Van',    topSpeed: 270, accel: 160, reverse: 110, turn: 2.1, len: 62, wid: 28, colors: ['#e8e8e8', '#7a8a99'] },
  sport:  { name: 'Sport',  topSpeed: 430, accel: 320, reverse: 150, turn: 3.1, len: 50, wid: 25, colors: ['#d83a2e', '#2e6fd8', '#e8e8e8'] },
  truck:  { name: 'Truck',  topSpeed: 240, accel: 140, reverse: 100, turn: 1.9, len: 72, wid: 30, colors: ['#5a6b7a', '#8c6f4a'] },
  police: { name: 'Police', topSpeed: 400, accel: 300, reverse: 140, turn: 3.0, len: 54, wid: 27, colors: ['#20242c'] },
};

export const PLAYER = {
  walkSpeed: 175,
  runSpeed: 265,
  radius: 13,
  health: 100,
  punchDamage: 12,
};

export const WANTED = {
  maxStars: 5,
  decayQuietSeconds: 14,
  decayStepSeconds: 9,
  stealCar: 1,
  hitPed: 1,
  killPed: 2,
  shootCop: 2,
  damageCopCar: 1,
};

// Money the story pays out.
export const REWARDS = { mission1: 150, mission2: 300, mission3: 450, mission4: 700, fare: 60 };

// Fixed places the missions use, in world coordinates.
export const PLACES = {
  playerStart: { x: 1575, y: 1125 },
  garage: { x: 2025, y: 675 },
  safehouse: { x: 675, y: 2025 },
  docks: { x: 2925, y: 2475 },
  hospital: { x: 1125, y: 225 },
  policeStation: { x: 2475, y: 1575 },
  maraOffice: { x: 1575, y: 2025 },
  deliveryA: { x: 675, y: 225 },
  deliveryB: { x: 3375, y: 1125 },
  deliveryC: { x: 1125, y: 2475 },
  eddieSpot: { x: 2475, y: 1125 },
};
