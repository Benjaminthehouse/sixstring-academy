import { useEffect, useMemo, useRef, useState } from 'react';
import { href } from '@/app/router';
import { isArtifact } from '@/core/platform';
import { useProgress } from '@/core/progress';
import { Button, ButtonGroup, Callout, Card, ChipGroup, Grid, Heading, IconButton, LinkButton, Page, PlayButton, Section, SegmentedControl, StarRating, Stepper, Switch, Tag, Text, toast, useLocalState, useRafLoop } from '@/ui';
import { strumChart } from '../core/charts';
import { skillId } from '../core/ladder';
import { meterInfo, secondsPerTick } from '../core/meter';
import {
  BUILDER_METERS,
  STRUM_PATTERNS,
  blankSlots,
  customPattern,
  decodeCustom,
  encodeCustom,
  gridAllowed,
  kindOf,
  nextKind,
  patternCount,
  patternNickname,
  setSlot,
  slotTicks,
  slotsPerBar,
  type StrumGrid as Grid_,
  type StrumPattern,
} from '../core/strum';
import { STRUM_CHORDS } from '../engine/sounds';
import { useRhythmPrefs } from '../ui/prefs';
import { RoundScreen } from '../ui/RoundScreen';
import { lastTempo } from '../ui/useRound';
import { StrumGrid, type StrumGridHandle } from '../ui/StrumGrid';
import { StrumStage, slotAtTick, useListen } from '../ui/StrumStage';
import styles from '../ui/Rhythm.module.css';

const LEVEL_NAMES = ['', 'First strums', 'Core patterns', 'Feel and colour', 'Sixteenths', 'Groove'] as const;

/** Skill id of a pattern: library patterns have their own, everything from the builder shares one. */
function strumSkill(pattern: StrumPattern): string {
  return pattern.custom ? skillId('strum', 'custom') : skillId('strum', pattern.id);
}

/** One pattern: listen to it, tap along, or play along through the microphone. */
export function StrumScreen({ pattern }: { pattern: StrumPattern }) {
  const [prefs, setPrefs] = useRhythmPrefs();
  const meter = meterInfo(pattern.meter);
  const bpmMin = meter.compound ? 30 : 40;
  const bpmMax = pattern.grid === 'sixteenth' ? 132 : 184;
  // Built patterns share one skill, so they start at their own tempo rather than the last one used.
  const [bpm, setBpm] = useState(() => (pattern.custom ? pattern.bpm : lastTempo(strumSkill(pattern), pattern.bpm, bpmMin, bpmMax)));
  const [chord, setChord] = useState(pattern.chord);
  const bars = pattern.grid === 'sixteenth' && !meter.compound ? 4 : meter.compound ? 4 : 8;
  // With the microphone on, the app's own guitar would be heard as the learner's strums.
  const viaMic = prefs.source === 'mic' && !isArtifact();
  const guitar = prefs.guitar && !viaMic;
  const chart = useMemo(() => strumChart(pattern, { bpm, bars, mode: 'play', guitar }), [pattern, bpm, bars, guitar]);
  const slotSeconds = secondsPerTick(bpm, meter) * slotTicks(pattern.grid);
  return (
    <RoundScreen
      activity="strum"
      skill={strumSkill(pattern)}
      params={['strum', pattern.id]}
      eyebrow={pattern.custom ? 'Strumming · Your pattern' : `Strumming · ${LEVEL_NAMES[pattern.level]}`}
      title={pattern.name}
      subtitle={pattern.blurb}
      teach={pattern.how}
      mistake={pattern.mistake}
      back={{ params: pattern.custom ? ['strum', 'builder'] : ['strum'], label: pattern.custom ? 'Pattern builder' : 'Strumming patterns' }}
      chart={chart}
      bpm={bpm}
      onBpm={setBpm}
      bpmMin={bpmMin}
      bpmMax={bpmMax}
      padMode="strum"
      display={(ctx) => <StrumStage ctx={ctx} pattern={pattern} bpm={bpm} chord={chord} />}
      quick={
        <div className={styles.chordPick}>
          <Text variant="label" as="span" aria-hidden="true">
            Chord
          </Text>
          <ChipGroup aria-label="Chord" options={[...STRUM_CHORDS]} value={chord} onChange={(v) => v && setChord(v)} />
        </div>
      }
      options={<Switch checked={prefs.guitar} onChange={(v) => setPrefs({ guitar: v })} label="Guitar plays along" description="Hear the pattern while you tap it. Off whenever the microphone is listening." />}
      hasCounts
      chord={chord}
      staccato={pattern.staccato}
      slotSeconds={slotSeconds}
      startLabel={viaMic ? 'Start: play along' : 'Start: tap along'}
      idleHint={viaMic ? 'Strum the pattern on your guitar' : 'Left thumb down, right thumb up'}
    />
  );
}

