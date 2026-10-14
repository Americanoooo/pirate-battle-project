# Architecture

Pirate Battle is split into four layers that only talk through small, explicit interfaces:

```
┌──────────────────────────── React (src/ui, src/app) ────────────────────────────┐
│ Menu · Options · Captain's Log · Result · HUD · Pause dialog · Touch controls    │
│      ▲ useSyncExternalStore(HudStore)            │ pause()/resume()/setTouch()   │
└──────┼───────────────────────────────────────────┼───────────────────────────────┘
       │                                           ▼
┌──────┴──────────────── GameSession (src/game/session) ──────────────────────────┐
│ owns one match: World + GameRenderer + InputController, fixed-step loop, pause,  │
│ publishes HUD snapshots, emits a MatchSummary when the match ends                │
└──────┬───────────────────────────┬──────────────────────────────┬───────────────┘
       │ stepWorld(world,input,dt) │ render(world) + events        │ events
       ▼                           ▼                               ▼
┌─ Simulation (src/game/core) ─┐ ┌─ Rendering (src/game/render) ─┐ ┌─ Audio ──────────┐
│ pure TypeScript, no DOM/Pixi │ │ PixiJS scene, pooled sprites  │ │ @pixi/sound, SFX │
│ movement, weapons, AI,       │ │ reads state, never mutates it │ │ from events      │
│ collisions, spawner, rules   │ └───────────────────────────────┘ └──────────────────┘
└──────────────────────────────┘
```

Ranking and match history are a separate slice (`src/api`, `src/mocks`) used only by React screens.

## 1. Simulation (`src/game/core`)

* **State**: a single `World` object (`types.ts`) holds time, score, player, enemies, projectiles, islands,
  spawner state and an `events` queue. Systems are plain functions that mutate it.
* **Fixed time step**: `stepWorld(world, input, dt)` is called with `FIXED_DT = 1/60 s`. The session
  accumulates real frame time (clamped to 100 ms so a hitch never teleports ships) and runs as many fixed
  steps as fit. Every rate in the game is per second and multiplied by `dt`, so movement, damage, cooldowns,
  the clock and spawns are independent of the display refresh rate (unit test: 60 steps of 1/60 s ≈ 30 of 2/60 s).
* **System order per step**: player (turn → accelerate → move → collide → fire) → enemies (cooldowns, AI,
  Chaser rams) → ship separation → projectiles → spawner → remove dead entities → clock/end check.
* **End of match** (`combat.ts#endMatch`): `status = 'ended'` makes `stepWorld` return immediately, which
  stops movement, attacks, damage, spawns and scoring in one place.
* **Determinism**: all gameplay randomness (spawn points, enemy kind bag) comes from a seeded `Rng`
  (mulberry32). The same seed and inputs reproduce the same match; visual effects use a *separate* seeded RNG
  so rendering never changes the simulation.
* **Configuration**: every balancing number lives in `src/game/config/gameConfig.ts`. `createMatchConfig`
  deep-copies and freezes it with the player's Options when a match starts, so a match always runs on the
  snapshot it started with.

### Movement and AI

* Ships have a heading angle (0 = east, y grows downwards). Movement is `pos += (cos θ, sin θ) · speed · dt`;
  speed approaches its target with `acceleration` / `deceleration`. The player only sails forward and turns.
* **Chaser**: seeks the player at full throttle and explodes on contact (ramming damage to the player,
  no score).
* **Shooter**: approaches until `preferredDistance`, holds position, turns to aim and fires its bow cannon
  when the player is inside `attackRange`, inside `aimTolerance` and in line of sight (islands block it).
* **Steering**: target direction + island repulsion with a tangential "slide" component + separation from
  other enemies. The ship commits to a side per island until it is clear of it; without that memory a ship
  directly behind an island alternates sides and stalls (covered by a unit test).
* **Spawner**: every `intervalSec` one enemy spawns. Kinds come from a shuffled bag built from the configured
  weights, so every bag contains both kinds (guaranteeing both types appear in a standard match). Spawn points
  are random open-water points that are at least `minDistanceFromPlayer` away, clear of islands and other ships;
  if none is found the spawner retries 0.25 s later. Fresh enemies have a short grace period before attacking.

### Collisions

* Ships are circles; islands are axis-aligned rectangles inset to match the drawn coastline.
* Ship vs island/border: closest-point push-out (`resolveCircleRect`), two passes to handle corners. Ships
  keep sliding along coasts; the player loses speed on impact.
