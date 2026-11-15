import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { TEACHERS, teacherById, teacherForLevel } from '@/app/teachers';
import { TUNINGS, getTuning } from '@/core/guitar';
import { speak, speechAvailable, stopSpeaking } from '@/core/platform';
import { AVATARS, COSMETICS, equipCosmetic, setDailyGoal, setPrefs, setProfile, usePrefs, useProfile, useProgress, type DailyGoalXp, type ExperienceLevel, type TeacherId } from '@/core/progress';
import { Button, Field, Icon, LinkButton, RadioGroup, SegmentedControl, Select, Slider, Stepper, Switch, TextField, cx, useLocalState, usePrefersReducedMotion } from '@/ui';
import { accentName } from '../shop/model';
import { AiHelper } from './AiHelper';
import { MicSettings } from './MicTest';
import {
  A4_RANGE,
  ACCIDENTAL_CHOICES,
  CLICK_CHOICES,
  EXPERIENCE_CHOICES,
  FRET_LABEL_CHOICES,
  GOAL_CHOICES,
  HAND_CHOICES,
  MOTION_CHOICES,
  NAME_MAX,
  NAMING_CHOICES,
  NOTATION_CHOICES,
  SPEECH_PREF_KEY,
  THEME_CHOICES,
  TONE_CHOICES,
  WEEK_START_CHOICES,
  a4Text,
  clickChoice,
  toneChoice,
  tuningOptions,
} from './model';
import { applyUiSounds, applyVolume, playClickTest, playReferenceTest, playToneTest, playUiTest } from './sound';
import styles from './Settings.module.css';

/** The groups, in order. Ids are also the last part of `#profile--settings--<id>`. */
const GROUPS = [
  { id: 'you', title: 'You', icon: 'CircleUser' },
  { id: 'playing', title: 'Playing', icon: 'Hand' },
  { id: 'goal', title: 'Daily goal', icon: 'Target' },
  { id: 'look', title: 'Appearance', icon: 'Palette' },
  { id: 'sound', title: 'Sound', icon: 'Volume2' },
  { id: 'instrument', title: 'Instrument', icon: 'Guitar' },
  { id: 'microphone', title: 'Microphone', icon: 'Mic' },
  { id: 'hearts', title: 'Hearts', icon: 'Heart' },
  { id: 'speech', title: 'Spoken explanations', icon: 'MessageCircle' },
  { id: 'ai', title: 'AI helper', icon: 'Sparkles' },
  { id: 'more', title: 'More options', icon: 'SlidersHorizontal' },
] as const;
type GroupId = (typeof GROUPS)[number]['id'];

function Group({ id, description, children }: { id: GroupId; description?: string; children: ReactNode }) {
  const group = GROUPS.find((g) => g.id === id) ?? GROUPS[0];
  return (
    <section className={styles.group} id={`settings-${id}`} data-settings-group={id} aria-labelledby={`settings-${id}-title`}>
      <header className={styles.groupHead}>
        <span className={styles.groupIcon} aria-hidden="true">
          <Icon name={group.icon} size={20} />
        </span>
        <div>
          <h2 className={styles.groupTitle} id={`settings-${id}-title`} tabIndex={-1}>
            {group.title}
          </h2>
          {description && <p className={styles.groupNote}>{description}</p>}
        </div>
      </header>
      <div className={styles.card}>{children}</div>
    </section>
  );
}

/**
 * A control with its test button beside it (under it when the row gets narrow). `align` says
 * where the control's own input sits, so the button lines up with it: under a label (`field`),
 * at the bottom (`end`, a slider) or in the middle (`center`, a switch).
 */
function WithTest({ children, onTest, label, disabled, align = 'field' }: { children: ReactNode; onTest: () => void; label: string; disabled?: boolean; align?: 'field' | 'end' | 'center' }) {
  return (
    <div className={styles.withTest} data-align={align}>
      <div className={styles.withTestControl}>{children}</div>
      <Button size="sm" iconLeft="Play" disabled={disabled} aria-label={label} onClick={onTest} className={styles.testButton}>
        Test
      </Button>
    </div>
  );
}

