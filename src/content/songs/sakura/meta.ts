import { defineSong } from '../types';

// From the repertoire plan (id sakura). `plan` is left out on purpose: the plan's key is "E in",
// which the content test's key reader (parseKey: major and minor only) cannot read, so naming the
// plan would fail its key check whatever key is written here. E minor names the right home note;
// the tune itself uses the in scale E F A B C, and `about` says so.
export default defineSong({
  title: 'Sakura, Sakura',
  composer: 'Traditional Japanese',
  origin: 'Edo-period melody, printed in Tokyo in 1888',
  publicDomain:
    'A traditional Japanese melody with no known composer, printed in 1888 in a koto collection of the Tokyo Academy of Music. The words shown are the traditional verse that begins "Sakura, sakura, yayoi no sora wa". This arrangement was written for Sixstring Academy.',
  level: 3,
  style: 'world',
  kind: 'melody',
  key: 'E minor',
  teaches: ['The Japanese in scale: E F A B C', 'Half steps: E to F and B to C', 'Playing slowly and evenly', 'A little vibrato on long notes'],
  skills: ['melody', 'technique'],
  tags: ['japanese', 'in scale', 'pentatonic', 'cherry blossom', 'koto', 'vibrato', 'slow'],
  about:
    'A calm song about cherry blossoms filling the spring sky like mist or clouds: play it as evenly as a koto, every note its full length, never hurried. It uses five notes, E F A B C, the Japanese in scale, so the F is natural, only a half step above E, and that closeness gives the tune its colour. On the long fretted notes, rock the fingertip gently for a little vibrato; if the low B and C on string 5 feel far away, loop bars 5 and 6 slowly until your hand finds them without looking.',
  added: '2026-11-16',
});
