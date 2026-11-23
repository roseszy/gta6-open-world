// Solmar Heat — keyboard and mouse input, kept in one place.
// The game reads plain state (which keys are down, where the mouse is) and
// never listens for keys anywhere else, so rebinding is a one-line change.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    // Edge-triggered presses: keydown records them here and keyup never
    // clears them, so a quick tap cannot fall between two frames unseen.
    this.pressedKeys = new Set();
    this.mouse = { x: 0, y: 0, down: false, clicked: false };
    this.canvas = canvas;
    this.anyKey = false;
    this.onFirstGesture = null;

    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat) {
        this.keys.add(e.code);
        this.pressedKeys.add(e.code);
        this.anyKey = true;
        if (this.onFirstGesture) { const f = this.onFirstGesture; this.onFirstGesture = null; f(); }
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouse.down = true;
        this.mouse.clicked = true;
        if (this.onFirstGesture) { const f = this.onFirstGesture; this.onFirstGesture = null; f(); }
      }
    });
    window.addEventListener('mouseup', () => { this.mouse.down = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(code) { return this.keys.has(code); }

  // Movement intent as a unit-ish vector, from WASD or arrows.
  moveVector() {
    let x = 0;
    let y = 0;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyW') || this.down('ArrowUp')) y -= 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y += 1;
    if (x !== 0 && y !== 0) { x *= 0.7071; y *= 0.7071; }
    return { x, y };
  }

  get running() { return this.down('ShiftLeft') || this.down('ShiftRight'); }
  get handbrake() { return this.down('Space'); }

  // Edge-triggered helpers: call once per frame, they clear themselves.
  consumeClicked() {
    const c = this.mouse.clicked;
    this.mouse.clicked = false;
    return c;
  }

  pressed(code) {
    if (this.pressedKeys.has(code)) {
      this.pressedKeys.delete(code);
      return true;
    }
    return false;
  }
}
