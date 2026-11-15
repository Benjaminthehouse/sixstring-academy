import { describe, expect, it } from 'vitest';
import { areaOfSkill, chordSymbol, skillName } from './areas';

describe('skill names', () => {
  it('spells chords as symbols, not shouted slugs', () => {
    // Skill ids are lower-case slugs (`chord:am7`); "AM" would read as A major.
    expect(skillName('chord:em')).toBe('Em chord');
    expect(skillName('chord:f')).toBe('F chord');
    expect(skillName('chord:am7')).toBe('Am7 chord');
    expect(skillName('chord:f-sharp-m')).toBe('F♯m chord');
    expect(skillName('chord:b-flat')).toBe('B♭ chord');
    expect(chordSymbol('c-e')).toBe('C/E');
  });

  it('names chord changes by both chords', () => {
    expect(skillName('chord-change:g-c')).toBe('G to C change');
    expect(skillName('chord-change:em-am')).toBe('Em to Am change');
    expect(skillName('chord-change:am-dm7')).toBe('Am to Dm7 change');
    expect(skillName('chord-change:c-g7')).toBe('C to G7 change');
  });

  it('keeps the other families readable', () => {
    expect(skillName('scale:a-minor-pentatonic:box-2')).toBe('A minor pentatonic, box 2');
    expect(skillName('scale:f-sharp-major:pos-1')).toBe('F♯ major, pos 1');
    expect(skillName('theory:unit-3:lesson-2')).toBe('Unit 3, lesson 2');
    expect(skillName('teacher:mia:lesson-3')).toBe('Lesson 3 with Mia');
  });

  it('maps skill prefixes to areas', () => {
    expect(areaOfSkill('chord:em')).toBe('chords');
    expect(areaOfSkill('chord-change:g-c')).toBe('chords');
    expect(areaOfSkill('scale:a-minor-pentatonic:box-1')).toBe('scales');
    expect(areaOfSkill('song:greensleeves')).toBe('repertoire');
    expect(areaOfSkill('unknown:thing')).toBeNull();
  });
});
