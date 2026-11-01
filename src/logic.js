// Lantern Heist rules: a turn-based stealth puzzle. Guards carry lanterns on fixed patrols. No drawing here, so it can be tested.
import { Rng } from "./gamekit.js";

export const COLS = 9, ROWS = 11, LEVELS = 40, BEAM = 3;
export const WALL = 1, FLOOR = 0;
export const MOVES = [[0, -1], [1, 0], [0, 1], [-1, 0], [0, 0]];   // up, right, down, left, wait
export const WAIT = 4;

const key = (c, r) => c + "," + r;
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const lcm = (a, b) => (a * b) / gcd(a, b);

/** Where a guard stands and faces on a turn. Routes run to the end and back, or round a loop. */
export function guardAt(g, turn) {
  const n = g.route.length;
  const span = g.loop ? n : Math.max(1, (n - 1) * 2);
  const i = turn % span;
  const idx = g.loop ? i : i < n ? i : span - i;
  const nextI = (i + 1) % span;
  const nextIdx = g.loop ? nextI : nextI < n ? nextI : span - nextI;
  const [c, r] = g.route[idx], [nc, nr] = g.route[nextIdx];
  const dir = nc !== c || nr !== r ? [Math.sign(nc - c), Math.sign(nr - r)] : g.facing || [0, 1];
  return { c, r, dx: dir[0], dy: dir[1] };
}
export const period = (g) => (g.loop ? g.route.length : Math.max(1, (g.route.length - 1) * 2));

/** The tiles lit by a lantern: straight ahead, stopped by walls and closed doors. */
export function beam(level, p, doorOpen = false) {
  const out = [];
  let { c, r } = p;
  for (let i = 0; i < BEAM; i++) {
    c += p.dx; r += p.dy;
    if (blocked(level, c, r, doorOpen)) break;
    out.push([c, r]);
  }
  return out;
}

export function blocked(level, c, r, doorOpen) {
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS || level.map[r][c] === WALL) return true;
  return !doorOpen && level.door && level.door.c === c && level.door.r === r;
}

/** One rule for the game and the solver: can a thief at c, r on this turn be seen? */
export function seenAt(level, c, r, turn, doorOpen) {
  for (const g of level.guards) {
    const p = guardAt(g, turn);
    if (p.c === c && p.r === r) return true;
    if (beam(level, p, doorOpen).some(([x, y]) => x === c && y === r)) return true;
  }
  return false;
}

function swapped(level, from, to, turn) {
  return level.guards.some((g) => {
    const a = guardAt(g, turn), b = guardAt(g, turn + 1);
    return a.c === to.c && a.r === to.r && b.c === from.c && b.r === from.r;
  });
}

/** Breadth-first search over position, patrol phase, treasure taken and whether the key is held. */
export function solve(level, { ignoreGuards = false } = {}) {
  const span = ignoreGuards ? 1 : level.guards.reduce((a, g) => lcm(a, period(g)), 1);
  const items = level.loot;
  const full = (1 << items.length) - 1;
  const lootBit = new Map(items.map((t, i) => [key(t.c, t.r), 1 << i]));
  const id = (c, r, ph, m, k) => (((((c * ROWS + r) * span + ph) * (full + 1) + m) * 2) + k);
  const start = { c: level.start.c, r: level.start.r, ph: 0, m: 0, k: 0, moves: [] };
  const prev = new Map([[id(start.c, start.r, 0, 0, 0), null]]);
  const q = [{ ...start }];
  for (let i = 0; i < q.length; i++) {
    const s = q[i];
    if (s.m === full && s.c === level.exit.c && s.r === level.exit.r) {
      const path = [];
      for (let cur = s; prev.get(cur.key); cur = prev.get(cur.key).from) path.unshift(prev.get(cur.key).move);
      return path;
    }
    for (let mv = 0; mv < 5; mv++) {
      const c = s.c + MOVES[mv][0], r = s.r + MOVES[mv][1];
      if (blocked(level, c, r, s.k === 1)) continue;
      if (!ignoreGuards && swapped(level, s, { c, r }, s.ph)) continue;
      const ph = (s.ph + 1) % span;
      if (!ignoreGuards && seenAt(level, c, r, ph, s.k === 1)) continue;
      const m = s.m | (lootBit.get(key(c, r)) || 0);
      const k = s.k || (level.key && level.key.c === c && level.key.r === r ? 1 : 0);
      const nid = id(c, r, ph, m, k);
      if (prev.has(nid)) continue;
      const n = { c, r, ph, m, k, key: nid };
      prev.set(nid, { from: s, move: mv });
      q.push(n);
    }
  }
  return null;
}