function You() {
  const profile = useProfile();
  // The store trims what it keeps, so the field has its own text: otherwise a space could never be typed.
  const [name, setName] = useState(profile.name);
  useEffect(() => {
    setName((typed) => (typed.trim() === profile.name ? typed : profile.name));
  }, [profile.name]);
  const teacher = teacherById(profile.teacher);
  return (
    <Group id="you">
      <div className={styles.fields}>
        <TextField
          label="Your name"
          value={name}
          maxLength={NAME_MAX}
          autoComplete="given-name"
          hint="What your teacher calls you. It stays on this device."
          data-settings-name=""
          onChange={(value) => {
            setName(value);
            setProfile({ name: value });
          }}
        />
        <Field label="Picture" labelAs="span">
          <div className={styles.avatars} role="radiogroup" aria-label="Picture">
            {AVATARS.map((avatar) => (
              <button
                key={avatar.id}
                type="button"
                role="radio"
                aria-checked={profile.avatar === avatar.id}
                aria-label={avatar.label}
                className={cx(styles.avatar, profile.avatar === avatar.id && styles.avatarOn)}
                onClick={() => setProfile({ avatar: avatar.id })}
              >
                <Icon name={avatar.icon} size={22} />
              </button>
            ))}
          </div>
        </Field>
      </div>
      <div className={styles.fields}>
        <Field label="Your level" labelAs="span" hint={`${EXPERIENCE_CHOICES.find((c) => c.value === profile.experience)?.description ?? ''} Picking a level also picks the teacher who fits it.`}>
          <SegmentedControl aria-label="Your level" fullWidth options={EXPERIENCE_CHOICES.map((c) => ({ value: c.value, label: c.label }))} value={profile.experience} onChange={(experience: ExperienceLevel) => setProfile({ experience, teacher: teacherForLevel(experience).id })} />
        </Field>
        <RadioGroup
          label="Your teacher"
          hint={`${teacher.first} says: “${teacher.hello}”`}
          options={TEACHERS.map((t) => ({ value: t.id, label: t.name, description: `${t.level}. ${t.course}` }))}
          value={profile.teacher}
          onChange={(id: TeacherId) => setProfile({ teacher: id })}
        />
      </div>
    </Group>
  );
}

function Playing() {
  const prefs = usePrefs();
  return (
    <Group id="playing">
      <div className={styles.fields}>
        <Field label="Playing hand" labelAs="span" hint={prefs.handedness === 'left' ? 'Every fretboard, chord diagram and tab is flipped for you: the nut is on the right.' : 'Left-handed flips every fretboard and chord diagram. The music itself never changes.'}>
          <SegmentedControl aria-label="Playing hand" className={styles.fit} options={HAND_CHOICES.map((c) => ({ value: c.value, label: c.label }))} value={prefs.handedness} onChange={(handedness) => setPrefs({ handedness })} />
        </Field>
        <RadioGroup
          label="Note names"
          options={NAMING_CHOICES.map((c) => ({ value: c.value, label: c.label, description: c.description }))}
          value={prefs.noteNaming}
          onChange={(noteNaming) => setPrefs({ noteNaming })}
        />
      </div>
    </Group>
  );
}

function Goal() {
  const goal = useProgress((s) => s.prefs.dailyGoalXp);
  return (
    <Group id="goal" description="How much to do each day to keep your streak. Change it whenever life does.">
      <div className={styles.fields}>
        <RadioGroup
          label="Daily goal"
          hideLabel
          variant="cards"
          minCardWidth="15rem"
          options={GOAL_CHOICES.map((c) => ({ value: String(c.value), label: c.label, description: c.description }))}
          value={String(goal)}
          onChange={(value) => setDailyGoal(Number(value) as DailyGoalXp)}
        />
      </div>
    </Group>
  );
}

