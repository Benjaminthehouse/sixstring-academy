import { useEffect, useMemo, useRef, useState } from 'react';
import type { RouteProps } from '@/app/routes';
import { Button, LinkButton, Page, Row, SegmentedControl, Stack, Switch, useRafLoop } from '@/ui';
import { MusicSettingsProvider, type NoteNaming } from '@/ui/music';
import { FretboardGroup } from './FretboardDemos';
import { BitsGroup, ChordGroup, CircleGroup, NotationGroup, PianoGroup, RhythmGroup } from './OtherDemos';
import { Demo, Group, kitStyles as styles } from './parts';
import { AMAZING_GRACE, CAMPFIRE_GROOVE, ODE_TO_JOY, TECHNIQUE_SAMPLER, sixTab, type Song } from '@/core/song';
import { RIVERSIDE_MORNING, TabSnippet, TabView, longStudy, noteKey, type TabNoteState, type TabRange, type TabViewHandle } from '@/ui/music/tab';

type ThemeChoice = 'system' | 'light' | 'dark';

// Two bars of an original fingerstyle blues in E: the thumb muted on every beat, the blue note B flat sliding to B.
const BLUES_IN_E = `title: Blues in E
tempo: 84
key: E

| ^"Thumb: steady quarters, lightly muted" "E7" q (6:0{pm} /1:3) q3 (6:0{pm} 1:0) e3 2:3 q (6:0{pm} 2:0) 6:0{pm} |
| q3 (6:0{pm} 3:3) e3 3:4s q3 (6:0{pm} 3:2) e3 3:0 q 6:0{pm} q3 6:0{pm} e3 1:0 |
| q3 (6:0{pm} 3:3) e3 3:4s q (6:0{pm} 3:2) (6:0{pm} 3:0) 6:0{pm} |
| h (6:0 2:0 1:0) (6:- 2:- 1:-) ||
`;

// An original tremolo bar over a let-ring bass, then two voices with the bass held under the tune.
const LET_RING_AND_HELD = `title: Let ring and held notes
tempo: 60
time: 3/4
key: Dm

| ^"p a m i over a let-ring bass" "Dm" s 5:5{lr} 1:5 1:5 1:5 4:7 1:5 1:5 1:5 3:7 1:5 1:5 1:5 |
| "Gm/D" s 5:5{lr} 1:6 1:6 1:6 4:5 1:6 1:6 1:6 3:7 1:5 1:5 1:5 |
| ^"The bass held under the tune" "Dm" e (5:5 1:5) (5:- 1:6) (5:- 1:8) (5:- 1:6) q (5:- 1:5) |
| "A7" e (5:0 2:6) (5:- 2:8) (5:- 1:5) (5:- 2:8) q (5:- 2:6) ||
`;

/**
 * Gallery of the music UI kit (`#kit-music`): every music component in realistic configurations,
 * for visual checks in both themes, both hands, every naming system and every width.
 */
export default function KitMusic(_props: RouteProps) {
  const [naming, setNaming] = useState<NoteNaming>('letters');
  const [leftHanded, setLeftHanded] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>('system');

  // A local theme override for checking; the app's own setting comes back on leaving.
  useEffect(() => {
    if (theme === 'system') return;
    const root = document.documentElement;
    const before = root.getAttribute('data-theme');
    root.setAttribute('data-theme', theme);
    return () => {
      if (before == null) root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', before);
    };
  }, [theme]);

  return (
    <Page
      title="Music kit"
      eyebrow="Sixstring Academy"
      subtitle="The fretboard, chord diagrams, the circle of fifths, notation, piano keys and beat grids, in the configurations lessons and games use."
      actions={
        <LinkButton to="kit" variant="secondary" iconLeft="ArrowLeft">
          UI kit
        </LinkButton>
      }
    >
      <div className={styles.controls}>
        <div className={styles.control}>
          <span className={styles.controlLabel} id="kit-music-naming">
            Note names
          </span>
          <SegmentedControl
            aria-label="Note names"
            size="sm"
            value={naming}
            onChange={setNaming}
            options={[
              { value: 'letters', label: 'C D E' },
              { value: 'solfege', label: 'Do Re Mi' },
              { value: 'german', label: 'German' },
            ]}
          />
        </div>
        <Switch label="Left-handed" checked={leftHanded} onChange={setLeftHanded} />
        <SegmentedControl
          aria-label="Theme"
          size="sm"
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'system', label: 'System', icon: 'Monitor' },
            { value: 'light', label: 'Light', icon: 'Sun' },
            { value: 'dark', label: 'Dark', icon: 'Moon' },
          ]}
        />
      </div>
      <MusicSettingsProvider naming={naming} leftHanded={leftHanded}>
        <FretboardGroup />
        <ChordGroup />
        <CircleGroup />
        <NotationGroup />
        <PianoGroup />
        <RhythmGroup />
        <BitsGroup />
        <TabGroup />
      </MusicSettingsProvider>
    </Page>
  );
}

