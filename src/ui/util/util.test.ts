import { describe, expect, it } from 'vitest';
import { cx } from './cx';
import { clamp, easeOutCubic, fraction, lerp, snapToStep, stepDecimals } from './math';
import { formatClock, formatCount, formatInt, hashString, initials } from './format';
import { rovingIndex, rovingKeyFor, typeaheadIndex } from './roving';
import { placeFloating } from './floating';
import { formatBytes, matchesAccept, partitionFiles } from './accept';
import { isExternalHref, resolveHref } from './links';

describe('cx', () => {
  it('joins strings and skips falsy parts', () => {
    expect(cx('a', false, null, undefined, '', 'b')).toBe('a b');
    expect(cx()).toBe('');
    expect(cx(0, 'x')).toBe('x');
  });
  it('handles maps and nested arrays', () => {
    expect(cx('a', { b: true, c: false, d: null }, ['e', ['f', { g: true }]])).toBe('a b e f g');
    expect(cx({})).toBe('');
  });
});

describe('math', () => {
  it('clamp and lerp', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
  });
  it('stepDecimals', () => {
    expect(stepDecimals(1)).toBe(0);
    expect(stepDecimals(0.5)).toBe(1);
    expect(stepDecimals(0.25)).toBe(2);
    expect(stepDecimals(1e-7)).toBe(7);
  });
  it('snapToStep snaps from min and clamps', () => {
    expect(snapToStep(7, 0, 10, 5)).toBe(5);
    expect(snapToStep(8, 0, 10, 5)).toBe(10);
    expect(snapToStep(99, 0, 10, 5)).toBe(10);
    expect(snapToStep(-99, 0, 10, 5)).toBe(0);
    // Steps count from min, not from zero.
    expect(snapToStep(44, 30, 260, 5)).toBe(45);
    expect(snapToStep(41, 40, 220, 4)).toBe(40);
    expect(snapToStep(43, 40, 220, 4)).toBe(44);
  });
  it('snapToStep removes float noise', () => {
    expect(snapToStep(0.1 + 0.2, 0, 1, 0.1)).toBe(0.3);
    expect(snapToStep(0.7000000001, -2, 2, 0.5)).toBe(0.5);
    expect(snapToStep(1.249, 0.5, 2, 0.25)).toBe(1.25);
  });
  it('snapToStep tolerates odd input', () => {
    expect(snapToStep(Number.NaN, 2, 9, 1)).toBe(2);
    expect(snapToStep(4.4, 0, 10, 0)).toBe(4.4);
  });
  it('fraction', () => {
    expect(fraction(5, 0, 10)).toBe(0.5);
    expect(fraction(-5, 0, 10)).toBe(0);
    expect(fraction(50, 0, 10)).toBe(1);
    expect(fraction(1, 3, 3)).toBe(0);
  });
  it('easeOutCubic is monotonic from 0 to 1', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(2)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    let prev = 0;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const v = easeOutCubic(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('format', () => {
  it('formatCount', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(950)).toBe('950');
    expect(formatCount(1000)).toBe('1k');
    expect(formatCount(1250)).toBe('1.2k');
    expect(formatCount(1999)).toBe('1.9k');
    expect(formatCount(12500)).toBe('12k');
    expect(formatCount(48200)).toBe('48k');
    expect(formatCount(1_500_000)).toBe('1.5M');
    expect(formatCount(-2400)).toBe('-2.4k');
  });
  it('formatInt', () => {
    expect(formatInt(0)).toBe('0');
    expect(formatInt(999)).toBe('999');
    expect(formatInt(1250)).toBe('1,250');
    expect(formatInt(1234567.4)).toBe('1,234,567');
    expect(formatInt(-48200)).toBe('-48,200');
  });
  it('formatClock', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(9.9)).toBe('0:09');
    expect(formatClock(90)).toBe('1:30');
    expect(formatClock(3600 + 61)).toBe('1:01:01');
    expect(formatClock(-5)).toBe('0:00');
  });
  it('initials', () => {
    expect(initials('Mia Brooks')).toBe('MB');
    expect(initials('Dev Okafor')).toBe('DO');
    expect(initials('Prof. Elena Varga')).toBe('EV');
    expect(initials('dev')).toBe('D');
    expect(initials('  ')).toBe('');
    expect(initials('Ana María de la Cruz')).toBe('AC');
  });
  it('hashString is stable and spreads', () => {
    expect(hashString('Mia Brooks')).toBe(hashString('Mia Brooks'));
    expect(hashString('Mia Brooks')).not.toBe(hashString('Dev Okafor'));
    expect(hashString('')).toBeGreaterThanOrEqual(0);
  });
});

