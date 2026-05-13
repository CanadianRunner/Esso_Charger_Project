import { describe, it, expect } from 'vitest';
import {
  buildChartPaths,
  catmullRomPath,
  medianSampleInterval,
  niceAxis,
  segmentSamples,
} from './powerChartMath';

describe('niceAxis', () => {
  it('produces a nice max and step for a 7.5 kW peak', () => {
    const a = niceAxis(7.5);
    expect(a.niceMax).toBe(8);
    expect(a.step).toBe(2);
    expect(a.ticks).toEqual([0, 2, 4, 6, 8]);
  });

  it('uses a 5-unit step for an 11.2 kW peak', () => {
    const a = niceAxis(11.2);
    expect(a.niceMax).toBe(15);
    expect(a.step).toBe(5);
    expect(a.ticks).toEqual([0, 5, 10, 15]);
  });

  it('falls back to a 0..1 range when given zero', () => {
    const a = niceAxis(0);
    expect(a.niceMax).toBe(1);
    expect(a.ticks[0]).toBe(0);
    expect(a.ticks[a.ticks.length - 1]).toBe(1);
  });
});

describe('medianSampleInterval', () => {
  it('returns the median delta between consecutive timestamps', () => {
    const samples = [
      { unixSecondsUtc: 100, kw: 7 },
      { unixSecondsUtc: 110, kw: 7 }, // 10s
      { unixSecondsUtc: 120, kw: 7 }, // 10s
      { unixSecondsUtc: 130, kw: 7 }, // 10s
      { unixSecondsUtc: 200, kw: 7 }, // 70s outlier
    ];
    expect(medianSampleInterval(samples)).toBe(10);
  });

  it('defaults to 10s on too-few samples to avoid div-by-zero downstream', () => {
    expect(medianSampleInterval([])).toBe(10);
    expect(medianSampleInterval([{ unixSecondsUtc: 1, kw: 5 }])).toBe(10);
  });
});

describe('segmentSamples', () => {
  it('keeps consecutive samples within threshold as one segment', () => {
    const samples = [
      { unixSecondsUtc: 100, kw: 7 },
      { unixSecondsUtc: 110, kw: 7 },
      { unixSecondsUtc: 120, kw: 7 },
    ];
    const segs = segmentSamples(samples, 30);
    expect(segs.length).toBe(1);
    expect(segs[0].length).toBe(3);
  });

  it('breaks at gaps wider than the threshold', () => {
    const samples = [
      { unixSecondsUtc: 100, kw: 7 },
      { unixSecondsUtc: 110, kw: 7 },
      // 60s gap > 30s threshold → break
      { unixSecondsUtc: 170, kw: 7 },
      { unixSecondsUtc: 180, kw: 7 },
    ];
    const segs = segmentSamples(samples, 30);
    expect(segs.length).toBe(2);
    expect(segs[0].length).toBe(2);
    expect(segs[1].length).toBe(2);
  });

  it('returns empty for empty input', () => {
    expect(segmentSamples([], 30)).toEqual([]);
  });
});

describe('catmullRomPath', () => {
  it('starts with a move-to on the first point', () => {
    const d = catmullRomPath([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
    expect(d.startsWith('M 10 20')).toBe(true);
  });

  it('emits a cubic Bezier segment between each pair', () => {
    const d = catmullRomPath([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
    ]);
    // Two C segments expected for 3 points (between p0-p1 and p1-p2).
    const cCount = (d.match(/C /g) ?? []).length;
    expect(cCount).toBe(2);
  });

  it('returns empty string for empty input', () => {
    expect(catmullRomPath([])).toBe('');
  });
});

describe('buildChartPaths', () => {
  it('closes each segment to the baseline for the fill', () => {
    const seg = [
      { x: 0, y: 50 },
      { x: 100, y: 30 },
    ];
    const { stroke, fill } = buildChartPaths([seg], 200);
    expect(stroke).toContain('M 0 50');
    expect(fill).toContain('L 100 200');
    expect(fill).toContain('L 0 200');
    expect(fill.endsWith('Z')).toBe(true);
  });

  it('skips fill for single-point segments', () => {
    const { fill } = buildChartPaths([[{ x: 0, y: 50 }]], 200);
    expect(fill).toBe('');
  });
});
