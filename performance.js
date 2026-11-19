(function (root) {
  'use strict';

  const heights = [540, 720, 900, 1080];
  const qualities = ['auto', '1080', '720', '540'];

  // Use the audio clock for scoring. For browsers whose media timestamp
  // advances in coarse steps, briefly interpolate the presentation only.
  class VisualClock {
    constructor() { this.reset(); }

    reset() {
      this.observed = null;
      this.observedAt = 0;
      this.presented = null;
      this.leadLimit = .033;
    }

    sample(raw, wall, advancing) {
      if (!advancing || this.observed === null || raw < this.observed || raw - this.observed > .25) {
        this.observed = raw;
        this.observedAt = wall;
        this.presented = raw;
        this.leadLimit = .033;
        return raw;
      }
      if (raw > this.observed) {
        // Some native players report time once per 100ms. Learn that
        // cadence for visual interpolation, with a strict 120ms bound.
        const step = raw - this.observed, interval = (wall-this.observedAt)/1000;
        this.leadLimit = step > .045 && step < .15 && interval > .03 && interval < .18
          ? Math.min(.12, Math.max(step, interval) + .004) : .033;
        this.observed = raw;
        this.observedAt = wall;
      }
      const ahead = Math.min(this.leadLimit, Math.max(0, (wall - this.observedAt) / 1000));
      this.presented = Math.max(this.presented, raw + ahead);
      return this.presented;
    }
  }

  function create(canvas, viewport, panel) {
    const fpsField = panel.querySelector('#perf-fps');
    const details = panel.querySelector('#perf-details');
    let quality = 'auto', enabled = false, active = false, exporting = false;
    let fitPending = true, limit = 1080, slowWindows = [], trial = null, stopAdapting = false;
    let sampleStart = null, callbacks = 0, paints = 0, workSum = 0, audioChanges = 0, lastAudio = null;
    let lastReading = null;

    const mobile = () => viewport.dataset.touch === 'true';

    function clearSample() {
      sampleStart = null;
      callbacks = paints = workSum = audioChanges = 0;
      lastAudio = null;
    }

    function clearAdaptation() {
      limit = 1080;
      stopAdapting = false;
      slowWindows = [];
      trial = null;
      fitPending = true;
      clearSample();
    }

    function updateVisibility() {
      const visible = enabled && active && !exporting;
      panel.hidden = !visible;
      if (visible && !lastReading) {
        fpsField.textContent = '—';
        details.textContent = '正在测量…';
      }
    }

    function invalidate() { fitPending = true; }

    function fit() {
      if (!fitPending) return;
      fitPending = false;
      let h = 1080;
      if (!exporting) {
        if (quality !== 'auto') h = Number(quality);
        else if (mobile() && canvas.clientHeight > 0) {
          const pixels = canvas.clientHeight * (root.devicePixelRatio || 1);
          h = Math.min(limit, heights.find(value => value >= pixels) || 1080);
        }
      }
      const w = Math.round(h * 16 / 9);
      if (canvas.width === w && canvas.height === h) return;
      canvas.width = w;
      canvas.height = h;
      if (trial && h < trial.target) {
        trial = null;
        slowWindows = [];
      }
      clearSample();
    }

    // A brief lower-resolution comparison helps a GPU-bound browser. When
    // the browser's own cadence stays capped, restore the original quality.
    function adapt(reading) {
      if (trial) {
        if (canvas.height !== trial.target) return;
        trial.readings.push(reading.fps);
        if (trial.readings.length < 2) return;
        const result = (trial.readings[0] + trial.readings[1]) / 2;
        if (result < trial.baseline + 4) {
          limit = trial.previousLimit;
          stopAdapting = true;
          fitPending = true;
        } else if (result >= 50 || canvas.height === heights[0]) {
          stopAdapting = true;
        }
        trial = null;
        slowWindows = [];
        return;
      }
      if (stopAdapting || canvas.height <= heights[0]) return;
      if (reading.fps >= 50 || reading.fps < 5) {
        slowWindows = [];
        return;
      }
      slowWindows.push(reading.fps);
      if (slowWindows.length < 2) return;
      const target = canvas.height > 720 ? 720 : 540;
      trial = {
        baseline: (slowWindows[0] + slowWindows[1]) / 2,
        previousLimit: limit,
        target,
        readings: []
      };
      limit = target;
      fitPending = true;
    }

    function wantsSample(phase, live) {
      if (!active || exporting || document.hidden) return false;
      const automatic = phase === 'playing' && live && quality === 'auto' && mobile();
      return enabled || (automatic && (trial !== null || (!stopAdapting && canvas.height > heights[0])));
    }

    function record(timestamp, workMs, painted, rawAudio, phase, live, audioMode) {
      if (!active || exporting || document.hidden) {
        clearSample();
        return;
      }
      if (sampleStart === null || timestamp < sampleStart || timestamp - sampleStart > 5000) {
        clearSample();
        sampleStart = timestamp;
        lastAudio = rawAudio;
        return;
      }
      callbacks++;
      if (painted) paints++;
      workSum += workMs;
      if (Number.isFinite(rawAudio)) {
        if (lastAudio !== null && Math.abs(rawAudio - lastAudio) > .00001) audioChanges++;
        lastAudio = rawAudio;
      }
      const elapsed = timestamp - sampleStart;
      if (elapsed < 1000) return;
      const reading = {
        fps: paints * 1000 / elapsed,
        cadence: callbacks * 1000 / elapsed,
        work: callbacks ? workSum / callbacks : 0,
        cpu: Math.min(100, workSum * 100 / elapsed),
        audioHz: phase === 'playing' && live ? audioChanges * 1000 / elapsed : null,
        width: canvas.width,
        height: canvas.height
      };
      lastReading = reading;
      if (enabled) {
        fpsField.textContent = String(Math.round(reading.fps));
        details.textContent = [
          'CPU 游戏线程 ' + reading.cpu.toFixed(0) + '%',
          reading.work.toFixed(1) + ' ms/帧',
          'GPU 占用 —',
          '刷新调度 ' + Math.round(reading.cadence) + '/秒',
          '音频时间 ' + (reading.audioHz === null ? '—' : Math.round(reading.audioHz) + '/秒'),
          '音频 ' + (audioMode === 'web-audio' ? 'Web Audio' : audioMode === 'native' ? '兼容模式' : '载入中'),
          reading.width + '×' + reading.height
        ].join('\n');
      }
      if (phase === 'playing' && live && quality === 'auto' && mobile()) adapt(reading);
      clearSample();
      sampleStart = timestamp;
      lastAudio = rawAudio;
    }

    root.addEventListener('resize', invalidate);
    root.visualViewport?.addEventListener('resize', invalidate);
    if (typeof ResizeObserver === 'function') new ResizeObserver(invalidate).observe(canvas);

    return {
      configure(value, show) {
        const next = qualities.includes(value) ? value : 'auto';
        if (next !== quality) {
          quality = next;
          clearAdaptation();
        }
        if (enabled !== show) {
          enabled = show;
          lastReading = null;
          clearSample();
        }
        updateVisibility();
      },
      resetRound() {
        clearAdaptation();
        lastReading = null;
        updateVisibility();
      },
      setPhase(phase) {
        const next = ['countdown', 'starting', 'playing'].includes(phase);
        if (next !== active || phase === 'playing') {
          active = next;
          clearSample();
          slowWindows = [];
          if (trial) trial.readings = [];
        }
        fitPending = true;
        updateVisibility();
      },
      setExport(value) {
        exporting = value;
        fitPending = true;
        if (value) fit();
        clearSample();
        updateVisibility();
      },
      fit,
      wantsSample,
      record
    };
  }

  root.CourtPerformance = { create, VisualClock, qualities };
})(window);
