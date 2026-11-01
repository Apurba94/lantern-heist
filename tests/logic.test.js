import assert from "node:assert/strict";
import test from "node:test";
import { COLS, FLOOR, Heist, LEVELS, MOVES, ROWS, WAIT, WALL, beam, blocked, guardAt, makeLevel, seenAt, solve } from "../src/logic.js";

const empty = () => Array.from({ length: ROWS }, () => Array(COLS).fill(FLOOR));
function level(extra = {}) {
  return { map: empty(), start: { c: 0, r: 10 }, exit: { c: 8, r: 0 }, guards: [], loot: [], door: null, key: null, par: 18, ...extra };
}
const guard = (route, loop = false) => ({ route, loop, id: 0 });
const UP = 0, RIGHT = 1, DOWN = 2, LEFT = 3;

test("a guard walks to the end of the route and back", () => {
  const g = guard([[1, 1], [2, 1], [3, 1]]);
  assert.deepEqual([0, 1, 2, 3, 4].map((t) => guardAt(g, t).c), [1, 2, 3, 2, 1]);
  assert.deepEqual([guardAt(g, 0).dx, guardAt(g, 2).dx, guardAt(g, 3).dx], [1, -1, -1]);
});

test("a looped route keeps going round", () => {
  const g = guard([[1, 1], [2, 1], [2, 2], [1, 2]], true);
  assert.deepEqual([3, 4].map((t) => guardAt(g, t).r), [2, 1]);
});

test("a lantern reaches three tiles and stops at walls", () => {
  const lv = level();
  assert.deepEqual(beam(lv, { c: 1, r: 1, dx: 1, dy: 0 }), [[2, 1], [3, 1], [4, 1]]);
  lv.map[1][3] = WALL;
  assert.deepEqual(beam(lv, { c: 1, r: 1, dx: 1, dy: 0 }), [[2, 1]]);
  assert.deepEqual(beam(lv, { c: 8, r: 1, dx: 1, dy: 0 }), []);
});

test("closed doors stop light, and open ones do not", () => {
  const lv = level({ door: { c: 3, r: 1 } });
  assert.deepEqual(beam(lv, { c: 1, r: 1, dx: 1, dy: 0 }, false), [[2, 1]]);
  assert.equal(beam(lv, { c: 1, r: 1, dx: 1, dy: 0 }, true).length, 3);
  assert.ok(blocked(lv, 3, 1, false));
  assert.equal(blocked(lv, 3, 1, true), false);
});

test("walls and edges stop the thief, and that costs no turn", () => {
  const lv = level();
  lv.map[9][0] = WALL;
  const h = new Heist(lv);
  assert.equal(h.move(UP), false);
  assert.equal(h.move(LEFT), false);
  assert.equal(h.turn, 0);
});

test("standing in the light after the guards move is a capture", () => {
  const lv = level({ guards: [guard([[3, 10], [4, 10], [5, 10]])] });
  lv.start = { c: 8, r: 10 };
  const h = new Heist(lv);
  assert.ok(h.move(WAIT));
  assert.equal(h.state, "playing");
  const k = new Heist({ ...lv, start: { c: 6, r: 10 } });
  k.move(WAIT);
  assert.equal(k.state, "caught");
});

test("guards see only ahead, so you can pass behind them", () => {
  const lv = level({ guards: [guard([[4, 5], [5, 5]])] });
  assert.equal(seenAt(lv, 3, 5, 0, false), false);
  assert.ok(seenAt(lv, 6, 5, 0, false));
  assert.ok(seenAt(lv, 4, 5, 0, false));
});

test("walking through a guard the wrong way round is a capture", () => {
  const lv = level({ start: { c: 4, r: 5 }, guards: [guard([[3, 5], [4, 5]])] });
  const h = new Heist(lv);
  h.move(LEFT);
  assert.equal(h.state, "caught");
});

test("the exit stays shut until all treasure is taken", () => {
  const lv = level({ start: { c: 0, r: 0 }, exit: { c: 1, r: 0 }, loot: [{ c: 0, r: 1 }] });
  const h = new Heist(lv);
  h.move(RIGHT);
  assert.equal(h.state, "playing");
  h.move(LEFT);
  h.move(DOWN);
  assert.equal(h.taken.size, 1);
  h.move(UP);
  h.move(RIGHT);
  assert.equal(h.state, "escaped");
});