function Appearance() {
  const prefs = usePrefs();
  const owned = useProgress((s) => s.cosmetics);
  const accents = useMemo(() => COSMETICS.filter((c) => c.category === 'accent' && owned.includes(c.id)), [owned]);
  return (
    <Group id="look">
      <div className={styles.fields}>
        <Field label="Theme" labelAs="span" hint={prefs.theme === 'system' ? 'Follows your device: light by day, dark when it is.' : undefined}>
          <SegmentedControl aria-label="Theme" className={styles.fit} options={THEME_CHOICES.map((c) => ({ value: c.value, label: c.label, icon: c.value === 'light' ? 'Sun' : c.value === 'dark' ? 'Moon' : 'Monitor' }))} value={prefs.theme} onChange={(theme) => setPrefs({ theme })} />
        </Field>
        <Field label="Motion" labelAs="span" hint={prefs.motion === 'reduce' ? 'Animations and confetti are switched off.' : prefs.motion === 'full' ? 'Animations play even if your device asks for less motion.' : 'Follows the “reduce motion” setting of your device.'}>
          <SegmentedControl aria-label="Motion" className={styles.fit} options={MOTION_CHOICES.map((c) => ({ value: c.value, label: c.label }))} value={prefs.motion} onChange={(motion) => setPrefs({ motion })} />
        </Field>
        <Field label="Accent colour" labelAs="span" hint={accents.length === 1 ? 'The house amber. More colours can be bought with gems.' : undefined}>
          <div className={styles.accents} role="radiogroup" aria-label="Accent colour">
            {accents.map((accent) => (
              <button
                key={accent.id}
                type="button"
                role="radio"
                aria-checked={prefs.accent === accent.id}
                className={cx(styles.accent, prefs.accent === accent.id && styles.accentOn)}
                data-accent-choice={accentName(accent.id)}
                onClick={() => equipCosmetic(accent.id)}
              >
                <span className={styles.accentDot} data-accent-scope={accentName(accent.id)} aria-hidden="true">
                  {prefs.accent === accent.id && <Icon name="Check" size={14} strokeWidth={3} />}
                </span>
                {accent.name}
              </button>
            ))}
            <LinkButton to="profile" params={['shop']} size="sm" variant="ghost" iconRight="ArrowRight">
              More in the shop
            </LinkButton>
          </div>
        </Field>
      </div>
    </Group>
  );
}

function Sound() {
  const sound = useProgress((s) => s.prefs.sound);
  const tone = toneChoice(sound.guitarTone);
  const click = clickChoice(sound.clickSound);
  return (
    <Group id="sound">
      <div className={styles.fields}>
        <WithTest align="end" label="Play a chord at this volume" onTest={() => void playToneTest(tone)}>
          <Slider
            label="Volume"
            min={0}
            max={100}
            step={5}
            value={Math.round(sound.volume * 100)}
            format={(v) => (v === 0 ? 'Off' : `${v}%`)}
            onChange={(v) => {
              setPrefs({ sound: { volume: v / 100 } });
              void applyVolume(v / 100);
            }}
          />
        </WithTest>
        <WithTest label="Play a chord in this guitar sound" onTest={() => void playToneTest(tone)}>
          <Select label="Guitar sound" value={tone} options={TONE_CHOICES.map((c) => ({ value: c.value, label: c.label }))} hint={TONE_CHOICES.find((c) => c.value === tone)?.description} onChange={(value) => {
            setPrefs({ sound: { guitarTone: value } });
            void playToneTest(value);
          }} />
        </WithTest>
        <WithTest label="Play one bar of this click" onTest={() => void playClickTest(click)}>
          <Select label="Metronome click" value={click} options={CLICK_CHOICES.map((c) => ({ value: c.value, label: c.label }))} onChange={(value) => {
            setPrefs({ sound: { clickSound: value } });
            void playClickTest(value);
          }} />
        </WithTest>
        <WithTest align="center" label="Play the sound of a right answer" disabled={!sound.uiSounds} onTest={() => void playUiTest()}>
          <Switch
            label="Interface sounds"
            description="Chimes for right and wrong answers, rewards and level-ups."
            checked={sound.uiSounds}
            onChange={(on) => {
              setPrefs({ sound: { uiSounds: on } });
              void applyUiSounds(on);
            }}
          />
        </WithTest>
      </div>
    </Group>
  );
}

