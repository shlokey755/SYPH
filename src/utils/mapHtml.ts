/**
 * mapHtml.ts
 * The small web page the location viewer shows in a WebView: an OpenStreetMap map (Leaflet) with one moving dot.
 * It needs no API key and no billing account, unlike Google Maps. The page exposes two functions for the app to call
 * with injectJavaScript: setPosition(lat, lng, accuracy) and recenter().
 *
 * Only validated numbers are put into the page (never text from a message or a user), so there is nothing to inject.
 *
 * OpenStreetMap's public tile server is meant for light use. A chat between friends is fine; if SYPH ever grows,
 * swap TILE_URL for a provider with a free tier.
 */

// Same check as isValidCoords in ./location. It is repeated here because a relative import between two utils files
// would need a ".ts" ending for the Node test runner, which the app's typecheck does not accept.
const isValidCoords = (lat: unknown, lng: unknown): boolean =>
  typeof lat === 'number' &&
  typeof lng === 'number' &&
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  Math.abs(lat) <= 90 &&
  Math.abs(lng) <= 180;

export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';

/** Tile servers expect a Referer that identifies the app, and a page loaded from a string has none, so one is set. */
export const MAP_BASE_URL = 'https://github.com/shlokey755/SYPH';

// Pinned to Leaflet 1.9.4. The integrity values are the SHA-256 of the files published on npm / unpkg for that version.
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_CSS_SRI = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_JS_SRI = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';

export interface MapStart {
  lat: number;
  lng: number;
  accuracy?: number | null;
}

/** The JavaScript call that moves the dot. Returns null for coordinates that are not real numbers. */
export function setPositionScript(lat: number, lng: number, accuracy?: number | null): string | null {
  if (!isValidCoords(lat, lng)) return null;
  const acc = typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy > 0 ? accuracy : 0;
  return `window.setPosition && window.setPosition(${lat}, ${lng}, ${acc}); true;`;
}

export function buildMapHtml(start: MapStart): string {
  const lat = isValidCoords(start.lat, start.lng) ? start.lat : 0;
  const lng = isValidCoords(start.lat, start.lng) ? start.lng : 0;
  const acc =
    typeof start.accuracy === 'number' && Number.isFinite(start.accuracy) && start.accuracy > 0 ? start.accuracy : 0;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="${LEAFLET_CSS}" integrity="${LEAFLET_CSS_SRI}" crossorigin="">
<style>
  html, body, #map { height: 100%; margin: 0; padding: 0; background: #e5e3df; }
  #fallback { font: 15px sans-serif; color: #333; padding: 24px; text-align: center; }
</style>
</head>
<body>
<div id="map"></div>
<script src="${LEAFLET_JS}" integrity="${LEAFLET_JS_SRI}" crossorigin=""></script>
<script>
(function () {
  var start = { lat: ${lat}, lng: ${lng}, acc: ${acc} };
  if (typeof L === 'undefined') {
    document.getElementById('map').innerHTML =
      '<div id="fallback">The map could not load (no internet?). Use "Open in Maps" below.</div>';
    window.setPosition = function () {};
    window.recenter = function () {};
    return;
  }
  var map = L.map('map', { zoomControl: true, attributionControl: false }).setView([start.lat, start.lng], 16);
  L.tileLayer('${TILE_URL}', { maxZoom: 19 }).addTo(map);
  L.control.attribution({ prefix: false }).addTo(map)
    .addAttribution('&copy; <a href="${COPYRIGHT_URL}">OpenStreetMap</a> contributors');

  var ring = L.circle([start.lat, start.lng], { radius: start.acc, weight: 1, color: '#1a73e8', fillColor: '#1a73e8', fillOpacity: 0.12 }).addTo(map);
  var dot = L.circleMarker([start.lat, start.lng], { radius: 9, weight: 3, color: '#ffffff', fillColor: '#1a73e8', fillOpacity: 1 }).addTo(map);
  var following = true;
  map.on('dragstart', function () { following = false; });

  window.setPosition = function (lat, lng, acc) {
    if (!isFinite(lat) || !isFinite(lng)) return;
    var p = [lat, lng];
    dot.setLatLng(p);
    ring.setLatLng(p);
    ring.setRadius(acc > 0 ? acc : 0);
    if (following) map.panTo(p);
  };
  window.recenter = function () { following = true; map.panTo(dot.getLatLng()); };
})();
</script>
</body>
</html>`;
}
