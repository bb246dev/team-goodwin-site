# Scroll-Driven Cloud and Inverse Foregrounds

## Visual system

The background follows one restrained brand sequence:

1. Black
2. Off-white
3. Goodwin green (`#193B3B`)
4. Off-white
5. Black

No purple, yellow, orange, or unrelated palette stops are used.

## Background cloud

Three oversized radial color fields live on a fixed layer beneath the complete page. Scroll position drives both their palette and position. A damped spring follows the browser's actual scroll target, producing visible vertical lag, a smaller counter-motion field, and a restrained rotational lean. The fields continue settling after scrolling stops and then stop completely.

The cloud never sits above content and never changes text opacity, blur, or shadow.

## Text and visual inversion

Eligible text on transparent surfaces is split into semantic inline word spans once. Each word is rendered as white with CSS `mix-blend-mode: difference`. Difference compositing calculates the foreground from the actual pixel beneath it:

`result = 255 - rendered backdrop channel`

This is not a timer, a section class, or a guessed light/dark state. As a cloud edge moves behind a line, each glyph responds to the local background pixel. Words therefore pass continuously through hundreds of colors and the change naturally travels across a line instead of switching the whole section at once.

Monochrome map geometry uses the same compositing rule. State boundaries, route lines, stops, and labels become dark over the white phase and light over a dark phase. Photographic runner and vehicle markers are excluded so their artwork is not color-inverted.

## Legibility constraint

Exact RGB inversion alone cannot guarantee contrast at mathematical 50% gray, because middle gray is its own inverse. The design handles that honestly rather than hiding a binary color switch:

- The palette uses black, off-white, and saturated Goodwin green instead of dwelling on neutral gray.
- Full-interval smoothstep interpolation removes abrupt color boundaries.
- Broad colored cloud fields keep most local pixels away from the neutral midpoint.
- No low-opacity text, blur, outline, or fake shadow is used.

Photography, the Mission Clock, form controls, solid CTAs, navigation, and partner artwork retain authored foreground colors because they sit on their own fixed-contrast surfaces.

## QA requirements

1. The background sequence contains only black, off-white, and Goodwin green.
2. Cloud transforms visibly lag a scroll input and settle to zero lag afterward.
3. Eligible text contains `.ambient-word` spans with white source color, `difference` compositing, no shadows, and no CSS color transition.
4. The rendered word color is the complement of the actual backdrop pixel, not a binary section mode.
5. A word traverses more than one hundred rendered RGB colors across the complete background journey.
6. Map geometry is visibly dark on the white map phase and responds inversely if the backdrop changes.
7. Navigation, imagery, Mission Clock, controls, CTAs, and partner art remain authored.
8. Desktop and mobile layouts have no horizontal overflow.
