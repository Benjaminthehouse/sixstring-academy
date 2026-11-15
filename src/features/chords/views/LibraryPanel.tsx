/**
 * The chord library as people browse it: search by symbol or name, then four ways in: the
 * first-chords path (ticked as the learner learns them), by type, by root, and their own chords.
 * Full width on a phone; the left column beside the chord page on a wide screen.
 */
import { useEffect, useMemo, useState } from 'react';
import { parseChord } from '@/core/theory';
import { Button, ChipGroup, cx, LinkButton, SearchField, Switch, Tabs, Text, useLocalState } from '@/ui';
import { chordsOfType, chordsOnRoot, familyById, familyTypes, FAMILIES, PATH, ROOTS, searchChords, stageProgress, symbolFor, type SearchHit } from '../model/catalog';
import { typeLabel } from '../model/symbols';
import { ChordTile } from './ChordTile';
import styles from './Library.module.css';

/** The four ways into the library. */
export type LibraryTab = 'path' | 'type' | 'root' | 'mine';

interface Remembered {
  tab: LibraryTab;
  family: string;
  type: string;
  root: number;
  rare: boolean;
}

const DEFAULTS: Remembered = { tab: 'path', family: 'major', type: 'major', root: 0, rare: false };

/** Props of the panel. */
export interface LibraryPanelProps {
  tuning: string;
  known: ReadonlySet<string>;
  /** The chord on screen beside the panel. */
  current?: string | null;
  /** Narrow column beside a chord page. */
  compact?: boolean;
  /** Open on a tab (from the address: `#chords--type--m7`, `#chords--root--f-sharp`). */
  open?: { tab: LibraryTab; family?: string; root?: number } | null;
}

function sanitize(r: Partial<Remembered> | null | undefined): Remembered {
  const out = { ...DEFAULTS, ...(r ?? {}) };
  if (!['path', 'type', 'root', 'mine'].includes(out.tab)) out.tab = 'path';
  if (!familyById(out.family)) out.family = 'major';
  if (!familyById(out.family)!.types.includes(out.type)) out.type = familyById(out.family)!.types[0];
  if (!Number.isInteger(out.root) || out.root < 0 || out.root > 11) out.root = 0;
  out.rare = !!out.rare;
  return out;
}

