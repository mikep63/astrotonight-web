// Fixed-default port of TonightView's recompute()/rank() pipeline
// (AstroTonight/Views/TonightView.swift). No filter UI — this site shows a
// fixed Tonight state for the popular-targets list: min altitude 30°,
// magnitude cap 11.0, popular-only (the export script already only emits
// popular objects, so that filter is implicit), and transit within 2h of
// mid-darkness.
import * as altaz from "./altaz.js";
import { makeObserver, twilightWindow, sunHorizonEvents, moonInfo } from "./sunmoon.js";

export const MIN_ALTITUDE = 30;
export const MAX_MAGNITUDE = 11;
// Restricts the list to objects transiting near the middle of astronomical
// darkness tonight — peak placement for the season, rather than caught
// rising or setting at the edges of the night.
export const MAX_TRANSIT_OFFSET_HOURS = 2;

/**
 * @returns {{window: {start,end}|null, moon, sunset, sunrise, targets: Array}}
 */
export function computeTonight(targets, latDeg, lonDeg, now = new Date()) {
  const observer = makeObserver(latDeg, lonDeg);
  const window = twilightWindow(now, observer);
  if (!window) {
    return { window: null, moon: null, sunset: null, sunrise: null, targets: [] };
  }

  const moon = moonInfo(now, observer);
  const { sunset, sunrise } = sunHorizonEvents(window, observer);

  // Anchor so each object's reported transit is the one nearest tonight,
  // not an arbitrary far-future one — same formula as Swift's transitAnchor.
  const windowMid = new Date((window.start.getTime() + window.end.getTime()) / 2);
  const transitAnchor = new Date(windowMid.getTime() - 12 * 3600 * 1000);

  const ranked = [];
  for (const obj of targets) {
    if (obj.vMagnitude != null && obj.vMagnitude > MAX_MAGNITUDE) continue;

    const peak = altaz.peak(obj.raDegrees, obj.decDegrees, latDeg, lonDeg, window);
    if (peak.altitude < MIN_ALTITUDE) continue;

    const transit = altaz.transit(obj.raDegrees, obj.decDegrees, latDeg, lonDeg, transitAnchor);
    const transitOffsetHours = Math.abs(transit.date - windowMid) / 3600000;
    if (transitOffsetHours > MAX_TRANSIT_OFFSET_HOURS) continue;

    ranked.push({
      object: obj,
      peakAltitude: peak.altitude,
      peakAzimuth: peak.azimuth,
      transitAltitude: transit.altitude,
      transitDate: transit.date,
    });
  }

  // The app's internal peak-altitude sort only matters as a pre-cap-at-200
  // ranking; at our scale (~96 objects) that cap never bites, so it has no
  // visible effect here. The list actually shown uses the app's default
  // `.meridian` sort — transit time ascending.
  ranked.sort((a, b) => a.transitDate - b.transitDate);

  return { window, moon, sunset, sunrise, observer, targets: ranked };
}
