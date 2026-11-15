import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { isArtifact } from '@/core/platform/env';
import { completeOnboarding, getProgress, setPrefs, type DailyGoalXp, type ExperienceLevel, type Handedness, type NoteNaming } from '@/core/progress';
import { formatNote } from '@/core/theory';
import { Avatar, Badge, Button, Icon, Portal, ProgressBar, RadioGroup, TextField, toast, useFocusTrap, useScrollLock } from '@/ui';
import { BrandMark } from '../brand/Brand';
import { navigate } from '../router';
import { routeDef } from '../routes';
import { teacherForLevel } from '../teachers';
import {
  GOAL_CHOICES,
  ONBOARDING_STEPS,
  clearOnboarding,
  defaultDraft,
  finishInput,
  loadOnboarding,
  nextStep,
  previousStep,
  saveOnboarding,
  stepIndex,
  type OnboardingDraft,
  type OnboardingStep,
} from './model';
import { C_MAJOR_SHAPE, NeckArt } from './NeckArt';
import { closeOnboarding } from './store';
import styles from './Onboarding.module.css';

const EXPERIENCE_CHOICES: ReadonlyArray<{ value: ExperienceLevel; label: string; description: string }> = [
  { value: 'beginner', label: 'I am just starting', description: 'You have never played, or you are still finding your first chords. We start from how to hold the guitar.' },
  { value: 'intermediate', label: 'I play a bit', description: 'Open chords and a few songs feel fine. Barre chords, scales and playing up the neck are the next step.' },
  { value: 'expert', label: 'I play well', description: 'You are at home all over the neck and want harmony, technique and style in real depth.' },
];

const NOTE_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;

const NAMING_CHOICES: ReadonlyArray<{ value: NoteNaming; label: string; description: string }> = [
  { value: 'letters', label: 'Letters', description: 'English letter names, as in most tab and chord charts.' },
  { value: 'solfege', label: 'Do Re Mi', description: 'Fixed-do names, common in France, Italy, Spain and Latin America.' },
  { value: 'german', label: 'German', description: 'H is B, and B means B flat. Used in Germany and much of northern and central Europe.' },
];

const TOUR: ReadonlyArray<{ route: string; title: string; text: string; needs?: 'microphone' | 'camera' }> = [
  { route: 'tuner', title: 'Tune up', text: 'A tuner that listens to your guitar and tells you which way to turn.', needs: 'microphone' },
  { route: 'learn', title: 'Learn theory in small bites', text: 'Two-minute lessons you can do on the bus, with reviews that make them stick.' },
  { route: 'teachers', title: 'Follow a teacher', text: 'A guided course, step by step, with someone who explains why.' },
  { route: 'arcade', title: 'Play your scales', text: 'Every scale in every position, drilled as short games.' },
  { route: 'camera', title: 'See the notes on your own guitar', text: 'Point your camera at the neck and the notes appear on your frets.', needs: 'camera' },
  { route: 'scan', title: 'Bring your own music', text: 'Scan a printed sheet, a photo or a PDF and play along with it.' },
];

const STEP_TITLES: Record<OnboardingStep, string> = {
  welcome: 'Welcome to Sixstring Academy',
  experience: 'How much have you played?',
  hand: 'Which way do you hold the guitar?',
  names: 'How do you name the notes?',
  goal: 'Pick a daily goal',
  tour: 'What you can do here',
};

const STEP_LEADS: Record<OnboardingStep, string> = {
  welcome: 'A whole guitar school in your pocket: a tuner, lessons, songs, scales and games. Four quick questions and it fits you.',
  experience: 'Be honest. It only decides where you start, and you can change it whenever you like.',
  hand: 'It decides which way round fretboards and chord diagrams are drawn, so they match your guitar. Nothing else changes.',
  names: 'This changes the labels everywhere in the app, never the music.',
  goal: 'A little every day beats a lot once a week. Your streak counts the days you reach it.',
  tour: 'Everything is open from day one. Start anywhere.',
};

/** The first-run draft, or one built from the current profile when the flow is reopened later. */
function initialDraft(): OnboardingDraft {
  const stored = loadOnboarding();
  const state = getProgress();
  if (!state.profile.onboarded) return stored.draft;
  return {
    ...defaultDraft(),
    name: state.profile.name,
    experience: state.profile.experience,
    handedness: state.prefs.handedness,
    noteNaming: state.prefs.noteNaming,
    dailyGoalXp: state.prefs.dailyGoalXp,
  };
}

