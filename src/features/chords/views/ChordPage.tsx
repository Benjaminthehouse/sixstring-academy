/**
 * One chord: its shapes (easiest first in each group) as big diagrams with fingers, the selected
 * shape on the neck, the notes and formula, how it sounds, where it is used, the easier thing a
 * beginner can play instead, finger tips for changing to its usual neighbours, and a microphone
 * check. Keyboard: ← → step through the shapes, Space strums, Enter starts the change trainer.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { href, navigate } from '@/app/router';
import { chordTones, getChordType, parseChord, type Chord } from '@/core/theory';
import { ActionBar, Badge, Button, Icon, IconButton, Kbd, LinkButton, Section, SegmentedControl, Switch, Text, useIsMobile, useLocalState } from '@/ui';
import { arpeggioMarkers, ChordDiagram, Fretboard, NoteBadge, useMusicSettings, voicingOnBoard } from '@/ui/music';
import { setKnown, useVoicingSet } from '../hooks/data';
import { useShortcuts } from '../hooks/keys';
import { arpeggiateVoicing, strumSequence, strumVoicing } from '../hooks/sound';
import { easierAlternatives } from '../model/alternatives';
import { familyOfType } from '../model/catalog';
import { chordParam, displayDegree, displaySymbol } from '../model/symbols';
import { changePartners, chordUsage } from '../model/usage';
import { defaultIndex, defaultVoicing, difficultyWord, shapeNote, voicingLabel, type VoicingSet } from '../model/voicings';
import { ChangeTipsPanel } from './ChangeTipsPanel';
import { MicCheckSheet } from './MicCheck';
import styles from './ChordPage.module.css';

/** Props of the chord page body (the screen supplies the `Page` and its title). */
export interface ChordPageProps {
  symbol: string;
  /** 1-based voicing from the address (`#chords--f-major--2`), or null. */
  initialVoicing: number | null;
  tuning: string;
  known: boolean;
  /** Show "Practise changes" as the view's primary action (false where the page header has one). */
  primaryAction?: boolean;
}

type DotMode = 'fingers' | 'notes' | 'degrees';
type NoteNaming = ReturnType<typeof useMusicSettings>['naming'];

const ROLE_WORDS: Record<string, string> = {
  root: 'root',
  second: 'second',
  third: 'third',
  fourth: 'fourth',
  fifth: 'fifth',
  sixth: 'sixth',
  seventh: 'seventh',
  ninth: 'ninth',
  eleventh: 'eleventh',
  thirteenth: 'thirteenth',
};

