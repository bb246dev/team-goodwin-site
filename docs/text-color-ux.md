# Spatial Text Color UX

## Outcome

Text responds spatially to the color physically behind it as the visitor scrolls. A heading can contain dark and light words at the same moment while a cloud field crosses it. The foreground follows the spring-rendered background state, never an interval, a page-wide toggle, or raw scroll position.

## Why the previous models failed

The original system selected one foreground mode for the entire page and animated everything between dark and light over 640ms. That produced synchronized, time-based changes unrelated to each element's location.

The first word-level prototype corrected the spatial logic but sampled an obsolete two-gradient background model. A later continuous-color experiment made the transition technically smooth but allowed low-contrast gray words to persist across the cloud crossover. The approved model therefore combines accurate spatial sampling with readable endpoint inks and a brief local paint transition.

`mix-blend-mode: difference` is not an acceptable shortcut. It generates complementary colors and cannot guarantee a controlled brand result.

## Interaction model

### 1. The rendered cloud field is the source of truth

The sampler uses the same spring position, section palette, layer translation, scale, rotation, opacity, radial stops, and wash as the visible background. Text never samples raw scroll while the background is still catching up.

### 2. Every adaptive word samples its own position

Visible text on transparent page surfaces is split into semantic inline word spans. On each rendered background frame, each visible word:

1. Reads its viewport-space center point.
2. Reconstructs the cloud color at that exact `x/y` coordinate.
3. Converts the result to relative luminance.
4. Calculates WCAG contrast for the Goodwin dark and warm-white endpoint inks.
5. Selects the stronger endpoint while retaining the current endpoint briefly when it remains readable and the alternative is only marginally stronger.

Different coordinates produce different foreground values, so the change can travel across a heading line by line and word by word.

### 3. The crossover is spatial and locally softened

Words choose only known endpoint inks, but each word makes that choice from its own position. A short 160ms paint transition softens the individual change. This transition does not decide when a change happens: the sampled background and scroll-driven cloud spring do. There is no interval, scheduled global switch, or synchronized document event.

### 4. Hysteresis and a restrained glyph halo protect the crossover

A word retains its current endpoint while it remains readable and the alternative is only marginally stronger. This prevents flicker when a moving cloud hovers around the decision boundary. A subtle same-color glyph halo supports the brief paint transition without producing a box, panel, or hard outline.

### 5. Authored surfaces remain authored

These surfaces keep their designed text treatment and are excluded from adaptive instrumentation:

- Hero copy over photography.
- Field-note cards over photography.
- The Mission Clock on its deep-green card.
- Mobile photo-break copy over imagery.
- Partner artwork and logos.
- Screen-reader-only and live-region text.

### 6. Controls and non-text marks sample locally

Inputs, selects, the hamburger, and the header wordmark sample their own center coordinates. The monochrome header logo uses the same local decision and short paint transition.

## Accessibility and semantics

- Endpoint dark ink: `rgb(8 17 15)`.
- Endpoint light ink: `rgb(255 253 247)`.
- Store the selected ink mode, measured background luminance, and WCAG contrast value as data attributes for QA.
- Preserve the original DOM reading order and whitespace.
- Do not duplicate or hide accessible text.
- Preserve native form values, placeholders, link names, keyboard focus, and button behavior.
- Reduced-motion mode removes cloud inertia; the text still samples the immediately rendered background.

## Performance requirements

- Instrument text once and observe only newly inserted content.
- Track visible words with `IntersectionObserver`; skip offscreen words.
- Reuse the background renderer's single `requestAnimationFrame` loop.
- Collect word rectangles before applying styles.
- Stop all frame work after the spring settles.
- Re-measure section anchors only on load, resize, and relevant DOM changes.

## QA contract

1. A heading crossing a cloud transition contains both dark and light words based on their individual positions.
2. Words do not switch in one global event or on an interval.
3. Each local change is visually softened and finishes within 160ms.
4. Text continues following the background while the cloud spring settles, then stops changing.
5. The glyph halo remains restrained and never reads as a box or hard outline.
6. Header links, controls, hamburger, and wordmark respond to their own coordinates.
7. Hero, photo-card, Mission Clock, mobile photo-break, and partner text remain authored.
8. FAQ expansion and asynchronously inserted ticker or itinerary text are instrumented.
9. Accessible names, focus, wrapping, and interaction behavior are unchanged.
