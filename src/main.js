// Lantern Heist screens: the vault, swipe controls, the beams and the hint button.
import { Game, LevelSelect, Result, Scene, Title, backdrop, compose, dot, panel, text } from "./gamekit.js";
import { COLS, Heist, LEVELS, MOVES, ROWS, WAIT, WALL, beam, guardAt, makeLevel, period } from "./logic.js";

export const game = new Game({ id: "lantern-heist", title: "Lantern Heist", theme: { accent: "#fde68a", onAccent: "#2b1a05", bg: "#0c0906", bg2: "#2a1c0d", panel: "#33240f" }, defaults: { stars: [] } });
const data = game.store.data;
const CELL = 40, X0 = 15;

const HELP = [
  ["The job", "Take every treasure, then reach the exit. Swipe to step one tile, or tap the Wait button to stay still."],
  ["Lanterns", "Guards only move when you do. Each carries a lantern that lights three tiles ahead. End your turn in the light and you are caught. Walls stop the beam."],
  ["Reading patrols", "A faded mark shows where each guard goes next, and pale tiles show where the beam will fall after your next move. Plan for that, not for where it is now."],
  ["Keys and doors", "Some vaults have a locked door. Find the key first. An open door lets lantern light through too."],
  ["Stars", "Three stars for matching the shortest route. Undo steps back as far as you like. Using a hint limits you to one star."],
];

function art(c, g, t) {
  backdrop(c, g, t);
  const x = 195 + Math.sin(t * 0.7) * 90;
  const beamGrad = c.createRadialGradient(x, 330, 8, x, 330, 150);
  beamGrad.addColorStop(0, "rgba(253,230,138,.6)");
  beamGrad.addColorStop(1, "rgba(253,230,138,0)");
  c.fillStyle = beamGrad;
  c.beginPath();
  c.arc(x, 330, 150, 0, Math.PI * 2);
  c.fill();
  dot(c, x, 330, 10, "#fde68a");
}

const title = () => new Title(game, { tag: "Stay out of the light", art, help: HELP, play: () => game.go(levels()) });
const levels = () => new LevelSelect(game, {
  title: "Vaults",
  count: LEVELS,
  unlocked: (i) => i === 0 || (data.stars[i - 1] || 0) > 0,
  stars: (i) => data.stars[i] || 0,
  pick: (i) => game.go(new Vault(game, i)),
  back: () => game.go(title()),
});