function attempt(i, n) {
  const rng = new Rng(5150 + i * 211 + n * 4099);
  const map = Array.from({ length: ROWS }, () => Array(COLS).fill(FLOOR));
  const blocks = 5 + Math.min(7, Math.floor(i / 4));
  for (let b = 0; b < blocks; b++) {
    const horizontal = rng.chance(0.5), len = rng.int(2, 5);
    let c = rng.int(0, COLS - 1), r = rng.int(1, ROWS - 2);
    for (let k = 0; k < len; k++) {
      if (c >= 0 && c < COLS && r >= 0 && r < ROWS) map[r][c] = WALL;
      if (horizontal) c++; else r++;
    }
  }
  const floors = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (map[r][c] === FLOOR) floors.push({ c, r });
  const bottom = floors.filter((f) => f.r >= ROWS - 2), top = floors.filter((f) => f.r <= 1);
  if (!bottom.length || !top.length) return null;
  const start = rng.pick(bottom), exit = rng.pick(top);
  const guards = [];
  const want = 1 + Math.min(4, Math.floor(i / 6));
  for (let t = 0; t < 40 && guards.length < want; t++) {
    const s = rng.pick(floors);
    const [dx, dy] = rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
    const route = [[s.c, s.r]];
    for (let k = 1; k < rng.int(3, 7); k++) {
      const c = s.c + dx * k, r = s.r + dy * k;
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS || map[r][c] === WALL) break;
      route.push([c, r]);
    }
    if (route.length < 2) continue;
    if (Math.abs(s.c - start.c) + Math.abs(s.r - start.r) < 4) continue;
    guards.push({ route, loop: false, id: guards.length });
  }
  if (!guards.length) return null;
  const pool = rng.shuffle(floors.filter((f) => f !== start && f !== exit));
  const lootCount = 1 + Math.min(2, Math.floor(i / 10));
  const loot = pool.slice(0, lootCount);
  let door = null, keyAt = null;
  if (i >= 10 && i % 2 === 0) {
    const d = pool.slice(lootCount).find((p) => {
      const lr = map[p.r]?.[p.c - 1] === WALL && map[p.r]?.[p.c + 1] === WALL, ud = map[p.r - 1]?.[p.c] === WALL && map[p.r + 1]?.[p.c] === WALL;
      return lr || ud;
    });
    if (d) { door = d; keyAt = pool[lootCount + 1]; if (keyAt === d) return null; }
  }
  return { index: i, map, start, exit, guards, loot, door, key: keyAt };
}

const memo = new Map();

/** Generated levels are kept only if the solver proves them possible and the guards truly get in the way. */
export function makeLevel(i) {
  if (memo.has(i)) return memo.get(i);
  const need = Math.min(26, 8 + Math.floor(i / 2));
  let backup = null;
  for (let n = 0; n < 900; n++) {
    const lv = attempt(i, n);
    if (!lv) continue;
    if (seenAt(lv, lv.start.c, lv.start.r, 0, false)) continue;
    const path = solve(lv);
    if (!path) continue;
    const free = solve(lv, { ignoreGuards: true });
    const detour = path.length - free.length;
    lv.solution = path;
    lv.par = path.length;
    if (!backup || detour > backup.detour) { backup = lv; backup.detour = detour; }
    if (path.length >= need && detour >= (i < 3 ? 0 : 2)) { memo.set(i, lv); return lv; }
  }
  if (!backup) throw new Error("no level " + i);
  memo.set(i, backup);
  return backup;
}

export class Heist {
  constructor(level) {
    this.level = level;
    this.c = level.start.c;
    this.r = level.start.r;
    this.turn = 0;
    this.moves = 0;
    this.taken = new Set();
    this.hasKey = false;
    this.state = "playing";
    this.history = [];
    this.hints = 0;
  }
  saved() { return { c: this.c, r: this.r, turn: this.turn, moves: this.moves, taken: new Set(this.taken), hasKey: this.hasKey }; }
  move(m) {
    if (this.state !== "playing") return false;
    const lv = this.level;
    const c = this.c + MOVES[m][0], r = this.r + MOVES[m][1];
    if (blocked(lv, c, r, this.hasKey)) return false;
    this.history.push(this.saved());
    const from = { c: this.c, r: this.r };
    this.c = c; this.r = r;
    this.moves++;
    const swap = swapped(lv, from, { c, r }, this.turn);
    this.turn++;
    if (lv.key && lv.key.c === c && lv.key.r === r) this.hasKey = true;
    lv.loot.forEach((t, i) => { if (t.c === c && t.r === r) this.taken.add(i); });
    if (swap || seenAt(lv, c, r, this.turn, this.hasKey)) { this.state = "caught"; return true; }
    if (this.taken.size === lv.loot.length && c === lv.exit.c && r === lv.exit.r) this.state = "escaped";
    return true;
  }
  undo() {
    const s = this.history.pop();
    if (!s) return false;
    Object.assign(this, s);
    this.state = "playing";
    return true;
  }
  /** The next move of a shortest route from here, or null if this position cannot be saved. */
  hint() {
    const lv = this.level;
    const copy = { ...lv, start: { c: this.c, r: this.r }, loot: lv.loot.filter((_, i) => !this.taken.has(i)), key: this.hasKey ? null : lv.key };
    const open = this.hasKey ? { ...copy, door: null } : copy;
    const shift = this.turn;
    const moved = { ...open, guards: lv.guards.map((g) => ({ ...g, shift })) };
    return hintFrom(moved, shift);
  }
  stars() {
    if (this.state !== "escaped") return 0;
    const over = this.moves - this.level.par;
    return this.hints ? 1 : over <= 0 ? 3 : over <= 4 ? 2 : 1;
  }
}

function hintFrom(level, shift) {
  const span = level.guards.reduce((a, g) => lcm(a, period(g)), 1);
  const phased = { ...level, guards: level.guards.map((g) => rotate(g, shift % span)) };
  const path = solve(phased);
  return path?.length ? path[0] : null;
}

/** The same patrol, started some turns later: written out as a loop so that the solver can begin mid-route. */
function rotate(g, by) {
  const p = period(g);
  const route = [];
  const facing = [];
  for (let i = 0; i < p; i++) { const s = guardAt(g, i + by); route.push([s.c, s.r]); facing.push([s.dx, s.dy]); }
  return { route, loop: true, facing: facing[0], id: g.id };
}
