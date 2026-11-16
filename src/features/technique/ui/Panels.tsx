/** The pieces of an exercise screen: ladder, phone bar, take result, history, how-to-play. */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { HANDS, SKILL_GROUPS, getExercise, type TechniqueExercise } from '@/content/technique';
import { href } from '@/app/router';
import type { ActivityResult } from '@/core/progress';
import {
  Button,
  Callout,
  Card,
  Heading,
  Icon,
  IconButton,
  Kbd,
  LinkButton,
  MediaBlocked,
  Meter,
  ProgressRing,
  Section,
  Sheet,
  Stat,
  StarRating,
  Stepper,
  Switch,
  Text,
  Tooltip,
  cx,
  focusRing,
} from '@/ui';
import type { InputLevel, TakeListener } from '../engine/listen';
import type { TechniqueRecord } from '../model/history';
import { climbs, ladderFraction, MAX_TEMPO, MIN_TEMPO, rungCount, rungOf } from '../model/ladder';
import type { Verdict } from '../model/takes';
import styles from '../Technique.module.css';
import type { ExerciseState, TakeView } from './useExercise';

/** Words, icon and class for a verdict: never colour alone. */
export const VERDICT: Record<Verdict, { word: string; icon: string; tone: string }> = {
  clean: { word: 'Clean', icon: 'CircleCheck', tone: styles.toneClean },
  close: { word: 'Nearly', icon: 'CircleDot', tone: styles.toneClose },
  'not-yet': { word: 'Not yet', icon: 'CircleAlert', tone: styles.toneNot },
};

/** "Picking hand · Alternate picking · Level 2". */
export function exerciseEyebrow(e: TechniqueExercise): string {
  const hand = HANDS.find((h) => h.id === e.hand)?.name ?? '';
  const group = SKILL_GROUPS.find((g) => g.id === e.skill)?.name ?? '';
  return `${hand} · ${group} · Level ${e.level}`;
}

/** The main control's label. */
export function primaryLabel(x: ExerciseState): string {
  if (x.mode === 'take') return x.analysing ? 'Listening back' : 'Stop the take';
  if (x.mode === 'practice') return 'Stop';
  return x.micWanted ? `Start a take at ${x.tempo} BPM` : `Start at ${x.tempo} BPM`;
}

/** Start or stop, whichever applies. */
export function togglePrimary(x: ExerciseState): void {
  if (x.mode === 'practice' || x.mode === 'take' || x.mode === 'demo') x.stop();
  else if (x.micWanted) void x.startTake();
  else x.startPractice();
}

/** The rungs of the ladder, with the best clean tempo and the tempo now. */
export function Rungs({ e, tempo, best, middle }: { e: TechniqueExercise; tempo: number; best: number | null; middle?: string }) {
  if (!climbs(e.tempo)) {
    return (
      <Text size="sm" tone="muted">
        A fixed tempo: {e.tempo.start} BPM. Clean takes count, not speed.
      </Text>
    );
  }
  const n = rungCount(e.tempo);
  const now = rungOf(e.tempo, tempo);
  const bestRung = best === null ? -1 : rungOf(e.tempo, best);
  return (
    <div>
      <div className={styles.rungs} role="img" aria-label={`Tempo ladder from ${e.tempo.start} to ${e.tempo.goal} BPM in steps of ${e.tempo.step}. ${best !== null ? `Best clean: ${best} BPM.` : 'No clean pass yet.'} Now: ${tempo} BPM.`}>
        {Array.from({ length: n }, (_, i) => (
          <span key={i} className={styles.rung} data-done={i <= bestRung} data-now={i === now} />
        ))}
      </div>
      <div className={styles.rungLabels} aria-hidden="true">
        <span>Start {e.tempo.start}</span>
        <span>{middle ?? (best !== null ? `Best ${best}` : 'No clean pass yet')}</span>
        <span>Goal {e.tempo.goal}</span>
      </div>
    </div>
  );
}

/** Count-in dots while the bar before the music clicks. */
export function CountIn({ countIn }: { countIn: { beat: number; beats: number } | null }) {
  if (!countIn) return null;
  return (
    <div className={styles.countIn} aria-hidden="true">
      {Array.from({ length: countIn.beats }, (_, i) => (
        <span key={i} className={styles.countDot} data-on={i <= countIn.beat} />
      ))}
    </div>
  );
}

