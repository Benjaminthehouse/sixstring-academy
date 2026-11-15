import { useState } from 'react';
import { Badge, Checkbox, Chip, ChipGroup, Cluster, Field, FileDrop, Grid, RadioGroup, SearchField, SegmentedControl, Select, Slider, Stack, Stepper, Switch, Tabs, Text, TextArea, TextField, toast, useDebounced } from '@/ui';
import { Box, Demo, Group, Specimen } from './parts';

const SONGS = ['Greensleeves', 'Scarborough Fair', 'House of the Rising Sun', 'Amazing Grace', 'Romanza', 'Lágrima', 'Ode to Joy', 'Aura Lee'];
const STYLES = ['Blues', 'Folk', 'Classical', 'Rock', 'Jazz', 'Country', 'Funk', 'Fingerstyle', 'Bossa nova', 'Metal'];

/** Form controls. Each one owns its label, hint and error. */
export function InputsGroup() {
  const [title, setTitle] = useState('Greensleeves');
  const [notes, setNotes] = useState('Bars 9 to 12: the F chord change is late. Slow to 60 and loop.');
  const [tuning, setTuning] = useState('standard');
  const [key, setKey] = useState('');
  const [query, setQuery] = useState('gre');
  const debounced = useDebounced(query, 250);
  const [accidentals, setAccidentals] = useState('Sharps');
  const [view, setView] = useState<'neck' | 'staff' | 'tab'>('neck');
  const [speed, setSpeed] = useState(75);
  const [lefty, setLefty] = useState(false);
  const [countIn, setCountIn] = useState(true);
  const [metronome, setMetronome] = useState(true);
  const [strings, setStrings] = useState<string[]>(['6', '5']);
  const [level, setLevel] = useState<string | null>('some');
  const [hand, setHand] = useState<string | null>('right');
  const [bpm, setBpm] = useState(92);
  const [volume, setVolume] = useState(70);
  const [zoom, setZoom] = useState(1);
  const [tempo, setTempo] = useState(120);
  const [capo, setCapo] = useState(2);
  const [cents, setCents] = useState(0.5);
  const [difficulty, setDifficulty] = useState<string | null>('All');
  const [picked, setPicked] = useState<string[]>(['Blues', 'Folk']);
  const [chipOn, setChipOn] = useState(true);
  const [files, setFiles] = useState<string>('');
  const allStrings = ['6', '5', '4', '3', '2', '1'];

  return (
    <Group id="inputs" index="04" title="Inputs" blurb="Every control comes with its label. Hints say what is expected, errors say how to fix it.">
      <Specimen name="TextField" note="One line of text. onChange gives you the string.">
        <Grid min="15rem" gap={5}>
          <TextField label="Song title" value={title} onChange={setTitle} hint="Shown in your library." />
          <TextField label="Artist or composer" optional placeholder="Traditional" value="" onChange={() => {}} />
          <TextField label="Tempo" value="12o" onChange={() => {}} suffix="BPM" error="Enter a number between 30 and 260." />
          <TextField label="Custom tuning" icon="Guitar" mono value="D A D G A D" onChange={() => {}} />
          <TextField label="Export name" value="greensleeves-capo-2" onChange={() => {}} disabled />
          <TextField label="Small" size="sm" placeholder="36 px tall" value="" onChange={() => {}} />
        </Grid>
      </Specimen>

      <Specimen name="TextArea" note="Several lines. autoGrow follows the content; maxLength adds a counter.">
        <Grid min="15rem" gap={5}>
          <TextArea label="Practice notes" value={notes} onChange={setNotes} autoGrow maxLength={200} />
          <TextArea label="Paste a tab" mono rows={4} value={'e|-----0-----0---|\nB|---1-----1-----|\nG|-2-----2-------|'} onChange={() => {}} hint="Six lines, one per string." />
        </Grid>
      </Specimen>

      <Specimen name="Select" note="Native select, styled: phones get their own picker.">
        <Grid min="15rem" gap={5}>
          <Select
            label="Tuning"
            value={tuning}
            onChange={setTuning}
            options={[
              { group: 'Common', options: [{ value: 'standard', label: 'Standard (E A D G B E)' }, { value: 'drop-d', label: 'Drop D' }, { value: 'half-down', label: 'Half step down' }] },
              { group: 'Open', options: [{ value: 'open-g', label: 'Open G' }, { value: 'open-d', label: 'Open D' }, { value: 'dadgad', label: 'DADGAD' }] },
            ]}
          />
          <Select label="Key" value={key} onChange={setKey} placeholder="Choose a key" options={['C major', 'G major', 'D major', 'A minor', 'E minor']} prefix="Music" />
          <Select label="Time signature" value="4/4" onChange={() => {}} options={['4/4', '3/4', '6/8']} error="This song changes metre: pick the one it starts in." />
          <Select label="Instrument" value="Six-string guitar" onChange={() => {}} options={['Six-string guitar']} disabled />
        </Grid>
      </Specimen>

      <Specimen name="SearchField" note="Filters as you type; Escape or the cross clears it.">
        <Demo width="narrow">
          <SearchField value={query} onChange={setQuery} placeholder="Search songs" />
          <Text variant="caption" aria-live="polite">
            {SONGS.filter((s) => s.toLowerCase().includes(debounced.trim().toLowerCase())).length} of {SONGS.length} songs match “{debounced}” (debounced 250 ms)
          </Text>
        </Demo>
      </Specimen>

      <Specimen name="SegmentedControl" note="Two to five short choices that apply at once. Arrow keys move the selection.">
        <Cluster gap={4}>
          <SegmentedControl aria-label="Accidentals" options={['Sharps', 'Flats']} value={accidentals} onChange={setAccidentals} />
          <SegmentedControl
            aria-label="View"
            value={view}
            onChange={setView}
            options={[
              { value: 'neck', label: 'Neck', icon: 'Rows4' },
              { value: 'staff', label: 'Staff', icon: 'Music' },
              { value: 'tab', label: 'Tab', icon: 'ListMusic' },
            ]}
          />
          <SegmentedControl aria-label="Speed" size="sm" options={[50, 75, 100]} value={speed} onChange={setSpeed} />
        </Cluster>
        <Demo label="fullWidth, lg, with a disabled option" width="medium">
          <SegmentedControl
            aria-label="Hand"
            size="lg"
            fullWidth
            value={lefty ? 'left' : 'right'}
            onChange={(v) => setLefty(v === 'left')}
            options={[
              { value: 'right', label: 'Right hand' },
              { value: 'left', label: 'Left hand' },
              { value: 'both', label: 'Mirror', disabled: true },
            ]}
          />
        </Demo>
      </Specimen>

      <Specimen name="Tabs" note="Views of the same thing. Roving tabindex: arrows move, Home and End jump.">
        <Tabs
          aria-label="Scale views"
          items={[
            { id: 'positions', label: 'Positions', icon: 'Rows4', content: <Box tall>Five positions of the scale on the neck</Box> },
            { id: 'notes', label: 'Notes', content: <Box tall>A B C D E F G</Box> },
            { id: 'songs', label: 'Songs', badge: <Badge tone="accent">12</Badge>, content: <Box tall>Songs that use this scale</Box> },
            { id: 'theory', label: 'Theory', content: <Box tall>Why it sounds minor</Box> },
            { id: 'locked', label: 'Jam track', disabled: true, content: null },
          ]}
        />
        <Demo label="pills, fitted" width="medium">
          <Tabs
            aria-label="Statistics period"
            variant="pills"
            fitted
            defaultValue="week"
            items={[
              { id: 'day', label: 'Today', content: <Box>Today</Box> },
              { id: 'week', label: 'This week', content: <Box>This week</Box> },
              { id: 'all', label: 'All time', content: <Box>All time</Box> },
            ]}
          />
        </Demo>
      </Specimen>

      <Specimen name="Switch" note="A setting that takes effect immediately.">
        <Demo width="medium">
          <Stack gap={0}>
            <Switch label="Left-handed neck" description="Flips every fretboard diagram. Your data stays the same." checked={lefty} onChange={setLefty} />
            <Switch label="Metronome click" checked={metronome} onChange={setMetronome} />
            <Switch label="Use the microphone" description="Not available in this viewer." checked={false} onChange={() => {}} disabled />
          </Stack>
        </Demo>
        <Demo label='side="start" and bare (aria-label)'>
          <Cluster gap={6}>
            <Switch side="start" label="Count-in" checked={countIn} onChange={setCountIn} />
            <Switch aria-label="Loop" checked={metronome} onChange={setMetronome} />
          </Cluster>
        </Demo>
      </Specimen>

      <Specimen name="Checkbox" note="Options confirmed later, or several picks from a list.">
        <Demo width="medium">
          <Stack gap={0}>
            <Checkbox
              label="All strings"
              checked={strings.length === allStrings.length}
              indeterminate={strings.length > 0 && strings.length < allStrings.length}
              onChange={(on) => setStrings(on ? allStrings : [])}
            />
            {allStrings.slice(0, 3).map((s) => (
              <Checkbox key={s} label={`String ${s}`} checked={strings.includes(s)} onChange={(on) => setStrings((prev) => (on ? [...prev, s] : prev.filter((x) => x !== s)))} />
            ))}
            <Checkbox label="Count me in before each loop" description="Two bars of clicks before the music starts." checked={countIn} onChange={setCountIn} />
            <Checkbox label="Unavailable option" checked={false} onChange={() => {}} disabled />
          </Stack>
        </Demo>
      </Specimen>

      <Specimen name="RadioGroup" note="Exactly one choice, with room to explain each.">
        <RadioGroup
          label="How much have you played?"
          variant="cards"
          value={level}
          onChange={setLevel}
          options={[
            { value: 'never', label: 'Never held a guitar', description: 'Start with how to sit, hold and tune.' },
            { value: 'some', label: 'I know a few chords', description: 'Pick up with smooth changes and strumming.' },
            { value: 'lots', label: 'I play regularly', description: 'Go straight to the whole neck and improvising.' },
          ]}
        />
        <Grid min="14rem" gap={6}>
          <RadioGroup label="Fretting hand" value={hand} onChange={setHand} options={[{ value: 'right', label: 'Left hand frets (right-handed)' }, { value: 'left', label: 'Right hand frets (left-handed)' }]} />
          <RadioGroup label="Note names" orientation="horizontal" value="letters" onChange={() => {}} options={[{ value: 'letters', label: 'C D E' }, { value: 'solfege', label: 'Do Re Mi' }, { value: 'off', label: 'Off', disabled: true }]} error="Choose how notes are named." />
        </Grid>
      </Specimen>

      <Specimen name="Slider" note="A sweep through a range, with a value bubble and tick labels.">
        <Grid min="16rem" gap={6}>
          <Slider label="Tempo" min={40} max={220} value={bpm} onChange={setBpm} format={(v) => `${v} BPM`} marks={[{ value: 40, label: 'Largo' }, { value: 92, label: 'Andante' }, { value: 132, label: 'Allegro' }, { value: 220, label: 'Presto' }]} />
          <Slider label="Backing track volume" value={volume} onChange={setVolume} format={(v) => `${v}%`} bubble="always" />
          <Slider label="Zoom" min={0.5} max={2} step={0.25} value={zoom} onChange={setZoom} format={(v) => `${v.toFixed(2)}×`} marks={[{ value: 0.5, label: '½' }, { value: 1, label: '1' }, { value: 1.5 }, { value: 2, label: '2' }]} hint="Scales the tab and the fretboard together." />
          <Slider label="Disabled" value={35} onChange={() => {}} disabled />
        </Grid>
      </Specimen>

      <Specimen name="Stepper" note="Exact numbers. Hold a button to repeat faster; or type, or use the arrow keys.">
        <Cluster gap={6} align="end">
          <Stepper label="Tempo" unit="BPM" min={30} max={260} value={tempo} onChange={setTempo} size="lg" />
          <Stepper label="Capo" unit="fret" min={0} max={12} value={capo} onChange={setCapo} />
          <Stepper label="Fine tune" unit="Hz" min={-2} max={2} step={0.5} value={cents} onChange={setCents} />
          <Stepper label="Disabled" min={0} max={10} value={4} onChange={() => {}} disabled />
        </Cluster>
      </Specimen>

      <Specimen name="FileDrop" note="Drop, browse or (on a phone) photograph. Files stay on the device.">
        <FileDrop
          accept=".pdf,image/*,.gp,.gp5,.gpx,.musicxml,.mxl,.mid,.txt"
          capture="environment"
          maxBytes={20_000_000}
          title="Drop a sheet, tab or photo here"
          hint="PDF, photo, Guitar Pro, MusicXML, MIDI or a text tab, up to 20 MB."
          onFiles={(list) => {
            setFiles(list.map((f) => f.name).join(', '));
            toast.ok(`Got ${list[0].name}`);
          }}
        />
        {files && <Text variant="caption">Last picked: {files}</Text>}
        <Grid min="16rem">
          <FileDrop compact icon="Image" title="Add a photo" browseLabel="Choose" accept="image/*" onFiles={() => {}} />
          <FileDrop compact title="Importing" busy="Reading greensleeves.pdf" onFiles={() => {}} />
        </Grid>
      </Specimen>

      <Specimen name="Field" note="The label, hint and error furniture on its own, for wrapping a custom control.">
        <Demo width="narrow">
          <Field label="Strumming pattern" hint="Tap a beat to toggle a strum." error={chipOn ? undefined : 'Choose at least one strum.'} labelAs="span">
            <Cluster>
              {['D', '·', 'D', 'U', '·', 'U', 'D', 'U'].map((beat, i) => (
                <Box key={i}>{beat}</Box>
              ))}
            </Cluster>
          </Field>
        </Demo>
      </Specimen>

      <Specimen name="Chip / ChipGroup" note="Filters. Single choice acts as a radio group; multiple is a set of toggles. One swipeable row on phones.">
        <Demo label="Single choice">
          <ChipGroup aria-label="Difficulty" value={difficulty} onChange={setDifficulty} options={[{ value: 'All', label: 'All', count: 86 }, { value: 'Beginner', label: 'Beginner', count: 31 }, { value: 'Intermediate', label: 'Intermediate', count: 38 }, { value: 'Expert', label: 'Expert', count: 17 }]} />
        </Demo>
        <Demo label="Multiple">
          <ChipGroup multiple aria-label="Styles" value={picked} onChange={setPicked} options={STYLES} />
        </Demo>
        <Demo label='scroll="always"'>
          <ChipGroup scroll="always" aria-label="Keys" value="A" onChange={() => {}} options={['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'D♭', 'A♭', 'E♭', 'B♭', 'F', 'A minor', 'E minor', 'B minor', 'F♯ minor', 'D minor', 'G minor']} />
        </Demo>
        <Demo label="Standalone Chip">
          <Cluster>
            <Chip selected={chipOn} onClick={() => setChipOn((v) => !v)} icon="Star">
              Favourites only
            </Chip>
            <Chip icon="Clock">Under 5 min</Chip>
            <Chip disabled>Unavailable</Chip>
          </Cluster>
        </Demo>
      </Specimen>
    </Group>
  );
}
