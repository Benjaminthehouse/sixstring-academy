/**
 * The Chords screen (`#chords`).
 *
 * Addresses (params are slug-safe; see `model/symbols.ts`):
 *   #chords                          the library: first-chords path, by type, by root, search, mine
 *   #chords--g-major, #chords--g     a chord page (theory `chordSlug`, also skill slugs `f-sharp-m`)
 *   #chords--c-major-over-e          a slash chord;  #chords--f-major--2  opens on its second shape
 *   #chords--trainer[--g-major--c-major]   the chord-change trainer (also `--changes`), set up with
 *                                    `--minute` / `--timed` / `--check`, `--t70`, `--beats-2` (see API.md)
 *   #chords--identify[--x32010]      name that shape
 *   #chords--mine                    my chords
 *   #chords--type--m7, #chords--root--f-sharp   the library opened on a family or a root
 *
 * Phones get one column (library, then a chord page of its own); from 1080 px the library sits
 * beside the chord page. Pure logic lives in `model/` with unit tests; the browser check is
 * `node e2e/chords.cjs`.
 */
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import type { RouteProps } from '@/app/routes';
import { href } from '@/app/router';
import { useScreenTitle } from '@/app/shell';
import { parseChord } from '@/core/theory';
import { Icon, LinkButton, Page, Text, useMediaQuery } from '@/ui';
import { ChordDiagram, useMusicSettings } from '@/ui/music';
import { useChordTuning, useKnownChords, useVoicingSet } from './hooks/data';
import { familyById, familyOfType, nextToLearn, rootPc, symbolFor } from './model/catalog';
import { chordParam, displaySymbol, viewFromParams, type ChordView } from './model/symbols';
import { defaultVoicing } from './model/voicings';
import { ChordPage, chordLongName } from './views/ChordPage';
import { LibraryPanel, type LibraryPanelProps } from './views/LibraryPanel';
import { MyChords } from './views/MyChords';
import { NameShape } from './views/NameShape';
import { Trainer } from './views/Trainer';
import styles from './Chords.module.css';
import lib from './views/Library.module.css';

/** Library beside the chord page from this width. */
const WIDE_QUERY = '(min-width: 1080px)';

