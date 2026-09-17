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
| `js/league.js` | screen 4: fixtures, roster assignment (`buildLeague`), `simMatch` + scorers/assists, standings, gol krallik, asist krallik, round-advance approval flow, text narration, `onEnd` |
| `js/main.js` | button wiring, `setStep(0)` |

Data is a `.js` file rather than fetched JSON so the page still works when opened from disk (`file://`).

## Running and checking

- Open `index.html` directly in a browser, or serve the folder with `python3 -m http.server 8765` and open http://127.0.0.1:8765/.
- Internet is required: Tailwind comes from a CDN and room state lives in Firebase.
- There are no tests or linters. Verify by loading the page and walking the five screens. Screens after the lobby can be driven without touching Firebase by calling render functions from the console, e.g. `setStep(1); buildPool(); renderTeams({})`, `setStep(2); buildFormation("4-3-3"); renderNodes()`, `setStep(4); buildLeague({}, 42); advanceRound(false)`. For the full multiplayer flow without the network, override `req` with an in-memory store in the console.
- Testing the approval flow for real needs two tabs/players with a human-vs-human fixture that week; `_fixtures[_round]` shows the upcoming pairing and `_league` each team's `.pid`/`.isHuman`.

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
  round: <int>,                 // shared "weeks simulated" counter, league phase only
  simReq?: { round, by, approvals: { "<pid>": true }, narrateVotes?: { "<pid>": true } },  // pending round-advance request
  players: { "<id>": { nick, teamId|null, ready, squadPw?, squad?: [<player name>...], ts, seen } } }
