import { defineSong } from '../types';

// From the repertoire plan (id drunken-sailor), in E Dorian: the signature of D major (two
// sharps), so the C# of the tune needs no accidental.
export default defineSong({
  title: 'What Shall We Do with the Drunken Sailor',
  composer: 'Traditional (sea shanty)',
  origin: "Sailors' work song, described in 1839",
  publicDomain:
    "A traditional sailors' work song with no known author, described in 1839 and printed in shanty collections by the 1890s. Only the traditional chorus and the verse \"Put him in the longboat\" are sung. This arrangement was written for Sixstring Academy.",
  level: 2,
  style: 'folk',
  kind: 'strum-and-sing',
  key: 'E Dorian',
  teaches: ['Em and D, four bars each', 'Dorian: a minor tune with a bright C#', 'Downstrums, then down-up eighths', 'A strong beat 1'],
  skills: ['strumming', 'chords', 'singing', 'rhythm'],
  tags: ['shanty', 'sea song', 'dorian', '2/4', 'two chords', 'em', 'd', 'lyrics'],
  about:
    'A stamping work song: two beats in a bar, and beat 1 a little louder, as if hauling on a rope. The first chorus is two downstrums a bar; from the verse on, play down-up eighths and keep the arm moving all the time. For D, strum only the four thinnest strings. The usual slip is changing late into the last line ("Early in the morning"): the D comes on "Ear-", only two bars before Em returns, so have your fingers ready.',
  plan: 'drunken-sailor',
  added: '2026-11-16',
});
