// Alt/Az geometry for a FIXED RA/Dec point (a catalog object — not a moving
// body). Ported directly from AstroTonight's AstroTonight/Services/AltAzCalculator.swift
// (the `AltAz` enum) since this is ~20 lines of JD -> GMST -> LST -> hour
// angle -> spherical trig with no sun/moon dependency — no library value-add
// over a faithful port. Sun/Moon (real ephemeris work) live in sunmoon.js.

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const SIDEREAL_DAY_SECONDS = 86164.0905;

function julianDay(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

function gmst(jd) {
  const t = (jd - 2451545.0) / 36525.0;
  let g = 280.46061837
    + 360.98564736629 * (jd - 2451545.0)
    + 0.000387933 * t * t
    - (t * t * t) / 38710000.0;
  g = g % 360;
  if (g < 0) g += 360;
  return g;
}

function localSiderealTime(jd, lonDeg) {
  let lst = (gmst(jd) + lonDeg) % 360;
  if (lst < 0) lst += 360;
  return lst;
}

/** Altitude/azimuth (degrees) of a fixed RA/Dec point at a given time and location. */
export function position(raDeg, decDeg, latDeg, lonDeg, date) {
  const jd = julianDay(date);
  const lst = localSiderealTime(jd, lonDeg);
  let ha = (lst - raDeg) % 360;
  if (ha < -180) ha += 360;
  else if (ha > 180) ha -= 360;

  const lat = latDeg * DEG2RAD;
  const dec = decDeg * DEG2RAD;
  const haR = ha * DEG2RAD;

  const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(haR);
  const alt = Math.asin(Math.min(Math.max(sinAlt, -1), 1));
  const cosAlt = Math.cos(alt);

  let az;
  if (cosAlt < 1e-9) {
    az = 0;
  } else {
    const cosAz = (Math.sin(dec) - Math.sin(alt) * Math.sin(lat)) / (cosAlt * Math.cos(lat));
    az = Math.acos(Math.min(Math.max(cosAz, -1), 1));
    if (Math.sin(haR) > 0) az = 2 * Math.PI - az;
  }

  return { altitude: alt * RAD2DEG, azimuth: az * RAD2DEG };
}

/**
 * True meridian culmination: analytic, not scanned. The object's maximum
 * possible altitude and the next time it crosses the meridian after `date`
 * (within one sidereal day), regardless of daylight.
 */
export function transit(raDeg, decDeg, latDeg, lonDeg, afterDate) {
  const jd = julianDay(afterDate);
  const lst = localSiderealTime(jd, lonDeg);
  let hourAngle = (lst - raDeg) % 360;
  if (hourAngle < 0) hourAngle += 360; // degrees since last transit

  const siderealDegreesPerSecond = 360.0 / SIDEREAL_DAY_SECONDS;
  const secondsUntilTransit = (360.0 - hourAngle) / siderealDegreesPerSecond;

  const altitude = 90.0 - Math.abs(latDeg - decDeg);
  const azimuth = decDeg > latDeg ? 0 : 180;
  return {
    altitude,
    azimuth,
    date: new Date(afterDate.getTime() + secondsUntilTransit * 1000),
  };
}

/** Scans the given time window (600s steps) and returns the peak altitude reached. */
export function peak(raDeg, decDeg, latDeg, lonDeg, window, stepSeconds = 600) {
  let best = position(raDeg, decDeg, latDeg, lonDeg, window.start);
  let bestDate = window.start;
  let t = new Date(window.start.getTime() + stepSeconds * 1000);
  while (t <= window.end) {
    const p = position(raDeg, decDeg, latDeg, lonDeg, t);
    if (p.altitude > best.altitude) {
      best = p;
      bestDate = t;
    }
    t = new Date(t.getTime() + stepSeconds * 1000);
  }
  return { altitude: best.altitude, azimuth: best.azimuth, date: bestDate };
}