/** What the last pass did, in words. */
export function PassNote({ x }: { x: ExerciseState }) {
  const n = x.take ? null : x.note;
  return (
    <div aria-live="polite" data-technique-note={n ? n.verdict : ''}>
      {n && (
        <div className={styles.passNote} data-verdict={n.verdict}>
          <span className={cx(styles.passNoteIcon, VERDICT[n.verdict].tone)}>
            <Icon name={n.move === 'up' || n.move === 'goal' ? 'TrendingUp' : VERDICT[n.verdict].icon} size="sm" />
          </span>
          <span>{n.text}</span>
        </div>
      )}
    </div>
  );
}

/** The microphone switch, its state and the live level. */
export function MicControls({ x }: { x: ExerciseState }) {
  const c = x.part.check;
  if (c.kind === 'none') {
    return (
      <Text size="sm" tone="muted">
        <Icon name="MicOff" size="xs" /> {c.why}
      </Text>
    );
  }
  const busy = x.mode !== 'idle';
  return (
    <div className={styles.micRow}>
      <Switch
        label="Check me with the microphone"
        description={c.kind === 'notes' ? 'One take: notes and evenness.' : c.kind === 'onsets' ? 'One take: the timing of every stroke.' : c.kind === 'level' ? 'One take: the level of every bar.' : c.kind === 'vibrato' ? 'One take: speed, width and evenness of the vibrato.' : 'One take: the pitch you bend to.'}
        checked={x.micWanted}
        onChange={x.setMicWanted}
        disabled={busy}
      />
      {x.micWanted && (c.kind === 'onsets' || c.kind === 'notes') && (
        <Switch label="Click during the take" description={x.takeClick ? 'Use headphones so the microphone hears only you.' : 'The click stops after the count-in, so the microphone hears only you.'} checked={x.takeClick} onChange={x.setTakeClick} disabled={busy} />
      )}
      {x.micWanted && c.kind === 'bend' && c.alone && (
        <Text size="sm" tone="muted">
          {c.alone}
        </Text>
      )}
      {x.micWanted && x.mic.kind === 'blocked' && (
        <MediaBlocked reason={x.mic.reason} device="microphone" align="start" level={4} onRetry={() => void x.openMic()} onContinueWithout={() => x.setMicWanted(false)} continueLabel="Judge it by ear instead" />
      )}
      {x.micWanted && x.mic.kind === 'ready' && <MicLevel listener={x.listener} />}
    </div>
  );
}

/**
 * The live microphone level. It listens to the microphone itself (about 30 readings a second), so
 * only the meter re-renders, never the whole screen.
 */
function MicLevel({ listener }: { listener: TakeListener }) {
  const [level, setLevel] = useState<InputLevel | null>(null);
  useEffect(() => listener.onLevel((l) => setLevel((prev) => (prev && Math.abs(prev.db - l.db) < 1.5 && prev.clipping === l.clipping ? prev : l))), [listener]);
  if (!level) return null;
  return (
    <div className={styles.meterRow}>
      <Meter label="Microphone level" value={Math.max(0, Math.min(1, (level.db + 70) / 70))} low={Math.max(0, (level.gateDb + 70) / 70)} tone={level.clipping ? 'warn' : 'ok'} segments={12} />
      <Text size="xs" tone="muted">
        {level.clipping ? 'Too loud: move back a little' : level.db < level.gateDb ? 'Listening' : 'Hearing you'}
      </Text>
    </div>
  );
}

