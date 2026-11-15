// @vitest-environment jsdom
/**
 * Keeps API.md honest: every component, hook and helper it names must be exported from "@/ui", and
 * the documented examples (mirrored below) must type-check under `tsc` and render.
 */
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type { MediaFailure } from '@/core/platform/media';
import doc from './API.md?raw';
import * as ui from './index';
import {
  AnimatedNumber,
  Button,
  Card,
  Celebration,
  ChipGroup,
  Cluster,
  EmptyState,
  FileDrop,
  Grid,
  HeartsChip,
  Icon,
  IconButton,
  LinkButton,
  List,
  ListItem,
  MediaBlocked,
  Menu,
  Modal,
  Page,
  PlayButton,
  ProgressBar,
  Section,
  SegmentedControl,
  Select,
  Slider,
  StarRating,
  Stat,
  Stepper,
  StreakChip,
  Tabs,
  TextField,
  XpChip,
  confirmDialog,
  cx,
  focusRing,
  toast,
  useElementSize,
  useLocalState,
  useRafLoop,
  useWakeLock,
} from './index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The snippets from API.md, kept compiling. `failure` stands in for a failed requestMic(). */
function Examples({ failure }: { failure: MediaFailure }) {
  const [title, setTitle] = useState('Greensleeves');
  const [tuning, setTuning] = useState('Standard');
  const [acc, setAcc] = useState('Sharps');
  const [bpm, setBpm] = useState(92);
  const [level, setLevel] = useState<string | null>('All');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [teacher, setTeacher] = useState('mia');
  const [loop, setLoop] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ref, { width }] = useElementSize<HTMLDivElement>();
  const [key, setKey] = useLocalState('api-test.key', 'A');
  useRafLoop(() => {}, playing);
  useWakeLock(playing);
  const positions = [{ id: 'box-1' }, { id: 'box-2' }];
  const remove = () => toast('Removed');
  const ask = async () => {
    if (await confirmDialog({ title: 'Delete this song?', description: 'This cannot be undone.', confirmLabel: 'Delete song', tone: 'danger' })) remove();
  };
  const notify = () => {
    toast.ok('Tuning saved');
    toast.error('The file could not be read', { description: 'It may be damaged.' });
    toast({ title: 'Removed from your library', action: { label: 'Undo', onClick: () => {} } });
  };
  return (
    <Page title="A minor pentatonic" subtitle="Five notes, five positions." back={{ to: 'scales', label: 'All scales' }} actions={<Button variant="primary" iconLeft="Play">Play along</Button>}>
      <Section title="Positions" description="Start with box one." actions={<LinkButton to="arcade" variant="ghost" size="sm">Practise</LinkButton>}>
        <Grid min="14rem">
          {positions.map((p) => (
            <Card key={p.id} to="scales" params={[p.id]}>
              {p.id}
            </Card>
          ))}
        </Grid>
      </Section>
      <Icon name="Flame" />
      <Icon name="Info" label="More information" />
      <Button variant="primary" iconLeft="Play" onClick={notify}>
        Start lesson
      </Button>
      <LinkButton to="tuner" iconRight="ArrowRight">
        Tune up first
      </LinkButton>
      <IconButton icon="Repeat" label="Loop this section" pressed={loop} onClick={() => setLoop((v) => !v)} />
      <PlayButton playing={playing} onClick={() => setPlaying((v) => !v)} />
      <TextField label="Song title" value={title} onChange={setTitle} hint="Shown in your library." />
      <Select label="Tuning" value={tuning} onChange={setTuning} options={['Standard', 'Drop D', 'DADGAD']} />
      <SegmentedControl aria-label="Accidentals" options={['Sharps', 'Flats']} value={acc} onChange={setAcc} />
      <Tabs aria-label="Scale views" items={[{ id: 'neck', label: 'Neck', content: <p>neck</p> }, { id: 'staff', label: 'Staff', content: <p>staff</p> }]} />
      <Slider label="Tempo" min={40} max={220} value={bpm} onChange={setBpm} format={(v) => `${v} BPM`} />
      <Stepper label="Tempo" unit="BPM" min={30} max={260} value={bpm} onChange={setBpm} size="lg" />
      <ChipGroup aria-label="Level" options={['All', 'Beginner', 'Intermediate', 'Expert']} value={level} onChange={setLevel} />
      <FileDrop accept=".pdf,image/*,.gp5,.musicxml" capture="environment" hint="PDF, photo, Guitar Pro or MusicXML" onFiles={([f]) => setName(f.name)} />
      <Button onClick={ask}>Delete</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Rename song"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => setOpen(false)}>
              Save name
            </Button>
          </>
        }
      >
        <TextField label="Song title" value={name} onChange={setName} data-autofocus />
      </Modal>
      <Menu
        trigger={<IconButton icon="EllipsisVertical" label="More actions" />}
        items={[{ label: 'Rename', icon: 'Pencil', onSelect: () => setOpen(true) }, 'separator', { label: 'Delete', icon: 'Trash2', danger: true, onSelect: remove }]}
      />
      <MediaBlocked reason={failure} device="microphone" onRetry={() => {}} onContinueWithout={() => {}} continueLabel="Tap the notes instead" />
      <EmptyState icon="Music" title="No songs yet" actions={<LinkButton to="scan" variant="primary">Scan a sheet</LinkButton>}>
        Songs you scan or import show up here.
      </EmptyState>
      <ProgressBar label="Daily goal" value={30} max={50} valueText="30 / 50 XP" tone="xp" />
      <List variant="card">
        <ListItem icon="Music" title="Greensleeves" subtitle="Traditional · A minor" to="play" params={['greensleeves']} trailing={<StarRating value={2} size={14} />} />
      </List>
      <Card selected={teacher === 'mia'} onClick={() => setTeacher('mia')}>
        Mia
      </Card>
      <Stat label="Total XP" value={<AnimatedNumber value={1250} />} />
      <Cluster>
        <XpChip value={1250} />
        <StreakChip days={12} active={false} />
        <HeartsChip value={3} pips />
      </Cluster>
      <Celebration fire={false} />
      <div ref={ref} role="button" tabIndex={0} className={cx('pad', focusRing)} onClick={() => setKey('E')}>
        {width} {key}
      </div>
    </Page>
  );
}

