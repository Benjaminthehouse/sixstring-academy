import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { navigate } from '@/app/router';
import { useImmersive, useScreenTitle } from '@/app/shell';
import { MediaBlocked, ActionBar, Banner, Button, Heading, Icon, IconButton, Kbd, Page, PlayButton, ProgressBar, Section, StarRating, Tag, Text, cx, useEventListener, useMediaQuery, useWakeLock } from '@/ui';
import { useProgress } from '@/core/progress';
import { isArtifact } from '@/core/platform';
import { formatChord, formatNote, midiToNote } from '@/core/theory';
import { readRecord, weakSpots } from '../core/adapt';
import { newInLevel } from '../core/drills';
import { drillSkillId, levelSkillId, levelStatuses, stepAfter } from '../core/progress';
import { makeRng } from '../core/rng';
import type { ChoiceQuestion, DrillDef, LevelDef, OptionInfo, Question } from '../core/types';
import { ANSWER_KEYS, AnswerPad } from './AnswerPad';
import { NoteRow, NoteSlots } from './NoteRow';
import { SoundSheet } from './SoundSheet';
import { SoundStatus, useSoundProblem } from './SoundStatus';
import { Summary } from './Summary';
import { useEarRound, type EarRoundApi } from './useEarRound';
import { useEarSettings } from './useEarSettings';
import { useMicNotes } from './useMicNotes';
import styles from './Ear.module.css';

/** Props of {@link RoundScreen}. */
export interface RoundScreenProps {
  drill: DrillDef;
  level: LevelDef;
}

/** "P4 (perfect 4th)", "1 (do)", or just "Higher" when the name only repeats the label. */
function answerPhrase(info: OptionInfo): string {
  if (!info.name.toLowerCase().startsWith(info.label.toLowerCase())) return `${info.label} (${info.name})`;
  return info.detail && info.detail.length <= 5 && info.detail !== info.label ? `${info.label} (${info.detail})` : info.label;
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) || !!el.closest('[role="dialog"]');
}