/** The library: every pattern, in teaching order. */
export function StrumLibrary() {
  const skills = useProgress((s) => s.skills);
  const levels = [1, 2, 3, 4, 5] as const;
  return (
    <Page
      title="Strumming patterns"
      subtitle="Every pattern is the same pendulum: down on the beat, up in between. What changes is which strokes touch the strings."
      back={{ to: 'rhythm', label: 'Rhythm' }}
      actions={
        <LinkButton to="rhythm" params={['strum', 'builder']} iconLeft="Pencil">
          Build your own
        </LinkButton>
      }
    >
      {levels.map((level) => (
        <Section key={level} title={LEVEL_NAMES[level]}>
          <Grid min="17rem" gap={3}>
            {STRUM_PATTERNS.filter((p) => p.level === level).map((p) => (
              <Card key={p.id} to="rhythm" params={['strum', p.id]} padding="md" className={styles.patternCard} data-pattern={p.id}>
                <div className={styles.patternTop}>
                  <Heading level={3} size="md">
                    {p.name}
                  </Heading>
                  <StarRating value={skills[skillId('strum', p.id)]?.stars ?? 0} size={14} />
                </div>
                <StrumGrid pattern={p} size="sm" counts={false} />
                <div className={styles.patternMeta}>
                  <span className={styles.patternNick}>{patternNickname(p)}</span>
                  <Tag mono>{p.meter}</Tag>
                </div>
                <Text size="sm" tone="muted">
                  {p.blurb}
                </Text>
              </Card>
            ))}
          </Grid>
        </Section>
      ))}
    </Page>
  );
}

interface Draft {
  meter: string;
  grid: Grid_;
  slots: string;
}
interface Saved {
  code: string;
  name: string;
}

const DEFAULT_DRAFT: Draft = { meter: '4/4', grid: 'eighth', slots: 's-ss-sss' };
const GRID_LABELS: Record<Grid_, string> = { eighth: 'Eighths', sixteenth: 'Sixteenths', swing: 'Swing' };

function cleanDraft(raw: Draft): Draft {
  const meter = (BUILDER_METERS as readonly string[]).includes(raw?.meter) ? raw.meter : '4/4';
  const grid: Grid_ = raw?.grid === 'sixteenth' || raw?.grid === 'swing' || raw?.grid === 'eighth' ? raw.grid : 'eighth';
  const okGrid = gridAllowed(meter, grid) ? grid : 'sixteenth';
  const n = slotsPerBar(meter, okGrid);
  const slots = typeof raw?.slots === 'string' && raw.slots.length === n && /^[sax-]+$/.test(raw.slots) ? raw.slots : blankSlots(meter, okGrid);
  return { meter, grid: okGrid, slots };
}