* Ship vs ship: overlapping circles are pushed apart equally (Chaser contact is handled first as a ram).
* Projectiles use **swept tests** (segment vs circle, segment vs rectangle slab test) so fast cannonballs
  never tunnel through ships or islands. The earliest hit wins, the projectile is marked dead immediately,
  so damage is applied exactly once. Projectiles also die when range or lifetime runs out (water splash) or
  when they leave the arena. Player shots only hit enemies; enemy shots only hit the player.

## 2. React ↔ PixiJS integration

* React never renders per frame. `GameScreen` creates a `GameSession` inside `useEffect` and destroys it in
  the cleanup. The session publishes a `HudSnapshot` through `HudStore`; `set()` only notifies when a displayed
  value changes (score, whole seconds left, health, pause state, arena rectangle), and components subscribe
  with `useSyncExternalStore`. The timer therefore re-renders React once per second.
* The screen-reader announcer subscribes to the same store and only announces start, pause/resume, score
  changes (debounced), the 60/30/10 s marks and the end — never per frame.
* **Strict Mode**: the effect mounts → unmounts → mounts in development. `GameSession.destroy()` is idempotent
  and safe while Pixi is still initialising: the renderer remembers it was destroyed and tears the
  `Application` down as soon as `app.init()` resolves. Only one canvas ever exists (tested by repeated
  play/menu cycles).
* **Input**: `InputController` listens on `window` only while a session exists and only acts while the match
  is running (not paused, not ended, not typing in a field). Keys use `KeyboardEvent.code`. Touch buttons are
  DOM buttons that call `session.setTouchControl` on pointer down/up with pointer capture, so several fingers
  can hold different controls. Pausing clears every held key/touch, so nothing pressed during a pause leaks
  into the resumed match.
* **Pause**: manual (button, Esc/P), on `window.blur` and on `visibilitychange → hidden`, and on portrait
  orientation on touch devices. While paused the loop renders with `dt = 0` (frozen visuals) and never steps
  the simulation, so the clock, cooldowns, AI and projectiles stand still. Resuming requires the Resume button
  (or Esc inside the dialog).

## 3. Rendering and resource lifecycle (`src/game/render`)

* **Assets**: three atlases (ships/effects, tiles, UI) are registered once with `Assets` and loaded before
  the match with a visible progress bar. Retina atlases are used when `devicePixelRatio ≥ 1.5`. A failed load
  shows an error with *Try again* (Pixi does not cache failed loads); combat never starts without textures.
  Textures stay in the Pixi cache and are reused by every match. Sounds load in the background and are
  optional.
* **Arena**: water, shallow rims, islands and decorations are composed from tiles once and **baked** into a
  single texture (`ArenaView.bake`). Each frame draws one quad instead of hundreds of alpha-blended tiles; the
  bake is redone only when the screen-density bucket changes.
* **Ships**: `ShipView` = rotating body (damage-stage hull sprite + fire overlays) + non-rotating health bar.
  The hull switches to more damaged sprites at 2/3 and 1/3 health; fires appear as health drops; hits flash
  red. Health-bar fills are cropped textures cached per 1/40 step, so no textures are created during play.
* **Projectiles & effects**: pooled sprites (ball + stretched trail sprite). Effects (muzzle flash, smoke,
  impacts, debris, splashes, wakes, explosions, sinking wrecks) are pooled sprites tweened by a tiny effect
  system; ring effects reuse one generated texture.
* **Resize / DPI**: the arena is a fixed 1280×720 world letterboxed into the host with uniform scale.
  A `ResizeObserver` resizes the renderer and a `matchMedia(resolution)` listener updates the resolution when
  the window moves to another screen. The HUD is positioned over the arena rectangle published in the HUD
  snapshot, so it is never cut off.
* **Teardown** (`GameRenderer.destroy`): disconnects observers, removes the ticker callback, destroys views,
  pools, the baked arena texture and the generated ring texture, then `app.destroy` (removing the canvas and
  WebGL context) while keeping shared atlas textures cached. Window/document listeners are removed by the
  session and input controller.

## 4. Local persistence (`src/app/persistence`)

All keys are prefixed with `pirate-battle:` and validated with Zod on read (corrupted data falls back to
defaults):

| Key | Content |
| --- | --- |
| `options:v1` | session time, spawn interval, sound |
| `player:v1` | local player id (UUID) and captain name |
| `last-result:v1` | the last completed match record (Result screen survives refresh) |
| `submissions:v1` | outbox of match records and their sync status |
| `mock-db:v1`, `mock-scenario` | mock server database and selected network scenario |

A match in progress is never persisted. Reloading on `#/play` redirects to the menu with an "abandoned"
notice; leaving the game screen destroys the session. Nothing is recorded for abandoned matches.

## 5. Ranking and match history

### Contracts (`src/api/contracts.ts`)

