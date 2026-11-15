/**
 * Example songs in SixTab: public-domain melodies and original exercises. They are the test
 * fixtures of this module and a ready-made "real example already loaded" for song screens.
 */

/** Beethoven's "Ode to Joy" melody in C on the top two strings, with chord symbols. */
export const ODE_TO_JOY = `title: Ode to Joy
composer: Ludwig van Beethoven
source: Symphony No. 9, fourth movement (1824); melody arranged for guitar
licence: Public domain
difficulty: 1
tags: melody, beginner, classical
tempo: 100
time: 4/4
key: C
tuning: standard

[Theme]
| "C" q 1:0 1:0 1:1 1:3 | "G" 1:3 1:1 1:0 2:3 | "C" 2:1 2:1 2:3 1:0 | "G" q. 1:0 e 2:3 h 2:3 |
| "C" q 1:0 1:0 1:1 1:3 | "G" 1:3 1:1 1:0 2:3 | "C" 2:1 2:1 2:3 1:0 | "G" q. 2:3 e 2:1 "C" h 2:1 ||
`;

/** "Amazing Grace" (melody "New Britain") in G, 3/4 with a pickup and lyrics, in open position. */
export const AMAZING_GRACE = `title: Amazing Grace
composer: Traditional (melody "New Britain"); words by John Newton
source: Words 1779, melody first printed 1829; simplified melody
licence: Public domain
difficulty: 2
tags: melody, lyrics, waltz time, beginner
tempo: 80
time: 3/4
key: G
pickup: q

[Verse]
| q 4:0 | "G" h 3:0 q 2:0 | h 2:0 q 3:2 | "C" h 3:0 q 4:2 | "G" h 4:0 q 4:0 |
lyrics: A- maz- ing grace how sweet the sound that
| "G" h 3:0 q 2:0 | h 2:0 q 3:2 | "D" h. 2:3 ||
lyrics: saved a wretch like me
`;

/** An original study that uses every technique SixTab can write. */
export const TECHNIQUE_SAMPLER = `title: Technique Sampler
composer: Sixstring Academy
licence: Original exercise for Sixstring Academy
difficulty: 6
tags: techniques, legato, bends, harmonics
tempo: 90
time: 4/4
key: A minor
tuning: standard

[Legato]
| e 3:5 3:7h 3:5p 3:7 s 3:9s 3:7s 3:5{1} 3:7{3} q 3:7b2r | e 2:8b1 2:5 q 2:5~ (3:7 2:5){pm dn} e3 4:7 4:5p 4:7h |
[Colour]
| q 1:<12> 2:<12> 3:<7>{lr} 6:x | e /4:7 4:7\\ q 3:(5) 3:5> e 3:5{st} 1:12t | h 4:7 4:- | q 5:0{P} 4:2{I} 3:2{M} 2:1{A} |
| q. 1:5{dn} e 1:8{up} s 1:5 1:8 2:5 2:8 q r | q \\3:9 3:7b2{pre} 3:7b2r~ r ||
`;

/** An original band arrangement: a strummed rhythm part with repeats and endings, and a bass line. */
export const CAMPFIRE_GROOVE = `title: Campfire Groove
composer: Sixstring Academy
licence: Original exercise for Sixstring Academy
difficulty: 3
tags: chords, strumming, band
tempo: 96
time: 4/4
key: G

track: Rhythm
role: rhythm
[Verse]
strum: D-DU-UDU
|: "G=320003" e D r D U r U D U | "Em" % | [1] "C" D r D U r U D U | "D" D r D U r U D U :|
| [2] "C" D r D U r U D U | "D" h D D ||
[Chorus]
tempo: 104
| "C" q D D D D | "G" D D D D | "D" D D D D | "G" w D ||

track: Bass
role: bass
tuning: bass
[Verse]
|: q 4:3 r 4:3 r | 4:0 r 4:0 r | [1] 3:3 r 3:3 r | 2:0 r 2:0 r :|
| [2] 3:3 r 3:3 r | h 2:0 2:0 ||
[Chorus]
| q 3:3 3:3 3:3 3:3 | 4:3 4:3 4:3 4:3 | 2:0 2:0 2:0 2:0 | w 4:3 ||
`;

/** All examples by id. */
export const SONG_EXAMPLES: Readonly<Record<string, string>> = {
  'ode-to-joy': ODE_TO_JOY,
  'amazing-grace': AMAZING_GRACE,
  'technique-sampler': TECHNIQUE_SAMPLER,
  'campfire-groove': CAMPFIRE_GROOVE,
};