/** The pattern builder: toggle strokes on the grid, hear the result, then practise it like any other pattern. */
export function StrumBuilder() {
  const [stored, setStored] = useLocalState<Draft>('rhythm.builder', DEFAULT_DRAFT);
  const [saved, setSaved] = useLocalState<Saved[]>('rhythm.patterns', []);
  const [bpm, setBpm] = useState(84);
  const draft = cleanDraft(stored);
  const empty = ![...draft.slots].some((c) => c !== '-');
  const code = encodeCustom(draft.meter, draft.grid, draft.slots);
  const pattern = useMemo(() => customPattern(draft.meter, draft.grid, draft.slots), [draft.meter, draft.grid, draft.slots]);
  // Building something the library already has is worth knowing: it has a name, a "how" and its own stars.
  const known = STRUM_PATTERNS.find((p) => p.meter === draft.meter && p.grid === draft.grid && p.slots === draft.slots) ?? null;
  const listen = useListen(pattern, bpm, 'G');
  const grid = useRef<StrumGridHandle | null>(null);
  const meter = meterInfo(draft.meter);
  useRafLoop(() => {
    const live = listen.session;
    if (!live || !grid.current) return;
    const tick = live.tickNow();
    const seg = live.segmentAt(tick);
    grid.current.setActive(seg?.kind === 'play' ? slotAtTick(draft, (tick - seg.startTick) % meter.barTicks) : null);
  }, listen.playing);
  const listening = listen.playing;
  useEffect(() => {
    if (!listening) grid.current?.setActive(null);
  }, [listening]);

  const set = (next: Partial<Draft>) => {
    const meterNext = next.meter ?? draft.meter;
    let gridNext = next.grid ?? draft.grid;
    if (!gridAllowed(meterNext, gridNext)) gridNext = 'sixteenth';
    const reshaped = meterNext !== draft.meter || gridNext !== draft.grid;
    setStored({ meter: meterNext, grid: gridNext, slots: next.slots ?? (reshaped ? blankSlots(meterNext, gridNext) : draft.slots) });
  };
  const list = Array.isArray(saved) ? saved.filter((s) => s && typeof s.code === 'string' && decodeCustom(s.code)) : [];
  const save = () => {
    if (list.some((s) => s.code === code)) return toast.info('This pattern is already in your list');
    const name = `My pattern ${list.length + 1}`;
    setSaved([{ code, name }, ...list].slice(0, 12));
    toast.ok(`Saved as "${name}"`);
  };

  return (
    <Page title="Pattern builder" subtitle="Press a slot to change what the hand does there. The direction is never yours to choose: down on the numbers, up in between." back={{ to: 'rhythm', params: ['strum'], label: 'Strumming patterns' }}>
      <div className={styles.builder}>
        <Card variant="raised" padding="lg" className={styles.builderCard}>
          <div className={styles.strumHead}>
            <div>
              <Text variant="eyebrow">Your pattern</Text>
              <p className={styles.nickname}>{empty ? 'Nothing yet' : patternNickname(known ?? pattern)}</p>
              <Text size="sm" tone="muted" mono>
                {empty ? 'Press a slot to add a strum' : patternCount(draft)}
              </Text>
              {known && (
                <Text size="sm" className={styles.knownLine}>
                  A pattern from the library: <a href={href('rhythm', 'strum', known.id)}>{known.name}</a>
                </Text>
              )}
            </div>
            <PlayButton playing={listen.playing} loading={listen.loading} onClick={listen.toggle} label={listen.playing ? 'Stop' : 'Listen to your pattern'} size="md" tone="neutral" />
          </div>
          <StrumGrid ref={grid} pattern={draft} onToggle={(slot) => set({ slots: setSlot(draft.slots, slot, nextKind(kindOf(draft.slots[slot]))) })} />
          <ul className={styles.legend}>
            <li data-kind="strum">Strum</li>
            <li data-kind="accent">Accent (louder)</li>
            <li data-kind="mute">Muted</li>
            <li data-kind="ghost">Ghost (miss the strings)</li>
          </ul>
        </Card>
        <div className={styles.builderSide}>
          <SegmentedControl aria-label="Time signature" options={[...BUILDER_METERS]} value={draft.meter} onChange={(v) => set({ meter: v })} fullWidth />
          <SegmentedControl
            aria-label="Grid"
            options={(['eighth', 'sixteenth', 'swing'] as const).map((g) => ({ value: g, label: GRID_LABELS[g], disabled: !gridAllowed(draft.meter, g) }))}
            value={draft.grid}
            onChange={(v) => set({ grid: v })}
            fullWidth
          />
          <Stepper label="Tempo" unit="BPM" min={40} max={160} step={2} largeStep={10} value={bpm} onChange={setBpm} />
          <Callout tone="tip" label="Why the arrows are fixed">
            A strumming hand swings like a pendulum and never stops. You only decide where it touches the strings. If a pattern needs two downstrokes in a row, the upstroke between them is a ghost.
          </Callout>
          <ButtonGroup align="end">
            <Button variant="ghost" iconLeft="RotateCcw" onClick={() => set({ slots: blankSlots(draft.meter, draft.grid) })}>
              Start over
            </Button>
            <Button iconLeft="Save" onClick={save} disabled={empty}>
              Save
            </Button>
            <LinkButton variant="primary" to="rhythm" params={['strum', code]} iconRight="ArrowRight" disabled={empty} data-builder-practise>
              Practise this pattern
            </LinkButton>
          </ButtonGroup>
        </div>
      </div>
      {list.length > 0 && (
        <Section title="Your saved patterns">
          <ul className={styles.savedList}>
            {list.map((s) => {
              const p = decodeCustom(s.code)!;
              return (
                <li key={s.code} className={styles.savedRow}>
                  <LinkButton variant="ghost" to="rhythm" params={['strum', s.code]} iconLeft="Guitar" className={styles.savedLink}>
                    {s.name} · {p.meter} · {patternNickname(p)}
                  </LinkButton>
                  <IconButton
                    icon="Trash2"
                    label={`Remove ${s.name}`}
                    onClick={() => {
                      const before = list;
                      setSaved(list.filter((x) => x.code !== s.code));
                      toast({ title: `Removed "${s.name}"`, action: { label: 'Undo', onClick: () => setSaved(before) } });
                    }}
                  />
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </Page>
  );
}
