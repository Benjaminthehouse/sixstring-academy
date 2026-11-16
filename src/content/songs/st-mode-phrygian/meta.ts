import { defineSong } from '../types';

// Key: A Phrygian. The content test's key reader (parseKey) knows only major and minor, so the
// key is written as A minor, the minor key that shares the Phrygian tonic; the mode is named in
// the title, the tags and the text.
export default defineSong({
  title: 'Mode Study: A Phrygian',
  composer: 'Sixstring Academy',
  origin: 'Original study on the Phrygian mode',
  publicDomain: 'An original study written for Sixstring Academy. The modes and a two-chord vamp are common building blocks that belong to everyone.',
  level: 7,
  style: 'latin',
  kind: 'study',
  key: 'A minor',
  teaches: ['Phrygian: minor with a flat second', 'The colour note: Bb, falling to A', 'The Phrygian cadence, Bb to Am', 'A Phrygian in fifth position'],
  skills: ['melody', 'chords'],
  tags: ['modes', 'phrygian', 'colour note', 'vamp', 'spanish', 'flamenco', 'a minor', 'fifth position'],
  about:
    'A Phrygian is A B flat C D E F G: a minor scale whose second note sits only a half step above the root, and that B flat is what makes it sound Spanish. The melody leans on B flat every time the Bb chord comes round, and over Am it lets B flat sigh straight down to A. Stay in fifth position with every B flat on string 1 under finger 2 (or string 4 under finger 4), and make the little hammer-on and pull-off turns even. The common mistake is a B natural out of habit from the minor scale: if a note sounds bright and wrong over the Bb chord, that is what happened.',
  plan: 'st-mode-phrygian',
  added: '2026-11-16',
});
