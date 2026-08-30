# Text Legibility and Background Motion

## Decision

The cloud effect belongs exclusively to the page background. It must never alter, mask, outline, blur, recolor, or split foreground text.

Text uses stable authored colors by section:

- Dark green sections use warm-white text.
- Light green, beige, and light rose sections use deep Goodwin-green text.
- Photography, the Mission Clock, partner art, and solid buttons retain their authored foreground colors.
- The navigation remains a stable dark-green surface with white text and logos.

## Background behavior

The cloud field is a fixed layer beneath the complete page. The page and all interactive content sit in a separate stacking layer above it.

Background palettes stay stable through most of a section. The next palette blends in only near the following section boundary, where the outgoing content is leaving and the incoming section is entering. The scroll target is followed by a damped spring so the cloud has restrained visual weight and settles after scrolling stops.

## Prohibited treatments

- No per-word spans or per-word color calculations.
- No text shadows, halos, outlines, blend modes, filters, or opacity fades for contrast.
- No timer-driven foreground changes.
- No cloud layer above page content.
- No background sampling that can leave text in a low-contrast intermediate color.

## QA requirements

1. No `.ambient-word` elements exist after the page loads.
2. FAQ questions remain deep green throughout their section.
3. The cloud layer has a lower stacking order than the page layer and cannot receive pointer events.
4. Navigation, photography, Mission Clock, solid CTAs, and partner artwork preserve authored contrast.
5. The background continues moving briefly after a scroll input, then reaches a settled state.
6. Asset URLs are versioned so prior foreground experiments cannot survive browser cache.
7. Desktop and mobile layouts have no horizontal overflow.
