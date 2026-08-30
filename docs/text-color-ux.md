# Spatial Text Color UX

## Outcome

Text responds continuously to the rendered background phase as the visitor scrolls. The foreground transition sweeps coherently from left to right across each visible line, and every word can occupy a different point among hundreds of RGB values between the authored palette inks. The foreground follows the spring-rendered background state, never an interval, a page-wide toggle, or raw scroll position.

## Why the previous models failed

The original system selected one foreground mode for the entire page and animated everything between dark and light over 640ms. That produced synchronized, time-based changes unrelated to each element's location.

The first word-level prototype corrected the spatial logic but sampled an obsolete two-gradient background model. A later binary version selected readable endpoint inks per word, but produced the black-and-white checkerboard the design specifically rejects. The approved model instead derives one continuous foreground phase from the background's rendered palette progress, then offsets that phase by horizontal position so the change reads as one left-to-right sweep.

`mix-blend-mode: difference` is not an acceptable shortcut. It generates complementary colors and cannot guarantee a controlled brand result.

## Interaction model

### 1. The rendered cloud field is the source of truth

The sampler uses the same spring position, section palette, layer translation, scale, rotation, opacity, radial stops, and wash as the visible background. Text never samples raw scroll while the background is still catching up.

### 2. Every adaptive word samples its own position

Visible text on transparent page surfaces is split into semantic inline word spans. On each rendered background frame, each visible word:

1. Reads its viewport-space center point.
2. Reconstructs the cloud color at that exact `x/y` coordinate.
3. Reads the rendered palette's authored start ink, end ink, and current progress.
4. Offsets that progress by the word's horizontal position, with a much smaller vertical offset so adjacent lines remain coherent.
5. Interpolates the final RGB value along a chromatic Goodwin-green curve between the palette inks.

Different coordinates produce different foreground values, so the change travels from left to right across a heading and then through subsequent lines without alternating randomly between black and white.

### 3. The crossover is continuous and scroll-addressable

Words are assigned continuously interpolated colors on every rendered spring frame. There is no binary ink mode and no CSS color transition. Small changes in scroll position produce small changes in the foreground RGB value; a full palette crossing produces well over one hundred distinct channel combinations.

### 4. The transition remains chromatic instead of muddy

A straight RGB interpolation from warm white to near-black produces a long band of neutral gray. On beige, peach, or green clouds that gray looks dirty and loses contrast. Light-to-dark crossings therefore use a continuous cubic color curve through the Goodwin green (`#193B3B`) with mirrored sixth-power easing. The ink enters the dark branded range early and exits it late when traveling in reverse, compressing the vulnerable mid-lightness interval without deleting any values from the scroll continuum. It still exposes hundreds of scroll-addressable colors, but it does not spread a gray midpoint across an entire line. No halo, outline, panel, or binary correction is applied.

### 5. Low-contrast colors bend continuously toward a readable ink

The modeled cloud color under each word provides a measured contrast score. If the authored sweep approaches the local background luminance, a smooth correction curve bends it toward Goodwin green on light clouds or warm white on dark clouds. Both the preferred ink and the correction strength are continuous functions of luminance and contrast. There is no thresholded mode, endpoint replacement, or visual snap.

### 6. Authored surfaces remain authored

These surfaces keep their designed text treatment and are excluded from adaptive instrumentation:

- Hero copy over photography.
- Field-note cards over photography.
- The Mission Clock on its deep-green card.
- Mobile photo-break copy over imagery.
- Partner artwork and logos.
- Solid green call-to-action buttons with authored white labels.
- Screen-reader-only and live-region text.

### 7. Controls and non-text marks sample locally

Inputs, selects, the hamburger, and the header wordmark use the same continuous positional phase. The monochrome header logo maps the interpolated ink luminance to a continuous filter value.

## Accessibility and semantics

- Endpoint dark ink: `rgb(8 17 15)`.
- Endpoint light ink: `rgb(255 253 247)`.
- Store the continuous sweep amount, measured background luminance, and WCAG contrast value as data attributes for QA.
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

1. A heading crossing a cloud transition contains a coherent left-to-right progression of intermediate RGB values.
2. At least one tested word records more than one hundred distinct colors through a full light-to-dark crossing.
3. No word is assigned a binary dark or light mode and no CSS color transition drives the effect.
4. Text continues following the background while the cloud spring settles, then stops changing.
5. The crossover remains chromatic and never produces a visible halo, box, or hard outline.
6. Header links, controls, hamburger, and wordmark respond to their own coordinates.
7. Hero, photo-card, Mission Clock, mobile photo-break, and partner text remain authored.
8. FAQ expansion and asynchronously inserted ticker or itinerary text are instrumented.
9. Accessible names, focus, wrapping, and interaction behavior are unchanged.
