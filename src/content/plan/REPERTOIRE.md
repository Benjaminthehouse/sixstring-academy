# Repertoire and exercise plan

What Sixstring Academy teaches with: 104 public-domain and traditional **pieces**, 89 **original studies** to be composed for the app, and 61 **technique exercises**. The data lives in `repertoire.json` (one entry per item, with exact instructions for the arranger or composer); this page is the overview. Levels run from 1 (first week) to 10 (concert level). `repertoire.test.ts` checks the file: ids, levels, required fields, dates, and every fret and chord shape it names, against the theory and guitar engines.

## The public-domain rule we applied

A piece is in only if **every** part we use passes, judged separately for the music and the words:

1. **Composition.** Either the composer (and every co-writer) died in 1954 or earlier **and** the work was first published in 1930 or earlier, or the music is traditional or anonymous with a documented existence before 1930. The first condition clears the life-plus-70 countries (the EU, the UK and most others) with a year to spare; the second clears the US, where works published in 1930 or earlier are public domain in 2026. Anonymous works are protected for 70 years from publication in life-plus-70 countries, which a pre-1930 printing also clears.
2. **Lyrics.** The same test, separately. If the words fail, vary from source to source or are unsuitable, the piece is instrumental. A translation is a separate work: we use original-language words, words whose translator passes the test, or none.
3. **Arrangement.** Everything is newly arranged for this app from the original or an early edition. Never copy a modern edition (its fingerings, editorial changes, tab or chord chart), a recording, or a later adaptation that has its own copyright.
4. **When in doubt, leave it out.** A song that only *feels* traditional (a known 20th-century author, a famous later version, or no record before 1930) is out.

## Rules for arrangers and composers

