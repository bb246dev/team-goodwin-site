# Background Motion and Typography

## Visual system

The page uses one restrained brand sequence: black, off-white, Goodwin green (`#193B3B`), off-white, and black. Three large radial fields move on a fixed layer beneath the page. A damped spring follows scroll position so the background has gentle weight without placing an effect over the content.

## Typography

All word-level color animation and DOM text splitting have been removed. Text remains normal semantic HTML and uses one of two production ink colors:

- Warm white (`#F8F7EF`) on black and Goodwin green.
- Deep green-black (`#091F1D`) on off-white.

The background renderer calculates the relative luminance of its base color and selects the higher-contrast ink. The change is immediate rather than interpolated, so text never travels through low-contrast middle colors. Cloud opacity is deliberately restrained so local highlights remain within the same luminance family as the base.

Navigation, photography, image cards, the Mission Clock, buttons, and partner artwork retain their own authored contrast rules. Map geometry uses the current high-contrast ink while runner and vehicle artwork remains unaltered.

## Responsive requirements

1. Text must remain readable without shadows, outlines, blend modes, or per-word spans.
2. Headings must wrap cleanly without clipping or horizontal overflow.
3. FAQ items remain one-column expandable controls at every size.
4. Forms and calls to action remain centered and touch-friendly.
5. Map boundaries and routes remain visible on both light and dark phases.
6. Desktop, tablet, and mobile layouts must have zero horizontal page overflow.
7. Reduced-motion users receive the same contrast with the spring motion disabled.
