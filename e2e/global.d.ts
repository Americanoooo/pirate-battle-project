// The debug bridge exposed with ?e2e=1 (typed loosely here; see src/game/session/debugBridge.ts).
interface PirateBridgeE2E {
  hasSession(): boolean
  state(): unknown
  setManualClock(enabled: boolean): void
  advance(ms: number): void
  spawnEnemy(kind: 'chaser' | 'shooter', x: number, y: number, angle?: number): number | null
  setSpawning(enabled: boolean): void
  setPlayerPose(x: number, y: number, angle: number): void
  setPlayerHealth(health: number): void
  startFrameSampling(): void
  stopFrameSampling(): number[]
}
interface Window {
  __pirate?: PirateBridgeE2E
}