- Classical pieces: transcribe from the first or an early edition (a public-domain scan). If you cannot consult it, do not reconstruct from memory: report it. Where an entry and the edition disagree, the edition wins (tell us).
- Data stores sounding pitch; guitar notation sounds an octave below where it is written. Notes are ASCII (F#, Bb) and spelled for their key.
- `key` is "<tonic> <scale id>" for the theory engine (`G major`, `E dorian`, `A mixolydian`, `E in`). `tempo` is the target in beats per minute, where the beat is the one `parseTimeSignature(meter)` defines: a quarter in 2/4 to 4/4, a dotted quarter in 6/8, an eighth in 3/8, a half note in 2/2.
- `string N fret M (X)` always means standard tuning, and `Chord (x32010)` is a voicing low string to high; the test verifies both. Entries in other tunings (DADGAD, open G) say so and avoid that notation.
- Lyrics: use only the verses an entry names. Where an entry says to leave verses out (racist minstrel verses, later copyrighted verses), that is a hard rule.
- Original studies must not quote or closely imitate any existing song, riff or lick.

## Left out on purpose

Scarborough Fair (the familiar tune was collected in 1947), Freight Train (Elizabeth Cotten, died 1987), Wildwood Flower (the Carter Family's 1928 version), House of the Rising Sun (first recorded 1933; famous later arrangement), Tom Dooley, Kumbaya, Wild Mountain Thyme (Francis McPeake, 1957), The Wellerman (collected 1966), We Wish You a Merry Christmas (its familiar form is traced to a 1935 arrangement), Happy Birthday, Edelweiss (1959), This Land Is Your Land (Woody Guthrie, died 1967), Cielito Lindo (Quirino Mendoza y Cortes, died 1957), Guantanamera, La Bamba (1958 version), El Condor Pasa (later arrangement), Malaguena (Ernesto Lecuona, died 1963), I'll Fly Away (Albert Brumley, 1932), Will the Circle Be Unbroken (the 1935 Carter version), Careless Love (first printed by W. C. Handy, 1921), the Spanish Romance (anonymous, but its early history is unclear), When the Saints Go Marching In (no printing before 1930 that we could confirm), Cripple Creek and Bile Them Cabbage Down (no firm pre-1930 record), Spanish Fandango (its 1860 meter could not be confirmed), and W. C. Handy's blues (Handy died in 1958; public domain in life-plus-70 countries from 2029). Early blues is therefore taught through John Henry, the spirituals, Joplin's rags and the original blues studies.

## The plan by level

### Level 1

**Pieces (5)**

- Hot Cross Buns: single-line melody, G major, 4/4 (Traditional English, in print by the late 18th century)
- Au Clair de la Lune: single-line melody, G major, 4/4 (Traditional French, 18th century)
- Mary Had a Little Lamb: single-line melody, G major, 4/4 (adapted by Lowell Mason, words 1830; tune 1830s)
- Frere Jacques (strum along): strum and sing, G major, 4/4 (Traditional French, 18th century)
- Skip to My Lou: strum and sing, A major, 2/4 (Traditional American, reported in the 1840s; widely printed by the 1880s)

**Studies (9)**

- Open-String Duet: Play a steady beat on open strings while the teacher plays the tune
- First Notes on String 1: E, F and G on the thinnest string
- First Notes on String 2: B, C and D on string 2, then join them to string 1
- First Notes on String 3: G and A on string 3, then a three-string tune
- First Notes on String 4: D, E and F on string 4
- First Notes on String 5: A, B and C on string 5
- First Notes on String 6: E, F and G on the thickest string
- Strumming: Steady Quarters: Four even downstrums per bar, never stopping
- Change: A and E7: Clean changes: A (x02220) and E7 (020100), the chords of Skip to My Lou

**Technique (7)**

- Posture: Sitting and Standing (both, 60 bpm)
- Play Without Pain (both, 60 bpm)
- Five-Minute Warm-Up (both, 60 to 80 bpm)
- Cool-Down (both, 50 to 60 bpm)
- Holding the Pick (picking, 60 to 80 bpm)
- Alternate Picking on Open Strings (picking, 60 to 120 bpm)
- Chromatic Spider (1-2-3-4) (fretting, 50 to 120 bpm)

### Level 2

**Pieces (9)**

- Ode to Joy (theme): single-line melody, G major, 4/4 (Ludwig van Beethoven, 1824 (Symphony No. 9; published 1826))
- Twinkle, Twinkle, Little Star: single-line melody, G major, 4/4 (Melody: French, Ah! vous dirai-je, maman, tune 1761; words 1806)
- Frere Jacques (round): duet, G major, 4/4 (Traditional French, 18th century)
- Jingle Bells (chorus): melody with chords, G major, 4/4 (James Lord Pierpont, 1857)
- Down in the Valley: strum and sing, A major, 3/4 (Traditional American, collected by 1909 (Missouri))
- Oh My Darling, Clementine: strum and sing, D major, 3/4 (American song credited to Percy Montrose, 1884)
- What Shall We Do with the Drunken Sailor: strum and sing, E dorian, 2/4 (Traditional, described in 1839; printed in shanty collections by the 1890s)
- Michael, Row the Boat Ashore: strum and sing, D major, 4/4 (Traditional African American spiritual, printed 1867 (Slave Songs of the United States))
- Deck the Halls: single-line melody, G major, 4/4 (Melody: traditional Welsh, tune printed 1794; English words 1862)

**Studies (5)**

- Change: Em-D and Em-G: Clean changes: Em (022000) with D (xx0232), then Em with G (320003)
- Change: D-A7 and A-D: Clean changes: D (xx0232) with A7 (x02020), then A (x02220) with D
- Strumming: Down-Up Eighths: Constant down-up motion with downs on the beat and ups on the and
- Strumming: Waltz (Bass-Strum-Strum): Feel 3/4: bass note on 1, strums on 2 and 3
- Reading: First Position in C: Read notes on strings 1-3 in first position

**Technique (5)**

- Constant Strumming Motion (picking, 60 to 100 bpm)
- Strum Only the Right Strings (picking, 60 to 96 bpm)
- Alternate Picking: Chromatic (picking, 60 to 120 bpm)
- Finger Permutations: Starting with 1 (fretting, 50 to 110 bpm)
- One-Minute Changes: First Chords (fretting, 40 to 100 bpm)

### Level 3

**Pieces (23)**

- Amazing Grace: strum and sing, G major, 3/4 (Words: John Newton, words 1779; tune printed 1829, set to these words in 1835)
- Oh! Susanna: strum and sing, G major, 2/4 (Stephen Foster, 1848)
- She'll Be Coming 'Round the Mountain: strum and sing, G major, 4/4 (Traditional American, printed 1927 (Sandburg, The American Songbag))
- Red River Valley: strum and sing, G major, 4/4 (Traditional, known before 1896; printed 1896 as In the Bright Mohawk Valley (credited to James J. Kerrigan))
- Go Tell It on the Mountain: strum and sing, G major, 4/4 (Traditional African American spiritual, printed 1907)
- Down by the Riverside: strum and sing, G major, 4/4 (Traditional African American spiritual, printed 1918 (Plantation Melodies, Chicago))
- Swing Low, Sweet Chariot: melody with chords, D major, 4/4 (Traditional African American spiritual, printed 1872 (Fisk Jubilee Singers))
- Go Down, Moses: strum and sing, A minor, 4/4 (Traditional African American spiritual, printed 1862 (as Oh! Let My People Go))
- Wade in the Water: strum and sing, E minor, 4/4 (Traditional African American spiritual, printed 1901 (New Jubilee Songs))
- Silent Night: strum and sing, C major, 6/8 (Franz Xaver Gruber, 1818; English words 1859)
- Joy to the World: single-line melody, D major, 2/4 (Words: Isaac Watts, words 1719; tune 1839)
- Sakura, Sakura: single-line melody, E in, 4/4 (Traditional Japanese, printed 1888 (Tokyo Academy of Music, koto collection))
- Minuet in G (melody): single-line melody, G major, 3/4 (Christian Petzold, long attributed to J. S. Bach, 1725)
- Eine kleine Nachtmusik (opening): single-line melody, G major, 4/4 (Wolfgang Amadeus Mozart, 1787 (published 1827))
- Morning Mood (Peer Gynt): single-line melody, E major, 6/8 (Edvard Grieg, 1875 (Peer Gynt; Suite No. 1 published 1888))
- Largo (New World Symphony): single-line melody, D major, 4/4 (Antonin Dvorak, 1893 (Symphony No. 9, From the New World))
- Brahms' Lullaby: melody with chords, C major, 3/4 (Johannes Brahms, 1868 (Wiegenlied, Op. 49 No. 4))
- Andantino in G, Op. 241 No. 5: classical solo, G major, 2/4 (Ferdinando Carulli, c. 1825 (Methode complete, Op. 241))
- Lesson in C, Op. 60 No. 1: classical solo, C major, 4/4 (Fernando Sor, 1837 (Introduction a l'etude de la guitare, Op. 60))
- O Come, All Ye Faithful: strum and sing, G major, 4/4 (Music and Latin words: John Francis Wade, c. 1751; English words 1841)
- God Rest Ye Merry, Gentlemen: strum and sing, E minor, 4/4 (Traditional English carol, printed in the 18th century; collected 1833)
- Auld Lang Syne: strum and sing, D major, 4/4 (Words: Robert Burns, words 1788; tune printed 1799)
- Angeline the Baker: flatpicking, D major, 2/4 (Fiddle tune derived from Angelina Baker by Stephen Foster, 1850)

**Studies (14)**

- Change: G-C and C-G7: Clean changes: G (320003) with C (x32010), then C with G7 (320001)
- Change: G-D7 and D-G: Clean changes: G (320003) with D7 (xx0212), then D (xx0232) with G
- Change: C-Am and Am-Dm: Clean changes: C (x32010) with Am (x02210), then Am with Dm (xx0231)
- Change: Am-E and E-B7: Clean changes: Am (x02210) with E (022100), then E with B7 (x21202)
- Strumming: The Folk Pattern: The all-purpose pattern: down, down-up, (miss), up, down-up
- Strumming: 6/8: Two beats per bar, each in three
- Strumming: Boom-Chick: Alternate a bass note and a strum, country style
- 12-Bar Blues Shuffle in A: Play the 12-bar blues form with a shuffle rhythm
- Power Chords: Open Riff: Two-finger power chords and a first rock riff
- Lick: Hammer-Ons: Sound a second note by hammering a finger down, without picking it
- Lick: Pull-Offs: Sound a lower note by plucking the string with the finger as it leaves
- Fingerstyle: p i m a: Assign the thumb to the bass and i, m, a to strings 3, 2 and 1
- Reading: First Position in G: Read across all six strings, with F#
- Duet: An Original Round: Play a round in two parts with the teacher

**Technique (7)**

- Subdivision Switch (picking, 60 to 100 bpm)
- Palm Muting (picking, 80 to 160 bpm)
- Free-Stroke Arpeggios (p i m a) (picking, 60 to 120 bpm)
- Finger Permutations: Starting with 2 (fretting, 50 to 110 bpm)
- Hammer and Pull Chains (fretting, 60 to 120 bpm)
- One-Minute Changes: Three-Chord Keys (fretting, 40 to 100 bpm)
- Hands in Sync (both, 40 to 80 bpm)

### Level 4

**Pieces (28)**

- Greensleeves (melody): melody with chords, A minor, 6/8 (Traditional English, registered 1580)
- Fur Elise (theme): single-line melody, A minor, 3/8 (Ludwig van Beethoven, composed 1810; published 1867)
- Danny Boy: melody with chords, C major, 4/4 (Melody: Londonderry Air, tune printed 1855; words 1913)
- Loch Lomond: strum and sing, D major, 4/4 (Traditional Scottish, printed 1841 (Vocal Melodies of Scotland))
- Shenandoah: melody with chords, D major, 4/4 (Traditional American, printed 1882)
- Simple Gifts: melody with chords, G major, 2/4 (Joseph Brackett, Shaker, 1848)
- All Through the Night: melody with chords, G major, 4/4 (Melody: traditional Welsh, tune printed 1784; English words 1884)
- The Ash Grove: melody with chords, G major, 3/4 (Melody: traditional Welsh, tune printed 1802; English words 1862)
- Nobody Knows the Trouble I've Seen: melody with chords, G major, 4/4 (Traditional African American spiritual, printed 1867 (Slave Songs of the United States) and in the 1870s Fisk Jubilee collections)
- Waltzing Matilda: strum and sing, D major, 4/4 (Words: A. B. 'Banjo' Paterson, words 1895; published 1903)
- Korobeiniki: single-line melody, A minor, 4/4 (Russian folk song, poem 1861; melody printed c. 1898)
- Turkey in the Straw: flatpicking, G major, 2/4 (American fiddle tune, 1834)
- Soldier's Joy: flatpicking, D major, 2/4 (Traditional Scottish and American fiddle tune, 18th century)
- The Rakes of Mallow: flatpicking, G major, 2/4 (Traditional Irish, 18th century)
- Canon in D (duet): duet, D major, 4/4 (Johann Pachelbel, composed c. 1680-1706 (first published 1919))
- Sarabande in D minor: classical solo, D minor, 3/4 (Robert de Visee, 1680s (Livre de guitarre, Paris))
- Arpeggio Studies from Op. 1 (selection): classical solo, C major, 4/4 (Mauro Giuliani, 1812 (Studio per la chitarra, Op. 1, part 1))
- Estudio in A minor: classical solo, A minor, 2/4 (Dionisio Aguado, 1825-1843 (Aguado's guitar methods))
- Mo Li Hua (Jasmine Flower): single-line melody, G major, 2/4 (Traditional Chinese, 18th century; printed in Europe by 1804)
- La Paloma: melody with chords, G major, 2/4 (Sebastian Iradier, c. 1860)
- La Cucaracha: melody with chords, C major, 4/4 (Traditional Spanish and Mexican folk song, known in the 19th century; printed 1927 (Sandburg, The American Songbag))
- Dance of the Sugar Plum Fairy (theme): single-line melody, E minor, 2/4 (Pyotr Ilyich Tchaikovsky, 1892 (The Nutcracker))
- We Three Kings: strum and sing, E minor, 3/4 (John Henry Hopkins Jr., 1857)
- The First Noel: melody with chords, D major, 3/4 (Traditional English carol, printed 1823 and 1833)
- Spring (Four Seasons, opening): single-line melody, E major, 4/4 (Antonio Vivaldi, published 1725 (Op. 8))
- The Blue Danube (waltz theme): melody with chords, D major, 3/4 (Johann Strauss II, 1867)
- Home on the Range: strum and sing, G major, 3/4 (Words: Brewster Higley, 1873 (as My Western Home); widely printed 1910)
- John Henry: strum and sing, E major, 4/4 (Traditional African American ballad, words in print by 1909; tunes printed in collections in the 1920s)

**Studies (10)**

- Change: Am-Fmaj7 and C-F: Clean changes: Am (x02210) with Fmaj7 (xx3210), then C (x32010) with the small F (xx3211)
- Change: Em-Am and Em-B7: Clean changes: Em (022000) with Am (x02210), then Em with B7 (x21202): the minor-key changes
- 12-Bar Blues Shuffle in E (quick change): The 12-bar blues in E, with the quick change to IV in bar 2
- Blues Turnarounds in E and A: Two classic-style turnarounds, each leading back to the top of the form
- Pentatonic Box 1 Lick: Learn A minor pentatonic box 1 (frets 5-8) by playing music in it, not just the shape
- Lick: Slides: Move to a new note by sliding the fretting finger
- Harmonics Melody: Play a melody using only natural harmonics
- Fingerstyle: p i m a m i in 3/4: A flowing six-note arpeggio that fills a 3/4 bar
- Travis Picking: An alternating-bass thumb that never stops, with fingers picking between
- Reading: Sharps and Dotted Rhythms: Read in D and A major in first position, with dotted rhythms and ties

**Technique (11)**

- Alternate Picking: G Major, Two Octaves (picking, 60 to 132 bpm)
- String Crossing Both Ways (picking, 60 to 120 bpm)
- Rest Stroke Scale (i-m) (picking, 60 to 120 bpm)
- Travis Thumb, Muted (picking, 60 to 112 bpm)
- Finger Permutations: Starting with 3 and 4 (fretting, 50 to 110 bpm)
- Anchored Fingers (fretting, 50 to 100 bpm)
- Trills (fretting, 60 to 120 bpm)
- Clean Position Shifts (fretting, 60 to 112 bpm)
- Slides to a Target (fretting, 60 to 112 bpm)
- One-Minute Changes: F and Friends (fretting, 40 to 96 bpm)
- Natural Harmonics (both, 60 to 72 bpm)

### Level 5

**Pieces (15)**

- Old Joe Clark: flatpicking, A mixolydian, 2/4 (Traditional American, printed 1918 (as sung in Virginia))
- Arkansas Traveler: flatpicking, D major, 2/4 (Traditional American fiddle tune, 1840s)
- The Irish Washerwoman: flatpicking, G major, 6/8 (Traditional Irish and English jig, 18th century)
- Haste to the Wedding: flatpicking, D major, 6/8 (Traditional English and Irish jig, printed in the 1760s)
- Si Bheag, Si Mhor: fingerstyle solo, D major, 3/4 (Turlough O'Carolan, early 18th century)
- Greensleeves (fingerstyle): fingerstyle solo, A minor, 6/8 (Traditional English, registered 1580)
- Down by the Riverside (Travis style): fingerstyle solo, C major, 4/4 (Traditional African American spiritual, printed 1918 (Plantation Melodies, Chicago))
- Minuet in G (two voices): classical solo, G major, 3/4 (Christian Petzold, long attributed to J. S. Bach, 1725)
- Canarios: classical solo, D major, 6/8 (Gaspar Sanz, 1674 (Instruccion de musica sobre la guitarra espanola, Zaragoza))
- Sarabande (Suite in D minor, HWV 437): classical solo, D minor, 3/4 (George Frideric Handel, published 1733)
- Prelude in A major, Op. 28 No. 7: classical solo, A major, 3/4 (Frederic Chopin, 1839)
- Lagrima: classical solo, E major, 3/4 (Francisco Tarrega, c. 1891)
- Habanera (Carmen): duet, D minor, 2/4 (Georges Bizet, based on a song by Sebastian Iradier, 1875)
- Funeral March of a Marionette: single-line melody, D minor, 6/8 (Charles Gounod, 1872 (piano); orchestrated 1879)
- In the Hall of the Mountain King: single-line melody, E minor, 4/4 (Edvard Grieg, 1875 (Peer Gynt))

**Studies (18)**

- Strumming: Offbeat Chops: Short chords on the offbeats with silence on the beats
- Minor Blues in A: The 12-bar form in minor with an A minor pentatonic melody
- Power Chords: Palm-Muted Gallop: The gallop rhythm (eighth plus two sixteenths) with palm muting
- Pentatonic Box 2 Lick: Learn A minor pentatonic box 2 (frets 7-10) by playing music in it, not just the shape
- Pentatonic Box 3 Lick: Learn A minor pentatonic box 3 (frets 9-13) by playing music in it, not just the shape
- Pentatonic Box 4 Lick: Learn A minor pentatonic box 4 (frets 12-15, or open position an octave lower) by playing music in it, not just the shape
- Pentatonic Box 5 Lick: Learn A minor pentatonic box 5 (frets 2-5, or 14-17) by playing music in it, not just the shape
- Lick: Bends in Tune: Bend a string up to an exact target pitch
- Lick: Vibrato: Bring held notes to life with an even, in-time vibrato
- Travis Picking with a Melody: Carry an original melody on top of the Travis pattern
- Thumb-Lead Melody with Brush Strums: Melody on the bass strings with the thumb, brush strums on the top strings with the index
- Triad Arpeggios in First Position: Play each chord of C major as an arpeggio, one octave from its root
- First Barre: F: Get a clean full barre chord, F at the first fret
- Barre Shapes: E, Em, A and Am Shapes: Move the four main barre shapes along the neck
- Reading: Second Position: Read in second position (finger 1 on fret 2)
- Duet: Baroque-Style Duo in D minor: Hold your line against an independent bass line
- Andalusian Cadence with Rasgueado: The Spanish descending progression Am G F E with flamenco strums
- Bluegrass Rhythm and the G Run: Bass-strum rhythm with a G-run ending

**Technique (10)**

- Picking-Hand Muting of the Low Strings (picking, 60 to 120 bpm)
- Thumb Independence (picking, 50 to 100 bpm)
- Dynamic Control (picking, 60 to 80 bpm)
- Gentle Stretch, Walking Down (fretting, 50 to 90 bpm)
- Half-Step Bend in Tune (fretting, 60 bpm)
- Whole-Step Bend in Tune (fretting, 60 bpm)
- Bending Vibrato in Time (fretting, 60 to 90 bpm)
- Barre Strength Without Strain (fretting, 60 to 90 bpm)
- Fretting-Hand Muting (fretting, 60 to 120 bpm)
- Metronome on 2 and 4 (both, 60 to 112 bpm)

### Level 6

**Pieces (11)**

- Red Haired Boy: flatpicking, A mixolydian, 4/4 (Traditional Irish, 19th century)
- Adelita (Mazurka): classical solo, E minor, 3/4 (Francisco Tarrega, c. 1899)
- Study in B minor, Op. 35 No. 22: classical solo, B minor, 3/4 (Fernando Sor, c. 1828)
- Prelude in C minor, BWV 999 (in D minor): classical solo, D minor, 3/4 (Johann Sebastian Bach, c. 1720 (for lute))
- Bourree in E minor, BWV 996: classical solo, E minor, 4/4 (Johann Sebastian Bach, c. 1708-1717 (Suite in E minor))
- Gymnopedie No. 1: classical solo, D major, 3/4 (Erik Satie, 1888)
- Study in A minor, Op. 60 No. 7: classical solo, A minor, 4/4 (Matteo Carcassi, 1852 (25 Etudes melodiques et progressives, Op. 60))
- Hungarian Dance No. 5 (theme): duet, A minor, 2/4 (Johannes Brahms, on a csardas by Bela Keler, 1869)
- William Tell Overture (galop): single-line melody, E major, 2/4 (Gioachino Rossini, 1829)
- Rondo alla Turca (theme): single-line melody, A minor, 2/4 (Wolfgang Amadeus Mozart, 1784 (Piano Sonata K. 331))
- Danny Boy (chord melody): fingerstyle solo, C major, 4/4 (Melody: Londonderry Air, tune printed 1855)

**Studies (11)**

- Strumming: Sixteenth-Note Funk: A constant sixteenth-note hand with chords on chosen sixteenths and muted strums elsewhere
- Fingerstyle Blues in E (steady thumb): A steady thumb on the low E while the fingers play a blues melody
- Pentatonic Across the Neck: Connect the five A minor pentatonic boxes into one map of the neck
- Barre Progression: I-vi-IV-V: Use barre chords in a real progression and in other keys
- CAGED: One Chord, Five Shapes: Find C and then G in five shapes up the neck
- Mode Study: A Ionian (major): Hear the major scale as a mode: its colour is the major seventh, G#
- Mode Study: A Dorian: Minor with a bright sixth: F#
- Mode Study: A Mixolydian: Major with a flat seventh: G natural
- Mode Study: A Aeolian (natural minor): The natural minor and its flat sixth: F
- Chord Melody: First Ballad: Put the melody on top and the chords underneath
- Reading: Fifth Position and Flats: Read in fifth position, in C major and F major

**Technique (9)**

- String Skipping (picking, 60 to 120 bpm)
- Tremolo Picking (picking, 60 to 144 bpm)
- Speed Bursts (both, 80 to 160 bpm)
- Hybrid Picking (picking, 60 to 120 bpm)
- Rasgueado Basics (picking, 52 to 112 bpm)
- Unison Bend (fretting, 60 bpm)
- Pre-Bend and Release (fretting, 60 bpm)
- Classical Vibrato (fretting, 60 to 72 bpm)
- Barre Change Speed (fretting, 50 to 100 bpm)

### Level 7

**Pieces (6)**

- Study in A minor, Op. 38 No. 1: classical solo, A minor, 2/4 (Napoleon Coste, 1873 (25 Etudes de genre, Op. 38, Paris: Richault))
- Romanze in E minor (Bardenklange, Op. 13): classical solo, E minor, 4/4 (Johann Kaspar Mertz, 1840s (Bardenklange, Op. 13, Vienna))
- Jesu, Joy of Man's Desiring: classical solo, G major, 3/4 (Johann Sebastian Bach, 1723 (Cantata BWV 147))
- Gran Vals: classical solo, A major, 3/4 (Francisco Tarrega, c. 1902)
- The Entertainer: fingerstyle solo, C major, 2/4 (Scott Joplin, 1902)
- Devil's Dream: flatpicking, A major, 4/4 (Traditional fiddle tune, 19th century)

**Studies (13)**

- Ragtime Blues in C: A fingerpicked ragtime progression with an alternating bass
- Lick: Tapping Arpeggios: Tap with the picking hand to play wide arpeggios on one string
- Seventh-Chord Arpeggios in C: Arpeggiate the seven diatonic seventh chords of C major
- CAGED: The Major Scale in Five Positions: Play C major in the five CAGED positions and join them
- CAGED: One Melody Everywhere: Play the same 8-bar melody in all five positions
- Mode Study: A Phrygian: Minor with a flat second: Bb, the Spanish-sounding mode
- Mode Study: A Lydian: Major with a raised fourth: D#, the dreamy mode
- Jazz Comping: Shell Voicings on ii-V-I: Comp a ii-V-I in C with three-note shells
- Bossa-Style Groove: A Brazilian-style syncopated fingerstyle comp
- Reading: Seventh Position: Read in seventh position, G major and E minor
- Flamenco Rhythm: the 12-Beat Cycle: Feel the 12-beat cycle of solea with accents on 3, 6, 8, 10 and 12
- DADGAD Air: A Celtic-style air in the DADGAD tuning
- Open G Slide Blues: Slide guitar in open G tuning

**Technique (9)**

- Economy Picking (picking, 60 to 132 bpm)
- Sweep Picking: Three Strings (picking, 50 to 120 bpm)
- Classical Tremolo (p a m i) (picking, 40 to 92 bpm)
- Three-Notes-per-String Legato (fretting, 60 to 132 bpm)
- Hammer-On from Nowhere (fretting, 60 to 112 bpm)
- Step-and-a-Half Bend (fretting, 60 bpm)
- Slide (Bottleneck) Intonation (fretting, 60 to 90 bpm)
- Pinch Harmonics (both, 60 bpm)
- Tapping Triplets (both, 50 to 120 bpm)

### Level 8

**Pieces (3)**

- Gavotte en Rondeau, BWV 1006: classical solo, E major, 2/2 (Johann Sebastian Bach, 1720 (Partita No. 3 for solo violin; lute version BWV 1006a))
- Caprice No. 24 (theme and variations): single-line melody, A minor, 2/4 (Niccolo Paganini, published 1820 (24 Caprices, Op. 1))
- Maple Leaf Rag: fingerstyle solo, G major, 2/4 (Scott Joplin, 1899)

**Studies (5)**

- Sweep-Picked Arpeggios: Play arpeggios with one stroke per direction across the strings
- Mode Study: A Locrian: The unstable mode: flat second and flat fifth (Bb and Eb)
- Jazz Comping: Drop-2 Voicings: Voice-lead a ii-V-I on the top four strings
- Jazz Comping: Minor ii-V-i: Comp the minor ii-V-i in A minor
- Chord Melody: Jazz Ballad with Reharmonisation: A chord-melody arrangement with secondary dominants and a tritone substitution

**Technique (1)**

- Artificial (Harp) Harmonics (both, 50 to 92 bpm)

### Level 9

**Pieces (2)**

- Prelude from Cello Suite No. 1, BWV 1007: classical solo, D major, 4/4 (Johann Sebastian Bach, c. 1720)
- Asturias (Leyenda): classical solo, E minor, 3/4 (Isaac Albeniz, 1892 (as Preludio of Chants d'Espagne; named Asturias in 1911))

**Studies (2)**

- Reading: Shifting Through the Neck: Read a piece that moves through positions I, V, VII, IX and XII
- Two-Voice Invention for Solo Guitar: Play true two-part counterpoint on one guitar

**Technique (1)**

- Sweep Picking: Five Strings (picking, 50 to 120 bpm)

### Level 10

**Pieces (2)**

- Recuerdos de la Alhambra: classical solo, A minor, 3/4 (Francisco Tarrega, 1896)
- Chaconne from Partita No. 2, BWV 1004: classical solo, D minor, 3/4 (Johann Sebastian Bach, 1720 (for solo violin))

**Studies (2)**

- Concert Tremolo Etude: Sustain a tremolo melody across a full piece
- Fugue Exposition for Solo Guitar: Three entries of a fugue subject on one guitar

**Technique (1)**

- Scales in Every Key, Full Neck (both, 80 to 160 bpm)
