import { defineSong } from '../types';

// The strums are written as the three notes they sound on strings 3 to 1 (not as rhythm
// slashes, which strum the whole chord shape), so the "strumming" skill, which the content test
// ties to slashes, is not claimed; the tags and the title still find it.
export default defineSong({
  title: 'Strumming: Waltz (Bass-Strum-Strum)',
  composer: 'Sixstring Academy',
  origin: 'Original strumming study',
  publicDomain: "An original study written for Sixstring Academy; the teacher's waltz tune is original too.",
  level: 2,
  style: 'folk',
  kind: 'study',
  key: 'D major',
  teaches: ['Feeling 3/4: one strong beat, two light', 'A bass note alone on beat 1', 'Strumming only strings 3 to 1', 'D and A7, two bars each'],
  skills: ['rhythm', 'chords'],
  tags: ['strumming', 'waltz', '3/4', 'bass note', 'oom-pah-pah', 'd', 'a7'],
  about:
    'Count "ONE, two, three" and play "bass, strum, strum": pick the open string 4 under D or the open string 5 under A7, then two light downstrums on just the three thinnest strings. Hold the whole chord shape the whole time, even though the bass strings are open. The common slip is strumming too many strings on beats 2 and 3, which buries the bass: start each strum from string 3 with a small, relaxed flick.',
  plan: 'st-strum-waltz',
  added: '2026-11-16',
});
