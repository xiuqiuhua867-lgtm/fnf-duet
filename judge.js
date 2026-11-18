(function (root) {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const SCORE = { sick: 350, good: 200, bad: 100, shit: 50, miss: -10 };
  const QUALITY = { sick: 1, good: .65, bad: .15, shit: -.25 };
  const ACCURACY = { sick: 1, good: .75, bad: .5, shit: .25, miss: 0 };
  const CODE = { sick: 1, good: 2, bad: 3, shit: 4, miss: 5, ghost: 6, drop: 7 };
  const DIRECTIONS = ['left', 'down', 'up', 'right'];

  class FnfJudge {
    constructor(chart, config = {}, options = {}) {
      if (!chart || !Array.isArray(chart.events)) throw new TypeError('A chart with events is required');
      this.chart = chart;
      this.config = {
        initialShare: .5, healthBudget: 2.4, healthMin: .04, healthMax: .96,
        sustainStep: .1171875, sustainWeight: .18, missPenalty: .065,
        ghostPenalty: .020, holdDropPenalty: .035, barSmoothSeconds: .075,
        dangerThreshold: .30, advantageThreshold: .60, ...config
      };
      this.options = { autoplay: false, ghostTapping: true, practice: false, ...options };
      // These windows are choices for this prototype, not claims about an
      // official/current engine's exact timing rules.
      this.windows = { sick: .045, good: .090, bad: .135, shit: .166 };
      this.releaseGrace = .080;
      this._notes = chart.events.map((e, index) => {
        if (![0, 1].includes(e.side) || !Number.isInteger(e.lane) || e.lane < 0 || e.lane > 3 ||
            !Number.isFinite(e.hit) || e.hit < 0 || !Number.isFinite(e.hold) || e.hold < 0)
          throw new TypeError('Invalid source note: ' + e.id);
        return { ...e, index, endTime: e.hit + e.hold, state: null, graceReleased: false };
      });
      const ids = new Set(this._notes.map(n => n.id));
      if (ids.size !== this._notes.length) throw new TypeError('Chart note IDs must be unique');
      this._weights = [0, 0];
      this._schedule = [];
      for (const n of this._notes) {
        this._weights[n.side]++;
        this._schedule.push({ at: n.hit, type: 'head', order: 0, n });
        if (n.side === 1) this._schedule.push({ at: n.hit + this.windows.shit, type: 'deadline', order: 3, n });
        if (n.hold > 0) {
          const step = this.config.sustainStep;
          for (let at = n.hit + step; at < n.endTime - step * .2; at += step) {
            this._schedule.push({ at, type: 'tick', order: 1, n });
            this._weights[n.side] += this.config.sustainWeight;
          }
          this._schedule.push({ at: n.endTime, type: 'end', order: 2, n });
        }
      }
      this._schedule.sort((a, b) => a.at - b.at || a.order - b.order || a.n.index - b.n.index);
      this.reset();
    }

    reset(options = {}) {
      this.options = { ...this.options, ...options };
      const formal = !this.options.autoplay && !this.options.practice;
      this.rules = {
        mode: this.options.autoplay ? 'auto' : this.options.practice ? 'practice' : 'formal',
        missPenalty: this.options.autoplay ? this.config.missPenalty : .045,
        ghostPenalty: this.options.autoplay ? this.config.ghostPenalty : .012,
        holdDropPenalty: this.options.autoplay ? this.config.holdDropPenalty : .025,
        playerRecoveryMultiplier: formal ? 1.8 : 1,
        opponentScores: !formal
      };
      this.time = 0;
      this.status = 'playing';
      this.failedAt = null;
      this.finishedAt = null;
      this._cursor = 0;
      this._exactDeadlines = [];
      this._healthRaw = this.config.initialShare;
      this._healthVisual = this._healthRaw;
      this._visualTime = 0;
      this._scores = [0, 0]; this._combo = [0, 0]; this._misses = [0, 0];
      this._heads = [0, 0]; this._attempts = [0, 0]; this._accSum = [0, 0];
      this._pop = [null, null]; this._recentHeads = [null, null];
      this._feedbackSerial = 0; this._feedbackEvents = [];
      this._lastMiss = [null, null]; this._lastMissAt = [-1000, -1000];
      this._keys = [false, false, false, false];
      this._lanes = [0, 1].map(() => [0, 1, 2, 3].map(() => ({ pressed: false, held: false, confirmAt: -1000 })));
      for (const n of this._notes) { n.state = null; n.graceReleased = false; }
      return this;
    }

    _isAuto(side) { return side === 0 || this.options.autoplay; }

    // The opponent is a visual/audio performer in a formal player round.
    // Practice and AUTO retain the two-sided demonstration battle behaviour.
    _canScoreSide(side) { return side === 1 || this.options.autoplay || this.options.practice; }

    _recoveryMultiplier(side) { return side === 1 ? this.rules.playerRecoveryMultiplier : 1; }

    _feedback(type, n, t, judgement, side = n ? n.side : 1, lane = n ? n.lane : -1) {
      const event = { seq: ++this._feedbackSerial, type, noteId: n ? n.id : null,
        side, lane, at: t, judgement, combo: this._combo[side],
        hold: n ? n.hold : 0, error: n && type === 'hit' ? t - n.hit : null,
        scoringEnabled: this._canScoreSide(side) };
      this._feedbackEvents.push(event);
      // Bounded history supports multiple simultaneous judgements without a
      // mutating drain API. Consumers remember seq and reset it on a new round.
      if (this._feedbackEvents.length > 256) this._feedbackEvents.shift();
      if (['miss', 'ghost', 'drop'].includes(type)) {
        this._lastMiss[side] = event; this._lastMissAt[side] = t;
      }
      return event;
    }

    _validateTime(t) {
      if (!Number.isFinite(t) || t < 0) throw new TypeError('Song time must be a nonnegative number');
      if (t < this.time - 1e-9) throw new RangeError('Song time moved backward; call reset() before seeking backward');
    }

    _advanceVisual(t) {
      const dt = Math.max(0, t - this._visualTime);
      const smooth = this.config.barSmoothSeconds;
      this._healthVisual = smooth > 0
        ? this._healthRaw + (this._healthVisual - this._healthRaw) * Math.exp(-dt / smooth)
        : this._healthRaw;
      this._visualTime = t;
    }

    _health(delta, t) {
      this._advanceVisual(t);
      this._healthRaw = this.options.autoplay
        ? clamp(this._healthRaw + delta, this.config.healthMin, this.config.healthMax)
        : clamp(this._healthRaw + delta, 0, 1);
      if (!this.options.autoplay && !this.options.practice && this._healthRaw >= 1 && this.status === 'playing') {
        this.status = 'failed'; this.failedAt = t;
        for (const lanes of this._lanes) for (const lane of lanes) lane.held = false;
        for (const n of this._notes) if (n.state) n.state.held = false;
      }
    }

    _newState(n, judgement, t) {
      n.state = {
        judged: true, judgement, held: false, dropped: false,
        releaseAt: null, hitAt: judgement === 'miss' ? null : t,
        completedAt: null, judgedAt: t, comboAtHit: 0
      };
      return n.state;
    }

    _head(n, judgement, t) {
      if (n.state) return false;
      const s = n.side, ns = this._newState(n, judgement, t), scoring = this._canScoreSide(s);
      this._heads[s]++; this._attempts[s]++;
      if (scoring) {
        this._scores[s] += SCORE[judgement];
        this._pop[s] = { kind: judgement, t, code: CODE[judgement], id: n.id, lane: n.lane };
      } else this._pop[s] = null;
      if (judgement === 'miss') {
        this._combo[s] = 0; this._misses[s]++;
        if (scoring) this._health((s === 0 ? -1 : 1) * this.rules.missPenalty, t);
      } else {
        if (scoring) this._combo[s]++;
        this._accSum[s] += ACCURACY[judgement];
        ns.comboAtHit = this._combo[s];
        const lane = this._lanes[s][n.lane];
        lane.confirmAt = t;
        ns.held = n.hold > 0 && t < n.endTime;
        if (ns.held) lane.held = true;
        else if (n.hold > 0) ns.completedAt = t;
        this._recentHeads[s] = { id: n.id, lane: n.lane, t, hit: n.hit, hold: n.hold, end: n.endTime };
        if (scoring) this._health((s === 0 ? 1 : -1) * this.config.healthBudget * QUALITY[judgement] *
          (QUALITY[judgement] > 0 ? this._recoveryMultiplier(s) : 1) / (this._weights[s] || 1), t);
      }
      this._feedback(judgement === 'miss' ? 'miss' : 'hit', n, t, judgement);
      return true;
    }

    _tick(n, t) {
      const ns = n.state;
      if (!ns || ns.judgement === 'miss' || ns.dropped || t < ns.hitAt) return;
      if (!this._isAuto(n.side) && !this._keys[n.lane] && !n.graceReleased) return;
      if (!this._canScoreSide(n.side)) return;
      this._scores[n.side] += 10;
      this._health((n.side === 0 ? 1 : -1) * this.config.healthBudget * this.config.sustainWeight * this._recoveryMultiplier(n.side) / (this._weights[n.side] || 1), t);
    }

    _end(n, t) {
      const ns = n.state;
      if (!ns || ns.judgement === 'miss') return;
      ns.held = false;
      if (!ns.dropped) { ns.completedAt = t; this._feedback('holdEnd', n, t, ns.judgement); }
      this._lanes[n.side][n.lane].held = this._notes.some(other => other !== n && other.side === n.side && other.lane === n.lane && other.state && other.state.held);
    }

    _drop(n, t) {
      const ns = n.state;
      if (!ns || ns.judgement === 'miss' || ns.dropped || !ns.held) return false;
      ns.held = false; ns.dropped = true; ns.releaseAt = t;
      this._misses[n.side]++; this._combo[n.side] = 0;
      this._attempts[n.side]++; this._scores[n.side] -= 10;
      this._pop[n.side] = { kind: 'drop', t, code: CODE.drop, id: n.id, lane: n.lane };
      this._health((n.side === 0 ? -1 : 1) * this.rules.holdDropPenalty, t);
      this._feedback('drop', n, t, 'drop');
      return true;
    }

    _dispatch(event) {
      const { n, at, type } = event;
      this._advanceVisual(at);
      if (type === 'head') { if (this._isAuto(n.side)) this._head(n, 'sick', at); }
      else if (type === 'deadline') { if (!n.state) this._head(n, 'miss', at); }
      else if (type === 'tick') this._tick(n, at);
      else if (type === 'end') this._end(n, at);
    }

    update(t) {
      this._validateTime(t);
      t = Math.max(this.time, t);
      if (this.status === 'playing') {
        // At the exact late boundary the head is still playable. Defer only
        // equality cases, then settle them before any later scheduled events.
        const keep = [];
        for (const event of this._exactDeadlines) {
          if (t > event.at) this._dispatch(event); else keep.push(event);
          if (this.status !== 'playing') break;
        }
        this._exactDeadlines = keep;
        while (this.status === 'playing' && this._cursor < this._schedule.length && this._schedule[this._cursor].at <= t) {
          const event = this._schedule[this._cursor++];
          if (event.type === 'deadline' && t === event.at) this._exactDeadlines.push(event);
          else this._dispatch(event);
        }
      }
      this._advanceVisual(t);
      this.time = t;
      if (this.status === 'playing' && Number.isFinite(this.chart.duration) && t >= this.chart.duration) {
        this.status = 'finished'; this.finishedAt = this.chart.duration;
        for (const lanes of this._lanes) for (const lane of lanes) lane.held = false;
      }
      return this;
    }

    press(lane, t) {
      if (!Number.isInteger(lane) || lane < 0 || lane > 3) throw new TypeError('Lane must be 0..3');
      this.update(t);
      if (this.status !== 'playing' || this.options.autoplay) return { accepted: false, reason: this.status !== 'playing' ? this.status : 'autoplay' };
      if (this._keys[lane]) return { accepted: false, reason: 'repeat' };
      this._keys[lane] = true; this._lanes[1][lane].pressed = true;
      let candidate = null, distance = Infinity;
      for (const n of this._notes) {
        if (n.side !== 1 || n.lane !== lane || n.state) continue;
        const d = Math.abs(n.hit - t);
        // A later nearby note must not steal a press from an earlier note
        // whose judgement window is still open. Dense same-lane repeats are
        // consumed in source time order, while notes outside the window are ignored.
        if (d <= this.windows.shit + 1e-12 && (!candidate || n.hit < candidate.hit || (n.hit === candidate.hit && n.index < candidate.index))) {
          candidate = n; distance = d;
        }
      }
      if (candidate) {
        const judgement = distance <= this.windows.sick + 1e-12 ? 'sick'
          : distance <= this.windows.good + 1e-12 ? 'good'
          : distance <= this.windows.bad + 1e-12 ? 'bad' : 'shit';
        this._head(candidate, judgement, t);
        return { accepted: true, id: candidate.id, judgement, error: t - candidate.hit };
      }
      if (!this.options.ghostTapping) {
        this._combo[1] = 0; this._misses[1]++; this._attempts[1]++; this._scores[1] -= 10;
        this._pop[1] = { kind: 'ghost', t, code: CODE.ghost, id: null, lane };
        this._health(this.rules.ghostPenalty, t);
        this._feedback('ghost', null, t, 'ghost', 1, lane);
      }
      return { accepted: false, reason: 'empty', penalized: !this.options.ghostTapping };
    }

    release(lane, t) {
      if (!Number.isInteger(lane) || lane < 0 || lane > 3) throw new TypeError('Lane must be 0..3');
      this.update(t);
      this._keys[lane] = false; this._lanes[1][lane].pressed = false;
      let dropped = 0;
      if (!this.options.autoplay && this.status === 'playing') for (const n of this._notes) {
        if (n.side !== 1 || n.lane !== lane || !n.state || !n.state.held) continue;
        if (n.endTime - t > this.releaseGrace + 1e-12) dropped += Number(this._drop(n, t));
        else { n.state.held = false; n.graceReleased = true; }
      }
      this._lanes[1][lane].held = this._notes.some(n => n.side === 1 && n.lane === lane && n.state && n.state.held);
      return { dropped };
    }

    activePose(role, t = this.time) {
      const side = role === 0 || role === 'joucho' || role === '情绪' ? 0 : 1;
      if (this.status !== 'playing') return 'idle';
      const recent = this._recentHeads[side];
      if (recent && t >= recent.t && t - recent.t <= .19) return DIRECTIONS[recent.lane];
      let held = null;
      // An actually held sustain keeps its direction until completion/drop.
      for (const n of this._notes) if (n.side === side && n.state && n.state.held && t >= n.state.hitAt && t < n.endTime) {
        if (!held || n.state.hitAt >= held.t) held = { lane: n.lane, t: n.state.hitAt };
      }
      return held ? DIRECTIONS[held.lane] : 'idle';
    }

    sample(t = this.time) {
      this.update(t);
      const c = this.config, auto = !!this.options.autoplay;
      const health = clamp(this._healthVisual, auto ? c.healthMin : 0, auto ? c.healthMax : 1);
      const icon = share => share <= c.dangerThreshold ? 2 : share >= c.advantageThreshold ? 1 : 0;
      const noteStates = new Map();
      for (const n of this._notes) if (n.state) noteStates.set(n.id, { ...n.state });
      return {
        time: this.time, status: this.status, failed: this.status === 'failed', finished: this.status === 'finished',
        failedAt: this.failedAt, finishedAt: this.finishedAt,
        auto, practice: !!this.options.practice, autoSides: [true, auto], health, healthRaw: this._healthRaw,
        scores: this._scores.slice(), combo: this._combo.slice(), misses: this._misses.slice(),
        heads: this._heads.slice(), attempts: this._attempts.slice(),
        accuracy: this._attempts.map((n, side) => n ? 100 * this._accSum[side] / n : 100),
        pop: this._pop.map(p => p ? { ...p, age: Math.max(0, this.time - p.t) } : { kind: 'none', code: 0, age: 99 }),
        iconStates: [icon(health), icon(1 - health)],
        laneStates: this._lanes.map(lanes => lanes.map(lane => ({ ...lane }))), noteStates,
        recentHeads: this._recentHeads.map(n => n ? { ...n } : null)
        , feedbackEvents: this._feedbackEvents.map(e => ({ ...e })), feedbackSeq: this._feedbackSerial,
        lastMissAt: this._lastMissAt.slice(), lastMiss: this._lastMiss.map(e => e ? { ...e } : null),
        ruleProfile: { ...this.rules }
      };
    }
  }

  root.FnfJudge = FnfJudge;
  if (typeof module === 'object' && module.exports) module.exports = FnfJudge;
})(typeof window !== 'undefined' ? window : globalThis);
