# AstroPlan Tonight — web companion

A static GitHub Pages site mirroring the "Tonight" view from the AstroPlan
iOS app: which *popular* deep-sky targets are up tonight from the visitor's
location. No backend, no accounts — everything computes client-side in the
browser.

**Status: implemented, pending a real-browser test with live geolocation.**

## Scope

- **Popular targets only** — the 96-object curated set from AstroPlan's
  `popularity.json`, not the full ~13,800-object catalog.
- **Fixed default filters** — mirrors the app's Tonight defaults: 30° minimum
  altitude during darkness, magnitude cap 11.0, transit within 2h of
  mid-darkness. No favorites, no imaging log, no per-user personalization,
  no adjustable filter UI — those are per-device SwiftData state in the app
  with no web equivalent, and out of scope here by design.
- **Location** — browser Geolocation API, same UX role as CoreLocation in
  the app (permission prompt, no server round-trip).
- **Per-target detail view** — tapping a row opens a hash-routed
  (`#/<object-name>`) detail page mirroring the app's ObjectDetailView:
  an info table (type, constellation, mag, size, RA/Dec, designations) and a
  "Tonight" section with an inline SVG altitude-vs-time curve, current
  altitude, peak, transit, and Moon separation. Limited to fields already in
  `targets.json`; morphology, surface brightness, catalog memberships, best
  month, and DSS2 hero images would each need the export pipeline (and image
  sourcing) extended before they can appear.

## Decisions

- **Astronomy math**: fixed-RA/Dec object math (`position`/`transit`/`peak`)
  is hand-ported directly from `AstroPlan/Services/AltAzCalculator.swift` —
  simple enough (~20 lines) that a general-purpose ephemeris library adds
  nothing. Sun/Moon (real ephemeris work) uses
  [astronomy-engine](https://github.com/cosinekitty/astronomy) (Don Cross),
  v2.1.19, MIT licensed, zero dependencies, vendored at `vendor/astronomy.js`
  (the ESM build, for native `import` — no bundler). Its `SearchAltitude`
  root-finding is more precise than the app's 300s-step manual scan for
  twilight/rise-set, at the cost of not being bit-for-bit identical to the
  app's output.
- **No-build static site**: plain HTML/CSS/JS, native ES modules. This
  machine has no `node`/`npm`, and the astronomy library's zero-dependency
  ESM build needs no bundling.
- **Separate repo from AstroPlan**: different toolchain (JS vs. Swift/
  Python) and deploy lifecycle (GitHub Pages vs. Xcode archive/App Store).
  Sibling directory to `AstroPlan` and `astrotonight-docs` on disk.

## Structure

```
index.html                 entry point
targets.html                static reference list of every tracked target
about.html                  attributions, calculations, privacy — static, no JS
css/style.css               matches astrotonight-docs' palette/type
js/
  main.js                   orchestration: geolocation -> data -> rank -> render
  geolocation.js            Promise wrapper over navigator.geolocation
  altaz.js                  hand-ported fixed-object position/transit/peak
  sunmoon.js                astronomy-engine wrapper: sun/moon/twilight
  data.js                   fetch targets.json; displayName/typeLabel/secondary-name
  rank.js                   fixed-default ranking pipeline
  detail.js                 per-target detail compute (altitude curve, peak,
                            transit, moon separation) — mirrors the app's
                            ObjectDetailView "Tonight" section
  render.js                 DOM rendering (list + hash-routed detail view)
vendor/astronomy.js         vendored astronomy-engine 2.1.19 (MIT, 0 deps)
data/targets.json           generated — see below, not hand-edited
```

## Data pipeline

`AstroPlan/Tools/export_tonight_data.py` (lives in the AstroPlan repo, not
here) generates `data/targets.json`. It re-implements
`CatalogService.parseFile`/`mergeCrossReferences`/`applyPopularityIfNeeded`'s
common-name promotion in Python, because `popularity.json` only stores raw
pre-merge catalog names — whether an entry like a Sharpless number ends up
standalone or absorbed into an NGC/IC object only happens at Swift runtime.
Re-run it (`python3 Tools/export_tonight_data.py` from the AstroPlan repo)
whenever `popularity.json`, the catalog CSVs, or `CatalogLists.swift`'s
cross-reference tables change, then commit the regenerated `data/targets.json`
here.

`targets.json` is a derivative of OpenNGC (CC BY-SA 4.0), so the site has to
carry attribution, the license link, and an indication of modifications —
that's what `about.html` is for. If the export ever starts pulling fields
from other catalogs, add them there too.

One real finding from building this: `Sh2-171` used to be a
`popularity.json` key that silently never applied to anything, because its
own `Sh2.csv` identifiers cross-reference `NGC 7822` — it's always been
absorbed into that object at merge time. Removed from `popularity.json`;
"Teddy Bear Nebula" (its own genuine nickname, confirmed via web search
against the astrophotography community's usage) added to `NGC7822`'s common
names instead, alongside its existing "Question Mark Nebula".

## Deploy

Commit `.nojekyll` (done). Repo Settings → Pages → Deploy from a branch →
`main` / `/ (root)`. Serves at `https://mikep63.github.io/astrotonight-web/`
over HTTPS (required for `navigator.geolocation`).

## Remaining before calling this done

- [ ] Real-browser test: `python3 -m http.server 8000` from this repo, open
      `http://localhost:8000`, grant location access, confirm the sun/moon
      card and target list render correctly. (No JS runtime was available
      in the environment that built this — the code has been audited for
      import/export correctness and the transit math independently
      cross-checked against AstroPlan's own test suite values in Python,
      but it has not actually been executed in a browser yet.)
- [ ] Cross-check 2–3 targets' transit time/peak altitude against the app
      for the same location/date.
- [ ] Enable GitHub Pages in repo settings and verify the live URL.

## Source of truth

The AstroPlan app repo remains authoritative for the actual popular-target
list and common names (`AstroPlan/popularity.json`,
`AstroPlan/Models/CatalogLists.swift`). This site is a read-only mirror of a
slice of that data, not an independent editorial source.