/** The chord's full name: "F sharp minor seventh". */
export function chordLongName(c: Chord): string {
  const root = c.root.replace(/##/, ' double sharp').replace(/#/, ' sharp').replace(/bb$/, ' double flat').replace(/(?<=^[A-G])b/, ' flat');
  const bass = c.bass ? ` over ${c.bass.replace('#', ' sharp').replace(/(?<=^[A-G])b/, ' flat')}` : '';
  return `${root} ${c.type.name}${bass}`;
}

/** The chord page body. */
export function ChordPage({ symbol, initialVoicing, tuning, known, primaryAction = true }: ChordPageProps) {
  const { naming } = useMusicSettings();
  const isMobile = useIsMobile();
  const chord = useMemo(() => parseChord(symbol)!, [symbol]);
  const set = useVoicingSet(symbol, tuning, false) as VoicingSet;
  const count = set.all.length;
  const startIndex = () => (initialVoicing ? clampIndex(initialVoicing - 1, count) : defaultIndex(symbol, tuning));
  const [index, setIndex] = useState(startIndex);
  const [dots, setDots] = useLocalState<DotMode>('chords.dots', 'fingers');
  const [allTones, setAllTones] = useLocalState<boolean>('chords.allTones', false);
  const [micOpen, setMicOpen] = useState(false);
  const stripRef = useRef<HTMLDivElement | null>(null);

  // A new chord opens on its first shape (or the one the address names).
  useEffect(() => {
    setIndex(startIndex());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tuning]);

  const v = set.all[index] ?? null;
  const name = displaySymbol(symbol, { system: naming });
  const partners = useMemo(() => changePartners(symbol), [symbol]);
  const trainerParams = ['trainer', chordParam(symbol), ...(partners[0] ? [chordParam(partners[0])] : [])];

  const go = (delta: number) => {
    if (!count) return;
    setIndex((i) => (i + delta + count) % count);
  };
  // Keep the chosen shape in view in the strip (scrolls the strip only, never the page).
  useEffect(() => {
    const strip = stripRef.current;
    const el = strip?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    if (!strip || !el) return;
    const left = el.offsetLeft - strip.offsetLeft;
    if (left < strip.scrollLeft || left + el.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollTo({ left: Math.max(0, left - 24), behavior: 'smooth' });
  }, [index]);

  useShortcuts({
    ArrowLeft: () => go(-1),
    ArrowRight: () => go(1),
    ' ': () => v && strumVoicing(v),
    Enter: () => navigate('chords', ...trainerParams),
  });

  const groupOfIndex = (i: number) => {
    let n = 0;
    for (const g of set.groups) {
      if (i < n + g.voicings.length) return g;
      n += g.voicings.length;
    }
    return null;
  };
  const group = groupOfIndex(index);

  const knownButton = (
    <Button pressed={known} iconLeft={known ? 'CircleCheck' : 'Check'} onClick={() => setKnown(symbol, !known)} data-known-toggle>
      {known ? 'In my chords' : 'I know this chord'}
    </Button>
  );
  const practise = (
    <LinkButton variant={primaryAction ? 'primary' : 'secondary'} iconLeft="Repeat" to="chords" params={trainerParams} className={isMobile ? styles.grow : undefined} data-practise>
      Practise changes
    </LinkButton>
  );

  return (
    <div className={styles.page} data-chord-page={symbol}>
      {/* ------------------------------------------------------------- hero */}
      <section className={styles.hero} aria-label={`${name}: shape ${index + 1} of ${count}`}>
        <div className={styles.stage}>
          <div className={styles.bigDiagram} data-voicing={v ? v.id : ''}>
            {v ? (
              <ChordDiagram key={v.id} className={styles.swap} voicing={v} size="lg" dots={dots} color={dots === 'fingers' ? 'finger' : 'degree'} footer={dots === 'fingers' ? 'notes' : 'none'} title={name} />
            ) : (
              <Text tone="muted">{set.note}</Text>
            )}
          </div>
          {count > 1 && (
            <div className={styles.stepper}>
              <IconButton icon="ChevronLeft" label="Previous shape (←)" onClick={() => go(-1)} variant="secondary" round />
              <span className={styles.counter} aria-live="polite" aria-label={`shape ${index + 1} of ${count}`}>
                {index + 1} / {count}
              </span>
              <IconButton icon="ChevronRight" label="Next shape (→)" onClick={() => go(1)} variant="secondary" round />
            </div>
          )}
        </div>
        <div className={styles.heroInfo}>
          {v && (
            <div className={styles.voicingLine}>
              <h2 className={styles.voicingName}>{voicingLabel(v)}</h2>
              <Badge tone={v.difficulty <= 3.5 ? 'ok' : v.difficulty <= 5.5 ? 'info' : 'warn'}>{difficultyWord(v)}</Badge>
            </div>
          )}
          {group && !isMobile && <Text variant="caption" tone="muted">{group.blurb}</Text>}
          {v && shapeNote(v) && (
            <Text variant="caption" tone="muted" data-shape-note>
              {shapeNote(v)}
            </Text>
          )}
          <div className={styles.buttons}>
            <Button iconLeft="Volume2" onClick={() => v && strumVoicing(v)} disabled={!v} data-strum>
              Strum
            </Button>
            <Button iconLeft="AudioLines" onClick={() => v && arpeggiateVoicing(v)} disabled={!v}>
              Note by note
            </Button>
            <Button iconLeft="Mic" onClick={() => setMicOpen(true)} disabled={!v} data-mic-check>
              Check with the mic
            </Button>
          </div>
          <SegmentedControl<DotMode>
            aria-label="Show in the dots"
            options={[
              { value: 'fingers', label: 'Fingers' },
              { value: 'notes', label: 'Notes' },
              { value: 'degrees', label: 'Degrees' },
            ]}
            value={dots}
            onChange={setDots}
            size="sm"
          />
          <div className={styles.buttons}>
            {knownButton}
            {!isMobile && practise}
          </div>
          {!isMobile && (
            <Text variant="caption" tone="muted" className={styles.hint}>
              <Kbd>←</Kbd> <Kbd>→</Kbd> shapes · <Kbd>Space</Kbd> strum · <Kbd>Enter</Kbd> practise
            </Text>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------------- every shape */}
      {count > 1 && (
        <Section title="Every shape" description="Easiest first in each group. Tap one to see it big and on the neck.">
          <div className={styles.strip} ref={stripRef} data-own-arrows>
            {(() => {
              let n = 0;
              return set.groups.map((g) => (
                <div key={g.id} className={styles.group} role="group" aria-label={g.title}>
                  <p className={styles.groupTitle}>{g.title}</p>
                  <div className={styles.groupItems}>
                    {g.voicings.map((gv) => {
                      const i = n++;
                      const selected = i === index;
                      return (
                        <button
                          key={gv.id}
                          type="button"
                          className={styles.voicingButton}
                          aria-pressed={selected}
                          data-index={i}
                          onClick={() => {
                            setIndex(i);
                            strumVoicing(gv);
                          }}
                          aria-label={`${voicingLabel(gv)}, ${difficultyWord(gv).toLowerCase()}`}
                        >
                          {selected && (
                            <span className={styles.voicingCheck} aria-hidden>
                              <Icon name="Check" size={12} strokeWidth={3} />
                            </span>
                          )}
                          <ChordDiagram voicing={gv} size="sm" title={false} />
                          <span className={styles.voicingLabel} aria-hidden>
                            {voicingLabel(gv)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ));
            })()}
          </div>
        </Section>
      )}

      {/* ------------------------------------------------------------- easier */}
      <Alternatives symbol={symbol} tuning={tuning} name={name} />

      {/* ------------------------------------------------------------- changes */}
      {v && partners.length > 0 && <ChangeTipsPanel symbol={symbol} voicing={v} partners={partners} tuning={tuning} />}

      {/* ------------------------------------------------------------- neck */}
      {v && (
        <Section title="On the neck" description={allTones ? `This shape, with every other ${name} note greyed in behind it.` : 'Where this shape sits on the fretboard.'} actions={<Switch checked={allTones} onChange={setAllTones} label="Every chord tone" side="start" />}>
          <NeckView symbol={symbol} voicing={v} allTones={allTones} tuning={tuning} />
        </Section>
      )}

      {/* ------------------------------------------------------------- facts */}
      <div className={styles.split}>
        <NotesAndFormula chord={chord} />
        <WhereUsed symbol={symbol} tuning={tuning} />
      </div>

      {isMobile && (
        <ActionBar stretchOnMobile={false}>
          <IconButton icon="Volume2" label="Strum (Space)" variant="secondary" size="lg" onClick={() => v && strumVoicing(v)} disabled={!v} />
          {practise}
        </ActionBar>
      )}
      {v && <MicCheckSheet open={micOpen} onClose={() => setMicOpen(false)} symbol={symbol} voicing={v} />}
    </div>
  );
}

function clampIndex(i: number, count: number): number {
  if (!count) return 0;
  return Math.max(0, Math.min(count - 1, Number.isFinite(i) ? i : 0));
}

// ---------------------------------------------------------------------------------------------

function NeckView({ symbol, voicing, allTones, tuning }: { symbol: string; voicing: NonNullable<VoicingSet['all'][number]>; allTones: boolean; tuning: string }) {
  const { naming } = useMusicSettings();
  const board = useMemo(() => voicingOnBoard(voicing, { label: 'finger' }), [voicing]);
  const maxFret = Math.max(0, ...voicing.frets.map((f) => f ?? 0));
  const hi = Math.max(12, Math.min(22, maxFret + 2));
  const ghosts = useMemo(() => {
    if (!allTones) return [];
    const taken = new Set(voicing.notes.map((n) => `${n.string}:${n.fret}`));
    return arpeggioMarkers(symbol, { tuning, minFret: 0, maxFret: hi, label: 'degree', state: 'ghost' }).filter((m) => !taken.has(`${m.string}:${m.fret}`));
  }, [allTones, symbol, voicing, hi, tuning]);
  return (
    <div className={styles.neck}>
      <Fretboard tuning={tuning} frets={[0, hi]} markers={[...ghosts, ...board.markers]} barres={board.barres} open={board.open} muted={board.muted} aria-label={`${displaySymbol(symbol, { system: naming })} on the neck`} />
    </div>
  );
}

function NotesAndFormula({ chord }: { chord: Chord }) {
  const { naming } = useMusicSettings();
  const tones = useMemo(() => chordTones(chord), [chord]);
  const type = getChordType(chord.type.id) ?? chord.type;
  // Aliases are written as charts write them (not re-parsed, which would turn them back into the canonical symbol).
  const rootText = displaySymbol(chord.root, { system: naming });
  const aliases = [...new Set(type.aliases.filter((a) => a && a !== type.symbol && /^[\x20-\x7e]+$/.test(a)))].slice(0, 4).map((a) => `${rootText}${a.replace(/b(?=\d)/g, '♭').replace(/#/g, '♯')}`);
  return (
    <Section title="Notes and formula" description={type.description}>
      <ul className={styles.tones} aria-label="Chord tones">
        {tones.map((t) => (
          <li key={t.degree} className={styles.tone}>
            <NoteBadge note={t.note} degree={t.degree} naming={naming} />
            <span className={styles.toneText}>
              <span className={styles.toneName}>{ROLE_WORDS[t.role] ?? t.role}</span>
              <span className={styles.toneRole}>{t.interval === 'P1' ? 'gives the chord its name' : intervalWords(t.interval)}</span>
            </span>
          </li>
        ))}
      </ul>
      <Text>
        Formula <span className={styles.formula}>{type.degrees.map(displayDegree).join(' – ')}</span>
        {chord.bass ? <> with {displaySymbol(chord.bass, { system: naming })} in the bass</> : null}
      </Text>
      {aliases.length > 0 && (
        <Text variant="caption" tone="muted">
          Also written {aliases.join(', ')}.
        </Text>
      )}
    </Section>
  );
}

const INTERVAL_WORDS: Record<string, string> = {
  m2: 'minor second up',
  M2: 'major second up',
  m3: 'minor third up',
  M3: 'major third up',
  P4: 'perfect fourth up',
  A4: 'augmented fourth up',
  d5: 'diminished fifth up',
  P5: 'perfect fifth up',
  A5: 'augmented fifth up',
  m6: 'minor sixth up',
  M6: 'major sixth up',
  d7: 'diminished seventh up',
  m7: 'minor seventh up',
  M7: 'major seventh up',
  m9: 'minor ninth up',
  M9: 'major ninth up',
  A9: 'augmented ninth up',
  P11: 'eleventh up',
  A11: 'augmented eleventh up',
  m13: 'minor thirteenth up',
  M13: 'major thirteenth up',
};

function intervalWords(iv: string): string {
  return INTERVAL_WORDS[iv] ?? iv;
}

function Alternatives({ symbol, tuning, name }: { symbol: string; tuning: string; name: string }) {
  const { naming } = useMusicSettings();
  const alts = useMemo(() => easierAlternatives(symbol, tuning, (s) => displaySymbol(s, { system: naming })), [symbol, tuning, naming]);
  if (!alts.length) return null;
  return (
    <Section title="Too hard for now? Play this instead" description={`Easier ways to get through a song that asks for ${name} while your hands catch up.`}>
      <div className={styles.alts} data-alternatives>
        {alts.map((a) => (
          <article key={`${a.kind}-${a.voicing.id}`} className={styles.alt}>
            <ChordDiagram voicing={a.voicing} size="sm" title={displaySymbol(a.symbol, { system: naming })} />
            <div className={styles.altBody}>
              <h3 className={styles.altTitle}>{a.title}</h3>
              <Text variant="caption" tone="muted">
                {a.detail}
              </Text>
              <div className={styles.buttons}>
                <Button size="sm" iconLeft="Volume2" onClick={() => strumVoicing(a.voicing)}>
                  Hear it
                </Button>
                {a.symbol !== symbol && a.kind !== 'capo' && (
                  <LinkButton size="sm" variant="ghost" to="chords" params={[chordParam(a.symbol)]} iconRight="ArrowRight">
                    Open {displaySymbol(a.symbol, { system: naming })}
                  </LinkButton>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}

function WhereUsed({ symbol, tuning }: { symbol: string; tuning: string }) {
  const { naming } = useMusicSettings();
  const usage = useMemo(() => chordUsage(symbol), [symbol]);
  const family = familyOfType(parseChord(symbol)!.type);
  const play = (chords: string[]) => {
    const vs = chords.map((c) => defaultVoicing(c, tuning)).filter((x): x is NonNullable<typeof x> => !!x);
    strumSequence(vs, 1.1);
  };
  return (
    <Section title="Where it is used" description={usage.styles}>
      {usage.keys.length > 0 && (
        <>
          <Text variant="label">In these keys</Text>
          <ul className={styles.keys}>
            {usage.keys.map((k) => (
              <li key={k.key} className={styles.keyChip}>
                <span>{displayKey(k.key, naming)}</span>
                <span className={styles.keyRoman}>{k.roman}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {usage.examples.length > 0 && (
        <div className={styles.examples}>
          {usage.examples.map((ex) => (
            <div key={`${ex.key}-${ex.romans}`} className={styles.example}>
              <div className={styles.exampleChords}>
                {ex.chords.map((c, i) => (
                  <Fragment key={`${c}-${i}`}>
                    {i > 0 && (
                      <span className={styles.exArrow} aria-hidden>
                        –
                      </span>
                    )}
                    <a className={styles.exChord} href={href('chords', chordParam(c))} aria-current={i === ex.self ? 'page' : undefined}>
                      {displaySymbol(c, { system: naming })}
                    </a>
                  </Fragment>
                ))}
              </div>
              <div className={styles.exampleMeta}>
                <Text variant="caption">
                  {ex.romans.replace(/b(?=[IV])/g, '♭')} in {displayKey(ex.key, naming)}
                </Text>
                <Text variant="caption" tone="muted">
                  {ex.note}
                </Text>
              </div>
              <IconButton icon="Play" label="Hear the progression" onClick={() => play(ex.chords)} />
            </div>
          ))}
        </div>
      )}
      {!usage.keys.length && !usage.examples.length && <Text tone="muted">{family.blurb}</Text>}
    </Section>
  );
}

/** "Bb major" in the learner's note naming: "B♭ major", "Si♭ major", "B major" (German). */
function displayKey(name: string, naming: NoteNaming): string {
  const [tonic, ...rest] = name.split(' ');
  return [displaySymbol(tonic, { system: naming }), ...rest].join(' ');
}

