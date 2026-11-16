import { defineSong } from '../types';

// From the repertoire plan (id sakura). `plan` is left out on purpose: the plan's key is "E in",
// a five-note Japanese scale that is not a key. Its notes E F A B C are five of the seven notes
// of E Phrygian, so the key is written as E Phrygian: home on E, no sharps or flats, F natural.
export default defineSong({
  title: 'Sakura, Sakura',
  composer: 'Traditional Japanese',
  origin: 'Edo-period melody, printed in Tokyo in 1888',
  publicDomain:
    'A traditional Japanese melody with no known composer, printed in 1888 in a koto collection of the Tokyo Academy of Music. The words shown are the traditional verse that begins "Sakura, sakura, yayoi no sora wa". This arrangement was written for Sixstring Academy.',
  level: 3,
  style: 'world',
  kind: 'melody',
  key: 'E Phrygian',
  teaches: ['The Japanese in scale: E F A B C', 'Half steps: E to F and B to C', 'Playing slowly and evenly', 'A little vibrato on long notes'],
  skills: ['melody', 'technique'],
  tags: ['japanese', 'in scale', 'pentatonic', 'cherry blossom', 'koto', 'vibrato', 'slow'],
  about:
    'A calm song about cherry blossoms filling the spring sky like mist or clouds: play it as evenly as a koto, every note its full length, never hurried. It uses five notes, E F A B C, the Japanese in scale, so the F is natural, only a half step above E, and that closeness gives the tune its colour. On the long fretted notes, rock the fingertip gently for a little vibrato; if the low B and C on string 5 feel far away, loop bars 5 and 6 slowly until your hand finds them without looking.',
  added: '2026-11-16',
});
