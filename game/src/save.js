// Solmar Heat — saving to localStorage. The save holds what a returning
// player needs: money, how far the story got, health and where Leo stands.
// It is written on every mission completion and from the pause menu.

const KEY = 'solmar-heat-save-v1';

export function saveGameData(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadGameData() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function hasSave() {
  return loadGameData() !== null;
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ }
}
