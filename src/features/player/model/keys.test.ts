import { describe, expect, it } from 'vitest';
import { commandFor, tempoStep } from './keys';

describe('player keyboard', () => {
  it('maps the documented keys', () => {
    expect(commandFor({ key: ' ' })).toBe('toggle');
    expect(commandFor({ key: 'ArrowLeft' })).toBe('prev-bar');
    expect(commandFor({ key: 'ArrowRight' })).toBe('next-bar');
    expect(commandFor({ key: 'l' })).toBe('loop');
    expect(commandFor({ key: 'L', shiftKey: true })).toBe('loop');
    expect(commandFor({ key: '-' })).toBe('slower');
    expect(commandFor({ key: '+' })).toBe('faster');
    expect(commandFor({ key: '=' })).toBe('faster');
    expect(commandFor({ key: 'm' })).toBe('metronome');
    expect(commandFor({ key: 'w' })).toBe('wait');
    expect(commandFor({ key: 'f' })).toBe('flow');
    expect(commandFor({ key: 'Escape' })).toBe('stop');
    expect(commandFor({ key: 'q' })).toBeNull();
  });

  it('leaves typing, shortcuts with modifiers and focused controls alone', () => {
    expect(commandFor({ key: 'l', target: { tagName: 'INPUT', type: 'text' } })).toBeNull();
    expect(commandFor({ key: ' ', target: { tagName: 'TEXTAREA' } })).toBeNull();
    expect(commandFor({ key: 'f', ctrlKey: true })).toBeNull();
    expect(commandFor({ key: 'ArrowLeft', target: { tagName: 'DIV', role: 'slider' } })).toBeNull();
    expect(commandFor({ key: 'ArrowRight', target: { tagName: 'INPUT', type: 'range' } })).toBeNull();
    // A button reached by Tab presses itself; one that was only clicked lets Space play.
    expect(commandFor({ key: ' ', target: { tagName: 'BUTTON', focusVisible: true } })).toBeNull();
    expect(commandFor({ key: ' ', target: { tagName: 'BUTTON', focusVisible: false } })).toBe('toggle');
    // Held keys repeat only for tempo.
    expect(commandFor({ key: 'l', repeat: true })).toBeNull();
    expect(commandFor({ key: '+', repeat: true })).toBe('faster');
  });

  it('steps the tempo on a grid of 5', () => {
    expect(tempoStep(100, 1)).toBe(105);
    expect(tempoStep(100, -1)).toBe(95);
    expect(tempoStep(72, 1)).toBe(75);
    expect(tempoStep(72, -1)).toBe(70);
    expect(tempoStep(25, -1)).toBe(25);
    expect(tempoStep(150, 1)).toBe(150);
  });
});