function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** The Chords screen. */
export default function ChordsScreen({ params }: RouteProps) {
  const key = params.join('--');
  const view = useMemo<ChordView>(() => viewFromParams(params), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const wide = useMediaQuery(WIDE_QUERY);
  const known = useKnownChords();
  const { id: tuning, isStandard, tuning: tuningObj } = useChordTuning();
  const { naming } = useMusicSettings();

  const tuningNote = !isStandard ? (
    <Text variant="caption" tone="muted">
      Shapes for your {tuningObj.name} tuning ({tuningObj.label}). Change it in Settings.
    </Text>
  ) : null;

  switch (view.view) {
    case 'chord':
      return <ChordScreen symbol={view.symbol} voicing={view.voicing} wide={wide} known={known} tuning={tuning} tuningNote={tuningNote} />;
    case 'trainer':
      return <Trainer chordsFromUrl={view.chords} optionsFromUrl={view.options} tuning={tuning} known={known} />;
    case 'identify':
      return (
        <Page title="Name that shape" subtitle="Tap frets on the neck and the app names the chord, with every other name it goes by." back={{ to: 'chords', label: 'Chords' }}>
          {tuningNote}
          <NameShape key={view.shape ?? ''} initial={view.shape} tuning={tuning} />
        </Page>
      );
    case 'mine':
      return (
        <Page title="My chords" subtitle="The chords you can play. They feed your progress, the practice planner and the first-chords path." back={{ to: 'chords', label: 'Chords' }}>
          <MyChords known={known} tuning={tuning} />
        </Page>
      );
    default: {
      const open: LibraryPanelProps['open'] =
        view.view === 'type' ? { tab: 'type', family: view.family } : view.view === 'root' ? { tab: 'root', root: rootPc(view.root) } : null;
      const next = nextToLearn(known);
      // On a wide screen the right-hand side always shows a chord: the family's or root's first, else the next one to learn.
      const featured =
        view.view === 'type' && familyById(view.family) ? symbolFor(0, familyById(view.family)!.types[0]) : view.view === 'root' ? symbolFor(rootPc(view.root), 'major') : next ?? 'Em';
      return (
        <Page
          title="Chords"
          subtitle="Every chord you will meet, the shapes to play it, and a trainer for clean changes."
          actions={
            <LinkButton variant="primary" iconLeft="Repeat" to="chords" params={['trainer']} data-open-trainer>
              Practise changes
            </LinkButton>
          }
        >
          <Tools known={known.size} />
          {tuningNote}
          {wide ? (
            <div className={styles.twoPane}>
              <aside className={styles.side} aria-label="Chord library">
                <LibraryPanel tuning={tuning} known={known} current={featured} compact open={open} />
              </aside>
              <div className={styles.main}>
                <div className={styles.mainHead}>
                  <Text variant="eyebrow">{featured === next && view.view === 'library' ? 'Next on your path' : capitalise(familyOfType(parseChord(featured)!.type).title)}</Text>
                  <h2 className={styles.chordTitle}>
                    <a href={href('chords', chordParam(featured))} className={styles.chordTitleLink}>
                      {displaySymbol(featured, { system: naming })}
                    </a>
                  </h2>
                  <Text tone="muted">{capitalise(chordLongName(parseChord(featured)!))}</Text>
                </div>
                <ChordPage key={featured} symbol={featured} initialVoicing={null} tuning={tuning} known={known.has(featured)} primaryAction={false} />
              </div>
            </div>
          ) : (
            <>
              {next && view.view === 'library' && <NextCard symbol={next} tuning={tuning} />}
              <LibraryPanel tuning={tuning} known={known} open={open} />
            </>
          )}
        </Page>
      );
    }
  }
}

function ChordScreen({ symbol, voicing, wide, known, tuning, tuningNote }: { symbol: string; voicing: number | null; wide: boolean; known: ReadonlySet<string>; tuning: string; tuningNote: ReactNode }) {
  const { naming } = useMusicSettings();
  const chord = parseChord(symbol)!;
  const family = familyOfType(chord.type);
  const name = displaySymbol(symbol, { system: naming });
  useScreenTitle(name);
  const body = <ChordPage key={`${symbol}|${tuning}`} symbol={symbol} initialVoicing={voicing} tuning={tuning} known={known.has(symbol)} />;
  return (
    <Page title={name} eyebrow={family.title} subtitle={capitalise(chordLongName(chord))} back={wide ? undefined : { to: 'chords', label: 'All chords' }}>
      {tuningNote}
      {wide ? (
        <div className={styles.twoPane}>
          <aside className={styles.side} aria-label="Chord library">
            <LibraryPanel tuning={tuning} known={known} current={symbol} compact />
          </aside>
          <div className={styles.main}>{body}</div>
        </div>
      ) : (
        body
      )}
    </Page>
  );
}

/** The three tools of the screen, one tap away. */
function Tools({ known }: { known: number }) {
  const items = [
    { to: ['trainer'], icon: 'Repeat', title: 'Chord-change trainer', sub: 'One-minute changes, in time, or checked by ear' },
    { to: ['identify'], icon: 'Search', title: 'Name that shape', sub: 'Tap frets, get the chord’s name' },
    { to: ['mine'], icon: 'CircleCheck', title: 'My chords', sub: known ? `${known} you can play` : 'Mark the chords you know' },
  ];
  return (
    <nav className={lib.tools} aria-label="Chord tools">
      {items.map((t) => (
        <a key={t.title} className={lib.tool} href={href('chords', ...t.to)} data-tool={t.to[0]}>
          <span className={lib.toolIcon} aria-hidden>
            <Icon name={t.icon} />
          </span>
          <span className={lib.toolText}>
            <span className={lib.toolTitle}>{t.title}</span>
            <span className={lib.toolSub}>{t.sub}</span>
          </span>
          <Icon name="ChevronRight" className={lib.toolChevron} />
        </a>
      ))}
    </nav>
  );
}

/** On a phone: the next chord on the path, big, one tap from its page. */
function NextCard({ symbol, tuning }: { symbol: string; tuning: string }) {
  const { naming } = useMusicSettings();
  const chord = parseChord(symbol)!;
  return (
    <section className={lib.next} aria-label="Next on your path">
      <NextDiagram symbol={symbol} tuning={tuning} />
      <div className={lib.nextBody}>
        <Text variant="eyebrow">Next on your path</Text>
        <p className={lib.nextName}>{displaySymbol(symbol, { system: naming })}</p>
        <Text variant="caption" tone="muted">
          {capitalise(chordLongName(chord))}
        </Text>
        <div>
          <LinkButton size="sm" iconRight="ArrowRight" to="chords" params={[chordParam(symbol)]}>
            Learn it
          </LinkButton>
        </div>
      </div>
    </section>
  );
}

function NextDiagram({ symbol, tuning }: { symbol: string; tuning: string }) {
  const set = useVoicingSet(symbol, tuning, false);
  const v = set ? defaultVoicing(symbol, tuning) : null;
  return v ? <ChordDiagram voicing={v} size="md" title={false} /> : null;
}
