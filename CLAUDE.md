# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A browser multiplayer football-manager toy: players open a room, pick a Turkish Super Lig club, drag a formation, draft an 11-man squad, then simulate a 34-week season. No build step, no framework, no npm. The pre-Tailwind single-file version is commit `5d8f492` if ever needed.

## File layout and load order

Plain `<script src>` tags, ES5 globals, no modules. `index.html` loads them in this order and it matters only for `main.js`, which runs at load; everything else is functions called later.

| File | Holds |
|---|---|
| `index.html` | Tailwind CDN + `@theme`/`@layer` block, all markup for the five screens |
| `js/data.js` | `PLAYERS` (~300 records), `TEAMS`, `TS`, `FORMATIONS`, `COMPAT`, `TRAITS` |
| `js/core.js` | `DB` URL, shared state (`ME`, `ROOM`, `loc`, league vars), helpers (`G`, `rnd`, `banner`, `setStep`), Firebase REST wrappers, polling and `onPhaseChange` |
| `js/lobby.js` | screens 0-1: create/join room, lobby list, `buildPool`, team grid, `selectTeam` |
| `js/tactics.js` | screen 2: formation buttons, draggable nodes |
| `js/squad.js` | screen 3: slots, candidate picker, `markReady` |
| `js/league.js` | screen 4: fixtures, `simMatch`, table, `onEnd` |
| `js/main.js` | button wiring, `setStep(0)` |

Data is a `.js` file rather than fetched JSON so the page still works when opened from disk (`file://`).

## Running and checking

- Open `index.html` directly in a browser, or serve the folder with `python3 -m http.server 8765` and open http://127.0.0.1:8765/.
- Internet is required: Tailwind comes from a CDN and room state lives in Firebase.
- There are no tests or linters. Verify by loading the page and walking the five screens. Screens after the lobby can be driven without touching Firebase by calling render functions from the console, e.g. `setStep(1); buildPool(); renderTeams({})`, `setStep(2); buildFormation("4-3-3"); renderNodes()`, `setStep(4); buildLeague({}, 42); simRound()`. For the full multiplayer flow without the network, override `req` with an in-memory store in the console.

## Token discipline

This repo is worked on under a limited Claude plan.

- `js/data.js` is 14 KB, mostly one line of ~300 player records. Do not read it unless the task is about rosters or team data; grep for a name instead.
- Read only the file for the screen you are changing (see the layout table). Shared helpers and state are in `js/core.js`. Make targeted edits; never rewrite a file.

## Styling: Tailwind v4 via CDN

- `<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4">` compiles utilities in the browser at load time. The `<style type="text/tailwindcss">` block holds the design tokens in `@theme` (`pitch-950/900/800/700`, `grass`, `gold`, `gold-light`, `gold-ink`, `ink`, `mist`, `dim`, `danger`, `ok`, `font-narrow`) and a few `@layer components` classes.
- Static markup uses utilities inline. A component class (`.btn`, `.btn-pri`, `.btn-ghost`, `.btn-sm`, `.tc`, `.node`, `.slot`, `.slot-filled`, `.slot-focus`, `.cand`, `.cb`, `.crest`, `.row-me`, `.row-human`, `.pitch-stripes`) exists only where JS creates the same element repeatedly. Add a new one only in that case.
- Write every class name out in full inside JS strings. Never build one by concatenation (`"bg-"+color`), or the production build cannot find it. Use theme tokens (`text-gold-light`), not hex values.
- Visibility is toggled with the `hidden` class (`classList.toggle/remove/replace`), not `style.display`.
- Production build (not set up yet): `npm i -D tailwindcss @tailwindcss/cli`; create `src/input.css` containing `@import "tailwindcss";` followed by the contents of the `<style type="text/tailwindcss">` block; run `npx @tailwindcss/cli -i src/input.css -o dist/style.css --minify`; replace the CDN `<script>` and the style block with `<link rel="stylesheet" href="dist/style.css">`.

## Architecture

Multiplayer is a phase state machine stored in Firebase Realtime Database and accessed over REST (`fetch` on `DB + "/rooms/CODE.json"`; no SDK, no auth). Each client polls the whole room every 2 s (`startPoll` → `poll` → `onRoomUpdate`) and writes a `seen` heartbeat every fifth poll. When the `phase` field changes, `onPhaseChange` switches screens via `setStep(n)`, which shows section `s0`…`s4`.

Room document `rooms/{CODE}`:

```
{ phase: "lobby"|"selecting"|"building"|"league",
  host: "<player id>", created: <ms>, seed: <int>,
  players: { "<id>": { nick, teamId|null, ready, squadPw?, ts, seen } } }
```

Phase transitions are all written by the host (`effectiveHost`: the stored host, or the earliest-joined active player if the host vanished):
- `lobby → selecting`: host presses start (needs 2+ players).
- `selecting → building`: every active player has a `teamId`. Picking a team only writes your own `teamId`.
- `building → league`: every active player has `ready:true`. Tactics (screen 2) and squad (screen 3) are both local steps inside `building`; "Kadro kur" just calls `setStep(3)`.

Ghosts: `activePlayers` drops anyone whose `seen` is older than `STALE_MS` (30 s), so a closed tab never blocks "everyone picked / everyone ready". A reload in the same tab restores `ME.id`/`ROOM` from `sessionStorage` and calls `rejoin`, which resumes at the current phase (including "already ready, waiting").

Shared vs local state:
- Shared through Firebase: `nick`, `teamId`, `ready`, `squadPw` (average power of the 11 assigned players, plus 2), the room `seed`.
- Local only (`loc`): the player pool (`buildPool` rolls a random power per player from the club's base `pw`), the formation and dragged slot positions, the assigned squad, the per-slot candidate cache. Each client draws different candidates.
- The league runs client-side but is deterministic: `buildLeague(players, seed)` seeds `_rng` (`mulberry32`) and `makeFixtures`, AI team power and `simMatch` draw only from `_rng`, so every player sees the identical season. Polling stops when the league starts and `onEnd` deletes the room.

All Firebase calls go through `req(method, path, val, cb)`, which turns non-2xx responses into errors. Nicknames are the only user text; pass them through `esc()` before `innerHTML`.

`database.rules.json` holds the intended Realtime Database rules (writes only under 4-letter room codes, field shapes validated). Deploy it from the Firebase console or `firebase deploy --only database`; it is not applied automatically.

Data: `TEAMS` holds id, short code `s`, colours and base `pw`. `TS` indexes teams by both `id` and `s` because player records reference clubs by short code (`c`) while room state uses `id`. `FORMATIONS` gives slot positions as pitch percentages; `roleForPos` relabels a dragged node from its x/y; `COMPAT` lets wide midfielders and wingers fill each other's slots.

## Conventions

- UI copy and player names are Turkish written without Turkish-specific letters (`Sampiyonluk`, `Hos geldin`, `Akaydin`); match that in new strings.
- Validation messages use `banner(msg, true)`, never `alert()`.
- Code is ES5: `var`, `function`, string concatenation for HTML, `G(id)` as the `getElementById` shorthand.