/** The library browser. */
export function LibraryPanel({ tuning, known, current, compact, open }: LibraryPanelProps) {
  const [stored, setStored] = useLocalState<Remembered>('chords.library', DEFAULTS);
  const state = sanitize(stored);
  const patch = (p: Partial<Remembered>) => setStored((prev) => ({ ...sanitize(prev), ...p }));
  const [query, setQuery] = useState('');

  // An address that names a tab opens it (once per address).
  const openKey = open ? `${open.tab}:${open.family ?? ''}:${open.root ?? ''}` : '';
  useEffect(() => {
    if (!open) return;
    const p: Partial<Remembered> = { tab: open.tab };
    if (open.family && familyById(open.family)) {
      p.family = open.family;
      p.type = familyById(open.family)!.types[0];
    }
    if (open.root !== undefined) p.root = open.root;
    patch(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey]);

  const hits = useMemo(() => searchChords(query, 24), [query]);

  const tile = (symbol: string, sub?: string) => <ChordTile key={symbol} symbol={symbol} tuning={tuning} known={known.has(symbol)} current={current === symbol} sub={sub} />;

  const pathPanel = (
    <div className={styles.panel}>
      {PATH.map((stage) => {
        const p = stageProgress(stage, known);
        return (
          <section key={stage.id} className={styles.stage} aria-labelledby={`stage-${stage.id}`}>
            <div className={styles.stageHead}>
              <h3 id={`stage-${stage.id}`} className={styles.stageTitle}>
                {stage.title}
              </h3>
              <span className={styles.stageCount} aria-label={`${p.known} of ${p.total} known`}>
                {p.known}/{p.total}
              </span>
            </div>
            {!compact && <p className={styles.stageBlurb}>{stage.blurb}</p>}
            <div className={styles.grid}>{stage.chords.map((s) => tile(s))}</div>
          </section>
        );
      })}
    </div>
  );

  const family = familyById(state.family)!;
  const types = familyTypes(family);
  const type = types.find((t) => t.id === state.type) ?? types[0];
  const typePanel = (
    <div className={styles.panel}>
      <ChipGroup
        aria-label="Chord family"
        options={FAMILIES.map((f) => ({ value: f.id, label: f.label }))}
        value={family.id}
        onChange={(id) => patch({ family: id, type: familyById(id)!.types[0] })}
        scroll={compact ? 'never' : 'auto'}
      />
      <Text variant="caption" tone="muted" className={styles.familyBlurb}>
        {family.blurb}
      </Text>
      {types.length > 1 && (
        <ChipGroup
          aria-label={`${family.title}: type`}
          options={types.map((t) => ({ value: t.id, label: typeLabel(t.symbol) }))}
          value={type.id}
          onChange={(id) => patch({ type: id })}
          scroll={compact ? 'never' : 'auto'}
        />
      )}
      <div className={styles.stage}>
        <div className={styles.stageHead}>
          <h3 className={styles.stageTitle}>{capitalise(type.name)}</h3>
        </div>
        <div className={styles.grid}>{chordsOfType(type).map((s) => tile(s))}</div>
      </div>
    </div>
  );

  const rootGroups = chordsOnRoot(state.root, { maxTier: state.rare ? 4 : 2 });
  const rootPanel = (
    <div className={styles.panel}>
      <ChipGroup aria-label="Root note" options={ROOTS.map((r) => ({ value: String(r.pc), label: r.label }))} value={String(state.root)} onChange={(v) => patch({ root: Number(v) })} scroll={compact ? 'never' : 'auto'} />
      <Switch checked={state.rare} onChange={(rare) => patch({ rare })} label="Show rare chords too" />
      {rootGroups.map((g) => (
        <section key={g.family.id} className={styles.stage} aria-label={g.family.title}>
          <div className={styles.stageHead}>
            <h3 className={styles.stageTitle}>{g.family.title}</h3>
          </div>
          <div className={styles.grid}>{g.chords.map((s) => tile(s, parseChord(s)?.type.name))}</div>
        </section>
      ))}
    </div>
  );

  const mineList = [...known].sort();
  const minePanel = (
    <div className={styles.panel}>
      {mineList.length ? (
        <>
          <div className={styles.grid}>{mineList.map((s) => tile(s))}</div>
          <LinkButton to="chords" params={['mine']} variant="ghost" size="sm" iconRight="ArrowRight">
            Open My chords
          </LinkButton>
        </>
      ) : (
        <>
          <Text tone="muted">Chords you mark with “I know this chord” collect here. Start with the first seven.</Text>
          <div>
            <Button size="sm" onClick={() => patch({ tab: 'path' })} iconRight="ArrowRight">
              Show the first chords
            </Button>
          </div>
        </>
      )}
    </div>
  );

  const resultsPanel = <SearchResults hits={hits} tile={tile} onType={(familyId, typeId) => {
    patch({ tab: 'type', family: familyId, type: typeId });
    setQuery('');
  }} />;

  return (
    <div className={cx(styles.panel, compact && styles.compact)} data-library>
      <SearchField value={query} onChange={setQuery} label="Search chords" placeholder="Search: F#m7b5, Bb/D, sus…" />
      {query.trim() ? (
        resultsPanel
      ) : (
        <Tabs<LibraryTab>
          aria-label="Browse chords"
          variant="pills"
          value={state.tab}
          onChange={(tab) => patch({ tab })}
          fitted={compact}
          items={[
            { id: 'path', label: compact ? 'First' : 'First chords', content: pathPanel },
            { id: 'type', label: compact ? 'Type' : 'By type', content: typePanel },
            { id: 'root', label: compact ? 'Root' : 'By root', content: rootPanel },
            { id: 'mine', label: 'Mine', badge: known.size || undefined, content: minePanel },
          ]}
        />
      )}
    </div>
  );
}

function SearchResults({ hits, tile, onType }: { hits: SearchHit[]; tile: (s: string) => JSX.Element; onType: (family: string, type: string) => void }) {
  const chords = hits.flatMap((h) => (h.kind === 'chord' ? [h.symbol] : []));
  const types = hits.flatMap((h) => (h.kind === 'type' ? [h] : []));
  if (!chords.length && !types.length) {
    return (
      <div className={styles.results} aria-live="polite">
        <Text tone="muted">No chord matches that. Try a symbol such as Am7 or D/F#, or a name such as “minor seventh”.</Text>
      </div>
    );
  }
  return (
    <div className={styles.results} aria-live="polite">
      {chords.length > 0 && <div className={styles.grid}>{chords.map((s) => tile(s))}</div>}
      {types.length > 0 && (
        <>
          <Text variant="label">Chord types</Text>
          <div className={styles.typeHits}>
            {types.map((t) => (
              <Button key={t.type.id} size="sm" onClick={() => onType(t.family.id, t.type.id)}>
                {typeLabel(t.type.symbol)} · {t.type.name}
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** The chord the type tab would show first (for a wide screen's address `#chords--type--m7`). */
export function firstOfFamily(familyId: string): string | null {
  const f = familyById(familyId);
  return f ? symbolFor(0, f.types[0]) : null;
}