function NameSample({ system }: { system: NoteNaming }) {
  return (
    <span className={styles.noteRow} aria-hidden="true">
      {NOTE_LETTERS.map((letter) => (
        <span key={letter} className={styles.noteCell}>
          {formatNote(letter, { system })}
        </span>
      ))}
    </span>
  );
}

/**
 * The first-run flow: welcome, level (and the teacher that goes with it), playing hand, note
 * names, daily goal and a short tour. It is a dialog over the app, can be skipped at any step
 * (Escape or "Skip for now"), and remembers its answers and its place across reloads.
 */
export default function Onboarding() {
  const [draft, setDraft] = useState<OnboardingDraft>(initialDraft);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const leadId = useId();
  const blocked = useMemo(() => isArtifact(), []);

  useScrollLock(true);
  useFocusTrap(panelRef, true);

  const update = useCallback((patch: Partial<OnboardingDraft>) => {
    setDraft((previous) => {
      const next = { ...previous, ...patch };
      // Saved on every answer, so closing the tab mid-way loses nothing.
      if (!getProgress().profile.onboarded) saveOnboarding({ skipped: false, draft: next });
      return next;
    });
  }, []);

  const step = draft.step;
  const index = stepIndex(step);
  const before = previousStep(step);
  const after = nextStep(step);
  const teacher = teacherForLevel(draft.experience);

  // A new step starts at its top, with the main button ready under the thumb / Enter key.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    panelRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
  }, [step]);

  const skip = useCallback(() => {
    if (!getProgress().profile.onboarded) saveOnboarding({ skipped: true, draft });
    closeOnboarding();
  }, [draft]);

  const finish = useCallback(() => {
    const result = finishInput(draft);
    completeOnboarding(result.onboarding);
    setPrefs({ noteNaming: result.noteNaming });
    clearOnboarding();
    closeOnboarding();
    navigate('home');
    toast.ok('You are all set', { description: `${teacherForLevel(draft.experience).name} has your first lesson ready.`, icon: 'PartyPopper' });
  }, [draft]);

  const goNext = useCallback(() => {
    if (after) update({ step: after });
    else finish();
  }, [after, finish, update]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      skip();
      return;
    }
    const target = event.target as HTMLElement;
    const typing = target instanceof HTMLInputElement && target.type === 'text';
    // Enter moves on from anywhere except a button or link, which already do their own thing.
    if (event.key === 'Enter' && !target.closest('button, a')) {
      event.preventDefault();
      goNext();
      return;
    }
    if (typing || event.altKey || event.ctrlKey || event.metaKey) return;
    // Number keys pick an answer on the question steps.
    const n = Number(event.key);
    if (!Number.isInteger(n) || n < 1) return;
    if (step === 'experience' && EXPERIENCE_CHOICES[n - 1]) update({ experience: EXPERIENCE_CHOICES[n - 1].value });
    else if (step === 'hand' && n <= 2) update({ handedness: n === 1 ? 'right' : 'left' });
    else if (step === 'names' && NAMING_CHOICES[n - 1]) update({ noteNaming: NAMING_CHOICES[n - 1].value });
    else if (step === 'goal' && GOAL_CHOICES[n - 1]) update({ dailyGoalXp: GOAL_CHOICES[n - 1].xp });
  };

  let content: ReactNode;
  if (step === 'welcome') {
    content = (
      <>
        <figure className={styles.heroArt}>
          <NeckArt dots={C_MAJOR_SHAPE} />
          <figcaption className={styles.heroCaption}>Your first chord: C major. The numbers are fingers, 1 is your index.</figcaption>
        </figure>
        <TextField label="What should we call you?" optional placeholder="Your first name" autoComplete="given-name" maxLength={40} value={draft.name} onChange={(name) => update({ name })} />
      </>
    );
  } else if (step === 'experience') {
    content = (
      <>
        <RadioGroup label="Your level" hideLabel variant="cards" minCardWidth="100%" value={draft.experience} onChange={(experience) => update({ experience })} options={EXPERIENCE_CHOICES.map((c) => ({ value: c.value, label: c.label, description: c.description }))} />
        <div className={styles.teacher} aria-live="polite">
          <Avatar name={teacher.name} size="lg" tone={teacher.tone} ring decorative />
          <div className={styles.teacherText}>
            <p className={styles.teacherKicker}>Your teacher · {teacher.level}</p>
            <p className={styles.teacherName}>{teacher.name}</p>
            <p className={styles.teacherHello}>“{teacher.hello}”</p>
          </div>
        </div>
      </>
    );
  } else if (step === 'hand') {
    const hands: ReadonlyArray<{ value: Handedness; label: string; description: string }> = [
      { value: 'right', label: 'Right-handed', description: 'Neck in your left hand, strumming with your right. Most guitars are built this way.' },
      { value: 'left', label: 'Left-handed', description: 'Neck in your right hand, strumming with your left. Every diagram is mirrored for you.' },
    ];
    content = (
      <RadioGroup
        label="Playing hand"
        hideLabel
        variant="cards"
        minCardWidth="15rem"
        value={draft.handedness}
        onChange={(handedness) => update({ handedness })}
        options={hands.map((h) => ({
          value: h.value,
          label: (
            <span className={styles.handLabel}>
              <span>{h.label}</span>
              <NeckArt className={styles.handArt} mirrored={h.value === 'left'} frets={4} dots={C_MAJOR_SHAPE} />
            </span>
          ),
          description: h.description,
        }))}
      />
    );
  } else if (step === 'names') {
    content = (
      <RadioGroup
        label="Note names"
        hideLabel
        variant="cards"
        minCardWidth="100%"
        value={draft.noteNaming}
        onChange={(noteNaming) => update({ noteNaming })}
        options={NAMING_CHOICES.map((c) => ({
          value: c.value,
          label: (
            <span className={styles.nameLabel}>
              <span>{c.label}</span>
              <NameSample system={c.value} />
              <span className="sr-only">: {NOTE_LETTERS.map((l) => formatNote(l, { system: c.value })).join(' ')}</span>
            </span>
          ),
          description: c.description,
        }))}
      />
    );
  } else if (step === 'goal') {
    content = (
      <RadioGroup
        label="Daily goal"
        hideLabel
        variant="cards"
        minCardWidth="14rem"
        value={String(draft.dailyGoalXp)}
        onChange={(value) => update({ dailyGoalXp: Number(value) as DailyGoalXp })}
        options={GOAL_CHOICES.map((c) => ({
          value: String(c.xp),
          label: (
            <span className={styles.goalLabel}>
              <span>{c.label}</span>
              <span className={styles.goalMeta}>
                {c.xp} XP · about {c.minutes} min
              </span>
            </span>
          ),
          description: c.note,
        }))}
      />
    );
  } else {
    content = (
      <ul className={styles.tour}>
        {TOUR.map((item) => (
          <li key={item.route} className={styles.tourItem}>
            <span className={styles.tourIcon} aria-hidden="true">
              <Icon name={routeDef(item.route).icon} size={22} />
            </span>
            <span className={styles.tourText}>
              <span className={styles.tourTitle}>
                {item.route === 'teachers' ? `Learn with ${teacher.first}` : item.title}
                {blocked && item.needs && (
                  <Badge tone="warn" icon={item.needs === 'camera' ? 'CameraOff' : 'MicOff'}>
                    Needs its own tab
                  </Badge>
                )}
              </span>
              <span className={styles.tourNote}>{item.text}</span>
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Portal>
      <div className={styles.layer}>
        <div ref={panelRef} className={styles.panel} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={leadId} tabIndex={-1} onKeyDown={onKeyDown}>
          <header className={styles.top}>
            <BrandMark size={28} />
            <ProgressBar className={styles.progress} aria-label={`Step ${index + 1} of ${ONBOARDING_STEPS.length}`} value={index} max={ONBOARDING_STEPS.length} segmented valueText={false} size="sm" />
            <Button variant="ghost" size="sm" onClick={skip}>
              Skip for now
            </Button>
          </header>

          <div ref={bodyRef} className={styles.body}>
            <div key={step} className={styles.step}>
              <p className={styles.count}>
                Step {index + 1} of {ONBOARDING_STEPS.length}
              </p>
              <h2 id={titleId} className={styles.title}>
                {step === 'welcome' && draft.name.trim() ? `Welcome, ${draft.name.trim()}` : STEP_TITLES[step]}
              </h2>
              <p id={leadId} className={styles.lead}>
                {STEP_LEADS[step]}
              </p>
              {content}
            </div>
          </div>

          <footer className={styles.actions}>
            {before ? (
              <Button variant="ghost" size="lg" iconLeft="ArrowLeft" onClick={() => update({ step: before })}>
                Back
              </Button>
            ) : (
              <span />
            )}
            <Button variant="primary" size="lg" iconRight={after ? 'ArrowRight' : undefined} data-autofocus onClick={goNext}>
              {step === 'welcome' ? 'Get started' : after ? 'Continue' : 'Start playing'}
            </Button>
          </footer>
        </div>
      </div>
    </Portal>
  );
}
