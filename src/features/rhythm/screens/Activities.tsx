import { useMemo, useState } from 'react';
import { getProgress } from '@/core/progress';
import { Switch, Text } from '@/ui';
import { SUBDIVISIONS, clockChart, findOneChart, offbeatChart, pulseChart, readChart, switchChart, switchSequence, type Subdivision } from '../core/charts';
import { generateRound, seededRandom, type ReadLevel } from '../core/generate';
import { skillId, type BeatLevel, type ClockLevel, type Drill } from '../core/ladder';
import { formatMs } from '../core/scoring';
import { BeatLane } from '../ui/BeatLane';
import { useRhythmPrefs } from '../ui/prefs';
import { ReadReview, ReadStage } from '../ui/ReadStage';
import { RoundScreen, type DisplayContext } from '../ui/RoundScreen';
import { lastTempo, type Round } from '../ui/useRound';
import styles from '../ui/Rhythm.module.css';

/** How many times a skill has been attempted: the seed of its next round, so every visit is new and repeatable. */
function attemptsOf(skill: string): number {
  return getProgress().skills[skill]?.attempts ?? 0;
}

const lane = (ctx: DisplayContext, counts = true) => (
  <BeatLane chart={ctx.round.chart} session={ctx.preview ? null : ctx.round.session} marks={ctx.round.marks} judgements={ctx.round.judgements} counts={counts && ctx.prefs.counts} reduced={ctx.reduced} />
);

/** Feel the beat: tap along with a click. */
export function BeatScreen({ level }: { level: BeatLevel }) {
  const [bpm, setBpm] = useState(() => lastTempo(skillId('beat', level.id), level.bpm, 40, 208));
  const chart = useMemo(() => pulseChart({ meter: level.meter, bpm, bars: level.bars, hit: level.hit }), [level, bpm]);
  return (
    <RoundScreen
      activity="beat"
      skill={skillId('beat', level.id)}
      params={['beat', String(level.id)]}
      eyebrow={`Feel the beat · Level ${level.id}`}
      title={level.title}
      subtitle={level.blurb}
      teach={level.teach}
      back={{ params: ['beat'], label: 'Feel the beat' }}
      chart={chart}
      bpm={bpm}
      onBpm={setBpm}
      bpmMin={40}
      bpmMax={208}
      display={(ctx) => lane(ctx)}
      hasCounts
      idleHint={level.hit === 'all' ? 'Tap with every click' : level.hit === 'backbeat' ? 'Tap on 2 and 4' : 'Tap on beat 1'}
    />
  );
}

/** Read and tap: rhythms in notation, level by level. */
export function ReadScreen({ level }: { level: ReadLevel }) {
  const skill = skillId('read', level.id);
  const [prefs, setPrefs] = useRhythmPrefs();
  const bpmMax = level.meter === '6/8' ? 96 : 160;
  const [bpm, setBpm] = useState(() => lastTempo(skill, level.bpm, 40, bpmMax));
  const [seed, setSeed] = useState(() => attemptsOf(skill));
  const phrases = useMemo(() => generateRound(level, seed), [level, seed]);
  const chart = useMemo(() => readChart(phrases, { bpm, echo: prefs.echo }), [phrases, bpm, prefs.echo]);
  const dense = level.allowed.notes.includes('s');
  const echoSwitch = <Switch checked={prefs.echo} onChange={(v) => setPrefs({ echo: v })} label="Hear it first" description="Each rhythm is played once before your turn." />;
  return (
    <RoundScreen
      activity="read"
      skill={skill}
      params={['read', String(level.id)]}
      eyebrow={`Read and tap · Level ${level.id}`}
      title={level.title}
      subtitle={level.blurb}
      teach={level.teach}
      back={{ params: ['read'], label: 'Read and tap' }}
      chart={chart}
      bpm={bpm}
      onBpm={setBpm}
      bpmMin={40}
      bpmMax={bpmMax}
      padMode={dense ? 'hands' : 'single'}
      display={(ctx) => <ReadStage ctx={ctx} phrases={phrases} />}
      quick={echoSwitch}
      hasCounts
      // A round that went well earns new rhythms; one that did not gets the same ones again.
      onAgain={(round: Round) => {
        if ((round.result?.stats.stars ?? 0) >= 1) setSeed((s) => s + 1);
      }}
      review={(round) => <ReadReview chart={round.chart} phrases={phrases} marks={round.marks} counts={prefs.counts} />}
      idleHint="Tap each note as the line reaches it"
    />
  );
}

