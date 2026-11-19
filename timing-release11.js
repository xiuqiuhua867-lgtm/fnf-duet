(function (root) {
  'use strict';

  // The calibration test has its own beat clock. It never edits the song,
  // chart, judgement windows or records, and only an explicit Apply saves it.
  const beatSeconds = .55, warmupBeats = 4, sampleBeats = 12;
  const totalBeats = warmupBeats + sampleBeats;
  const endSeconds = (totalBeats - 1) * beatSeconds + .27;
  const median = values => {
    const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };

  class TapCalibration {
    constructor() { this.samples = new Map(); }
    tap(elapsed) {
      if (!Number.isFinite(elapsed)) return false;
      const index = Math.round(elapsed / beatSeconds);
      const errorMs = 1000 * (elapsed - index * beatSeconds);
      // One sample per target beat; warmup, double taps and taps between
      // beats cannot artificially create a successful measurement.
      if (index < warmupBeats || index >= totalBeats || Math.abs(errorMs) > 250 || this.samples.has(index)) return false;
      this.samples.set(index, errorMs);
      return true;
    }
    get count() { return this.samples.size; }
    result() {
      const values = [...this.samples.values()];
      if (values.length < 8) return { ok: false, reason: 'few', count: values.length };
      const centre = median(values), mad = median(values.map(value => Math.abs(value - centre)));
      const limit = Math.min(100, Math.max(30, mad * 3.5));
      const kept = values.filter(value => Math.abs(value - centre) <= limit);
      if (kept.length < 8) return { ok: false, reason: 'unstable', count: kept.length };
      const estimate = median(kept), jitter = 1.4826 * median(kept.map(value => Math.abs(value - estimate)));
      // A few random early/late taps must not become an automatic offset.
      const spread = Math.max(...kept) - Math.min(...kept);
      if (jitter > 45 || spread > 100 || Math.abs(estimate) > 200) {
        return { ok: false, reason: 'unstable', count: kept.length };
      }
      return { ok: true, offsetMs: Math.round(estimate / 5) * 5 || 0, count: kept.length, jitterMs: Math.round(jitter) };
    }
  }

  function grade(accuracy, misses, autoplay = false) {
    if (autoplay) return { key: 'auto', title: 'AUTO', caption: '自动演示' };
    if (accuracy >= 100 - 1e-8 && misses === 0) return { key: 'perfect', title: 'PERFECT', caption: '完美' };
    if (accuracy >= 90) return { key: 'excellent', title: 'EXCELLENT', caption: '优秀' };
    if (accuracy >= 80) return { key: 'great', title: 'GREAT', caption: '出色' };
    if (accuracy >= 65) return { key: 'good', title: 'GOOD', caption: '良好' };
    return { key: 'retry', title: 'TRY AGAIN', caption: '再接再厉' };
  }

  const api = Object.freeze({ beatSeconds, warmupBeats, sampleBeats, totalBeats, endSeconds, TapCalibration, grade });
  root.CourtTiming = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