/** The ladder card: tempo, rungs, the controls (unless the phone bar has them), switches. */
export function LadderPanel({ x, e, withControls }: { x: ExerciseState; e: TechniqueExercise; withControls: boolean }) {
  const idle = x.mode === 'idle';
  const even = x.part.pulse === 'eighth';
  const step = even ? 2 : 1;
  return (
    <Card padding="lg" className={styles.ladder} data-technique-ladder="">
      <div className={styles.tempoRow}>
        <div>
          <Text variant="eyebrow">{x.mode === 'take' ? 'Take' : x.mode === 'practice' ? 'Practising' : 'Tempo ladder'}</Text>
          <div className={styles.tempoValue} aria-live="polite">
            <span className={styles.tempoNumber} data-technique-tempo={x.tempo}>
              {x.tempo}
            </span>
            <span className={styles.tempoUnit}>{even ? 'eighths per minute' : 'BPM'}</span>
          </div>
        </div>
        <Stepper label="Tempo" hideLabel value={x.tempo} onChange={x.setTempo} min={MIN_TEMPO} max={MAX_TEMPO} step={step} largeStep={e.tempo.step || 4} unit={even ? '♪/min' : 'BPM'} disabled={x.mode === 'take'} />
      </div>
      <Rungs e={e} tempo={x.tempo} best={x.best} />
      <CountIn countIn={x.countIn} />
      {withControls && (
        <>
          <Tooltip content={<>Start or stop <Kbd>Space</Kbd></>}>
            <Button variant="primary" size="lg" fullWidth iconLeft={idle ? (x.micWanted ? 'Mic' : 'Play') : 'Square'} onClick={() => togglePrimary(x)} loading={x.analysing} data-technique-primary="">
              {primaryLabel(x)}
            </Button>
          </Tooltip>
          {!x.micWanted && (
            <div className={styles.ladderButtons}>
              <Tooltip content={<>Not clean yet <Kbd>N</Kbd></>}>
                <Button iconLeft="RotateCcw" onClick={x.notYet} disabled={x.mode === 'take'} data-technique-notyet="">
                  Not yet
                </Button>
              </Tooltip>
              <Tooltip content={<>That was clean <Kbd>Enter</Kbd></>}>
                <Button iconLeft={climbs(e.tempo) && x.tempo < e.tempo.goal ? 'TrendingUp' : 'Check'} onClick={x.clean} disabled={x.mode === 'take'} data-technique-clean="">
                  Clean
                </Button>
              </Tooltip>
            </div>
          )}
        </>
      )}
      <PassNote x={x} />
      {x.take && <TakeResult take={x.take} onPlayBack={x.playBack} onClose={x.clearTake} move={x.note && x.note.move !== 'fixed' ? x.note.text : undefined} />}
      <div className={styles.switches}>
        <Switch label="Guitar plays along" description="Hear the part with the click while you practise." checked={x.guide} onChange={x.setGuide} disabled={x.mode === 'take'} />
        <MicControls x={x} />
      </div>
      {!withControls && (
        <Button variant="ghost" iconLeft="Check" onClick={() => x.finish()} data-technique-finish="">
          Finish and save this session
        </Button>
      )}
      {withControls && (
        <div className={styles.keys} aria-hidden="true">
          <span>
            <Kbd>Space</Kbd> start, stop
          </span>
          <span>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> tempo
          </span>
          {!x.micWanted && (
            <span>
              <Kbd>Enter</Kbd> clean <Kbd>N</Kbd> not yet
            </span>
          )}
        </div>
      )}
    </Card>
  );
}

/** The phone's bottom bar content: tempo and the main controls under the thumb. */
export function PhoneBarStart({ x }: { x: ExerciseState }) {
  if (x.mode === 'practice') return <IconButton icon="Square" label="Stop (Space)" variant="secondary" onClick={x.stop} />;
  const even = x.part.pulse === 'eighth';
  return (
    <div className={styles.barTempo}>
      <IconButton icon="Minus" label="Slower" onClick={() => x.nudge(-1)} disabled={x.mode === 'take' || x.tempo <= MIN_TEMPO} />
      <span className={styles.barTempoValue} aria-live="polite">
        {x.tempo}
        <small>{even ? '♪/min' : 'BPM'}</small>
      </span>
      <IconButton icon="Plus" label="Faster" onClick={() => x.nudge(1)} disabled={x.mode === 'take' || x.tempo >= MAX_TEMPO} />
    </div>
  );
}