function Instrument() {
  const prefs = usePrefs();
  const options = useMemo(() => tuningOptions(TUNINGS), []);
  const tuning = getTuning(prefs.tuningId) ?? getTuning('standard');
  return (
    <Group id="instrument" description="What the tuner, the fretboards and the chord shapes start from.">
      <div className={styles.fields}>
        <Select
          label="Tuning"
          value={tuning?.id ?? 'standard'}
          options={options}
          hint={tuning ? `Strings low to high: ${tuning.label}. ${tuning.description}` : undefined}
          data-settings-tuning=""
          onChange={(tuningId) => setPrefs({ tuningId })}
        />
        <WithTest label={`Play the note A at ${prefs.a4} hertz`} onTest={() => void playReferenceTest(prefs.a4)}>
          <div className={styles.a4}>
            <Stepper label="Reference pitch (A4)" unit="Hz" min={A4_RANGE.min} max={A4_RANGE.max} step={1} largeStep={5} value={Math.round(prefs.a4)} hint={a4Text(Math.round(prefs.a4))} onChange={(a4) => setPrefs({ a4 })} />
            {prefs.a4 !== A4_RANGE.standard && (
              <Button size="sm" variant="ghost" iconLeft="RotateCcw" onClick={() => setPrefs({ a4: A4_RANGE.standard })}>
                Back to 440
              </Button>
            )}
          </div>
        </WithTest>
      </div>
    </Group>
  );
}

function Hearts() {
  const unlimited = useProgress((s) => s.prefs.unlimitedHearts);
  return (
    <Group id="hearts" description="In theory lessons a mistake costs a heart. Five hearts, and one comes back every 20 minutes.">
      <div className={styles.fields}>
        <Switch label="Relaxed mode" description="Mistakes never cost hearts and a lesson never stops. Learning comes first." checked={unlimited} onChange={(on) => setPrefs({ unlimitedHearts: on })} />
      </div>
    </Group>
  );
}

function Speech() {
  const profile = useProfile();
  const [enabled, setEnabled] = useLocalState<boolean>(SPEECH_PREF_KEY, true);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [problem, setProblem] = useState(false);
  useEffect(() => {
    let alive = true;
    void speechAvailable().then((ok) => {
      if (alive) setAvailable(ok);
    });
    return () => {
      alive = false;
      stopSpeaking();
    };
  }, []);
  const teacher = teacherById(profile.teacher);
  const test = async (): Promise<void> => {
    setProblem(false);
    const result = await speak(`Hello${profile.name ? `, ${profile.name}` : ''}. ${teacher.hello}`, { voice: profile.teacher });
    if (!result.ok && result.reason !== 'stopped' && result.reason !== 'empty') setProblem(true);
  };
  return (
    <Group id="speech" description="Your teacher can read explanations aloud. The text always stays on screen as well.">
      <div className={styles.fields}>
        <WithTest align="center" label={`Hear ${teacher.first} say hello`} disabled={!enabled || available === false} onTest={() => void test()}>
          <Switch
            label="Read explanations aloud"
            description={available === false ? 'This browser has no voice to read with, so this stays silent here.' : `In ${teacher.first}’s voice, where a screen offers it.`}
            checked={enabled && available !== false}
            disabled={available === false}
            onChange={(on) => {
              setEnabled(on);
              if (!on) stopSpeaking();
            }}
          />
        </WithTest>
        {problem && (
          <p className={styles.note} role="status">
            The voice did not start. Check that your device is not muted, then try again.
          </p>
        )}
      </div>
    </Group>
  );
}

