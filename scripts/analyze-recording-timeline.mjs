#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function usage() {
  const bin = path.basename(process.argv[1] || 'analyze-recording-timeline.mjs');
  console.error(`Usage: node scripts/${bin} /path/to/timeline.jsonl`);
  process.exit(1);
}

const inputPath = process.argv[2];
if (!inputPath) usage();

const text = fs.readFileSync(inputPath, 'utf8');
const lines = text.split('\n').filter(Boolean);
const events = [];

for (let i = 0; i < lines.length; i += 1) {
  try {
    events.push(JSON.parse(lines[i]));
  } catch {
    // ignore malformed lines
  }
}

events.sort((a, b) => (a.atMs ?? 0) - (b.atMs ?? 0));

const deltas = { pause: [], resume: [] };
for (const e of events) {
  if (e?.type === 'audio.pause.event') {
    const d = e?.payload?.deltaMs ?? e?.payload?.deltaPerfMs;
    if (typeof d === 'number') deltas.pause.push(d);
  }
  if (e?.type === 'audio.resume.event') {
    const d = e?.payload?.deltaMs ?? e?.payload?.deltaPerfMs;
    if (typeof d === 'number') deltas.resume.push(d);
  }
}

function stats(arr) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const sum = sorted.reduce((s, n) => s + n, 0);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p90 = sorted[Math.floor(sorted.length * 0.9)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? sorted.at(-1);
  return { count: sorted.length, avg: sum / sorted.length, p50, p90, p99, min: sorted[0], max: sorted.at(-1) };
}

const pauseStats = stats(deltas.pause);
const resumeStats = stats(deltas.resume);

console.log(`Events: ${events.length}`);
console.log('');
console.log('Audio pause() -> onpause latency (ms):', pauseStats ?? '(none)');
console.log('Audio resume() -> onresume latency (ms):', resumeStats ?? '(none)');
console.log('');

const recStart = events.find(e => e?.type === 'rec.start');
const recStop = [...events].reverse().find(e => e?.type === 'rec.stop.begin');
if (recStart?.payload?.nowMs && recStop?.payload) {
  const actualDurationMs = recStop.payload.actualDurationMs;
  const timerDurationMs = recStop.payload.durationMs;
  const accumulatedMs = recStop.payload.accumulatedMs;
  const audioOffsetMs = recStop.payload.audioOffsetMs;
  if (typeof actualDurationMs === 'number' && typeof timerDurationMs === 'number') {
    console.log('Recorder durations (ms):');
    console.log(`- wall clock: ${actualDurationMs}`);
    console.log(`- timer (active): ${timerDurationMs}`);
    console.log(`- timer (paused): ${actualDurationMs - timerDurationMs}`);
    if (typeof accumulatedMs === 'number') console.log(`- accumulatedMs: ${accumulatedMs}`);
    if (typeof audioOffsetMs === 'number') console.log(`- audioOffsetMs: ${audioOffsetMs}`);
    console.log('');
  }
}

// Pause interval analysis (wall-clock from rec.pause.begin -> rec.resume.begin)
const pauseBegins = events.filter(e => e?.type === 'rec.pause.begin' && typeof e?.payload?.tFromStartMs === 'number');
const resumeBegins = events.filter(e => e?.type === 'rec.resume.begin' && typeof e?.payload?.tFromStartMs === 'number');
pauseBegins.sort((a, b) => a.payload.tFromStartMs - b.payload.tFromStartMs);
resumeBegins.sort((a, b) => a.payload.tFromStartMs - b.payload.tFromStartMs);

const pauseIntervals = [];
let resumeIdx = 0;
for (const p of pauseBegins) {
  while (resumeIdx < resumeBegins.length && resumeBegins[resumeIdx].payload.tFromStartMs <= p.payload.tFromStartMs) {
    resumeIdx += 1;
  }
  const r = resumeBegins[resumeIdx];
  if (!r) break;
  const pauseMs = r.payload.tFromStartMs - p.payload.tFromStartMs;
  pauseIntervals.push({
    pauseAt: p.payload.tFromStartMs,
    resumeAt: r.payload.tFromStartMs,
    pauseMs,
    pauseOrigin: p.origin,
    resumeOrigin: r.origin
  });
  resumeIdx += 1;
}

const pauseMsList = pauseIntervals.map(i => i.pauseMs);
const pauseIntervalStats = stats(pauseMsList);
if (pauseIntervalStats) {
  console.log('Pause intervals (ms, from events):', pauseIntervalStats);
  console.log('');
}

