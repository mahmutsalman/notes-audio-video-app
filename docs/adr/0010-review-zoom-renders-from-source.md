# ADR-0010: Review zoom renders from the source image, not a CSS transform

**Status**: Accepted
**Date**: 2026-07-10
**Supersedes the zoom mechanism of**: ADR-era `2517d4f` (zoom + pan the review image).

## Context

The Echo review card is drawn by `PixelatedImage` into a `<canvas>` sized to its container, and zoom
was a CSS `transform: scale()` on an ancestor `<div>` in `ReviewSession`. A CSS transform magnifies
the *already-rasterised* canvas bitmap — it does not re-sample the source — so zooming blurred, and
the more the card had been shrunk (e.g. by stacked review notes), the smaller the base raster and the
worse the blur. Mahmut asked for zoom that renders from the source image instead.

A second, latent softness: the canvas backing store was sized in CSS pixels, so on a Retina display
it was drawn at 1x and upscaled by the browser to 2x device pixels — soft even at zoom 1.

## Decision

Fold zoom and pan into the canvas draw, and size the backing store at `devicePixelRatio`.

- `PixelatedImage` gains `zoom` and `pan` props. `ReviewSession` keeps its zoom/pan state, wheel
  handler and pan clamp unchanged, but no longer applies a CSS transform — it passes the values down.
- The net transform is `screen = center + zoom·(p − center) + pan`, applied uniformly to the base
  image, the mask rectangles, the hint overlays, and (inverted) to hit-testing.
- The base image is drawn with `ctx.drawImage(img, …, fitW·zoom·dpr, fitH·zoom·dpr)` straight from the
  source `HTMLImageElement`, so detail is limited by the source, not by a stale bitmap.
- Backing store is `displaySize · dpr`; the zoom lives in the draw math, not the canvas size, so the
  canvas stays 1:1 with device pixels and the browser never soft-scales it.

Mask pixelation is unchanged in spirit: block counts are computed against the zoom-1 CSS size, so a
mask looks identical to before at zoom 1 and its blocks magnify with zoom exactly as the old CSS
transform made them. Masked regions are *meant* to be blocky; only the revealed image benefits from
source-resolution zoom.

## Consequences

- Revealed image stays sharp at any zoom, source-limited. Zooming past native resolution smooths
  (as it must) rather than double-blurring a 1x bitmap.
- Sharper even at zoom 1 on Retina, because the backing store is now device-resolution.
- `image-rendering: pixelated` was removed from the canvas — with a device-resolution backing store
  the canvas maps 1:1 to device pixels, so the hint was a no-op, and the block hardness is already
  baked in by the nearest-neighbour upscale in the draw.
- Cursor-anchored zoom is now mathematically exact. With the CSS transform gone, the wheel handler's
  reference rect centre coincides with the transform origin (`center`), which is the point the
  fixed-point formula `panNew = u − ratio·(u − panOld)` assumes. Under the old transform the rect
  centre was shifted by the pan, so successive cursor-zooms after a pan drifted slightly.
- The canvas redraws on every pan/zoom tick (they are now in the draw effect's deps). One
  `drawImage` of the scaled source plus a few tiny offscreen-canvas pixelations per frame — cheap,
  and what a 2D canvas is for. If it ever stutters on a huge image, throttle the redraw to
  `requestAnimationFrame`; not needed now.

## Verification

The transform math was checked numerically before building (fixed display/natural sizes,
`zoom=2.3`, `pan=(−40,17)`):

- fit-space → screen → fit-space round-trips to identity (hit-testing inverts the draw exactly).
- a mask at normalized offset 0.5 within the image stays at 0.5 under zoom+pan (masks track the image).
- the cursor-zoom fixed point holds: the image point under the cursor is unchanged across a
  2×→3× zoom step.

Renderer `tsc` clean. **Not verified:** the visual result and mask hit-testing under zoom in the
running app.
