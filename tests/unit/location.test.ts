import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  HOUR_MS,
  MAX_SHARE_MS,
  MINUTE_MS,
  PUBLISH_HEARTBEAT_MS,
  PUBLISH_MIN_INTERVAL_MS,
  SHARE_DURATIONS,
  STALE_AFTER_MS,
  bubbleStatus,
  describeShare,
  distanceMeters,
  formatAgo,
  formatDuration,
  isValidCoords,
  mapsUrl,
  shouldPublish,
} from '../../src/utils/location.ts';
import { COPYRIGHT_URL, MAP_BASE_URL, TILE_URL, buildMapHtml, setPositionScript } from '../../src/utils/mapHtml.ts';

describe('share durations', () => {
  it('offers 15 minutes, 1 hour and 8 hours, never more than the cap', () => {
    assert.deepEqual(SHARE_DURATIONS.map((d) => d.ms), [15 * MINUTE_MS, HOUR_MS, 8 * HOUR_MS]);
    assert.ok(SHARE_DURATIONS.every((d) => d.ms <= MAX_SHARE_MS));
  });
});

describe('coordinates', () => {
  it('accepts real positions and rejects everything else', () => {
    assert.equal(isValidCoords(12.97, 77.59), true);
    assert.equal(isValidCoords(-90, 180), true);
    assert.equal(isValidCoords(91, 0), false);
    assert.equal(isValidCoords(0, -181), false);
    assert.equal(isValidCoords(NaN, 0), false);
    assert.equal(isValidCoords(Infinity, 0), false);
    assert.equal(isValidCoords('12' as unknown as number, 0), false);
    assert.equal(isValidCoords(undefined, undefined), false);
  });

  it('measures distance in metres', () => {
    assert.equal(Math.round(distanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })), 0);
    // One degree of latitude is about 111 km.
    const km = distanceMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }) / 1000;
    assert.ok(km > 110.5 && km < 111.8, String(km));
    // About 11 m north.
    const small = distanceMeters({ lat: 12.97, lng: 77.59 }, { lat: 12.9701, lng: 77.59 });
    assert.ok(small > 10 && small < 12, String(small));
  });
});

describe('when to write a new position', () => {
  const here = { lat: 12.97, lng: 77.59 };
  const moved = { lat: 12.9702, lng: 77.59 }; // about 22 m
  const nudge = { lat: 12.970003, lng: 77.59 }; // about 0.3 m

  it('always writes the first position', () => {
    assert.equal(shouldPublish(null, { ...here, at: 0 }), true);
  });

  it('never writes faster than the minimum interval, even when moving', () => {
    assert.equal(shouldPublish({ ...here, at: 0 }, { ...moved, at: PUBLISH_MIN_INTERVAL_MS - 1 }), false);
  });

  it('writes once the person has moved far enough', () => {
    assert.equal(shouldPublish({ ...here, at: 0 }, { ...moved, at: PUBLISH_MIN_INTERVAL_MS }), true);
  });

  it('skips tiny movements...', () => {
    assert.equal(shouldPublish({ ...here, at: 0 }, { ...nudge, at: 20_000 }), false);
  });

  it('...but sends a heartbeat so a person standing still does not look stale', () => {
    assert.equal(shouldPublish({ ...here, at: 0 }, { ...nudge, at: PUBLISH_HEARTBEAT_MS }), true);
  });
});

describe('wording', () => {
  it('formats durations, rounding up', () => {
    assert.equal(formatDuration(30_000), '1 min');
    assert.equal(formatDuration(61_000), '2 min');
    assert.equal(formatDuration(15 * MINUTE_MS), '15 min');
    assert.equal(formatDuration(HOUR_MS), '1 h');
    assert.equal(formatDuration(HOUR_MS + 5 * MINUTE_MS), '1 h 5 min');
    assert.equal(formatDuration(8 * HOUR_MS), '8 h');
    assert.equal(formatDuration(-5), '1 min');
  });

  it('formats "ago"', () => {
    assert.equal(formatAgo(10_000), 'just now');
    assert.equal(formatAgo(4 * MINUTE_MS), '4 min ago');
  });

  it('bubble: live until the end time, then ended', () => {
    assert.deepEqual(bubbleStatus(10 * MINUTE_MS, 0), { live: true, label: 'Live location · 10 min left' });
    assert.deepEqual(bubbleStatus(10 * MINUTE_MS, 10 * MINUTE_MS), { live: false, label: 'Live location ended' });
    assert.deepEqual(bubbleStatus(0, 5), { live: false, label: 'Live location ended' });
  });
});

describe('viewer status', () => {
  const base = { now: 100 * MINUTE_MS, expiresAt: 130 * MINUTE_MS, active: true, updatedAtMs: 99 * MINUTE_MS };

  it('live when active, unexpired and recently updated', () => {
    assert.deepEqual(describeShare(base), { state: 'live', label: 'Live · 30 min left' });
  });

  it('stale when updates stopped (the sharer closed the app)', () => {
    const state = describeShare({ ...base, updatedAtMs: base.now - STALE_AFTER_MS - MINUTE_MS });
    assert.equal(state.state, 'stale');
    assert.equal(state.label, 'Last updated 4 min ago');
  });

  it('ended when switched off or past the end time', () => {
    assert.equal(describeShare({ ...base, active: false }).state, 'ended');
    assert.equal(describeShare({ ...base, now: base.expiresAt }).state, 'ended');
  });

  it('an unknown update time is not treated as stale', () => {
    assert.equal(describeShare({ ...base, updatedAtMs: 0 }).state, 'live');
  });
});

describe('maps link', () => {
  it('builds a link for real positions only', () => {
    assert.equal(mapsUrl(12.97, 77.59), 'https://www.google.com/maps/search/?api=1&query=12.97,77.59');
    assert.equal(mapsUrl(100, 0), null);
    assert.equal(mapsUrl(NaN, 0), null);
  });
});

describe('map page', () => {
  it('uses OpenStreetMap, credits it, and pins Leaflet with integrity hashes', () => {
    const html = buildMapHtml({ lat: 12.97, lng: 77.59, accuracy: 8 });
    assert.ok(html.includes(TILE_URL));
    assert.ok(html.includes(COPYRIGHT_URL));
    assert.ok(html.includes('leaflet@1.9.4'));
    assert.equal((html.match(/integrity="sha256-/g) ?? []).length, 2);
    assert.ok(html.includes('lat: 12.97, lng: 77.59, acc: 8'));
  });

  it('never puts bad numbers into the page', () => {
    const html = buildMapHtml({ lat: NaN, lng: 500, accuracy: -4 });
    assert.ok(html.includes('lat: 0, lng: 0, acc: 0'));
    assert.ok(!html.includes('NaN'));
  });

  it('the move script only accepts real coordinates', () => {
    assert.equal(setPositionScript(12.97, 77.59, 8), 'window.setPosition && window.setPosition(12.97, 77.59, 8); true;');
    assert.equal(setPositionScript(12.97, 77.59, null), 'window.setPosition && window.setPosition(12.97, 77.59, 0); true;');
    assert.equal(setPositionScript(NaN, 0), null);
    assert.equal(setPositionScript(0, 999), null);
  });

  it('identifies the app to the tile server', () => {
    assert.ok(MAP_BASE_URL.startsWith('https://'));
  });
});
