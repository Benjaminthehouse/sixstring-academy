import { describe, expect, it } from 'vitest';
import { ROUTE_BY_NAME } from '../routes';
import { searchableRoutes } from '../shell/nav';
import { ROUTE_KEYWORDS, searchRoutes, searchTokens } from './search';

const find = (query: string) => searchRoutes(query, searchableRoutes()).map((h) => h.route.name);

describe('searchTokens', () => {
  it('lowercases and drops punctuation', () => {
    expect(searchTokens('  Scan & Import!  ')).toEqual(['scan', 'import']);
    expect(searchTokens('')).toEqual([]);
  });
});

describe('ROUTE_KEYWORDS', () => {
  it('only describes routes that exist, and covers every searchable one', () => {
    for (const name of Object.keys(ROUTE_KEYWORDS)) expect(ROUTE_BY_NAME[name], name).toBeDefined();
    for (const route of searchableRoutes()) expect(ROUTE_KEYWORDS[route.name], route.name).toBeTruthy();
  });
});

describe('searchRoutes', () => {
  it('matches nothing for an empty query', () => {
    expect(find('')).toEqual([]);
    expect(find('   ')).toEqual([]);
  });

  it('finds a screen by its title, from any hub', () => {
    expect(find('tuner')[0]).toBe('tuner');
    expect(find('Metronome')[0]).toBe('metronome');
    expect(find('ear')[0]).toBe('ear');
    expect(find('scale arcade')[0]).toBe('arcade');
  });

  it('finds a screen by what the learner wants to do', () => {
    expect(find('tune')[0]).toBe('tuner');
    expect(find('pdf')).toEqual(['scan']);
    expect(find('pentatonic')[0]).toBe('scales');
    expect(find('webcam')[0]).toBe('camera');
    expect(find('bpm')[0]).toBe('metronome');
    expect(find('barre')).toContain('chords');
    expect(find('strumming')[0]).toBe('rhythm');
    expect(find('blues')).toContain('progressions');
    expect(find('glossary')[0]).toBe('reference');
    expect(find('mia')[0]).toBe('teachers');
    expect(find('achievements')[0]).toBe('profile');
  });

  it('matches as the learner types', () => {
    expect(find('met')[0]).toBe('metronome');
    expect(find('prog')[0]).toBe('progressions');
  });

  it('needs every word to match', () => {
    expect(find('chord progression')[0]).toBe('progressions');
    expect(find('tuner zebra')).toEqual([]);
  });

  it('ranks a title match above a keyword match', () => {
    const hits = find('scales');
    expect(hits[0]).toBe('scales');
    expect(hits).toContain('arcade');
  });

  it('finds nothing for nonsense', () => {
    expect(find('qqqqq')).toEqual([]);
  });
});