/** The cue card of the switch drill: what to tap now, how to count it, and what comes next. */
function SwitchCue({ ctx, sequence }: { ctx: DisplayContext; sequence: readonly Subdivision[] }) {
  const { round, preview } = ctx;
  const seg = round.segment;
  // During the count-in the first cue is already on show.
  const index = preview || !seg ? 0 : seg.kind === 'count' ? 0 : Math.min(sequence.length - 1, seg.phrase);
  const now = SUBDIVISIONS[sequence[index]];
  const next = index + 1 < sequence.length ? SUBDIVISIONS[sequence[index + 1]] : null;
  return (
    <div className={styles.switchStage}>
      <div className={styles.switchCard} data-sub={sequence[index]}>
        <Text variant="eyebrow">
          Bar {index + 1} of {sequence.length}
        </Text>
        <p className={styles.switchName} key={index}>
          {now.name}
        </p>
        <p className={styles.switchSay}>{now.say}</p>
        <Text tone="muted" size="sm">
          {next ? `Next: ${next.name}` : 'Last bar'}
        </Text>
      </div>
      {lane(ctx)}
    </div>
  );
}

/** Subdivision and counting drills. */
export function DrillScreen({ drill }: { drill: Drill }) {
  const skill = skillId('drill', drill.id);
  const bpmMax = drill.kind === 'switch' ? 120 : 160;
  const [bpm, setBpm] = useState(() => lastTempo(skill, drill.bpm, 40, bpmMax));
  const [seed, setSeed] = useState(() => attemptsOf(skill));
  const sequence = useMemo(() => (drill.kind === 'switch' ? switchSequence(drill.pool, drill.bars, seededRandom(seed * 13 + 7)) : []), [drill, seed]);
  const chart = useMemo(() => {
    if (drill.kind === 'switch') return switchChart({ bpm, sequence });
    if (drill.kind === 'offbeat') return offbeatChart({ bpm, bars: drill.bars, part: drill.part });
    return findOneChart({ meter: drill.meter, bpm, guided: drill.guided, blind: drill.blind });
  }, [drill, bpm, sequence]);
  const fast = drill.kind === 'switch' && drill.pool.some((s) => s === 'sixteenth' || s === 'triplet');
  return (
    <RoundScreen
      activity="drill"
      skill={skill}
      params={['drill', drill.id]}
      eyebrow={drill.kind === 'switch' ? 'Drill · Switch on cue' : drill.kind === 'offbeat' ? 'Drill · Off-beats' : `Drill · Find beat one · ${drill.meter}`}
      title={drill.title}
      subtitle={drill.blurb}
      teach={drill.teach}
      back={{ params: ['drill'], label: 'Drills' }}
      chart={chart}
      bpm={bpm}
      onBpm={setBpm}
      bpmMin={40}
      bpmMax={bpmMax}
      padMode={fast ? 'hands' : 'single'}
      display={(ctx) => (drill.kind === 'switch' ? <SwitchCue ctx={ctx} sequence={sequence} /> : lane(ctx))}
      hasCounts
      onAgain={() => setSeed((s) => s + 1)}
      idleHint={drill.kind === 'offbeat' ? 'Tap between the clicks' : drill.kind === 'one' ? 'Tap only on beat 1' : 'Tap what the card says'}
    />
  );
}

/** After an inner-clock round: how far the learner had drifted at the end of each silence. */
function ClockReview({ round }: { round: Round }) {
  const chart = round.chart;
  const rows = chart.segments
    .filter((seg) => seg.silent)
    .map((seg, i) => {
      const errors = chart.targets
        .filter((t) => t.seg === seg.index)
        .map((t) => round.marks.get(t.id))
        .filter((j) => j && j.verdict !== 'miss')
        .map((j) => j!.errorMs);
      const last = errors.length ? errors[errors.length - 1] : null;
      return { n: i + 1, bars: seg.bars, hits: errors.length, last };
    });
  if (!rows.length) return null;
  return (
    <section className={styles.review} aria-label="When the click came back">
      <Text variant="eyebrow">When the click came back</Text>
      <ul className={styles.clockRows}>
        {rows.map((row) => (
          <li key={row.n}>
            <span>
              Silence {row.n} ({row.bars} {row.bars === 1 ? 'bar' : 'bars'})
            </span>
            <strong>{row.last === null ? 'no taps' : `you were ${formatMs(row.last)}`}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Inner clock: the click drops out and comes back. */
export function ClockScreen({ level }: { level: ClockLevel }) {
  const [bpm, setBpm] = useState(() => lastTempo(skillId('clock', level.id), level.bpm, 40, 160));
  const chart = useMemo(() => clockChart({ bpm, on: level.on, off: level.off, cycles: level.cycles }), [level, bpm]);
  return (
    <RoundScreen
      activity="clock"
      skill={skillId('clock', level.id)}
      params={['clock', String(level.id)]}
      eyebrow={`Inner clock · Level ${level.id}`}
      title={level.title}
      subtitle={level.blurb}
      teach="Tap every beat. After a while the click goes silent: keep tapping at exactly the same speed. When it comes back, you will see how far you drifted."
      back={{ params: ['clock'], label: 'Inner clock' }}
      chart={chart}
      bpm={bpm}
      onBpm={setBpm}
      bpmMin={40}
      bpmMax={160}
      display={(ctx) => lane(ctx, false)}
      innerClock
      review={(round) => <ClockReview round={round} />}
      idleHint="Tap every beat, click or no click"
    />
  );
}