describe('API.md', () => {
  it('only names things that "@/ui" really exports', () => {
    const exported = new Set(Object.keys(ui));
    const named = new Set<string>();
    // First cell of every table row, plus the bullet list under "Icon": backticked identifiers and calls.
    for (const row of doc.split('\n').filter((l) => l.startsWith('| `') || l.startsWith('- `'))) {
      const cell = row.startsWith('|') ? row.split('|')[1] : row.split('—')[0];
      for (const m of cell.matchAll(/`([A-Za-z][A-Za-z0-9]*)(?:[<(][^`]*)?`/g)) named.add(m[1]);
    }
    expect(named.size).toBeGreaterThan(70);
    expect([...named].filter((n) => !exported.has(n))).toEqual([]);
  });

  it('documents every component and hook the barrel exports', () => {
    const undocumented = Object.keys(ui).filter((name) => {
      const value = (ui as Record<string, unknown>)[name];
      const isComponentOrHook = (typeof value === 'function' || (typeof value === 'object' && value !== null && '$$typeof' in value)) && (/^[A-Z]/.test(name) || /^use[A-Z]/.test(name));
      return isComponentOrHook && !doc.includes('`' + name);
    });
    expect(undocumented).toEqual([]);
  });

  it('its examples render', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    act(() => root.render(<Examples failure="denied" />));
    expect(el.querySelectorAll('h1')).toHaveLength(1);
    expect(el.querySelector('[role="tablist"]')).not.toBeNull();
    expect(el.querySelectorAll('a[href="#scales--box-1"]')).toHaveLength(1);
    act(() => root.unmount());
    el.remove();
  });
});
