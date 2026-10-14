# Performance report

Generated 2026-10-14T21:12:56.710Z by `npm run perf`.

## Environment

- **os:** Linux 6.18.44-fc-v114 (x64)
- **cpu:** Intel(R) Xeon(R) Processor @ 2.10GHz
- **cores:** 2
- **memoryGB:** 7.8
- **browser:** chromium 141.0.7390.37
- **gpuRenderer:** ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)
- **viewport:** 1280x720 @1x
- **build:** vite build + vite preview (production bundle)
- **match:** 180s session, 1s spawn interval, invulnerable bot holding forward + all cannons

## Frame rate (full match)

| Frames | Avg FPS | Avg frame (ms) | p95 frame (ms) | p99 frame (ms) |
| ---: | ---: | ---: | ---: | ---: |
| 2752 | 15.2 | 65.77 | 97.6 | 114.6 |

## Entities (peak during the match)

| Enemies | Projectiles | Effects | Display objects |
| ---: | ---: | ---: | ---: |
| 8 | 7 | 89 | 163 |

Display objects are counted in the Pixi stage; the static arena is one baked sprite, and projectiles,
effects and wakes come from pools, so the count stays bounded during the whole match.

## Memory after start / play 10 s / exit cycles (after forced GC)

| Cycle | JS heap (MB) | DOM nodes | JS listeners | Canvases |
| ---: | ---: | ---: | ---: | ---: |
| baseline | 8.16 | 260 | 216 | 0 |
| 1 | 8.46 | 272 | 216 | 0 |
| 2 | 8.47 | 268 | 216 | 0 |
| 3 | 8.63 | 268 | 216 | 0 |
| 4 | 8.83 | 272 | 216 | 0 |
| 5 | 8.9 | 268 | 216 | 0 |

## Notes and limitations

- The reference run uses SwiftShader (CPU software rendering) on a 2-vCPU cloud container with no GPU,
  so the frame rate measures the worst case, not the 60 FPS target hardware. Fill rate dominates there.
  Run `PW_HEADED=1 npm run perf` on a machine with a GPU to measure the 60 FPS target.
- Because the simulation runs on a fixed 1/60 s step with an accumulator, a low frame rate does not change
  game speed or rules; it only reduces how often the scene is drawn.
- Optimizations made after profiling: the static arena (water + shallows + islands) is baked into one
  texture (about 2x more frames in software rendering), MSAA is disabled for sprite art, per-frame Graphics
  were replaced by pooled sprites (trails, ripples) and the stage mask was replaced by letterbox covers.
- Memory: no canvas, DOM node or listener survives leaving a match; the JS heap after GC stays within
  about 1 MB of the baseline over five cycles (small caches such as the query cache and bar textures).