describe('roving focus', () => {
  const none = () => false;
  it('moves and wraps', () => {
    expect(rovingIndex(0, 3, 'next', none)).toBe(1);
    expect(rovingIndex(2, 3, 'next', none)).toBe(0);
    expect(rovingIndex(0, 3, 'prev', none)).toBe(2);
    expect(rovingIndex(1, 3, 'first', none)).toBe(0);
    expect(rovingIndex(1, 3, 'last', none)).toBe(2);
  });
  it('does not wrap when loop is off', () => {
    expect(rovingIndex(2, 3, 'next', none, false)).toBe(2);
    expect(rovingIndex(0, 3, 'prev', none, false)).toBe(0);
  });
  it('skips disabled items', () => {
    const disabled = (i: number) => i === 1 || i === 4;
    expect(rovingIndex(0, 5, 'next', disabled)).toBe(2);
    expect(rovingIndex(2, 5, 'prev', disabled)).toBe(0);
    expect(rovingIndex(3, 5, 'next', disabled)).toBe(0);
    expect(rovingIndex(0, 5, 'last', disabled)).toBe(3);
  });
  it('recovers from a disabled or unknown current index', () => {
    const disabled = (i: number) => i === 1;
    expect(rovingIndex(1, 4, 'next', disabled)).toBe(2);
    expect(rovingIndex(1, 4, 'prev', disabled)).toBe(0);
    expect(rovingIndex(-1, 4, 'next', disabled)).toBe(0);
    expect(rovingIndex(-1, 4, 'first', disabled)).toBe(0);
  });
  it('handles empty and fully disabled lists', () => {
    expect(rovingIndex(0, 0, 'next')).toBe(-1);
    expect(rovingIndex(1, 3, 'next', () => true)).toBe(1);
  });
  it('maps keys by orientation', () => {
    expect(rovingKeyFor('ArrowRight')).toBe('next');
    expect(rovingKeyFor('ArrowLeft')).toBe('prev');
    expect(rovingKeyFor('ArrowDown')).toBeNull();
    expect(rovingKeyFor('ArrowDown', 'vertical')).toBe('next');
    expect(rovingKeyFor('ArrowRight', 'vertical')).toBeNull();
    expect(rovingKeyFor('ArrowUp', 'both')).toBe('prev');
    expect(rovingKeyFor('Home')).toBe('first');
    expect(rovingKeyFor('End')).toBe('last');
    expect(rovingKeyFor('ArrowRight', 'horizontal', true)).toBe('prev');
    expect(rovingKeyFor('a')).toBeNull();
  });
  it('typeahead searches after the current item and wraps', () => {
    const labels = ['Rename', 'Add to plan', 'Remove', 'Delete'];
    expect(typeaheadIndex(labels, 'r', 0)).toBe(2);
    expect(typeaheadIndex(labels, 'r', 2)).toBe(0);
    expect(typeaheadIndex(labels, 'de', -1)).toBe(3);
    expect(typeaheadIndex(labels, 'x', 0)).toBe(-1);
    expect(typeaheadIndex(labels, 'r', 0, (i) => i === 2)).toBe(0);
    expect(typeaheadIndex(labels, ' ', 0)).toBe(-1);
  });
});

