/**
 * The reading side of the scale page: the formula (steps and degrees, every note tappable), the
 * intervals, how it sounds and where it is used, the staff, the chords it fits and the chords it
 * makes, and its relatives one tap away. Pure presentation of the page model.
 */
import { Fragment, memo, useState } from 'react';
import { href } from '@/app/router';
import { formatNote, noteSlug } from '@/core/theory';
import { Badge, Cluster, List, ListItem, SegmentedControl, Section, Stack, Tag, Text } from '@/ui';
import { NotationView, NoteBadge, degreeColor, type NotationItem } from '@/ui/music';
import type { FitChord, RelatedScale, ScalePageModel, StaffLine } from '../model/page';
import { modeSentence } from '../model/page';
import styles from './Scales.module.css';

/** Props shared by the sections that make sound. */
interface Sounding {
  onPlayNote: (midi: number) => void;
}

// ── Formula ─────────────────────────────────────────────────────────────────────────────────

/** Props of `<FormulaSection>`. */
export interface FormulaSectionProps extends Sounding {
  model: ScalePageModel;
  /** MIDI of each scale note from the root up, plus the octave (for tapping). */
  midis: readonly number[];
}

/** Notes, steps and degrees: the scale's recipe, every note a button. */
export const FormulaSection = memo(function FormulaSection({ model, midis, onPlayNote }: FormulaSectionProps) {
  const kinds = [...new Map(model.steps.map((s) => [s.text, s.words])).entries()];
  const octave = model.tones[0];
  return (
    <Section title="Notes and formula" description="Tap a note to hear it. The steps between them are the scale's recipe: move it to any root and it stays the same scale.">
      <ol className={styles.formula} aria-label="Notes of the scale, with the step to the next note">
        {model.tones.map((t, i) => (
          <Fragment key={`${t.note}-${i}`}>
            <li className={styles.formulaNote}>
              <button type="button" className={styles.noteButton} onClick={() => onPlayNote(midis[i])} aria-label={`${t.label}, ${t.intervalWords}. Play it`}>
                <NoteBadge note={t.note} degree={t.degree} size="lg" />
              </button>
            </li>
            <li className={styles.formulaStep} aria-label={model.steps[i].words}>
              <span aria-hidden="true">{model.steps[i].text}</span>
            </li>
          </Fragment>
        ))}
        <li className={styles.formulaNote}>
          <button type="button" className={styles.noteButton} onClick={() => onPlayNote(midis[midis.length - 1])} aria-label={`${octave.label}, the root an octave up. Play it`}>
            <NoteBadge note={octave.note} degree="1" size="lg" />
          </button>
        </li>
      </ol>
      <dl className={styles.formulaKey}>
        <div>
          <dt>Steps</dt>
          <dd className={styles.mono}>{model.stepsText}</dd>
        </div>
        <div>
          <dt>Degrees</dt>
          <dd className={styles.mono}>{model.degreesText}</dd>
        </div>
      </dl>
      <Text variant="caption" tone="muted" as="p">
        {kinds.map(([text, words], i) => (
          <Fragment key={text}>
            {i > 0 && ' · '}
            <strong className={styles.mono}>{text}</strong> = {words}
          </Fragment>
        ))}
      </Text>
    </Section>
  );
});

