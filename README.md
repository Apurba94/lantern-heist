# Lantern Heist

A turn-based stealth puzzle for phones. Guards walk fixed patrols and only move when you do, each carrying a lantern that lights three
tiles ahead. Swipe past them, take the treasure and reach the exit without ending a move in the light. It is a game of reading patterns,
with no reflexes needed.

**[Play it now](https://apurba94.github.io/lantern-heist/)** in your phone's browser, then use "Add to Home Screen" to install it. After the
first visit it works offline.

* 40 generated vaults, with up to 5 guards, locked doors, keys and several treasures to take.
* Faint tiles show where each beam will fall after your next move.
* Unlimited undo, plus a hint that always works out the next safe step from where you stand.
* Three stars for matching the true shortest route, which is computed for every vault.

No ads, no accounts, no tracking and no network use after the first load.

## Run from source

```bash
npx serve .
npm test
```

Plain JavaScript with no dependencies. `src/logic.js` holds the rules, generator and solver, and `src/main.js` holds the screens.

## How it is tested

A breadth-first solver searches every position, patrol phase and item state. A vault is kept only if the solver can finish it, and the
tests replay each solution through the game's own rules on all 40 vaults. The move target is therefore a true shortest route.

## License

MIT
