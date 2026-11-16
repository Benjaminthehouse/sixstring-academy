/**
 * The notation and tab cheat sheet: note values and rests, dots, ties and triplets, time
 * signatures, repeats and road signs, dynamics, articulation, and every tab symbol with an example
 * you can hear.
 */
import { useMemo } from 'react';
import { Button, Section, Text, cx, usePrefersReducedMotion } from '@/ui';
import { NoteGlyph, NotationView, TabSnippet } from '@/ui/music';
import { ARTICULATIONS, DYNAMICS, REPEAT_SIGNS, TAB_TECHNIQUES, beatsWords, lengthExamples, noteValueRows, timeSignatureRows, type SignItem, type TabTechnique, type TimeSignatureRow } from '../model/notation';
import { SignGlyph } from './Glyphs';
import { Lazy } from './Lazy';
import type { SectionProps } from './SectionBody';
import styles from './Sections.module.css';

const PARTS = [
  { value: 'reading', label: 'Reading music' },
  { value: 'signs', label: 'Signs' },
  { value: 'tab', label: 'Tab symbols' },
] as const;

/** The notation and tab page. */
export function NotationSection({ item, level, sounder }: SectionProps) {
  const values = useMemo(() => noteValueRows(), []);
  const lengths = useMemo(() => lengthExamples(), []);
  const times = useMemo(() => timeSignatureRows(), []);
  const reduced = usePrefersReducedMotion();

  const jump = (part: string) => {
    document.getElementById(`notation-${part}`)?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  };

  return (
    <div className={styles.stack}>
      <nav aria-label="On this page" className={styles.jumps}>
        {PARTS.map((p) => (
          <Button key={p.value} size="sm" iconRight="ArrowDown" onClick={() => jump(p.value)}>
            {p.label}
          </Button>
        ))}
      </nav>

      <div id="notation-reading" className={styles.stack}>
        <Section level={level} title="Note values and rests" description="How long each note lasts, and the silence of the same length. In 4/4 a quarter note gets one beat." data-ref-item="note-values">
          <div className={styles.staff}>
            <NotationView clef="treble" notes={values.flatMap((v, i) => [...(i ? ['|'] : []), { keys: 'B4', duration: v.vex, label: v.name.replace(' note', '') }])} aria-label="Whole, half, quarter, eighth and sixteenth notes" />
          </div>
          <div className={styles.tableFrame} data-ref-item="rests">
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Note</th>
                  <th scope="col">Rest</th>
                  <th scope="col">Beats in 4/4</th>
                  <th scope="col">Per bar</th>
                  <th scope="col" className={styles.britishCol}>
                    British name
                  </th>
                </tr>
              </thead>
              <tbody>
                {values.map((v) => (
                  <tr key={v.id}>
                    <th scope="row">
                      <span className={styles.glyphCell}>
                        <NoteGlyph value={v.id} className={styles.noteGlyph} />
                        <span>
                          {v.name}
                          <span className={styles.britishInline}>{v.british}</span>
                        </span>
                      </span>
                    </th>
                    <td>
                      <span className={styles.glyphCell}>
                        <NoteGlyph value={v.id} rest className={styles.noteGlyph} />
                        <span className={styles.srOnly}>{v.restName}</span>
                      </span>
                    </td>
                    <td className={styles.num}>{beatsWords(v.beats)}</td>
                    <td className={styles.num}>{v.perBar}</td>
                    <td className={styles.britishCol}>{v.british}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Text variant="caption" tone="muted">
            On the staff the whole rest hangs below the fourth line and the half rest sits on the middle line. A whole rest also means “rest for the whole bar” in any time signature.
          </Text>
        </Section>

        <Section level={level} title="Dots, ties and triplets">
          <div className={styles.cards}>
            {lengths.map((e) => (
              <figure key={e.id} className={styles.card} data-ref-item={e.id}>
                <div className={styles.cardStaff}>
                  <NotationView clef="treble" notes={e.notes.map((n) => ({ keys: 'B4', duration: n.duration, dots: n.dots, tie: n.tie, triplet: n.triplet, label: n.triplet ? undefined : n.label }))} aria-label={e.name} />
                </div>
                <figcaption>
                  <span className={styles.cardTitle}>{e.name}</span>
                  <span className={styles.cardText}>
                    {e.sum} = {beatsWords(e.beats)}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </Section>

        <Section level={level} title="Time signatures" description="Top: how many beats in a bar. Bottom: which note gets one beat (4 a quarter, 8 an eighth).">
          <div className={styles.cards}>
            {times.map((t) => (
              <figure key={t.id} className={cx(styles.card, styles.cardRow)} data-ref-item={t.id}>
                <TimeSig t={t} />
                <figcaption>
                  <span className={styles.cardTitle}>
                    {t.text} · {t.kind}
                  </span>
                  <span className={styles.cardText}>{t.meaning}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </Section>
      </div>

      <div id="notation-signs" className={styles.stack}>
        <SignGroup level={level} title="Repeats and road signs" description="Where to go next: these save writing the same music twice." items={REPEAT_SIGNS} />
        <SignGroup level={level} title="Dynamics" description="How loud, from very soft to very loud. On guitar: how hard you pick or strum." items={DYNAMICS} />
        <SignGroup level={level} title="Articulation" description="How each note starts and ends." items={ARTICULATIONS} />
      </div>

      <div id="notation-tab" className={styles.stack}>
        <Section level={level} title="Tab symbols" description="Tab shows strings and frets: the top line is the high E string. Tap play to hear each technique.">
          <div className={cx(styles.cards, styles.tabCards)}>
            {TAB_TECHNIQUES.map((t) => (
              <TabCard key={t.id} t={t} sounder={sounder} highlight={item === t.id} />
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

function SignGroup({ level, title, description, items }: { level: 2 | 3; title: string; description: string; items: readonly SignItem[] }) {
  return (
    <Section level={level} title={title} description={description}>
      <div className={styles.cards}>
        {items.map((s) => (
          <figure key={s.id} className={cx(styles.card, styles.cardRow)} data-ref-item={s.id}>
            <SignGlyph glyph={s.glyph} />
            <figcaption>
              <span className={styles.cardTitle}>{s.name}</span>
              <span className={styles.cardText}>{s.meaning}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}

function TimeSig({ t }: { t: TimeSignatureRow }) {
  if (t.symbol) {
    return (
      <span className={styles.timeSig} aria-hidden="true">
        <span className={cx(styles.timeC, t.symbol === 'cut' && styles.timeCut)}>C</span>
      </span>
    );
  }
  return (
    <span className={styles.timeSig} aria-hidden="true">
      <span>{t.top}</span>
      <span>{t.bottom}</span>
    </span>
  );
}

function TabCard({ t, sounder, highlight }: { t: TabTechnique; sounder: SectionProps['sounder']; highlight: boolean }) {
  const id = `tab:${t.id}`;
  return (
    <figure className={cx(styles.card, styles.tabCard)} data-ref-item={t.id} data-highlight={highlight || undefined}>
      <figcaption>
        <span className={styles.cardTitle}>
          {t.name} <span className={styles.symbol}>{t.symbol}</span>
        </span>
        <span className={styles.cardText}>{t.meaning}</span>
      </figcaption>
      <Lazy minHeight="7.5rem">
        {() => <TabSnippet tab={t.tab} time="4/4" tempo={t.tempo} size="md" onPlay={(song) => sounder.toggleSong(id, song)} playing={sounder.playing === id} playLabel={`Play: ${t.name}`} aria-label={`${t.name} in tab`} />}
      </Lazy>
    </figure>
  );
}