| Endpoint | Request | Response |
| --- | --- | --- |
| `GET /api/ranking?configKey&page&pageSize` | — | `{ items: RankingEntry[], page, pageSize, totalItems, totalPages, configKey }` |
| `GET /api/matches?playerId&page&pageSize` | — | `{ items: MatchRecord[], page, pageSize, totalItems, totalPages }` |
| `POST /api/matches` | body `MatchRecordInput`, header `Idempotency-Key: <matchId>` | `201 { record, created: true }` or `200 { record, created: false }` |

A record holds `matchId`, `playerId`, `playerName`, `playedAt`, `score`, `durationMs` (active time),
`endReason` and the `config` used (`sessionTimeSec`, `spawnIntervalSec`, `balanceVersion`). The server adds
`configKey` and `recordedAt`. The ranking only compares matches with the same `configKey` (the Ranking tab
shows the rules of the current Options). **Tie-break**: score desc → earlier `playedAt` → `matchId`.
Schemas are shared by the client (response validation) and the mock server (request validation).

### Client (`src/api/client.ts`, `src/api/queries.ts`)

* One Axios instance (`/api`, configurable timeout). Errors are normalised into `ApiError` kinds
  (timeout, network, server, client, invalid-response, cancelled); only transient ones are retried
  (2 retries, exponential backoff).
* `useRanking(configKey, page)` / `useHistory(playerId, page)` (TanStack Query): one cache entry per page,
  `keepPreviousData` while paging, `refetchOnMount: 'always'` (refresh when a tab is shown again),
  `staleTime` 10 s, refetch on window focus. Loading, empty, error (with retry), background "Updating…" and
  "showing saved data" states are rendered explicitly.
* **Late responses**: the `AbortSignal` from TanStack Query is passed to Axios, so a refetch cancels the
  in-flight request of the same key, and responses for other pages land in their own cache entries — an old
  response can never replace the page on screen (E2E test with the out-of-order scenario).

### Recording a match exactly once (`src/api/submissions.ts`)

1. When a match ends, the record is written to the `submissions` outbox (status `pending`) **before** any
   request, together with the last result.
2. The submit mutation is registered with `setMutationDefaults`, so its callbacks run even if the Result
   screen unmounts (the player can start another match while a record is pending).
3. `matchId` is the idempotency key: the server returns the existing record when the same match is sent
   again, so retries after a timeout (even if the server already saved it) and repeated clicks cannot
   duplicate it. The client also ignores clicks while a submit for that match is in flight.
4. On success the entry becomes `saved` and both `ranking` and `history` queries are invalidated.
5. On failure it becomes `failed` with the error; the Result screen and the History tab show it with
   *Retry*. Every unsent entry is re-sent automatically on start-up (e.g. after a refresh) and on the
   browser `online` event. Entries left `sending` by a refresh go back to `pending`.

## 6. Mock API (`src/mocks`)

MSW runs in development, tests **and the published build** (the worker script is in `public/`). Handlers,
contracts and fixtures are shared by all three. The mock database is persisted in localStorage, seeded with
31 deterministic fixture matches from 14 captains across three rule sets. Scenarios (selected in the
*Network lab* panel or with `?scenario=`) inject latency, out-of-order responses, timeouts, connection
failures, HTTP 4xx/5xx, per-endpoint outages, "timeout after save" and "submit unavailable". Latency is
seeded (`?mockSeed=`) or fixed (`?mockLatency=`) for reproducible tests.

## 7. Balancing decisions

* Player (100 hp, 150 px/s) is faster than both enemies so skilled play can always escape.
* Front cannon: 20 dmg every 0.45 s, 460 px range. Broadsides: 3 × 15 dmg every 1.4 s, 340 px range —
  strong at close range, they reward positioning.
* Chaser: 40 hp (2 front hits), 135 px/s, 25 ramming damage; Shooter: 60 hp (3 front hits), 95 px/s,
  10 dmg every 1.8 s from 380 px. Both appear in roughly equal numbers; at most 8 enemies alive.
* Spawn interval is limited to **1–10 s** (step 0.5 s); session time to **60–180 s** (step 10 s).
* Spawns keep ≥ 360 px from the player and enemies wait 0.8 s before attacking, so no damage is unavoidable.

## 8. Known limitations

* Ships are approximated by circles for collisions, which is slightly generous at bow and stern.
* Enemy steering is local (no path finding); it handles the convex islands of this map but would need a
  navigation grid for concave obstacles.
* Profiling in this repository was done with software rendering (see `perf-results/REPORT.md`); numbers on
  real GPUs are expected to be much higher.
* Visual-regression baselines are generated on Linux; screenshot assertions are skipped on other OSes.