```

Phase transitions are all written by the host (`effectiveHost`: the stored host, or the earliest-joined active player if the host vanished):
- `lobby → selecting`: host presses start (needs 2+ players).
- `selecting → building`: every active player has a `teamId`. Picking a team only writes your own `teamId`.
- `building → league`: every active player has `ready:true`. Tactics (screen 2) and squad (screen 3) are both local steps inside `building`; "Kadro kur" just calls `setStep(3)`. The host writes `phase:"league"` and `round:0` together, but guards with `_leagueStartSent` and retries `phase` alone (then `round` separately, best-effort) if the combined write is rejected — so a not-yet-redeployed `database.rules.json` that doesn't whitelist `round` can never block the phase transition itself, only the round counter.

Ghosts: `activePlayers` drops anyone whose `seen` is older than `STALE_MS` (30 s), so a closed tab never blocks "everyone picked / everyone ready", and never blocks a round-advance approval either (see below). A reload in the same tab restores `ME.id`/`ROOM` from `sessionStorage` and calls `rejoin`, which resumes at the current phase (including "already ready, waiting"); a reload during `league` still lands on a fresh `s0` (rejoin doesn't resume mid-season).

`buildPool` (in `lobby.js`) is a fantasy draft, not a club-locked roster: it turns every entry in `PLAYERS` (all 18 real clubs) into a candidate with a randomized power, so a human building their squad in `squad.js` can draft ANY real player onto their XI regardless of that player's native club (`p.club` on the candidate is just their real-world club badge shown for flavor). `openCands` shows 5 random eligible-position candidates per slot (`shuffled`, plain `Math.random`), so two humans in the same room see different candidates even for the same slot.

Shared vs local state:
- Shared through Firebase: `nick`, `teamId`, `ready`, `squadPw` (average power of the 11 assigned players, plus 2), `squad` (the drafted 11's real names — see roster assignment below), the room `seed`, and during `league` the shared `round` counter + `simReq`.
- Local only (`loc`): the player pool (`buildPool` rolls a random power per player), the formation and dragged slot positions, the assigned squad, the per-slot candidate cache. Each client draws different candidates, but the final `squad` names get synced at `markReady()`.
- The league itself runs client-side but is deterministic: `buildLeague(players, seed)` seeds `_rng` (`mulberry32`) and `makeFixtures`, AI team power and `simMatch` draw only from `_rng`, so every player sees the identical season (same standings, same gol krallik, same asist krallik). What is no longer purely local is *when* each round actually simulates:
  - `advanceRound(narrate)` is the real simulate-and-render step (was `simRound`). Every client calls it once per round, locally, either while catching up to `room.round` or right after seeing a round's approvals complete.
  - `renderNextFixture()` always shows "Sonraki hafta: A - B" above the buttons (`#nextFixture`), computed from `myFixture(_round)` — the upcoming matchup is visible before the player ever presses anything, not just after.
  - `requestAdvance()` (wired to "Sonraki hafta", no args now) and `tryFree()` (wired to "Tumunu simule et") are the gates in front of `advanceRound`: if `_fixtures[_round]` has no active human-vs-human fixture, they advance immediately (`writeRound` + `advanceRound`); if it does, they write `simReq` (just `{round, by, approvals}`, no upfront narrate choice) and wait.
  - `onLeaguePoll` (called from `onRoomUpdate` every poll while `phase==="league"`; polling is no longer stopped when the league starts) is what actually drives this: it replays any rounds the room is ahead of (`room.round`), and shows/clears the approval banner (`showApprovalPrompt`/`hideApprovalBanner`) via `handleSimRequest`.
  - Because both sides' clicks are just "add my pid to `simReq.approvals`", either participant can request and either can approve/reject (`approveSim`/`rejectSim`); a stale (ghost) opponent is dropped from the required set by `requiredPids`, same as elsewhere.
  - Whether to narrate is a shared decision, not something the requester decides upfront: `showApprovalPrompt` renders the fixture name and a "Bu haftayi yaziyla anlat" checkbox to *both* sides (the requester waiting for approval, and the other player deciding whether to approve), wired to `voteNarrate(want)` which writes `simReq.narrateVotes.{pid}`. `narrateFor(req, active, round)` resolves the final flag once all approvals are in: true if *any* required pid voted for it. Used both by `handleSimRequest` (live resolution) and `onLeaguePoll`'s catch-up loop (replaying a round a poll arrived late for).
  - Goal scorers and assists aren't simulated per-player; `pickScorer`/`pickAssister` draw a name from that specific team's actual **roster** (weighted by position via `scorerWeight`/`assistWeight`, GK excluded, `clubRoster`), not from a club's native `PLAYERS` listing. `buildLeague` builds that roster once per team: a human team's roster is exactly the 11 names in `players[pid].squad` (resolved back to `{n,t,c}` records via the `PLAYERS_BY_NAME` lookup); every real player nobody drafted is dealt out — `seededShuffle` (Fisher-Yates on `_rng`, not `Math.random`) then round-robin — across the AI clubs, so the same undrafted-player deal happens identically on every client and nobody can score/assist for a club they weren't actually put on. Two humans can (rarely) end up with the same real name in both `squad` arrays (independent drafts); `buildLeague` resolves this deterministically by walking `_league` in fixed `TEAMS` array order with a shared `claimed` set — the earlier-order team keeps the contested player, the later team's slot for that name is simply dropped from its roster (so nobody sees that name score/assist for two clubs at once, and every client computes the same winner since `TEAMS` order and `players` are identical everywhere). `recordScorer`/`recordAssist` tally `_scorers`/`_assists` for the gol krallik / asist krallik tabs (`renderScorers`/`topScorers`, `renderAssists`/`topAssists`; `showTab` now has a third state, `"assists"`). A goal has roughly a 72% chance of getting an assist credited (`pickAssister`), drawn from the scoring team's roster minus the scorer.
  - Text narration (`maybeShowNarration`/`renderNarrStep`, the `#mcast` overlay) only ever renders for a human-vs-human fixture, and only when `narrateFor` resolved true for that round; every other fixture always resolves instantly.
  - `onEnd()` no longer deletes the room — the champion overlay (`#ov`/`#champ`) can be dismissed with "Sonuclari incele" (`closeChampOverlay`, reopened via `showChampBtn`/`openChampOverlay`) to browse the finished table/gol krallik without forcing a new season. `newSeason()` (the only thing that reloads the page) is what deletes the room now.
  - Screen 4 (`#s4`) is a two-column layout: the left column keeps `lgpills`/standings/gol krallik/asist krallik/fixture/buttons unchanged; the right column is a sticky `#mySquadBody` panel rendered by `renderMySquad()` (called at the end of `buildLeague` and whenever the round advances), which reads `tById(ME.teamId).roster` and lists the local human player's own 11 names/positions — so a player is never left wondering who they actually drafted while browsing the league screen. AI-controlled viewers or players without a `teamId` simply see an empty panel.

All Firebase calls go through `req(method, path, val, cb)`, which turns non-2xx responses into errors. Nicknames are the only user text; pass them through `esc()` before `innerHTML`.

`database.rules.json` holds the intended Realtime Database rules (writes only under 4-letter room codes, field shapes validated). Deploy it from the Firebase console or `firebase deploy --only database`; it is not applied automatically.

Data: `TEAMS` holds id, short code `s`, colours and base `pw`. `TS` indexes teams by both `id` and `s` because player records reference clubs by short code (`c`) while room state uses `id`. `FORMATIONS` gives slot positions as pitch percentages; `roleForPos` relabels a dragged node from its x/y; `COMPAT` lets wide midfielders and wingers fill each other's slots.

## Conventions

- UI copy and player names are Turkish written without Turkish-specific letters (`Sampiyonluk`, `Hos geldin`, `Akaydin`); match that in new strings.
- Validation messages use `banner(msg, true)`, never `alert()`.
- Code is ES5: `var`, `function`, string concatenation for HTML, `G(id)` as the `getElementById` shorthand.