function More() {
  const prefs = usePrefs();
  return (
    <Group id="more" description="Finer points. The defaults suit most players.">
      <div className={styles.fields}>
        <Field label="Sharps or flats" labelAs="span" hint="Used when the key does not already decide how a note is spelled.">
          <SegmentedControl aria-label="Sharps or flats" className={styles.fit} options={ACCIDENTAL_CHOICES.map((c) => ({ value: c.value, label: c.label }))} value={prefs.accidentals} onChange={(accidentals) => setPrefs({ accidentals })} />
        </Field>
        <Field label="Dots on the fretboard show" labelAs="span">
          <SegmentedControl aria-label="Dots on the fretboard show" className={styles.fit} options={FRET_LABEL_CHOICES.map((c) => ({ value: c.value, label: c.label }))} value={prefs.fretboard.labels} onChange={(labels) => setPrefs({ fretboard: { labels } })} />
        </Field>
        <Stepper label="Frets on full-neck diagrams" min={12} max={24} step={1} value={prefs.fretboard.frets} onChange={(frets) => setPrefs({ fretboard: { frets } })} />
        <Field label="Songs and exercises show" labelAs="span">
          <SegmentedControl aria-label="Songs and exercises show" className={styles.fit} options={NOTATION_CHOICES.map((c) => ({ value: c.value, label: c.label }))} value={prefs.notation} onChange={(notation) => setPrefs({ notation })} />
        </Field>
      </div>
      <div className={styles.fields}>
        <Field label="Week starts on" labelAs="span">
          <SegmentedControl aria-label="Week starts on" className={styles.fit} options={WEEK_START_CHOICES.map((c) => ({ value: c.value, label: c.label }))} value={prefs.weekStart} onChange={(weekStart) => setPrefs({ weekStart })} />
        </Field>
        <Stepper label="New review cards a day" min={0} max={50} step={1} largeStep={5} value={prefs.review.newPerDay} hint="How many new facts the review deck introduces each day." onChange={(newPerDay) => setPrefs({ review: { newPerDay } })} />
        <Stepper label="Reviews a day" min={10} max={500} step={10} largeStep={50} value={prefs.review.reviewsPerDay} hint="The most cards the deck asks you to review in one day." onChange={(reviewsPerDay) => setPrefs({ review: { reviewsPerDay } })} />
        <Switch label="Mirror the camera" description="Shows the live fretboard like a mirror, which most players find easier to follow." checked={prefs.camera.mirrored} onChange={(mirrored) => setPrefs({ camera: { mirrored } })} />
      </div>
    </Group>
  );
}

/**
 * Settings, in groups. Every control writes to the progress store as it changes, so there is no
 * Save button, and the effect (theme, accent, volume, names) shows at once. A row of shortcuts
 * jumps to a group; `#profile--settings--<group>` opens on one.
 */
export default function Settings({ focus }: { focus?: string | null }) {
  const root = useRef<HTMLDivElement | null>(null);
  const calm = usePrefersReducedMotion();
  const jump = (id: string, smooth: boolean): void => {
    const target = root.current?.querySelector<HTMLElement>(`[data-settings-group="${id}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: smooth && !calm ? 'smooth' : 'auto', block: 'start' });
    target.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  };
  // A link to one group: wait for the shell's own scroll-to-top, then go there.
  useEffect(() => {
    if (!focus || !GROUPS.some((g) => g.id === focus)) return undefined;
    const handle = requestAnimationFrame(() => jump(focus, false));
    return () => cancelAnimationFrame(handle);
    // `jump` only reads refs and the motion setting; the address is what this follows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  return (
    <div className={styles.screen} ref={root}>
      <nav className={styles.jump} aria-label="Jump to a group">
        {GROUPS.map((group) => (
          <button key={group.id} type="button" className={styles.jumpLink} onClick={() => jump(group.id, true)}>
            {group.title}
          </button>
        ))}
      </nav>
      <You />
      <Playing />
      <Goal />
      <Appearance />
      <Sound />
      <Instrument />
      <Group id="microphone" description="For the tuner, play-along checking and the listening games.">
        <MicSettings />
      </Group>
      <Hearts />
      <Speech />
      <Group id="ai">
        <AiHelper />
      </Group>
      <More />
    </div>
  );
}