/** Every note's interval from the root, in words. */
export const IntervalsSection = memo(function IntervalsSection({ model, midis, onPlayNote }: FormulaSectionProps) {
  return (
    <Section title="Intervals from the root" level={3} description="How far each note sits above the root. The colour of a degree is the same everywhere in the app.">
      <ul className={styles.intervals}>
        {model.tones.map((t, i) => (
          <li key={`${t.note}-${i}`}>
            <button type="button" className={styles.intervalRow} onClick={() => onPlayNote(midis[i])}>
              <span className={styles.intervalDot} data-c={degreeColor(t.degree)} aria-hidden="true">
                {t.degree === '1' ? 'R' : t.degreeText}
              </span>
              <span className={styles.intervalNote}>{t.label}</span>
              <span className={styles.intervalWords}>{t.intervalWords}</span>
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
});

// ── Sound and use ───────────────────────────────────────────────────────────────────────────

/** How it sounds, where it is used, and what it is called elsewhere. */
export const MoodSection = memo(function MoodSection({ model, naming }: { model: ScalePageModel; naming: 'letters' | 'solfege' | 'german' }) {
  const mode = modeSentence(model, naming);
  return (
    <Section title="How it sounds">
      <Stack gap={3}>
        <Text variant="lead" as="p" className={styles.measure}>
          {model.mood}
        </Text>
        <Text as="p" className={styles.measure}>
          <strong>Where it is used.</strong> {model.uses}
        </Text>
        {mode && (
          <Text as="p" tone="muted" className={styles.measure}>
            {mode}
          </Text>
        )}
        {model.genres.length > 0 && (
          <Cluster gap={2} aria-label="Styles">
            {model.genres.map((g) => (
              <Tag key={g}>{g}</Tag>
            ))}
          </Cluster>
        )}
        {model.aliases.length > 0 && (
          <Text variant="caption" tone="muted" as="p">
            Also called {model.aliases.slice(0, 4).join(', ')}.
          </Text>
        )}
      </Stack>
    </Section>
  );
});

// ── Staff ───────────────────────────────────────────────────────────────────────────────────

/** Props of `<StaffSection>`. */
export interface StaffSectionProps {
  line: StaffLine;
  degrees: readonly string[];
  /** Index of the note being heard, when the octave is playing. */
  highlight: number | null;
}

/** The scale written out, one octave up and back down, in the guitar's clef. */
export const StaffSection = memo(function StaffSection({ line, degrees, highlight }: StaffSectionProps) {
  const notes: NotationItem[] = [];
  line.notes.forEach((n, i) => {
    if (i === line.top + 1) notes.push('|');
    notes.push({ keys: [n], duration: 'q', label: line.labels[i], color: degreeColor(degrees[i] ?? '1') });
  });
  return (
    <Section title="On the staff" level={3} description="One octave up and back down, as guitar music is written (it sounds an octave lower).">
      <div className={styles.staff}>
        <NotationView notes={notes} highlight={highlight} aria-label={`The scale on the staff: ${line.notes.join(' ')}`} />
      </div>
    </Section>
  );
});

// ── Chords ──────────────────────────────────────────────────────────────────────────────────

const FIT_WORDS: Record<NonNullable<FitChord['fit']>, { text: string; tone: 'ok' | 'info' | 'warn' }> = {
  primary: { text: 'Great fit', tone: 'ok' },
  compatible: { text: 'Fits', tone: 'info' },
  colour: { text: 'Bluesy clash', tone: 'warn' },
};

/** Props of `<ChordsSection>`. */
export interface ChordsSectionProps {
  model: ScalePageModel;
  onPlayChord: (symbol: string) => void;
}

/** The chords the scale fits (from chord-scale matching) and the chords built from its notes. */
export const ChordsSection = memo(function ChordsSection({ model, onPlayChord }: ChordsSectionProps) {
  const [sevenths, setSevenths] = useState(false);
  const built = sevenths ? model.sevenths : model.triads;
  return (
    <Section title="Chords it fits" description="Play the scale over these chords. Tap one to hear it.">
      <Stack gap={4}>
        {model.fitsChords.length > 0 ? (
          <ul className={styles.chordList}>
            {model.fitsChords.map((c) => (
              <li key={c.symbol}>
                <button type="button" className={styles.chordButton} onClick={() => onPlayChord(c.symbol)} aria-label={`${c.display}. ${c.fit ? FIT_WORDS[c.fit].text : ''}. Play it`}>
                  <span className={styles.chordSymbol}>{c.display}</span>
                  {c.fit && (
                    <Badge size="sm" tone={FIT_WORDS[c.fit].tone} variant="soft">
                      {c.rank === 1 ? 'First choice' : FIT_WORDS[c.fit].text}
                    </Badge>
                  )}
                  {c.avoid.length > 0 && <span className={styles.chordNote}>don’t sit on {c.avoid.map((n) => formatNote(n)).join(', ')}</span>}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Text tone="muted" as="p">
            This scale is a colour more than a home: it is not tied to one chord. Try it over a drone.
          </Text>
        )}
        {built && (
          <Stack gap={2}>
            <div className={styles.rowBetween}>
              <Text variant="label" as="h3">
                Chords built from it
              </Text>
              <SegmentedControl
                aria-label="Chord size"
                size="sm"
                options={[
                  { value: 'triads', label: 'Triads' },
                  { value: 'sevenths', label: 'Sevenths' },
                ]}
                value={sevenths ? 'sevenths' : 'triads'}
                onChange={(v) => setSevenths(v === 'sevenths')}
              />
            </div>
            <ol className={styles.builtList}>
              {built.map((c, i) => (
                <li key={`${c.symbol}-${i}`}>
                  <button type="button" className={styles.builtButton} onClick={() => onPlayChord(c.symbol)} aria-label={`${c.romanText}: ${c.display}. Play it`}>
                    <span className={styles.roman}>{c.romanText}</span>
                    <span className={styles.chordSymbol}>{c.display}</span>
                  </button>
                </li>
              ))}
            </ol>
          </Stack>
        )}
      </Stack>
    </Section>
  );
});

// ── Relatives ───────────────────────────────────────────────────────────────────────────────

/** Props of `<RelativesSection>`. */
export interface RelativesSectionProps {
  model: ScalePageModel;
  modes: readonly RelatedScale[];
}

/** Scales one tap away: the same notes from another root, the same root with another colour, the family's modes. */
export const RelativesSection = memo(function RelativesSection({ model, modes }: RelativesSectionProps) {
  const [more, setMore] = useState(false);
  const parallels = more ? model.parallels : model.parallels.slice(0, 5);
  const link = (r: RelatedScale) => [noteSlug(r.tonic), r.scale];
  return (
    <Section title="Relatives" description="Neighbouring scales, one tap away.">
      <Stack gap={4}>
        {model.relatives.length > 0 && (
          <Stack gap={2}>
            <Text variant="label" as="h3">
              Same notes, another home
            </Text>
            <List variant="card">
              {model.relatives.slice(0, 7).map((r) => (
                <ListItem key={`${r.tonic}-${r.scale}`} title={r.title} subtitle={r.detail} to="scales" params={link(r)} />
              ))}
            </List>
          </Stack>
        )}
        {parallels.length > 0 && (
          <Stack gap={2}>
            <Text variant="label" as="h3">
              Same root, another colour
            </Text>
            <List variant="card">
              {parallels.map((r) => (
                <ListItem key={`${r.tonic}-${r.scale}`} title={r.title} subtitle={r.detail} to="scales" params={link(r)} wrap />
              ))}
            </List>
            {model.parallels.length > 5 && (
              <button type="button" className={styles.moreLink} onClick={() => setMore((m) => !m)} aria-expanded={more}>
                {more ? 'Show fewer' : `Show ${model.parallels.length - 5} more`}
              </button>
            )}
          </Stack>
        )}
        {modes.length > 0 && (
          <Stack gap={2}>
            <Text variant="label" as="h3">
              The family’s modes
            </Text>
            <ol className={styles.modeList}>
              {modes.map((m) => {
                const here = m.scale === model.scale.id;
                return (
                  <li key={`${m.tonic}-${m.scale}`}>
                    <a className={styles.modeLink} href={href('scales', ...link(m))} aria-current={here ? 'page' : undefined}>
                      <span className={styles.modeNumber}>{m.detail.replace('Mode ', '')}</span>
                      <span>{m.title}</span>
                    </a>
                  </li>
                );
              })}
            </ol>
          </Stack>
        )}
      </Stack>
    </Section>
  );
});
