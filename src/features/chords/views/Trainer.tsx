/**
 * The chord-change trainer (`#chords--trainer`, `#chords--trainer--g-major--c-major`): pick two to
 * four chords (or a classic pair), choose one-minute changes, changes in time or the microphone
 * check, play a round, see the score, the trend over days and the next step. Every finished
 * round is one `chord-change` activity on the set's `chord-change:` skill; the one-minute trend
 * and the timed tempo live in that skill's data.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useImmersive } from '@/app/shell';
import { playUi, unlockAudio } from '@/core/audio';
import { dayKey, getProgressStore, recordActivity, useSkill, type ActivityResult } from '@/core/progress';
import { ActionBar, Badge, Banner, Button, Callout, Celebration, ChipGroup, Icon, IconButton, MediaBlocked, Page, RadioGroup, Section, SegmentedControl, StarRating, Stat, Stepper, Text, XpChip, useIsMobile, useIsTouch, useLocalState, useWakeLock } from '@/ui';
import { ChordDiagram, useMusicSettings } from '@/ui/music';
import { useShortcuts } from '../hooks/keys';
import { micRefusedByHost, useMic } from '../hooks/useMic';
import { MIC_EXPLAINER } from '../model/hints';
import { chordParam, displaySymbol } from '../model/symbols';
import { tipsForVoicings } from '../model/tips';
import {
  addScore,
  changeDataJson,
  changeSkillId,
  changeTitle,
  MAX_BPM,
  MIN_BPM,
  nextTempo,
  readChangeData,
  scoreCheck,
  scoreInTime,
  scoreOneMinute,
  setDifficulty,
  suggestedPairs,
  targetPerMinute,
  trendWords,
} from '../model/trainer';
import { changePartners } from '../model/usage';
import { defaultVoicing } from '../model/voicings';
import { ChangePair, RingLegend } from './ChangeTipsPanel';
import { ChordPicker } from './ChordPicker';
import { CheckRun, MinuteRun, TimedRun, type RoundResult, type TrainerInput, type TrainerMode } from './TrainerRun';
import { TrendChart } from './TrendChart';
import styles from './Trainer.module.css';

interface Settings {
  chords: string[];
  mode: TrainerMode;
  input: TrainerInput;
  bpm: number;
  beats: number;
}

const DEFAULTS: Settings = { chords: ['Em', 'Am'], mode: 'minute', input: 'tap', bpm: 60, beats: 4 };

function sanitize(s: Partial<Settings> | null | undefined): Settings {
  const out = { ...DEFAULTS, ...(s ?? {}) };
  out.chords = Array.isArray(out.chords) ? out.chords.filter((c) => typeof c === 'string' && defaultVoicing(c)).slice(0, 4) : DEFAULTS.chords;
  if (out.chords.length < 2) out.chords = DEFAULTS.chords;
  if (!['minute', 'timed', 'check'].includes(out.mode)) out.mode = 'minute';
  if (!['tap', 'mic'].includes(out.input)) out.input = 'tap';
  out.bpm = Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(Number(out.bpm) || 60)));
  if (![1, 2, 4, 8].includes(out.beats)) out.beats = 4;
  return out;
}

interface Outcome {
  round: RoundResult;
  activity: ActivityResult | null;
  /** One-minute: changes a minute; timed: clean changes; check: first-try chords. */
  headline: number;
  unit: string;
  verdict: string;
  stars: 0 | 1 | 2 | 3;
  newBest: boolean;
  firstScore: boolean;
  details: Array<{ label: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' | 'info' }>;
  next: { bpm: number; beats: number; message: string } | null;
}