describe('placeFloating', () => {
  const viewport = { width: 1000, height: 800 };
  const panel = { width: 200, height: 100 };
  it('places below, centred, with the offset', () => {
    const pos = placeFloating({ left: 400, top: 300, width: 100, height: 40 }, panel, viewport, { placement: 'bottom', offset: 8 });
    expect(pos).toMatchObject({ left: 350, top: 348, placement: 'bottom' });
    expect(pos.arrow).toBe(100);
  });
  it('aligns to the start or end edge', () => {
    const anchor = { left: 400, top: 300, width: 100, height: 40 };
    expect(placeFloating(anchor, panel, viewport, { align: 'start' }).left).toBe(400);
    expect(placeFloating(anchor, panel, viewport, { align: 'end' }).left).toBe(300);
  });
  it('flips to the other side when there is no room', () => {
    const low = placeFloating({ left: 400, top: 740, width: 100, height: 40 }, panel, viewport, { placement: 'bottom' });
    expect(low.placement).toBe('top');
    expect(low.top).toBe(740 - 100 - 8);
    const high = placeFloating({ left: 400, top: 10, width: 100, height: 40 }, panel, viewport, { placement: 'top' });
    expect(high.placement).toBe('bottom');
  });
  it('keeps the preferred side when neither fits but it has more room', () => {
    const pos = placeFloating({ left: 400, top: 60, width: 100, height: 40 }, { width: 200, height: 780 }, viewport, { placement: 'bottom' });
    expect(pos.placement).toBe('bottom');
  });
  it('shifts along the cross axis to stay in view', () => {
    const left = placeFloating({ left: 0, top: 300, width: 40, height: 40 }, panel, viewport, { margin: 8 });
    expect(left.left).toBe(8);
    const right = placeFloating({ left: 960, top: 300, width: 40, height: 40 }, panel, viewport, { margin: 8 });
    expect(right.left).toBe(1000 - 200 - 8);
    // The arrow keeps pointing at the anchor after the shift.
    expect(right.arrow).toBe(980 - right.left);
  });
  it('supports left and right placements', () => {
    const pos = placeFloating({ left: 500, top: 300, width: 40, height: 40 }, panel, viewport, { placement: 'right', offset: 10 });
    expect(pos).toMatchObject({ left: 550, top: 270, placement: 'right' });
    const flipped = placeFloating({ left: 900, top: 300, width: 40, height: 40 }, panel, viewport, { placement: 'right' });
    expect(flipped.placement).toBe('left');
  });
  it('pins an oversized panel to the leading margin', () => {
    const pos = placeFloating({ left: 100, top: 100, width: 40, height: 40 }, { width: 1200, height: 100 }, viewport, { margin: 8 });
    expect(pos.left).toBe(8);
  });
});

describe('file accept', () => {
  const pdf = { name: 'Greensleeves.PDF', type: 'application/pdf', size: 1200 };
  const photo = { name: 'sheet.jpeg', type: 'image/jpeg', size: 4_000_000 };
  const gp = { name: 'song.gp5', type: '', size: 900 };
  it('matches extensions, MIME types and wildcards', () => {
    expect(matchesAccept(pdf, '.pdf')).toBe(true);
    expect(matchesAccept(pdf, 'application/pdf')).toBe(true);
    expect(matchesAccept(photo, 'image/*')).toBe(true);
    expect(matchesAccept(photo, '.pdf, image/*')).toBe(true);
    expect(matchesAccept(gp, '.gp5,.gpx')).toBe(true);
    expect(matchesAccept(gp, 'image/*,.pdf')).toBe(false);
    expect(matchesAccept(photo, 'image/png')).toBe(false);
  });
  it('accepts everything when accept is empty', () => {
    expect(matchesAccept(gp, undefined)).toBe(true);
    expect(matchesAccept(gp, '')).toBe(true);
    expect(matchesAccept(gp, ' , ')).toBe(true);
  });
  it('partitions by type and size', () => {
    const result = partitionFiles([pdf, photo, gp], '.pdf,image/*', 2_000_000);
    expect(result.accepted).toEqual([pdf]);
    expect(result.rejected).toEqual([photo, gp]);
    expect(partitionFiles([pdf, photo, gp], undefined).accepted).toHaveLength(3);
  });
  it('formatBytes', () => {
    expect(formatBytes(980)).toBe('980 B');
    expect(formatBytes(12_400)).toBe('12 kB');
    expect(formatBytes(1_500)).toBe('1.5 kB');
    expect(formatBytes(3_100_000)).toBe('3.1 MB');
    expect(formatBytes(20_000_000)).toBe('20 MB');
  });
});

describe('links', () => {
  it('resolves route targets through the router', () => {
    expect(resolveHref({ to: 'scales', params: ['a-minor'] })).toBe('#scales--a-minor');
    expect(resolveHref({ to: 'tuner' })).toBe('#tuner');
    expect(resolveHref({ to: 'scales', params: ['F# minor', undefined] })).toBe('#scales--f-sharp-minor');
  });
  it('passes plain hrefs through and prefers `to`', () => {
    expect(resolveHref({ href: '#songs' })).toBe('#songs');
    expect(resolveHref({ to: 'home', href: '#songs' })).toBe('#home');
    expect(resolveHref({})).toBeUndefined();
  });
  it('detects external links', () => {
    expect(isExternalHref('https://example.org')).toBe(true);
    expect(isExternalHref('mailto:hi@example.org')).toBe(true);
    expect(isExternalHref('//example.org/x')).toBe(true);
    expect(isExternalHref('#tuner')).toBe(false);
    expect(isExternalHref('./file.pdf')).toBe(false);
    expect(isExternalHref(undefined)).toBe(false);
  });
});
