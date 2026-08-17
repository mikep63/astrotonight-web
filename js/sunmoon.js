// Sun/Moon: real ephemeris work, delegated to astronomy-engine rather than
// hand-rolled. Wraps it to match the shape of AstroTonight's Sun/Moon/Twilight
// enums (AstroTonight/Services/AltAzCalculator.swift) so rank.js/render.js can
// consume it the same way the Swift Tonight view does.
import * as Astronomy from "../vendor/astronomy.js";

const { Body } = Astronomy;

export function makeObserver(latDeg, lonDeg) {
  return new Astronomy.Observer(latDeg, lonDeg, 0);
}

function sunAltitude(date, observer) {
  const eq = Astronomy.Equator(Body.Sun, date, observer, true, true);
  return Astronomy.Horizon(date, observer, eq.ra, eq.dec, "normal").altitude;
}

/**
 * The dark stretch relevant to `date`: if already dark, extends backward to
 * when darkness began; otherwise the next dark stretch within 24h. Returns
 * null if the sun never crosses the threshold within that window (polar
 * day). Uses SearchAltitude's proper root-finding rather than Swift's
 * 300s-step manual scan — same contract, more precise.
 */
function nightWindow(date, observer, threshold) {
  let start;
  if (sunAltitude(date, observer) < threshold) {
    const descend = Astronomy.SearchAltitude(Body.Sun, observer, -1, date, -1, threshold);
    start = descend ? descend.date : date;
  } else {
    const descend = Astronomy.SearchAltitude(Body.Sun, observer, -1, date, 1, threshold);
    if (!descend) return null;
    start = descend.date;
  }

  const ascend = Astronomy.SearchAltitude(Body.Sun, observer, +1, start, 1, threshold);
  const end = ascend ? ascend.date : new Date(date.getTime() + 24 * 3600 * 1000);
  return { start, end };
}

/** Astronomical night (sun < -18°), falling back to nautical (-12°) at high
 * latitudes in summer — same chain as Swift's `astronomicalNight ?? nauticalNight`. */
export function twilightWindow(date, observer) {
  return nightWindow(date, observer, -18) ?? nightWindow(date, observer, -12);
}

export function sunHorizonEvents(window, observer) {
  const sunset = Astronomy.SearchRiseSet(Body.Sun, observer, -1, window.start, -1);
  const sunrise = Astronomy.SearchRiseSet(Body.Sun, observer, +1, window.end, 1);
  return {
    sunset: sunset ? sunset.date : null,
    sunrise: sunrise ? sunrise.date : null,
  };
}

// Same 8-bucket, 45°-wide elongation table as Swift's Moon.info switch.
const PHASE_BUCKETS = [
  [22.5, "New Moon", "🌑"],
  [67.5, "Waxing Crescent", "🌒"],
  [112.5, "First Quarter", "🌓"],
  [157.5, "Waxing Gibbous", "🌔"],
  [202.5, "Full Moon", "🌕"],
  [247.5, "Waning Gibbous", "🌖"],
  [292.5, "Last Quarter", "🌗"],
  [337.5, "Waning Crescent", "🌘"],
];

function phaseNameAndEmoji(elongationDeg) {
  for (const [limit, name, emoji] of PHASE_BUCKETS) {
    if (elongationDeg < limit) return { name, emoji };
  }
  return { name: "New Moon", emoji: "🌑" };
}

/** Moon's apparent equatorial coords at `date`, in degrees (ra 0..360, dec).
 * astronomy-engine returns ra in sidereal hours; ×15 gives degrees, matching
 * the RA/Dec convention altaz.js and targets.json use. */
export function moonEquatorial(date, observer) {
  const eq = Astronomy.Equator(Body.Moon, date, observer, true, true);
  return { ra: eq.ra * 15, dec: eq.dec };
}

export function moonInfo(date, observer) {
  // 0..360°, elongation between lunar/solar ecliptic longitude — same
  // convention as Swift's `moonLon - sunLon` (0 = new, 180 = full).
  const elongation = Astronomy.MoonPhase(date);
  const { name, emoji } = phaseNameAndEmoji(elongation);
  const illum = Astronomy.Illumination(Body.Moon, date);
  const rise = Astronomy.SearchRiseSet(Body.Moon, observer, +1, date, 1);
  const set = Astronomy.SearchRiseSet(Body.Moon, observer, -1, date, 1);
  return {
    illuminatedFraction: illum.phase_fraction,
    phaseName: name,
    emoji,
    rise: rise ? rise.date : null,
    set: set ? set.date : null,
  };
}