// ── tab ─────────────────────────────────────────────────────────────────────────────────────────

/** Tablature: a melody, techniques with chords and words, notation above, a band part, a long piece, play-along, a snippet. */
function TabGroup() {
  const ode = useMemo(() => sixTab(ODE_TO_JOY), []);
  const river = useMemo(() => sixTab(RIVERSIDE_MORNING), []);
  const sampler = useMemo(() => sixTab(TECHNIQUE_SAMPLER), []);
  const grace = useMemo(() => sixTab(AMAZING_GRACE), []);
  const groove = useMemo(() => sixTab(CAMPFIRE_GROOVE), []);
  const long = useMemo(() => sixTab(longStudy(200)), []);
  const blues = useMemo(() => sixTab(BLUES_IN_E), []);
  const held = useMemo(() => sixTab(LET_RING_AND_HELD), []);
  const [size, setSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [boxes, setBoxes] = useState(false);
  const [staff, setStaff] = useState(false);
  const [samplerStaff, setSamplerStaff] = useState(false);
  const [part, setPart] = useState<'rhythm' | 'bass'>('rhythm');
  const [selection, setSelection] = useState<TabRange | null>({ from: 4, to: 7 });
  return (
    <Group id="tab" index="08" title="Tab" blurb="Engraved tablature from the song model: rhythm under the staff, every technique, chords and words, optional notation above, a cursor that can move every frame.">
      <div className={styles.grid}>
        <Demo
          wide
          title="A simple melody"
          note="Ode to Joy on the top two strings. Bars are as wide as their music and wrap to the width."
          controls={<SegmentedControl aria-label="Tab size" size="sm" value={size} onChange={setSize} options={[{ value: 'sm', label: 'S' }, { value: 'md', label: 'M' }, { value: 'lg', label: 'L' }]} />}
        >
          <TabView song={ode} size={size} />
        </Demo>
        <Demo
          wide
          title="Techniques, chords and lyrics"
          note="An original song: hammer-ons and pull-offs, a bend, a slide, vibrato, let ring, palm mute, harmonics, fingering and pick strokes."
          controls={
            <>
              <Switch label="Chord boxes" checked={boxes} onChange={setBoxes} />
              <Switch label="Notation" checked={staff} onChange={setStaff} />
            </>
          }
        >
          <TabView song={river} chords={boxes ? 'diagrams' : true} notation={staff} />
        </Demo>
        <Demo
          wide
          title="Every technique"
          note="The technique sampler: slides in and out, tapping, ghost and dead notes, accents, staccato, pre-bends, triplets, picking-hand fingers."
          controls={<Switch label="Notation" checked={samplerStaff} onChange={setSamplerStaff} />}
        >
          <TabView song={sampler} notation={samplerStaff} rhythm />
        </Demo>
        <Demo wide title="Notation above the tab" note="Amazing Grace in G with its pickup: the staff (treble clef, sounding an octave lower) is engraved from the same bars, note for note above the frets.">
          <TabView song={grace} notation />
        </Demo>
        <Demo wide title="A blues with its blue note" note="E blues over a steady thumb: B♭ is written as the flat five even where it slides up to B, the thumb's P.M. is written once per stretch, and the held bass of the last bar once.">
          <TabView song={blues} notation />
        </Demo>
        <Demo wide title="Let ring and held notes" note="A tremolo bar with a let-ring bass, and two voices where the bass is held under the tune: “let ring” once per stretch, each held note once, tied from where it was struck.">
          <TabView song={held} />
        </Demo>
        <Demo
          wide
          title="A band part with repeats"
          note="Campfire Groove: rhythm slashes with strum directions, a repeat with first and second endings; the bass part on four strings."
          controls={<SegmentedControl aria-label="Part" size="sm" value={part} onChange={setPart} options={[{ value: 'rhythm', label: 'Rhythm' }, { value: 'bass', label: 'Bass' }]} />}
        >
          <TabView song={groove} track={part} />
        </Demo>
        <Demo wide title="A long piece" note="Two hundred bars in a box of its own: only the lines near the view are drawn. Drag across bars with a mouse to select them, or Shift and the arrow keys.">
          <TabView song={long} height={460} selection={selection} onSelectionChange={setSelection} />
        </Demo>
        <Demo wide title="Play-along line" note="One line that scrolls with the cursor. Notes behind it turn green (or red for a miss), the next one is the target. Drag the blue handles to change the loop.">
          <PlayAlong song={river} />
        </Demo>
        <Demo title="A snippet in lesson text" note="A few bars written straight into a lesson, with a play button the lesson wires up.">
          <SnippetDemo />
        </Demo>
      </div>
    </Group>
  );
}

/** Beats of the first track in written order with absolute ticks (repeats not unrolled). */
function beatList(song: Song): Array<{ bar: number; beat: number; tick: number; start: number; end: number }> {
  const out: Array<{ bar: number; beat: number; tick: number; start: number; end: number }> = [];
  let at = 0;
  song.bars.forEach((info, bar) => {
    const len = info.length ?? (3840 * info.time.numerator) / info.time.denominator;
    (song.tracks[0]?.measures[bar]?.beats ?? []).forEach((b, i) => out.push({ bar, beat: i, tick: b.start, start: at + b.start, end: at + b.start + b.duration }));
    at += len;
  });
  return out;
}

function PlayAlong({ song }: { song: Song }) {
  const tab = useRef<TabViewHandle>(null);
  const beats = useMemo(() => beatList(song), [song]);
  const barStarts = useMemo(() => {
    const starts: number[] = [];
    let at = 0;
    song.bars.forEach((info) => {
      starts.push(at);
      at += info.length ?? (3840 * info.time.numerator) / info.time.denominator;
    });
    starts.push(at);
    return starts;
  }, [song]);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState<TabRange | null>({ from: 0, to: 3 });
  const [tapTo, setTapTo] = useState<'seek' | 'loop'>('seek');
  const [current, setCurrent] = useState(-1);
  const pos = useRef(0);
  const bpm = song.tempo[0]?.bpm ?? 90;

  const place = (tick: number) => {
    let bar = 0;
    while (bar + 1 < barStarts.length - 1 && barStarts[bar + 1] <= tick) bar++;
    tab.current?.setCursor({ bar, tick: tick - barStarts[bar] });
    let index = -1;
    for (let i = 0; i < beats.length; i++) if (beats[i].start <= tick) index = i;
    setCurrent((c) => (c === index ? c : index));
  };
  useRafLoop((dt) => {
    const from = loop ? barStarts[loop.from] : 0;
    const to = loop ? barStarts[loop.to + 1] : barStarts[barStarts.length - 1];
    pos.current += (dt * bpm * 960) / 60000;
    if (pos.current >= to || pos.current < from) pos.current = from;
    place(pos.current);
  }, playing);

  const states = useMemo(() => {
    const map = new Map<string, TabNoteState>();
    if (current < 0) return map;
    beats.forEach((b, i) => {
      const key = noteKey(b.bar, b.beat);
      if (i < current) map.set(key, i % 7 === 3 ? 'miss' : 'hit');
      else if (i === current) map.set(key, 'target');
      else if (i <= current + 2) map.set(key, 'upcoming');
    });
    return map;
  }, [beats, current]);

  return (
    <Stack gap={3}>
      <TabView
        ref={tab}
        song={song}
        layout="line"
        loop={loop}
        onLoopChange={setLoop}
        noteStates={states}
        pick={tapTo}
        onSeek={(at) => {
          pos.current = barStarts[at.bar] + at.tick;
          place(pos.current);
        }}
      />
      <Row wrap justify="between" gap={3}>
        <SegmentedControl aria-label="A tap on the tab" size="sm" value={tapTo} onChange={setTapTo} options={[{ value: 'seek', label: 'Tap to jump' }, { value: 'loop', label: 'Tap to loop' }]} />
        <Button variant="primary" iconLeft={playing ? 'Pause' : 'Play'} onClick={() => setPlaying((p) => !p)}>
          {playing ? 'Pause' : 'Play along'}
        </Button>
      </Row>
    </Stack>
  );
}

function SnippetDemo() {
  const ref = useRef<TabViewHandle>(null);
  const [playing, setPlaying] = useState(false);
  const t = useRef(0);
  useRafLoop((dt) => {
    t.current += (dt * 90 * 960) / 60000;
    if (t.current >= 3840 * 2) {
      t.current = 0;
      setPlaying(false);
      ref.current?.setCursor(null);
      return;
    }
    const bar = Math.floor(t.current / 3840);
    ref.current?.setCursor({ bar, tick: t.current - bar * 3840 });
  }, playing);
  return (
    <TabSnippet
      ref={ref}
      tab="| e 3:5 3:7h 3:5p 3:7 s 3:9s 3:7s 3:5 3:7 q 3:7b2r | e 2:8b1 2:5 q 2:5~ (3:7 2:5){pm dn} e3 4:7 4:5p 4:7h |"
      tempo={90}
      caption="Legato, slides and a bend and release, in two bars."
      playing={playing}
      onPlay={() => {
        t.current = 0;
        setPlaying((p) => !p);
        if (playing) ref.current?.setCursor(null);
      }}
    />
  );
}
