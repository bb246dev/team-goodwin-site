# Inertial Atmospheric Gradient UX

## Design language

The requested effect is best described as a **scroll-inertial atmospheric gradient** or **spring-smoothed cloud field**. Large, soft color masses behave like illuminated clouds: they move in response to the visitor's scroll, carry a small amount of momentum, slightly overshoot, and settle into the page's section color. The visual should feel weighty and painterly, not like a looping screensaver or a conventional parallax layer.

## Motion contract

1. Native page scrolling remains untouched.
2. Actual scroll position becomes a target value for the background.
3. A damped spring follows that target. The spring is deliberately underdamped enough to create a small swish, but not enough to bounce visibly.
4. Section palette interpolation uses the spring position, so the color itself has mass and arrives just after the content.
5. Three oversized radial color fields move at different amplitudes and directions. Their transforms use the same spring state, producing depth without an independently timed animation.
6. When scrolling stops, the fields finish settling and animation work stops. There is no autonomous loop.

## Visual constraints

- Preserve the established color journey and the Goodwin brand green `#193B3B`.
- Keep white and near-white regions visually clean; cloud movement should come from chromatic fields rather than gray haze.
- Motion should be more apparent during a decisive trackpad or touch fling and almost imperceptible during slow reading.
- Avoid sharp boundaries, repeated blobs, obvious circles, or a liquid-lava-lamp appearance.
- Do not move content, images, or the browser's scroll position.

## Technical model

- Use layered radial gradients for soft-edged color volume.
- Animate the cloud layers with compositor-friendly transforms.
- Calculate spring physics in `requestAnimationFrame`, using its timestamp so behavior is stable across refresh rates.
- Continue requesting frames only while the spring is displaced or moving.
- Keep DOM measurement out of the animation loop; section anchors are measured on load, resize, and relevant layout changes.
- Under `prefers-reduced-motion: reduce`, remove inertia and render the final scroll-linked state immediately.

## Relationship to text contrast

Text color work must sample the **rendered spring position and cloud composition**, not raw scroll position. Any earlier word-level system based on the old static radial model is provisional. Background motion should be approved first; the contrast model can then be rebuilt against the final rendered background rather than duplicated now.

## Acceptance criteria

1. A quick scroll produces a visible but restrained catch-up and settle.
2. Slow scrolling feels directly controlled rather than delayed.
3. Reversing direction makes the color mass change direction naturally, without snapping.
4. The effect stops completely after settling.
5. The background preserves the existing section palette sequence.
6. No content shifts, scroll-jacking, or pointer interference occurs.
7. Reduced-motion mode has no inertial follow-through.

## Research grounding

- GSAP ScrollTrigger documents numeric `scrub` as a playhead that takes time to catch up to scroll position; this is the closest established label for the requested lag behavior: https://gsap.com/docs/v3/Plugins/ScrollTrigger/
- Motion documents composing scroll values with spring values, which matches the underlying interaction model: https://motion.dev/docs/react-use-scroll and https://motion.dev/docs/react-use-spring
- MDN documents layered radial gradients as a standard way to build multiple soft color fields: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Images/Using_gradients
- MDN documents `requestAnimationFrame` as the browser-synchronized mechanism for per-frame work: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
- MDN's reduced-motion guidance requires non-essential movement to respond to the visitor's operating-system preference: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion
