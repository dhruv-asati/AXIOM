# AXIOM Frontend Performance Report

## Scope

This change set is frontend-only. No API contracts, authentication rules, backend files, deployment files, or database resources were changed. Existing dashboard and responsive timetable work already present in the working tree was preserved.

## Problems discovered and changes made

| Area | Finding | Change |
| --- | --- | --- |
| Theme initialization | The saved theme was applied in a React effect, after the first browser paint, allowing a light-theme flash on reload. | `main.tsx` now applies the saved `axiom-theme` before React mounts. `ThemeProvider` remains the single source of truth and persists the same key. |
| Theme toggle | Landing and authenticated navigation had separate button implementations and an immediate, non-animated switch. | Added one reusable `ThemeToggle` and View Transitions reveal support. Circle, rectangle, polygon, circle-blur and optional local GIF variants are available; origins include center, corners, edges and directional options. Center circle is the default. A missing View Transitions API, or reduced-motion preference, falls back to an immediate theme update. Rapid second clicks during a transition are ignored. |
| Crowd background | The GSAP ticker continued waking while a tab was hidden and did not wait for the sprite sheet before attaching. | The ticker now attaches only after the image is ready, detaches on hidden tabs/reduced motion, and resumes on visibility. One mounted canvas remains shared through authenticated nested routes. |
| Specular WebGL effect | `getAttribLocation` and computed style reads were performed in the render loop for visible cards. | Attribute location is cached after shader linking. Radius and tint are cached per surface and refreshed on theme changes instead of reading computed styles every render. Existing observers, one RAF scheduler, and resource cleanup remain in place. |
| Timetable | Faculty, room and course filters repeatedly built and sorted unique option lists during page renders. Time labels also searched period arrays for every assignment. | Filter option lists, sorted periods and a period lookup map are memoized. Output ordering and values are unchanged. |
| Assistant autocomplete | Scroll and resize events could repeatedly calculate popover geometry within one frame. | Popover positioning is coalesced to one requestAnimationFrame and canceled on cleanup. |
| Wheel picker lifecycle | Two programmatic-scroll reset timers were not tracked for cleanup. | Resets now use one replaceable timer, cleared when the wheel unmounts. |

## Theme toggle integration

- Reusable implementation: `frontend/src/components/ui/ThemeToggle.tsx` and `ThemeToggle.css`.
- Public landing: existing top-left theme control now uses the shared component.
- Authenticated app: the existing theme entry in the floating menu uses the shared compact control; menu placement and role navigation are preserved.
- The optional GIF variant accepts a caller-supplied asset path. No GIF or external asset dependency is bundled by default.
- View Transitions are feature-detected; reduced-motion users do not receive the reveal animation.

## Measurements

Builds were run before and after this work with the same production command. The baseline came from the pre-change build in this task; comparisons are emitted asset sizes, not a runtime benchmark.

| Asset | Baseline | After | Difference |
| --- | ---: | ---: | ---: |
| Main JavaScript | 393.37 kB (131.04 kB gzip) | 396.04 kB (131.83 kB gzip) | +2.67 kB raw (+0.79 kB gzip) |
| Main CSS | 197.70 kB (34.80 kB gzip) | 201.75 kB (35.71 kB gzip) | +4.05 kB raw (+0.91 kB gzip) |
| Timetable route JavaScript | 23.69 kB | 23.90 kB | +0.21 kB |
| Bookings route JavaScript | 22.70 kB | 22.70 kB | unchanged |
| Assistant route JavaScript | 21.97 kB | 22.13 kB | +0.16 kB |

The theme feature adds a small amount of code and CSS, so total bundle size did not decrease. Existing route-level lazy loading remains enabled. No browser profiling, render-count instrumentation, request-count capture, or representative-device timing was available in this verification run; no runtime speedup is claimed.

## Preserved safeguards and visual features

- API caching, request cancellation, dataset isolation, stale-response handling, and existing parallel dashboard loading were inspected and left intact.
- Existing route lazy loading, CrowdCanvas, MagicBento, specular components, smooth inputs, animated links, sidebar and assistant behavior remain present.
- No visual features were removed to improve performance.

## Tests performed

- `npm test` — **passed: 19 tests, 0 failures**.
- `npm run build` — **passed**; includes `tsc -b` TypeScript checking and Vite production build.
- `git diff --check` — **passed** (Git reported only line-ending conversion notices for working files).
- Changed paths were checked with `git diff --name-only`; all tracked changes are under `frontend/`. This report is the only documentation addition.

## Remaining bottlenecks / verification limits

- The specular overlay still evaluates visible surface bounds and updates pointer-driven CSS/WebGL state on animation frames. It is already coalesced to a single RAF and visibility/IntersectionObserver aware, but should be profiled on a lower-end phone before deeper renderer changes.
- The timetable intentionally renders both its desktop table and mobile assignment-card representation, with CSS selecting the visible form. Large schedules therefore retain extra DOM nodes; virtualization was not introduced because it can complicate schedule readability and accessibility.
- The animated crowd and specular effects still consume resources while the application is visible. The crowd pauses while the document is hidden and both systems respect reduced-motion settings.
- The production app was not exhaustively exercised under all four authenticated accounts in an interactive browser during this task. Existing role-routing, auth and dataset tests passed; a full live-account workflow and visual-device matrix remain manual checks.