/** A level of a drill: intro, a round of questions, summary. Route `#ear--<drill>--<level>`. */
export function RoundScreen({ drill, level }: RoundScreenProps) {
  const [settings, setSettings] = useEarSettings();
  const api = useEarRound(drill, level, settings);
  const problem = useSoundProblem();
  const [sheet, setSheet] = useState(false);
  const skills = useProgress((s) => s.skills);
  const inRound = api.phase === 'asking' || api.phase === 'answered';
  useImmersive(inRound, 'focus');
  useWakeLock(inRound);
  useScreenTitle(`${drill.title}: ${level.title}`);
  // Each phase is a new screen: start it at the top (the summary would otherwise open scrolled down).
  useEffect(() => {
    if (api.phase !== 'answered') window.scrollTo({ top: 0 });
  }, [api.phase]);

  const status = levelStatuses(drill, skills)[level.n - 1];
  const next = useMemo(() => (api.phase === 'summary' ? stepAfter(drill.id, level.n, skills) : null), [api.phase, drill.id, level.n, skills]);

  const endRound = () => {
    api.end();
    navigate('ear', drill.id);
  };

  useEventListener(typeof window === 'undefined' ? null : window, 'keydown', (e: KeyboardEvent) => {
    if (sheet || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
    const q = api.question;
    // Escape leaves a round, as the X does (and as every other game round in the app).
    if (e.key === 'Escape' && inRound) {
      e.preventDefault();
      endRound();
      return;
    }
    if (api.phase === 'summary') {
      // Enter takes the summary's main step, unless a control has focus (it handles Enter itself).
      const onControl = !!(e.target as HTMLElement | null)?.closest?.('a, button');
      if (e.key === 'Enter' && !onControl) {
        e.preventDefault();
        if (api.outcome?.score.passed && next) navigate('ear', next.drill, String(next.level));
        else api.start();
      }
      return;
    }
    if (api.phase === 'intro') {
      if (e.key === 'Enter') {
        e.preventDefault();
        api.start();
      }
      return;
    }
    if (!inRound || !q) return;
    if (e.key === ' ') {
      e.preventDefault();
      api.replay('normal');
      return;
    }
    if (e.key === 'Enter') {
      if (api.phase === 'answered') {
        e.preventDefault();
        api.next();
      }
      return;
    }
    if (api.phase !== 'asking') return;
    if (e.key === 'Backspace' && q.kind === 'sequence') {
      e.preventDefault();
      api.undo();
      return;
    }
    const i = ANSWER_KEYS.indexOf(e.key as (typeof ANSWER_KEYS)[number]);
    if (i < 0) return;
    if (q.kind === 'choice' && q.options[i]) {
      e.preventDefault();
      api.submit(q.options[i].id);
    } else if (q.kind === 'sequence' && q.keys[i]) {
      e.preventDefault();
      api.tapKey(q.keys[i].id);
    }
  });

  const sheetEl = <SoundSheet open={sheet} onClose={() => setSheet(false)} settings={settings} onChange={setSettings} drill={drill.id} />;

  if (api.phase === 'summary' && api.outcome && api.round) {
    return (
      <Page title={`${drill.title}: ${level.title}`} eyebrow={`Level ${level.n} of ${drill.levels.length} · round complete`} back={{ to: 'ear', params: [drill.id], label: drill.title }}>
        <Summary drill={drill} level={level} round={api.round} outcome={api.outcome} next={next} onAgain={api.start} />
      </Page>
    );
  }

  if (api.phase === 'intro' || !api.question) {
    return (
      <>
        <Intro drill={drill} level={level} api={api} best={status} onSettings={() => setSheet(true)} problem={problem} aids={settings.aids} />
        {sheetEl}
      </>
    );
  }

  return (
    <Page title={`${drill.title}: ${level.title}`} hideHeader>
      <Asking drill={drill} level={level} api={api} question={api.question} showNames={settings.showFirstNote} aids={settings.aids} problem={problem} onEnd={endRound} onSettings={() => setSheet(true)} />
      {sheetEl}
    </Page>
  );
}

/** The level's intro: what you will hear (tap to hear each), your record, and Start. */
function Intro({ drill, level, api, best, onSettings, problem, aids }: { drill: DrillDef; level: LevelDef; api: EarRoundApi; best: { best: number; stars: number; completions: number; unlocked: boolean }; onSettings: () => void; problem: ReturnType<typeof useSoundProblem>; aids: boolean }) {
  const [settings] = useEarSettings();
  const record = useProgress((s) => s.skills[drillSkillId(drill.id)]?.data);
  const weak = useMemo(() => weakSpots(drill, readRecord(record), { pool: level.pool, limit: 2 }), [drill, record, level.pool]);
  // One example question gives every option's sound on the same root: "hear each one".
  const example = useMemo<Question>(() => level.make({ rng: makeRng(level.n * 7919 + 17), answer: level.pool[0], settings, difficulty: 0.25, index: 0, seed: 1 }), [level, settings]);
  const fresh = new Set(newInLevel(drill, level.n));
  const options: Array<OptionInfo & { plan?: Question['plan'] }> =
    example.kind === 'choice' ? example.options : example.keys.map((k) => ({ id: k.id, label: k.label, name: k.sub, detail: k.sub, plan: { events: [{ at: 0, midis: [k.midi], dur: 1, strike: 'pluck', role: 'subject' }], length: 0.8 } }));
  const locked = !best.unlocked;

  return (
    <Page
      title={level.title}
      eyebrow={`${drill.title} · Level ${level.n} of ${drill.levels.length}`}
      subtitle={example.prompt}
      back={{ to: 'ear', params: [drill.id], label: drill.title }}
    >
      <div className={styles.intro} data-ear-intro>
        <div className={styles.hubMain}>
          {/* "Start round" is itself the tap that starts sound, so only a lasting problem is worth a banner here. */}
          <SoundStatus problem={problem === 'locked' ? null : problem} />
          {locked && (
            <Banner tone="tip" icon="Lock" title="Skipping ahead">
              This level opens once the one before it is passed. Get {Math.ceil(level.questions * 0.8)} of {level.questions} right here and every level below it opens too.
            </Banner>
          )}
          <Section title={example.kind === 'sequence' ? 'The notes you will use' : `${options.length} choices`} description={example.kind === 'sequence' ? 'Each melody starts on 1 (do). Tap a note to hear it.' : 'Tap one to hear it before you start.'}>
            <div className={styles.choices}>
              {options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={cx(styles.choice, api.playingOption === o.id && styles.choicePlaying)}
                  onClick={() => o.plan && api.preview(o.plan, o.id)}
                  aria-label={`Hear ${o.label}${o.detail && o.detail !== o.label ? `, ${o.detail}` : ''}`}
                  data-ear-example={o.id}
                >
                  {fresh.has(o.id) && <span className={styles.newTag}>New</span>}
                  <span className={styles.choiceIcon} aria-hidden="true">
                    <Icon name={api.playingOption === o.id ? 'AudioLines' : 'Play'} size={16} />
                  </span>
                  <span className={styles.choiceText}>
                    <span className={styles.choiceLabel}>{o.label}</span>
                    {o.detail && o.detail !== o.label && <span className={styles.choiceDetail}>{o.detail}</span>}
                    {aids && o.aid && <span className={styles.choiceDetail}>Like “{o.aid}”</span>}
                  </span>
                </button>
              ))}
            </div>
          </Section>
        </div>
        <div className={styles.hubSide}>
          <Section title="Your record" level={2}>
            {best.completions > 0 ? (
              <div className={styles.recordLine}>
                <StarRating value={best.stars} size={22} label={`${best.stars} of 3 stars`} />
                <Text tone="muted" tabular>
                  Best {Math.round(best.best * 100)}% · {best.completions} {best.completions === 1 ? 'round' : 'rounds'}
                </Text>
              </div>
            ) : (
              <Text tone="muted">
                New level. {level.questions} questions, about {level.questions * 8 < 100 ? 'a minute and a half' : 'two minutes'}. Get {Math.ceil(level.questions * 0.8)} right to open the next one.
              </Text>
            )}
            {weak.length > 0 && (
              <ul className={styles.weak}>
                {weak.map((w) => (
                  <li key={`${w.answer}>${w.chosen}`} className={styles.weakItem}>
                    <Icon name="Ear" size={18} className={styles.weakIcon} />
                    <Text size="sm">{w.sentence}</Text>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
      <ActionBar start={<Button variant="ghost" iconLeft="SlidersHorizontal" onClick={onSettings}>Sound choices</Button>}>
        <Button variant="primary" size="lg" iconLeft="Play" onClick={api.start} data-ear-start aria-keyshortcuts="Enter">
          Start round
        </Button>
      </ActionBar>
    </Page>
  );
}

/** The question on screen: replay controls on top, the verdict, the answers in the thumb zone. */
function Asking({ drill, level, api, question: q, showNames, aids, problem, onEnd, onSettings }: { drill: DrillDef; level: LevelDef; api: EarRoundApi; question: Question; showNames: boolean; aids: boolean; problem: ReturnType<typeof useSoundProblem>; onEnd: () => void; onSettings: () => void }) {
  const round = api.round!;
  const answered = round.answers.length;
  const fb = api.feedback;
  const isChoice = q.kind === 'choice';
  const listening = api.playing === 'question' || api.playing === 'slower' || api.playing === 'spread';
  const offerMic = q.kind === 'sequence' && !isArtifact();
  const mic = useMicNotes(
    (midi) => {
      if (q.kind !== 'sequence') return;
      // Same note name; where the row has it twice (low 5 and 5), the one nearest to what was played.
      const key = q.keys.filter((k) => k.midi % 12 === midi % 12).sort((a, b) => Math.abs(a.midi - midi) - Math.abs(b.midi - midi))[0];
      api.tapKey(key ? key.id : `heard-${midi}`, false);
    },
    () => api.playing !== null && api.playing !== 'note',
  );

  // A phone held sideways has little height: a smaller replay button keeps everything on screen.
  const compact = useMediaQuery('(orientation: landscape) and (max-height: 540px)');
  const choice = isChoice ? (q as ChoiceQuestion) : null;
  const right = choice ? drill.info(choice.answer) : null;
  const chosen = choice && fb ? drill.info(String(fb.chosen)) : null;

  let statusEl: ReactNode;
  if (fb) {
    statusEl = (
      <>
        <span className={cx(styles.verdict, fb.correct ? styles.okText : styles.badText)}>
          <Icon name={fb.correct ? 'CircleCheck' : 'CircleX'} size={24} strokeWidth={2.25} />
          {fb.correct ? 'Right' : 'Not quite'}
        </span>
        {choice && right && <Text tone="muted">{fb.correct ? `That was ${answerPhrase(right)}.` : `It was ${answerPhrase(right)}. Listen to both:`}</Text>}
        {choice && drill.id === 'chords' && typeof choice.truth.frets === 'string' && choice.truth.frets && (
          <Text size="sm" tone="muted">
            Played as {formatChord(String(choice.truth.symbol))}, shape <Text as="span" mono>{choice.truth.frets}</Text>
          </Text>
        )}
        {!choice && <Text tone="muted">{fb.correct ? 'Every note in place.' : 'The red notes are off. Listen to yours, then the melody:'}</Text>}
        {!fb.correct && (
          <div className={styles.compare}>
            <button type="button" className={cx(styles.compareBtn, styles.compareChosen, api.playing === 'chosen' && styles.comparePlaying)} onClick={() => api.hear('chosen')} data-ear-hear="chosen">
              <Icon name={api.playing === 'chosen' ? 'AudioLines' : 'Play'} size={18} />
              <span className={styles.compareText}>
                <span className={styles.compareKicker}>{chosen ? 'You chose' : 'You played'}</span>
                <span className={styles.compareName}>{chosen ? chosen.label : 'Your notes'}</span>
              </span>
            </button>
            <button type="button" className={cx(styles.compareBtn, styles.compareAnswer, api.playing === 'answer' && styles.comparePlaying)} onClick={() => api.hear('answer')} data-ear-hear="answer">
              <Icon name={api.playing === 'answer' ? 'AudioLines' : 'Play'} size={18} />
              <span className={styles.compareText}>
                <span className={styles.compareKicker}>{right ? 'It was' : 'It went'}</span>
                <span className={styles.compareName}>{right ? right.label : 'The melody'}</span>
              </span>
            </button>
          </div>
        )}
      </>
    );
  } else if (api.silent) {
    statusEl = <Text tone="muted">Nothing could be played. Turn the sound on, then tap play.</Text>;
  } else if (listening) {
    statusEl = (
      <span className={styles.listening}>
        <span className={styles.bars} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        Listen…
      </span>
    );
  } else {
    statusEl = <Text tone="muted">{isChoice ? 'Your answer?' : mic.status === 'on' ? 'Play the notes on your guitar, or tap them.' : 'Tap the notes you heard, in order.'}</Text>;
  }

  const firstName = q.firstNote !== null ? formatNote(midiToNote(q.firstNote), { octave: true }) : null;

  return (
    <div className={styles.round} data-ear-phase={api.phase} data-ear-question={q.id}>
      <div className={styles.top}>
        <IconButton icon="X" label="End round" onClick={onEnd} data-ear-end />
        <ProgressBar className={styles.topBar} aria-label="Round progress" value={answered} max={round.total} segmented size="sm" tone="accent" valueText={false} />
        <span className={styles.count} aria-label={`Question ${q.index + 1} of ${round.total}`}>
          {q.index + 1}/{round.total}
        </span>
        <IconButton icon="SlidersHorizontal" label="Sound choices" onClick={onSettings} />
      </div>

      <div className={styles.listen}>
        {/* "Not started" is only news once a play really came back silent; the polled state lags a tap. */}
        <div className={styles.banner}>
          <SoundStatus problem={problem === 'locked' && !api.silent ? null : problem} />
        </div>
        <Text variant="eyebrow" className={styles.eyebrow}>
          {drill.title} · Level {level.n}
        </Text>
        <Heading level={2} size="xl" className={styles.prompt}>
          {q.prompt}
        </Heading>
        {showNames && (q.keyName || firstName) && (
          <div className={styles.context}>
            {q.keyName ? <Tag icon="Key">{q.keyName}</Tag> : firstName && <Tag icon="Music">First note {firstName}</Tag>}
          </div>
        )}
        <div className={styles.controls}>
          <span className={styles.replay}>
            <PlayButton size={compact ? 'lg' : 'xl'} icon={listening ? 'AudioLines' : 'RotateCcw'} label="Play again" onClick={() => api.replay('normal')} aria-keyshortcuts="Space" data-ear-replay />
            <span className={styles.replayLabel} aria-hidden="true">
              Play again
            </span>
          </span>
          {(q.canSlow || q.canSpread) && (
            <div className={styles.side}>
              {q.canSlow && (
                <Button iconLeft="Turtle" onClick={() => api.replay('slower')} pressed={api.playing === 'slower'} data-ear-slower>
                  Slower
                </Button>
              )}
              {q.canSpread && (
                <Button iconLeft="AudioLines" onClick={() => api.replay('spread')} pressed={api.playing === 'spread'} data-ear-spread>
                  One at a time
                </Button>
              )}
            </div>
          )}
        </div>
        {q.kind === 'sequence' && <NoteSlots question={q} entered={fb && Array.isArray(fb.chosen) ? fb.chosen : api.entered} marks={api.marks} />}
        <div className={styles.status} aria-live="polite" data-ear-status={fb ? (fb.correct ? 'right' : 'wrong') : 'waiting'}>
          {statusEl}
        </div>
      </div>

      <div className={styles.answers}>
        {choice ? (
          <AnswerPad options={choice.options} onAnswer={api.submit} result={fb ? { chosen: String(fb.chosen), answer: choice.answer } : null} aids={aids} playing={api.playingOption} />
        ) : (
          q.kind === 'sequence' && (
            <>
              <NoteRow
                question={q}
                onTap={(id) => api.tapKey(id)}
                onUndo={api.undo}
                canUndo={api.entered.length > q.given}
                disabled={api.phase !== 'asking'}
                showNames={showNames}
                mic={
                  offerMic ? (
                    <Button size="sm" variant={mic.status === 'on' ? 'secondary' : 'ghost'} iconLeft="Mic" pressed={mic.status === 'on'} loading={mic.status === 'starting'} onClick={() => (mic.status === 'on' ? mic.stop() : void mic.start())} data-ear-mic>
                      {mic.status === 'on' ? 'Listening to your guitar' : 'Play it on my guitar'}
                    </Button>
                  ) : undefined
                }
              />
              {mic.status === 'failed' && mic.failure && (
                <MediaBlocked reason={mic.failure} device="microphone" onRetry={() => void mic.start()} onContinueWithout={mic.stop} continueLabel="Tap the notes instead" level={3} />
              )}
            </>
          )
        )}
        {api.phase === 'answered' && (
          <Button variant="primary" size="lg" fullWidth iconRight="ArrowRight" onClick={api.next} aria-keyshortcuts="Enter" data-ear-next>
            {answered >= round.total ? 'See your score' : 'Next'}
          </Button>
        )}
        <div className={styles.keysHint} aria-hidden="true">
          <span>
            <Kbd>1</Kbd>–<Kbd>{ANSWER_KEYS[Math.min(isChoice ? (q as ChoiceQuestion).options.length : q.kind === 'sequence' ? q.keys.length : 1, 12) - 1]}</Kbd> answer
          </span>
          <span>
            <Kbd>Space</Kbd> play again
          </span>
          <span>
            <Kbd>Enter</Kbd> next
          </span>
        </div>
      </div>
    </div>
  );
}
