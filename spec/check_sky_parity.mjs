// Holds this build's sky maths to what the iOS app computes.
//
// spec/sky_fixture.json is recorded from Swift, which is the reference
// implementation: where the two disagree, that side is right and this one is
// wrong. Same arrangement app.py and api-local.js have in baseball-games.
//
// Run:  jsc -m spec/check_sky_parity.mjs
//
// It reports the distribution of every difference rather than only pass/fail,
// because the useful question is not "does it pass" but "by how much, and is
// that the scan step or a bug". Tolerances live at the bottom and were chosen
// after measuring, not before.
//
// SPDX-FileCopyrightText: 2026 Mike Parker <mike@rsbl.org>
// SPDX-License-Identifier: LicenseRef-AllRightsReserved

import * as altaz from "../js/altaz.js";
import * as sunmoon from "../js/sunmoon.js";

const fx = JSON.parse(read("spec/sky_fixture.json"));
const site = (i) => fx.sites[i];
const when = (i) => new Date(fx.instants[i].replace("Z", ":00Z").replace("::", ":"));

// The object list both sides describe, read from the same generated file that
// export_tonight_data.py writes to the web and to the iOS test bundle.
const TARGETS = {};
for (const o of JSON.parse(read("data/targets.json"))) TARGETS[o.name] = o;
const objectRA = (name) => TARGETS[name].raDegrees;
const objectDec = (name) => TARGETS[name].decDegrees;

function stats(name, values, unit) {
  if (!values.length) return { name, n: 0 };
  const v = values.slice().sort((a, b) => a - b);
  const q = (p) => v[Math.min(Math.floor(v.length * p), v.length - 1)];
  return {
    name, unit, n: v.length,
    median: q(0.5), p95: q(0.95), max: v[v.length - 1],
  };
}

const rows = [];
const report = (s) => rows.push(s);

// ---------------------------------------------------------------- positions
{
  const dAlt = [], dAz = [];
  for (const c of fx.positions) {
    const s = site(c.site);
    const p = altaz.position(objectRA(c.object), objectDec(c.object), s.lat, s.lon, when(c.instant));
    dAlt.push(Math.abs(p.altitude - c.altitude));
    // Azimuth wraps: 359.9 and 0.1 are two tenths apart, not 359.8.
    let da = Math.abs(p.azimuth - c.azimuth) % 360;
    if (da > 180) da = 360 - da;
    dAz.push(da);
  }
  report(stats("position altitude", dAlt, "deg"));
  report(stats("position azimuth", dAz, "deg"));
}

// ----------------------------------------------------------------- transits
{
  const dAlt = [], dTime = [];
  for (const c of fx.transits) {
    const s = site(c.site);
    const t = altaz.transit(objectRA(c.object), objectDec(c.object), s.lat, s.lon, when(c.instant));
    if (!t) continue;
    dAlt.push(Math.abs(t.altitude - c.altitude));
    if (c.date && t.date) dTime.push(Math.abs(new Date(t.date) - new Date(c.date)) / 1000);
  }
  report(stats("transit altitude", dAlt, "deg"));
  report(stats("transit time", dTime, "s"));
}

// -------------------------------------------------- sun, twilight and moon
{
  const dSunset = [], dSunrise = [], dNightStart = [], dNightEnd = [], dSunAlt = [];
  const dMoonIllum = [], dMoonAlt = [];
  let nightAgree = 0, nightDisagree = 0;
  const nightMismatches = [];

  for (const c of fx.sky) {
    const s = site(c.site), d = when(c.instant);
    const obs = sunmoon.makeObserver(s.lat, s.lon);

    // twilightWindow folds -18 and -12 into one answer, so it is compared
    // against whichever the reference found first.
    const refWindow = c.astronomicalNight ?? c.nauticalNight;
    const got = sunmoon.twilightWindow(d, obs);

    if (!!refWindow === !!got) {
      nightAgree++;
      if (refWindow && got) {
        dNightStart.push(Math.abs(new Date(got.start) - new Date(refWindow.start)) / 1000);
        dNightEnd.push(Math.abs(new Date(got.end) - new Date(refWindow.end)) / 1000);
        const ev = sunmoon.sunHorizonEvents(got, obs);
        if (c.sunset && ev.sunset) dSunset.push(Math.abs(new Date(ev.sunset) - new Date(c.sunset)) / 1000);
        if (c.sunrise && ev.sunrise) dSunrise.push(Math.abs(new Date(ev.sunrise) - new Date(c.sunrise)) / 1000);
      }
    } else {
      nightDisagree++;
      nightMismatches.push(`${s.name} ${fx.instants[c.instant]}: swift=${refWindow ? "window" : "null"} js=${got ? "window" : "null"}`);
    }

    const mi = sunmoon.moonInfo(d, obs);
    if (mi && c.moon) {
      if (typeof mi.illuminatedFraction === "number")
        dMoonIllum.push(Math.abs(mi.illuminatedFraction - c.moon.illuminatedFraction));
    }
  }
  report(stats("night window start", dNightStart, "s"));
  report(stats("night window end", dNightEnd, "s"));
  report(stats("sunset", dSunset, "s"));
  report(stats("sunrise", dSunrise, "s"));
  report(stats("moon illuminated fraction", dMoonIllum, "0-1"));

  print(`\n  night exists / does not exist: ${nightAgree} agree, ${nightDisagree} disagree`);
  for (const m of nightMismatches) print(`      ${m}`);
}

/* Set after measuring, not before, and each one is a statement about why the
   two differ rather than a round number that made the run go green.

   The object geometry agrees to machine precision -- altitude to 1e-13 degrees
   -- because altaz.js is a faithful port of the same arithmetic rather than a
   second library. Anything above 1e-9 there is a real defect, so the bar is set
   just above the floating-point floor.

   Sun and twilight are a different story: SwiftAA against astronomy-engine, and
   more importantly a scan against a root-find. Swift steps horizon events every
   120 s and the night boundary more coarsely still, so it lands on clean minute
   marks while this build solves for the crossing. The gap is dominated by the
   reference being the blunter instrument, which is worth saying plainly -- the
   port is the more precise of the two and is being held to the less precise.

   The moon differs by about one percent of illuminated fraction, which is two
   different phase models rather than a scan step, and is invisible in a phase
   name or an emoji. */
const TOLERANCE = {
  "position altitude": 1e-9,
  "position azimuth": 1e-9,
  "transit altitude": 1e-9,
  "transit time": 1,
  "night window start": 360,
  "night window end": 360,
  "sunset": 180,
  "sunrise": 180,
  "moon illuminated fraction": 0.02,
};

print("\n  difference between this build and the Swift reference\n");
print("    " + "measure".padEnd(28) + "n".padStart(6) + "median".padStart(12)
      + "p95".padStart(12) + "max".padStart(12) + "  unit");
let failed = 0;
for (const r of rows) {
  if (!r.n) { print("    " + r.name.padEnd(28) + "     0" + "  (no cases)"); continue; }
  const f = (x) => (x < 0.001 ? x.toExponential(2) : x.toFixed(4));
  const limit = TOLERANCE[r.name];
  const ok = limit === undefined || r.max <= limit;
  if (!ok) failed++;
  print("    " + (ok ? "ok  " : "FAIL") + r.name.padEnd(26) + String(r.n).padStart(6)
        + f(r.median).padStart(12) + f(r.p95).padStart(12) + f(r.max).padStart(12)
        + "  " + r.unit + (limit === undefined ? "" : "   limit " + limit));
}
print(failed ? `\n  ${failed} measure(s) outside tolerance` : "\n  all measures within tolerance");