class Vault extends Scene {
  constructor(g, index) { super(g); this.index = index; }
  get y0() { return 58 + Math.max(0, (this.g.H - 58 - 80 - ROWS * CELL) / 2); }
  enter() {
    const g = this.g, ui = this.ui, y = g.H - 74;
    this.lv = makeLevel(this.index);
    this.h = new Heist(this.lv);
    this.flash = 0;
    this.nextHint = null;
    g.sound.music(compose(this.index + 61, 64, 82));
    ui.button(10, 10, 62, 34, "Menu", () => { g.sound.stopMusic(); g.go(levels()); }, { size: 13 });
    ui.button(g.W - 72, 10, 62, 34, "Restart", () => { this.h = new Heist(this.lv); this.nextHint = null; }, { size: 12 });
    ui.button(15, y, 112, 62, "Undo", () => { this.h.undo(); this.nextHint = null; }, { size: 15 });
    ui.button(139, y, 112, 62, "Wait", () => this.step(WAIT), { style: "primary", size: 15 });
    ui.button(263, y, 112, 62, "Hint", () => this.hint(), { sub: "1 star only", size: 15 });
  }
  hint() {
    if (this.h.state !== "playing") return;
    const m = this.h.hint();
    if (m == null) { this.note = "No way out from here. Undo or restart."; this.noteT = 2.5; return; }
    this.h.hints++;
    this.nextHint = m;
  }
  step(m) {
    const g = this.g, h = this.h;
    this.nextHint = null;
    const taken = h.taken.size, key = h.hasKey;
    if (!h.move(m)) return g.sound.play("bad");
    g.sound.tone(180 + Math.random() * 20, 0.05, { type: "triangle", vol: 0.1 });
    if (h.taken.size > taken) { g.sound.play("coin"); g.fx.float(this.x(h.c), this.y(h.r) - 12, "Taken", g.theme.gold, 14); }
    if (h.hasKey && !key) { g.sound.play("ok"); g.fx.float(this.x(h.c), this.y(h.r) - 12, "Key", g.theme.gold, 14); }
    if (h.state === "caught") {
      g.sound.play("bad");
      g.shake(0.3);
      g.buzz(80);
      this.note = "Spotted. Undo or restart.";
      this.noteT = 2.5;
    }
    if (h.state === "escaped") this.win();
  }
  win() {
    const g = this.g, h = this.h, i = this.index, s = h.stars();
    g.sound.stopMusic();
    if (s > (data.stars[i] || 0)) { data.stars[i] = s; g.store.save(); }
    const buttons = [];
    if (i + 1 < LEVELS) buttons.push(["Next vault", () => g.go(new Vault(g, i + 1)), "primary"]);
    buttons.push(["Try for fewer moves", () => g.go(new Vault(g, i))], ["Vaults", () => g.go(levels())]);
    g.go(new Result(g, { title: "Clean getaway", stars: s, lines: [`Vault ${i + 1}`, `${h.moves} moves. Shortest is ${this.lv.par}`, h.hints ? `${h.hints} hints used` : ""], buttons }));
  }
  x(c) { return X0 + (c + 0.5) * CELL; }
  y(r) { return this.y0 + (r + 0.5) * CELL; }
  down(p) { this.start = p; }
  up(p) {
    const s = this.start;
    this.start = null;
    if (!s || this.h.state === "caught") return;
    const dx = p.x - s.x, dy = p.y - s.y;
    if (Math.hypot(dx, dy) < 18) {
      const c = Math.floor((p.x - X0) / CELL), r = Math.floor((p.y - this.y0) / CELL);
      const step = MOVES.findIndex(([a, b], i) => i !== WAIT && this.h.c + a === c && this.h.r + b === r);
      if (step >= 0) this.step(step);
      return;
    }
    this.step(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
  }
  update(dt) { if (this.noteT > 0) this.noteT -= dt; }
  draw(c) {
    const g = this.g, lv = this.lv, h = this.h, y0 = this.y0;
    c.fillStyle = g.theme.bg;
    c.fillRect(0, 0, g.W, g.H);
    text(c, `Vault ${this.index + 1}`, g.W / 2, 18, { size: 16, weight: 800 });
    text(c, `${h.moves} moves, shortest ${lv.par}`, g.W / 2, 38, { size: 12, color: g.theme.muted });
    for (let r = 0; r < ROWS; r++) {
      for (let col = 0; col < COLS; col++) {
        panel(c, X0 + col * CELL, y0 + r * CELL, CELL + 0.5, CELL + 0.5, lv.map[r][col] === WALL ? "#4a3a24" : "#17120b", 2);
        if (lv.map[r][col] === WALL) { c.fillStyle = "#5c4a30"; c.fillRect(X0 + col * CELL, y0 + r * CELL, CELL, 5); }
      }
    }
    const cell = (x, y, color) => { c.fillStyle = color; c.fillRect(X0 + x * CELL + 1, y0 + y * CELL + 1, CELL - 2, CELL - 2); };
    for (const gd of lv.guards) {
      for (const [x, y] of beam(lv, guardAt(gd, h.turn + 1), h.hasKey)) cell(x, y, "rgba(253,230,138,.13)");
      for (const [x, y] of beam(lv, guardAt(gd, h.turn), h.hasKey)) cell(x, y, "rgba(253,230,138,.42)");
    }
    const e = lv.exit;
    panel(c, this.x(e.c) - 15, this.y(e.r) - 15, 30, 30, h.taken.size === lv.loot.length ? "#22c55e" : "#14532d", 6);
    text(c, "EXIT", this.x(e.c), this.y(e.r), { size: 9, weight: 800 });
    lv.loot.forEach((t, i) => { if (!h.taken.has(i)) { c.save(); c.translate(this.x(t.c), this.y(t.r)); c.rotate(Math.PI / 4); c.fillStyle = g.theme.gold; c.fillRect(-8, -8, 16, 16); c.restore(); } });
    if (lv.door && !h.hasKey) panel(c, this.x(lv.door.c) - 17, this.y(lv.door.r) - 17, 34, 34, "#92400e", 4, "#fbbf24");
    if (lv.key && !h.hasKey) { dot(c, this.x(lv.key.c), this.y(lv.key.r) - 4, 6, "#fbbf24"); c.fillStyle = "#fbbf24"; c.fillRect(this.x(lv.key.c) - 1.5, this.y(lv.key.r), 3, 11); }
    for (const gd of lv.guards) {
      const p = guardAt(gd, h.turn), n = guardAt(gd, h.turn + 1);
      if (period(gd) > 1) dot(c, this.x(n.c), this.y(n.r), 5, "rgba(248,113,113,.4)");
      dot(c, this.x(p.c), this.y(p.r), 13, "#ef4444");
      dot(c, this.x(p.c) + p.dx * 9, this.y(p.r) + p.dy * 9, 5, "#fde68a");
    }
    dot(c, this.x(h.c), this.y(h.r), 13, h.state === "caught" ? "#64748b" : "#38bdf8");
    dot(c, this.x(h.c), this.y(h.r), 6, "#0c0906");
    if (this.nextHint != null) {
      const [a, b] = MOVES[this.nextHint];
      const label = this.nextHint === WAIT ? "Wait here" : "Go this way";
      c.strokeStyle = "#4ade80";
      c.lineWidth = 3;
      c.strokeRect(X0 + (h.c + a) * CELL + 3, y0 + (h.r + b) * CELL + 3, CELL - 6, CELL - 6);
      text(c, label, g.W / 2, y0 - 8, { size: 12, color: "#86efac", weight: 700 });
    }
    if (this.noteT > 0) { panel(c, 45, y0 + 190, 300, 52, "rgba(0,0,0,.82)", 12); text(c, this.note, g.W / 2, y0 + 216, { size: 15, weight: 700, color: "#fca5a5" }); }
  }
}

game.start(title());
