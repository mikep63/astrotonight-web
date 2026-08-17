import { getPosition } from "./geolocation.js";
import { loadTargets } from "./data.js";
import { computeTonight, MIN_ALTITUDE, MAX_MAGNITUDE, MAX_TRANSIT_OFFSET_HOURS } from "./rank.js";
import { computeDetail } from "./detail.js";
import { renderAll, renderDetail, renderStatus, renderError } from "./render.js";

const root = document.getElementById("app");

// Populated once geolocation + the Tonight computation succeed; the hash
// router below reads them to switch between the list and per-target detail.
let appState = null;
let targetIndex = null; // object.name -> target record (all popular objects)

/** #/<object-name> shows that target's detail; anything else shows the list. */
function route() {
  if (!appState) return;
  const match = appState.window && location.hash.match(/^#\/(.+)$/);
  if (match) {
    const obj = targetIndex.get(decodeURIComponent(match[1]));
    if (obj) {
      const detail = computeDetail(obj, appState.lat, appState.lon, appState);
      renderDetail(root, obj, detail, appState);
      window.scrollTo(0, 0);
      return;
    }
  }
  renderAll(root, appState);
}

async function run() {
  renderStatus(root, "Requesting your location…");
  let coord;
  try {
    coord = await getPosition();
  } catch (err) {
    renderError(
      root,
      "AstroTonight Tonight needs your location to compute which targets are up tonight. " +
        "Please allow location access and reload the page."
    );
    return;
  }

  renderStatus(root, "Loading targets…");
  let targets;
  try {
    targets = await loadTargets();
  } catch (err) {
    renderError(root, "Couldn't load the target list. Please reload the page.");
    return;
  }

  const state = computeTonight(targets, coord.lat, coord.lon);
  appState = {
    ...state,
    lat: coord.lat,
    lon: coord.lon,
    minAltitude: MIN_ALTITUDE,
    maxMagnitude: MAX_MAGNITUDE,
    maxTransitOffsetHours: MAX_TRANSIT_OFFSET_HOURS,
  };
  targetIndex = new Map(targets.map((o) => [o.name, o]));

  window.addEventListener("hashchange", route);
  route();
}

run();
