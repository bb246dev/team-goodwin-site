# Scroll-Driven Cloud and Text Motion

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

The cloud never changes text opacity, blur, shadow, stacking, or compositing.

## Text motion

Text motion is independent of the cloud renderer. Eligible transparent-surface text is split into semantic inline word spans once. Each visible word receives a scroll-addressed color based on:

- The spring-rendered scroll position, not a timer.
- Its horizontal viewport position, producing a left-to-right sweep.
- A much smaller vertical offset, keeping adjacent lines coherent.

The ramp is closed, so wrapping from its final stop to its first stop is seamless.

## Legibility constraint

Text never interpolates directly between white and black.

- Dark backgrounds use a multi-stop family of warm white, pale mint, cool gray, and cream tints.
- Light backgrounds use a multi-stop family of very dark Goodwin green, blue-green charcoal, and forest tints.

Every color within a section therefore remains on the same readable side of the luminance range while still providing hundreds of scroll-addressable RGB combinations. Photography, the Mission Clock, form controls, solid CTAs, navigation, and partner artwork retain authored foreground colors.

## QA requirements

1. The background sequence contains only black, off-white, and Goodwin green.
2. Cloud transforms visibly lag a scroll input and settle to zero lag afterward.
3. Eligible text contains `.ambient-word` spans with no shadows or CSS color transitions.
4. Words on one line have a coherent horizontal progression, not alternating binary modes.
5. A tested word traverses more than one hundred rendered RGB colors through a full ramp.
6. Light sections never receive the light ink family; dark sections never receive the dark ink family.
7. Navigation, imagery, Mission Clock, controls, CTAs, and partner art remain authored.
8. Desktop and mobile layouts have no horizontal overflow.