/** The phone's bottom bar buttons. */
export function PhoneBarActions({ x }: { x: ExerciseState }) {
  if (x.mode === 'practice' && !x.micWanted) {
    return (
      <div className={styles.barActions}>
        <Button onClick={x.notYet} iconLeft="RotateCcw" data-technique-notyet="">
          Not yet
        </Button>
        <Button variant="primary" onClick={x.clean} iconLeft="Check" data-technique-clean="">
          Clean
        </Button>
      </div>
    );
  }
  const idle = x.mode === 'idle';
  return (
    <div className={styles.barActions}>
      <Button variant="primary" iconLeft={idle ? (x.micWanted ? 'Mic' : 'Play') : 'Square'} onClick={() => togglePrimary(x)} loading={x.analysing} data-technique-primary="">
        {idle ? (x.micWanted ? 'Start a take' : 'Start') : primaryLabel(x)}
      </Button>
    </div>
  );
}

/** The result of the last microphone take. */
export function TakeResult({ take, onPlayBack, onClose, move }: { take: TakeView; onPlayBack: () => void; onClose: () => void; move?: string }) {
  const v = VERDICT[take.verdict];
  const maxDb = take.bars?.length ? Math.max(...take.bars) : 0;
  const minDb = take.bars?.length ? Math.min(...take.bars) : 0;
  return (
    <div className={styles.take} data-technique-take={take.verdict} data-technique-take-kind={take.kind} data-click-offset={take.click ? take.click.offsetMs : undefined} data-click={take.click ? take.click.keeping : undefined} aria-live="polite">
      <div className={styles.takeHead}>
        {take.score !== null && (
          <ProgressRing value={take.score} max={100} size={64} tone={take.verdict === 'clean' ? 'ok' : take.verdict === 'close' ? 'info' : 'warn'} label={`Score ${take.score} of 100`}>
            <Text weight="bold" tabular>
              {take.score}
            </Text>
          </ProgressRing>
        )}
        <div>
          <span className={cx(styles.takeVerdict, v.tone)}>
            <Icon name={v.icon} size="sm" /> {v.word} at {take.tempo} BPM
          </span>
          <Text>{take.headline}</Text>
        </div>
      </div>
      {take.details.length > 0 && (
        <ul className={styles.takeDetails}>
          {take.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
      {take.bars && take.bars.length > 0 && (
        <div className={styles.levelBars} role="img" aria-label={`Level per bar: ${take.bars.map((b) => `${Math.round(b)} dB`).join(', ')}`}>
          {take.bars.map((b, i) => (
            <div key={i} className={styles.levelBar}>
              <div className={styles.levelFill} style={{ height: `${maxDb > minDb ? 15 + (85 * (b - minDb)) / (maxDb - minDb) : 50}%` }} />
              <span>{i + 1}</span>
            </div>
          ))}
        </div>
      )}
      {move && (
        <Text size="sm" weight="bold">
          {move}
        </Text>
      )}
      <div className={styles.todayLinks}>
        {take.heard.length > 0 && (
          <Button iconLeft="Volume2" size="sm" onClick={onPlayBack}>
            Hear what I played
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onClose}>
          Hide
        </Button>
      </div>
    </div>
  );
}

/** The best clean tempo per session, newest on the right, with the goal as a line. */
export function History({ e, record }: { e: TechniqueExercise; record: TechniqueRecord }) {
  const entries = record.log.slice(-14);
  const top = Math.max(e.tempo.goal, ...entries.map((s) => s.t), 1);
  const floor = Math.max(0, e.tempo.start - (e.tempo.step || 10) * 2);
  const h = (t: number): number => (t <= 0 ? 6 : 10 + (90 * (t - floor)) / Math.max(1, top - floor));
  return (
    <Section title="Your history" level={3} description={record.best !== null ? undefined : 'Your best clean tempo per session will show here.'}>
      <div className={styles.summaryStats}>
        <Stat label="Best clean" value={record.best ?? '–'} unit={record.best !== null ? 'BPM' : undefined} hint={record.bestDay ? `on ${record.bestDay}` : undefined} />
        <Stat label="Goal" value={e.tempo.goal} unit="BPM" hint={climbs(e.tempo) ? `${Math.round(ladderFraction(e.tempo, record.best) * 100)}% of the way` : 'fixed tempo'} />
        <Stat label="Sessions" value={record.log.length} />
      </div>
      {entries.length > 0 && (
        <>
          <div className={styles.chartGoal}>
            <div className={styles.chart} role="img" aria-label={`Best clean tempo in your last ${entries.length} sessions: ${entries.map((s) => (s.t ? `${s.d} ${s.t} BPM` : `${s.d} none`)).join('; ')}`}>
              {entries.map((s, i) => (
                <span key={`${s.d}-${i}`} className={styles.chartBar} data-empty={s.t <= 0} style={{ height: `${h(s.t)}%` }} />
              ))}
            </div>
            <span className={styles.chartLine} style={{ bottom: `${h(e.tempo.goal)}%` }} aria-hidden="true" />
          </div>
          <div className={styles.chartLegend} aria-hidden="true">
            <span>{entries[0].d}</span>
            <span>dashed line: goal {e.tempo.goal} BPM</span>
            <span>{entries[entries.length - 1].d}</span>
          </div>
        </>
      )}
    </Section>
  );
}

/** How to play it, what it should feel like, what to watch for. */
export function Coaching({ e }: { e: TechniqueExercise }) {
  return (
    <>
      <Section title="How to play it" level={3}>
        <ol className={styles.steps}>
          {e.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <Callout label="When it is right" tone="tip">
          {e.feel}
        </Callout>
      </Section>
      <Section title="Watch for" level={3}>
        <ul className={styles.mistakes}>
          {e.mistakes.map((m) => (
            <li key={m.watch} className={styles.mistake}>
              <span className={styles.mistakeWatch}>{m.watch}</span>
              <Text tone="muted" size="sm">
                {m.fix}
              </Text>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

/** The next exercise in the same group, or the next one up. */
export function nextExercise(e: TechniqueExercise, all: readonly TechniqueExercise[]): TechniqueExercise | null {
  const same = all.filter((x) => x.skill === e.skill);
  const i = same.findIndex((x) => x.id === e.id);
  if (i >= 0 && i + 1 < same.length) return same[i + 1];
  const k = all.findIndex((x) => x.id === e.id);
  return all.slice(k + 1).find((x) => x.mode === 'ladder') ?? null;
}

/** The end-of-session sheet: what was saved and what to do next. */
export function SummarySheet({ e, result, record, next, onClose, extra }: { e: TechniqueExercise; result: ActivityResult | null; record: TechniqueRecord; next: TechniqueExercise | null; onClose: () => void; extra?: ReactNode }) {
  const coolDown = useMemo(() => getExercise('tech-cool-down'), []);
  return (
    <Sheet
      open={result !== null}
      onClose={onClose}
      title="Session saved"
      description={e.title}
      footer={
        <>
          <Button onClick={onClose}>Keep practising</Button>
          {next ? (
            <LinkButton variant="primary" to="technique" params={[next.id]} iconRight="ArrowRight" onClick={onClose}>
              Next: {next.title}
            </LinkButton>
          ) : (
            <LinkButton variant="primary" to="technique" onClick={onClose}>
              All exercises
            </LinkButton>
          )}
        </>
      }
    >
      {result && (
        <div className={styles.summary} data-technique-summary="">
          <div className={styles.summaryStats}>
            <Stat label="Experience" value={`+${result.xp}`} unit="XP" />
            <Stat label="Best clean" value={record.best ?? '–'} unit={record.best !== null ? 'BPM' : undefined} hint={result.skill?.newBest ? 'a new best' : undefined} />
            <div>
              <Text variant="label">Stars</Text>
              <StarRating value={result.skill?.stars ?? 0} size={22} animate />
            </div>
          </div>
          {extra}
          {coolDown && e.id !== coolDown.id && (
            <Text tone="muted" size="sm">
              Finishing for today? Two minutes of{' '}
              <a className={cx(styles.inlineLink, focusRing)} href={href('technique', coolDown.id)} onClick={onClose}>
                cool-down
              </a>{' '}
              keep your hands happy.
            </Text>
          )}
          <Heading level={3} size="md">
            Up next
          </Heading>
          <Text tone="muted">{next ? next.summary : 'Pick any exercise from the list, or come back tomorrow and climb the ladder again.'}</Text>
        </div>
      )}
    </Sheet>
  );
}