test("a key opens the door", () => {
  const lv = level({ start: { c: 0, r: 0 }, door: { c: 2, r: 0 }, key: { c: 1, r: 1 } });
  const h = new Heist(lv);
  h.move(RIGHT);
  assert.equal(h.move(RIGHT), false);
  h.move(DOWN);
  assert.ok(h.hasKey);
  h.move(UP);
  assert.ok(h.move(RIGHT));
});

test("undo restores everything, even a capture", () => {
  const lv = level({ start: { c: 0, r: 0 }, loot: [{ c: 1, r: 0 }], guards: [guard([[5, 0], [4, 0], [3, 0]])] });
  const h = new Heist(lv);
  h.move(RIGHT);
  assert.equal(h.state, "caught");
  assert.ok(h.undo());
  assert.equal(h.state, "playing");
  assert.deepEqual([h.c, h.turn, h.moves, h.taken.size], [0, 0, 0, 0]);
  assert.equal(h.undo(), false);
});

test("stars follow moves, and a hint limits them", () => {
  const h = new Heist(level({ par: 10 }));
  h.state = "escaped";
  h.moves = 10; assert.equal(h.stars(), 3);
  h.moves = 13; assert.equal(h.stars(), 2);
  h.moves = 20; assert.equal(h.stars(), 1);
  h.moves = 10; h.hints = 1; assert.equal(h.stars(), 1);
});

test("the solver finds the shortest route on an open floor", () => {
  const lv = level();
  assert.equal(solve(lv).length, 18);
  lv.exit = { c: 0, r: 8 };
  assert.deepEqual(solve(lv), [UP, UP]);
});

test("the solver reports an impossible vault", () => {
  const lv = level();
  lv.map[9] = Array(COLS).fill(WALL);
  assert.equal(solve(lv), null);
});

test("all 40 vaults are proven: the solver's route really escapes in the game", () => {
  for (let i = 0; i < LEVELS; i++) {
    const lv = makeLevel(i);
    const h = new Heist(lv);
    for (const m of lv.solution) {
      assert.ok(h.move(m), `level ${i + 1}`);
      assert.notEqual(h.state, "caught", `level ${i + 1}`);
    }
    assert.equal(h.state, "escaped", `level ${i + 1}`);
    assert.equal(h.stars(), 3);
  }
});

test("vaults get longer, and the guards matter", () => {
  const avg = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += makeLevel(i).par; return s / (b - a); };
  assert.ok(avg(30, 40) > avg(0, 10) + 5);
  let forced = 0;
  for (let i = 3; i < LEVELS; i++) {
    const lv = makeLevel(i);
    if (lv.par > solve(lv, { ignoreGuards: true }).length) forced++;
  }
  assert.ok(forced >= 30, `${forced} vaults force a detour`);
});

test("keys, doors and several guards all appear", () => {
  const all = Array.from({ length: LEVELS }, (_, i) => makeLevel(i));
  assert.ok(all.some((l) => l.door && l.key));
  assert.ok(all.some((l) => l.guards.length >= 3));
  assert.ok(all.some((l) => l.loot.length >= 3));
});

test("a hint gives the first step of a working route, from any safe position", () => {
  for (const i of [0, 8, 16, 24, 33, 39]) {
    const lv = makeLevel(i);
    const h = new Heist(lv);
    const half = Math.floor(lv.solution.length / 2);
    for (let k = 0; k < half; k++) h.move(lv.solution[k]);
    assert.equal(h.state, "playing");
    for (let guard = 0; guard < 80 && h.state === "playing"; guard++) {
      const m = h.hint();
      assert.notEqual(m, null, `level ${i + 1}`);
      assert.ok(h.move(m));
    }
    assert.equal(h.state, "escaped", `level ${i + 1}`);
  }
});

test("moves table has four steps and a wait", () => {
  assert.equal(MOVES.length, 5);
  assert.deepEqual(MOVES[WAIT], [0, 0]);
});