/** The trainer. */
export function Trainer({ chordsFromUrl, tuning, known }: { chordsFromUrl: string[]; tuning: string; known: ReadonlySet<string> }) {
  const { naming } = useMusicSettings();
  const [stored, setStored] = useLocalState<Settings>('chords.trainer', DEFAULTS);
  const settings = sanitize(stored);
  const patch = useCallback((p: Partial<Settings>) => setStored((prev) => ({ ...sanitize(prev), ...p })), [setStored]);

  // Chords named in the address win (a "Practise changes" link from a chord page).
  const urlKey = chordsFromUrl.join('|');
  useEffect(() => {
    if (!chordsFromUrl.length) return;
    const list = chordsFromUrl.length === 1 ? [chordsFromUrl[0], changePartners(chordsFromUrl[0])[0] ?? 'C'] : chordsFromUrl;
    patch({ chords: list.slice(0, 4) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKey]);

  const chords = settings.chords;
  const voicings = useMemo(() => chords.map((c) => defaultVoicing(c, tuning)!), [chords, tuning]);
  const title = changeTitle(chords, (s) => displaySymbol(s, { system: naming }));
  const skillId = changeSkillId(chords);
  const skill = useSkill(skillId);
  const data = useMemo(() => readChangeData(skill.record?.data), [skill.record?.data]);
  const target = useMemo(() => targetPerMinute(setDifficulty(chords)), [chords]);
  const today = dayKey(getProgressStore().now());
  const mic = useMic();
  const hostRefusesMic = micRefusedByHost();
  const touch = useIsTouch();

  const [phase, setPhase] = useState<'setup' | 'running' | 'results'>('setup');
  const [runKey, setRunKey] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [celebrate, setCelebrate] = useState(0);

  useImmersive(phase === 'running', 'focus');
  useWakeLock(phase === 'running');

  const needsMic = settings.mode === 'check' || settings.input === 'mic';

  const start = useCallback(
    async (override?: Partial<Settings>) => {
      if (override) patch(override);
      const s = { ...settings, ...(override ?? {}) };
      void unlockAudio();
      if (s.mode === 'check' || s.input === 'mic') {
        const t = await mic.start();
        if (!t) {
          setPhase('setup');
          return;
        }
      } else mic.stop();
      setOutcome(null);
      setPhase('running');
      setRunKey((k) => k + 1);
      window.scrollTo({ top: 0 });
    },
    [mic, patch, settings],
  );

  const onDone = useCallback(
    (round: RoundResult) => {
      mic.stop();
      if (!round.completed && round.seconds < 8) {
        setPhase('setup');
        return;
      }
      const base = { route: 'chords', params: ['trainer', ...chords.map(chordParam)], durationSec: Math.max(1, round.seconds), completed: round.completed };
      let o: Outcome;
      if (round.mode === 'minute') {
        const s = scoreOneMinute({ changes: round.changes, unclear: round.unclear, seconds: round.seconds, target, mic: round.input === 'mic' });
        const newData = round.completed ? addScore(data, today, s.perMinute) : data;
        const firstScore = round.completed && data.trend.length === 0;
        const newBest = round.completed && !firstScore && s.perMinute > data.best;
        const activity = recordActivity({
          kind: 'chord-change',
          id: skillId,
          title: `One-minute changes: ${changeTitle(chords, (x) => displaySymbol(x))}`,
          count: round.changes,
          score: s.perMinute,
          accuracy: s.accuracy,
          stars: s.stars,
          data: changeDataJson(newData),
          meta: { perMinute: s.perMinute, unclear: round.unclear },
          ...base,
        });
        o = {
          round,
          activity,
          headline: round.completed ? s.perMinute : round.changes,
          unit: round.completed ? 'clean changes in a minute' : `clean changes in ${round.seconds} s`,
          verdict: s.verdict,
          stars: s.stars,
          newBest,
          firstScore,
          details: [
            { label: `Goal ${target}`, tone: 'neutral' },
            ...(data.best > 0 ? [{ label: `Best before ${data.best}`, tone: 'neutral' as const }] : []),
            ...(s.clean !== null ? [{ label: `${Math.round(s.clean * 100)} % of strums rang true`, tone: s.clean >= 0.8 ? ('ok' as const) : ('warn' as const) }] : []),
            ...(round.unclear ? [{ label: `${round.unclear} not counted`, tone: 'warn' as const }] : []),
          ],
          next: null,
        };
      } else if (round.mode === 'timed') {
        const s = scoreInTime(round.outcomes);
        const next = nextTempo({ bpm: round.bpm, beatsPerChord: round.beats }, s.accuracy);
        const newData = round.completed ? { ...data, timed: { bpm: next.bpm, beatsPerChord: next.beatsPerChord } } : data;
        const activity = recordActivity({
          kind: 'chord-change',
          id: skillId,
          title: `Changes in time: ${changeTitle(chords, (x) => displaySymbol(x))}, ${round.bpm} BPM`,
          count: s.clean,
          accuracy: s.accuracy,
          mistakes: s.total - s.clean,
          data: changeDataJson(newData),
          meta: { bpm: round.bpm, beats: round.beats },
          ...base,
        });
        if (round.completed) patch({ bpm: next.bpm, beats: next.beatsPerChord });
        o = {
          round,
          activity,
          headline: s.clean,
          unit: `of ${s.total} changes on time`,
          verdict: next.message,
          stars: s.accuracy >= 0.95 ? 3 : s.accuracy >= 0.8 ? 2 : s.accuracy >= 0.6 ? 1 : 0,
          newBest: false,
          firstScore: false,
          details: [
            { label: `${s.clean} on time`, tone: 'ok' },
            ...(s.late ? [{ label: `${s.late} late`, tone: 'warn' as const }] : []),
            ...(s.missed ? [{ label: `${s.missed} missed`, tone: 'bad' as const }] : []),
            ...(s.wrong ? [{ label: `${s.wrong} did not ring true`, tone: 'bad' as const }] : []),
          ],
          next: round.completed ? { bpm: next.bpm, beats: next.beatsPerChord, message: next.message } : null,
        };
      } else {
        const s = scoreCheck(round.steps);
        const activity = recordActivity({
          kind: 'chord-change',
          id: skillId,
          title: `Clean chord check: ${changeTitle(chords, (x) => displaySymbol(x))}`,
          count: s.count,
          accuracy: s.accuracy,
          mistakes: round.steps.reduce((sum, x) => sum + x.failedAttempts, 0),
          ...base,
        });
        o = {
          round,
          activity,
          headline: s.firstTry,
          unit: `of ${s.count} chords rang true on the first strum`,
          verdict: s.count ? `About ${s.averageSeconds.toFixed(1)} seconds to find each chord. ${s.accuracy >= 0.75 ? 'Clean hands: try one-minute changes next.' : 'Take each shape slowly; accuracy first, speed later.'}` : 'No chords finished this time.',
          stars: s.accuracy >= 0.95 ? 3 : s.accuracy >= 0.75 ? 2 : s.accuracy >= 0.5 ? 1 : 0,
          newBest: false,
          firstScore: false,
          details: [{ label: `${s.averageSeconds.toFixed(1)} s a chord`, tone: 'info' }],
          next: null,
        };
      }
      playUi(o.newBest || o.stars >= 3 ? 'perfect' : o.stars >= 1 ? 'good' : 'tap');
      if (o.newBest || o.firstScore) setCelebrate((c) => c + 1);
      setOutcome(o);
      setPhase('results');
      window.scrollTo({ top: 0 });
    },
    [mic, chords, target, data, today, skillId, patch],
  );

  const replaceChord = (slot: number, symbol: string) => {
    const list = [...chords];
    if (slot >= list.length) list.push(symbol);
    else list[slot] = symbol;
    patch({ chords: list.slice(0, 4) });
    setPickerSlot(null);
  };
  const removeChord = (slot: number) => {
    if (chords.length <= 2) return;
    patch({ chords: chords.filter((_c, i) => i !== slot) });
  };

  // Enter starts (setup) or runs the primary next step (results).
  useShortcuts(
    {
      Enter: () => {
        if (phase === 'setup') void start();
        else if (phase === 'results' && outcome) primaryNext();
      },
    },
    phase !== 'running' && pickerSlot === null,
  );

  const primaryNext = () => {
    if (!outcome) return;
    if (outcome.round.mode === 'timed' && outcome.next) void start({ bpm: outcome.next.bpm, beats: outcome.next.beats });
    else void start();
  };

  // ------------------------------------------------------------------ running
  if (phase === 'running') {
    const common = { chords, voicings, input: settings.input, tracker: mic.tracker, onDone };
    return (
      <Page title="Chord-change trainer" hideHeader>
      <div data-trainer data-phase="running">
        {settings.mode === 'minute' && <MinuteRun key={runKey} {...common} />}
        {settings.mode === 'timed' && <TimedRun key={runKey} {...common} bpm={settings.bpm} beats={settings.beats} />}
        {settings.mode === 'check' && <CheckRun key={runKey} {...common} input="mic" />}
      </div>
      </Page>
    );
  }

  // ------------------------------------------------------------------ results
  if (phase === 'results' && outcome) {
    const mode = outcome.round.mode;
    const trendText = trendWords(data.trend);
    return (
      <Page title="Chord-change trainer" eyebrow="Round finished" back={{ to: 'chords', label: 'Chords' }}>
      <div data-trainer data-phase="results" data-score={outcome.headline}>
        <Celebration fire={celebrate} intensity={outcome.newBest ? 'medium' : 'low'} />
        <div className={styles.results}>
          <section className={styles.score} aria-live="polite">
            <Text variant="eyebrow">{title}</Text>
            {(outcome.newBest || outcome.firstScore) && (
              <div className={styles.chips}>
                {outcome.newBest && <Badge tone="streak" icon="Trophy">New personal best</Badge>}
                {outcome.firstScore && <Badge tone="info" icon="Sparkles">Your first score</Badge>}
              </div>
            )}
            <div>
              <span className={styles.scoreNumber} data-result-number>
                {outcome.headline}
              </span>{' '}
              <span className={styles.scoreUnit}>{outcome.unit}</span>
            </div>
            <StarRating value={outcome.stars} size={28} label={`${outcome.stars} of 3 stars`} />
            <Text>{outcome.verdict}</Text>
            <div className={styles.chips}>
              {outcome.details.map((d) => (
                <Badge key={d.label} tone={d.tone}>
                  {d.label}
                </Badge>
              ))}
              {outcome.activity && outcome.activity.xp > 0 && <XpChip value={outcome.activity.xp} gain />}
            </div>
            {!outcome.round.completed && <Text variant="caption" tone="muted">You stopped early, so this round counts for half.</Text>}
            <div className={styles.chips}>
              {mode === 'minute' && <Button onClick={() => void start({ mode: 'timed' })}>Try it in time</Button>}
              {mode !== 'minute' && <Button onClick={() => void start({ mode: 'minute' })}>One-minute changes</Button>}
              <Button variant="ghost" onClick={() => setPhase('setup')}>
                Change chords
              </Button>
            </div>
          </section>
          <div className={styles.column}>
            {data.trend.length > 0 && (
              <Section title="Your one-minute scores" description={trendText ?? 'One column per practice day: the day’s best.'}>
                <TrendChart trend={data.trend} target={target} today={today} />
              </Section>
            )}
            {voicings.length >= 2 && <TipsBlock chords={chords} voicings={voicings} />}
          </div>
        </div>
        <ActionBar start={touch ? undefined : <Text variant="caption" tone="muted">Enter</Text>}>
          <Button variant="primary" iconLeft="RotateCcw" onClick={primaryNext} data-again>
            {mode === 'timed' && outcome.next ? `Next round: ${outcome.next.bpm} BPM` : mode === 'check' ? 'Check again' : 'One more minute'}
          </Button>
        </ActionBar>
      </div>
      </Page>
    );
  }

  // ------------------------------------------------------------------ setup
  const pairs = suggestedPairs();
  const pairValue = chords.length === 2 ? pairs.find(([a, b]) => (a === chords[0] && b === chords[1]) || (a === chords[1] && b === chords[0]))?.join('-') ?? null : null;
  const startLabel = settings.mode === 'minute' ? 'Start one minute' : settings.mode === 'timed' ? `Start at ${settings.bpm} BPM` : 'Start checking';
  return (
    <Page title="Chord-change trainer" subtitle="Changing chords cleanly, in time, is the first wall every guitarist meets. A minute a day knocks it down." back={{ to: 'chords', label: 'Chords' }}>
    <div data-trainer data-phase="setup" data-skill={skillId}>
      <div className={styles.setup}>
        <div className={styles.column}>
          <Section title="Your chords" description="Two to four chords. Tap one to swap it.">
            <div className={styles.slots} data-slots>
              {chords.map((c, i) => (
                <div key={`${c}-${i}`} className={styles.slot}>
                  <button type="button" className={styles.slotPick} onClick={() => setPickerSlot(i)} aria-label={`${displaySymbol(c, { system: naming })}: change this chord`}>
                    <ChordDiagram voicing={voicings[i]} size="md" title={displaySymbol(c, { system: naming })} />
                    <span className={styles.slotHint}>Tap to change</span>
                  </button>
                  {chords.length > 2 && <IconButton className={styles.slotRemove} icon="X" label={`Remove ${displaySymbol(c)}`} size="sm" onClick={() => removeChord(i)} />}
                </div>
              ))}
              {chords.length < 4 && (
                <button type="button" className={styles.addSlot} onClick={() => setPickerSlot(chords.length)}>
                  <Icon name="Plus" size="lg" />
                  Add a chord
                </button>
              )}
            </div>
            <ChipGroup
              aria-label="Classic pairs"
              options={pairs.map(([a, b]) => ({ value: `${a}-${b}`, label: `${displaySymbol(a, { system: naming })} – ${displaySymbol(b, { system: naming })}` }))}
              value={pairValue}
              onChange={(v) => {
                const [a, b] = v.split('-');
                patch({ chords: [a, b] });
              }}
            />
          </Section>
          <Section title="How to practise">
            <RadioGroup<TrainerMode>
              label="Practice mode"
              hideLabel
              variant="cards"
              minCardWidth="19rem"
              value={settings.mode}
              onChange={(mode) => patch({ mode })}
              options={[
                { value: 'minute', label: 'One-minute changes', description: 'Back and forth for a minute. Count the clean changes and beat your score tomorrow.' },
                { value: 'timed', label: 'Changes in time', description: 'A click and a set number of beats per chord. The tempo follows how you do.' },
                { value: 'check', label: 'Ring-true check', description: 'With the microphone: the app waits until each chord rings clean and says which string to fix.', disabled: hostRefusesMic },
              ]}
            />
            {settings.mode !== 'check' && (
              <SegmentedControl<TrainerInput>
                aria-label="Count changes with"
                options={[
                  { value: 'tap', label: 'Count with taps', icon: 'Pointer' },
                  { value: 'mic', label: 'Microphone', icon: 'Mic', disabled: hostRefusesMic },
                ]}
                value={settings.input}
                onChange={(input) => patch({ input })}
              />
            )}
            {settings.mode === 'timed' && (
              <div className={styles.statRow}>
                <Stepper label="Tempo" unit="BPM" min={MIN_BPM} max={MAX_BPM} step={4} value={settings.bpm} onChange={(bpm) => patch({ bpm })} />
                <SegmentedControl<string>
                  aria-label="Beats per chord"
                  options={[
                    { value: '8', label: '8 beats' },
                    { value: '4', label: '4' },
                    { value: '2', label: '2' },
                    { value: '1', label: '1' },
                  ]}
                  value={String(settings.beats)}
                  onChange={(v) => patch({ beats: Number(v) })}
                />
              </div>
            )}
            {needsMic && !hostRefusesMic && (
              <Callout tone="info" label="How the microphone check works">
                {MIC_EXPLAINER}
              </Callout>
            )}
            {hostRefusesMic && <Text variant="caption" tone="muted">The microphone is switched off where this copy of the app is running, so changes are counted with taps.</Text>}
          </Section>
        </div>
        <div className={styles.column}>
          <TipsBlock chords={chords} voicings={voicings} />
          <Section title="Your one-minute scores" description={data.trend.length ? trendWords(data.trend) ?? `Best so far: ${data.best}.` : undefined}>
            {data.trend.length ? (
              <>
                <div className={styles.statRow}>
                  <Stat label="Best" value={data.best} unit="a minute" />
                  <Stat label="Goal" value={target} unit="a minute" hint="Fluent, for this change" />
                </div>
                <TrendChart trend={data.trend} target={target} today={today} />
              </>
            ) : (
              <Text tone="muted">
                No score for {title} yet. Most people start at around a third of the goal of {target} clean changes a minute, and get there within a couple of weeks of a minute a day.
              </Text>
            )}
          </Section>
        </div>
      </div>
      {mic.status === 'failed' && mic.failure && (
        <MediaBlocked
          reason={mic.failure}
          device="microphone"
          onRetry={() => void start()}
          onContinueWithout={() => {
            patch({ input: 'tap', mode: settings.mode === 'check' ? 'minute' : settings.mode });
            mic.stop();
          }}
          continueLabel="Count with taps instead"
        />
      )}
      {mic.status === 'starting' && <Banner tone="info" title="Opening the microphone…" />}
      <ActionBar start={touch ? undefined : <Text variant="caption" tone="muted">Press Enter to start</Text>}>
        <Button variant="primary" iconLeft="Play" loading={mic.status === 'starting'} onClick={() => void start()} data-start>
          {startLabel}
        </Button>
      </ActionBar>
      <ChordPicker
        open={pickerSlot !== null}
        onClose={() => setPickerSlot(null)}
        onPick={(s) => pickerSlot !== null && replaceChord(pickerSlot, s)}
        tuning={tuning}
        known={known}
        chosen={chords}
        title={pickerSlot !== null && pickerSlot < chords.length ? `Swap ${displaySymbol(chords[pickerSlot])} for…` : 'Add a chord'}
      />
    </div>
    </Page>
  );
}

/** Finger tips for the set's first change (the pair, or the first two of a longer set). */
function TipsBlock({ chords, voicings }: { chords: string[]; voicings: ReturnType<typeof defaultVoicing>[] }) {
  const { naming } = useMusicSettings();
  const isMobile = useIsMobile();
  const a = voicings[0];
  const b = voicings[1];
  const tips = useMemo(() => (a && b ? tipsForVoicings(a, b) : null), [a, b]);
  if (!tips) return null;
  return (
    <Section title="Before you start" description={`${displaySymbol(chords[0], { system: naming })} to ${displaySymbol(chords[1], { system: naming })}: what your fingers do.`}>
      <ChangePair tips={tips} size={isMobile ? 'sm' : 'md'} />
      <RingLegend anchors={tips.fromMarks.some((m) => m.role === 'anchor')} guides={tips.fromMarks.some((m) => m.role === 'guide')} />
      <Text variant="caption">{tips.tips[0]}</Text>
    </Section>
  );
}