const lastTimings = [...events].reverse().find(e => e?.type === 'finalize.output.timings');
if (lastTimings?.payload) {
  const v = lastTimings.payload.video;
  const a = lastTimings.payload.audio;
  const vd = typeof v?.duration === 'number' ? v.duration : undefined;
  const ad = typeof a?.duration === 'number' ? a.duration : undefined;
  if (typeof vd === 'number' || typeof ad === 'number') {
    console.log('Final output durations (seconds):');
    if (typeof vd === 'number') console.log(`- video: ${vd.toFixed(3)}`);
    if (typeof ad === 'number') console.log(`- audio: ${ad.toFixed(3)}`);
    if (typeof vd === 'number' && typeof ad === 'number') {
      const diff = ad - vd;
      console.log(`- audio - video: ${diff.toFixed(3)}s`);
    }
    console.log('');
  }
}

// Compare how much time video trimmed vs timer paused time.
if (recStop?.payload && lastTimings?.payload?.video?.duration) {
  const actualDurationMs = recStop.payload.actualDurationMs;
  const timerDurationMs = recStop.payload.durationMs;
  const videoDurationMs = lastTimings.payload.video.duration * 1000;
  if (typeof actualDurationMs === 'number' && typeof timerDurationMs === 'number') {
    const pausedByTimerMs = actualDurationMs - timerDurationMs;
    const pausedByVideoMs = actualDurationMs - videoDurationMs;
    const extraTrimMs = pausedByVideoMs - pausedByTimerMs;
    console.log('Pause accounting mismatch (ms):');
    console.log(`- pausedByTimerMs: ${pausedByTimerMs.toFixed(0)}`);
    console.log(`- pausedByVideoMs: ${pausedByVideoMs.toFixed(0)}`);
    console.log(`- extraTrimMs (video trims more): ${extraTrimMs.toFixed(0)}`);
    if (pauseIntervals.length) {
      console.log(`- extraTrimMsPerPause: ${(extraTrimMs / pauseIntervals.length).toFixed(1)} (pauseCount=${pauseIntervals.length})`);
    }
    console.log('');
  }
}

const interestingTypes = new Set([
  'rec.start',
  'rec.debugLogPath',
  'rec.pause.begin',
  'rec.pause.noop',
  'rec.pause.upgradeSource',
  'video.pause.invoke',
  'video.pause.resolved',
  'audio.pause.invoke',
  'audio.pause.event',
  'rec.resume.begin',
  'rec.resume.noop',
  'video.resume.invoke',
  'video.resume.resolved',
  'audio.resume.invoke',
  'audio.resume.event',
  'timer.pause',
  'timer.resume',
  'mark.start',
  'mark.complete',
  'mark.complete.skip',
  'marks.save',
  'rec.stop.begin',
  'video.stop.invoke',
  'video.stop.resolved',
  'video.complete.received',
  'finalize.mux.start',
  'finalize.mux.complete',
  'finalize.mux.error',
  'finalize.output.timings',
  'finalize.output.metadata'
]);

for (const e of events) {
  if (!interestingTypes.has(e?.type)) continue;
  const t = e?.payload?.tFromStartMs;
  const at = typeof t === 'number' ? `${t.toString().padStart(6, ' ')}ms` : `${(e.atMs ?? 0)}`;
  const origin = e.origin ? String(e.origin) : '';
  const extra = (() => {
    if (e.type === 'audio.pause.event' || e.type === 'audio.resume.event') {
      return ` deltaMs=${e?.payload?.deltaMs ?? ''} deltaPerfMs=${e?.payload?.deltaPerfMs ?? ''}`;
    }
    if (e.type === 'timer.pause') {
      const tbp = e?.payload?.timeBeforePause;
      const acc = e?.payload?.accumulatedMs;
      return ` timeBeforePauseMs=${typeof tbp === 'number' ? tbp : ''} accumulatedMs=${typeof acc === 'number' ? acc : ''}`;
    }
    if (e.type === 'timer.resume') {
      const acc = e?.payload?.accumulatedMs;
      return ` accumulatedMs=${typeof acc === 'number' ? acc : ''}`;
    }
    if (e.type === 'rec.pause.noop' || e.type === 'rec.resume.noop') {
      const reason = e?.payload?.reason;
      return ` reason=${typeof reason === 'string' ? reason : ''}`;
    }
    return '';
  })();
  console.log(`${at}  ${e.type.padEnd(22, ' ')}  ${origin}${extra}`);
}
