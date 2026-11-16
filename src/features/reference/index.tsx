/**
 * The Reference (`#reference`): the shelf a learner reaches for to look something up. Speed of
 * finding beats depth of explaining: one search over everything, nine sections, every fact
 * computed by the theory and guitar engines (see `model/`, unit-tested against hand-written truth).
 *
 * Addresses (`model/sections.ts`):
 *   #reference                     phones: the list of sections and the search; wide: the circle of fifths
 *   #reference--intervals          a section
 *   #reference--intervals--maj3    a section opened on an item (selected, or scrolled to and flashed)
 *
 * Layout: below 1080 px the list and each section are pages of their own (a search sheet is one
 * tap away on every section); from 1080 px the section list and the search sit beside the page.
 * Each section can be copied or downloaded as plain text. Keyboard: "/" focuses the search, Escape
 * clears it. The root mirrors state for tests: `data-section`, `data-item`, `data-layout`.
 *
 * Browser check: `node e2e/reference.cjs`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { href, navigate } from '@/app/router';
import type { RouteProps } from '@/app/routes';
import { useScreenTitle } from '@/app/shell';
import { Icon, IconButton, List, ListItem, Page, SearchField, Sheet, Text, cx, useDebounced, useEventListener, useMediaQuery } from '@/ui';
import { buildSearchIndex, searchReference, type SearchHit } from './model/search';
import { DEFAULT_SECTION, SECTIONS, parseReferenceParams, sectionById, type SectionId } from './model/sections';
import { useFmt } from './ui/format';
import { SectionBody } from './ui/SectionBody';
import { ExportMenu } from './ui/ExportMenu';
import { useSounder } from './ui/sound';
import styles from './ui/Reference.module.css';

/** The section list sits beside the page from this width. */
const WIDE_QUERY = '(min-width: 1080px)';

/** The Reference screen. */
export default function ReferenceScreen({ params }: RouteProps) {
  const address = parseReferenceParams(params);
  const wide = useMediaQuery(WIDE_QUERY);
  const fmt = useFmt();
  const sounder = useSounder();
  const [query, setQuery] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  /** Bumped on every search pick, so picking the item already in the address still reveals it. */
  const [reveal, setReveal] = useState(0);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const section: SectionId | null = address.section ?? (wide ? DEFAULT_SECTION : null);
  const info = sectionById(section);
  useScreenTitle(info ? info.title : null);

  const index = useMemo(() => buildSearchIndex(fmt), [fmt]);
  const debounced = useDebounced(query, 80);
  const hits = useMemo(() => searchReference(index, debounced, 40), [index, debounced]);

  // Stop sounds when the section changes.
  const { stop } = sounder;
  useEffect(() => stop, [section, stop]);

  // "/" focuses the search, as on most reference sites.
  useEventListener(typeof window === 'undefined' ? null : window, 'keydown', (e: KeyboardEvent) => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    e.preventDefault();
    if (!wide && section) setSheetOpen(true);
    else searchRef.current?.focus();
  });

  const onPick = useCallback(() => {
    setReveal((n) => n + 1);
    setSheetOpen(false);
  }, []);

  const openFirst = useCallback(
    (value: string) => {
      const first = searchReference(index, value, 1)[0];
      if (!first) return;
      const { section: s, item } = first.entry;
      onPick();
      navigate('reference', s, item ?? undefined);
    },
    [index, onPick],
  );

  const searchBox = (autoFocus = false) => (
    <SearchField
      ref={autoFocus ? undefined : searchRef}
      value={query}
      onChange={setQuery}
      onSubmit={openFirst}
      label="Search the Reference"
      placeholder="Search keys, chords, scales, symbols…"
      size="lg"
      autoFocus={autoFocus}
      data-autofocus={autoFocus ? '' : undefined}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && query) {
          e.stopPropagation();
          setQuery('');
        }
      }}
    />
  );

  const results = <SearchResults query={debounced} hits={hits} onPick={onPick} compact={wide} />;

  // ── wide: list beside the page ─────────────────────────────────────────────────────────
  if (wide && section && info) {
    return (
      <Page title="Reference" subtitle="Look anything up: keys, intervals, chords, scales, symbols and words." data-section={section} data-item={address.item ?? ''} data-layout="wide">
        <div className={styles.split}>
          <aside className={styles.side} aria-label="Reference sections">
            {searchBox()}
            {query.trim() ? results : <SectionNav current={section} />}
          </aside>
          <article className={styles.article} aria-labelledby="reference-section-title">
            <header className={styles.articleHead}>
              <div className={styles.articleTitles}>
                <span className={styles.articleIcon} aria-hidden="true">
                  <Icon name={info.icon} />
                </span>
                <div>
                  <h2 id="reference-section-title" className={styles.articleTitle}>
                    {info.title}
                  </h2>
                  <Text tone="muted">{info.blurb}</Text>
                </div>
              </div>
              <ExportMenu section={section} fmt={fmt} />
            </header>
            <SectionBody key={section} section={section} item={address.item} reveal={reveal} level={3} fmt={fmt} sounder={sounder} />
          </article>
        </div>
      </Page>
    );
  }

  // ── phone: one section per page ───────────────────────────────────────────────────────
  if (section && info) {
    return (
      <Page
        title={info.title}
        subtitle={info.blurb}
        back={{ to: 'reference', label: 'Reference' }}
        actions={
          <div className={styles.headActions}>
            <IconButton icon="Search" label="Search the Reference" variant="secondary" onClick={() => setSheetOpen(true)} />
            <ExportMenu section={section} fmt={fmt} />
          </div>
        }
        data-section={section}
        data-item={address.item ?? ''}
        data-layout="phone"
      >
        <SectionBody key={section} section={section} item={address.item} reveal={reveal} level={2} fmt={fmt} sounder={sounder} />
        <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Search the Reference" size="lg">
          <div className={styles.sheetSearch}>
            {searchBox(true)}
            {query.trim() ? results : <Text tone="muted">Type a key, an interval, a chord, a scale, a sign or a word.</Text>}
          </div>
        </Sheet>
      </Page>
    );
  }

  // ── phone: the list ───────────────────────────────────────────────────────────────────
  return (
    <Page title="Reference" subtitle="Look anything up: keys, intervals, chords, scales, symbols and words." data-section="" data-item="" data-layout="phone">
      <div className={styles.indexTop}>{searchBox()}</div>
      {query.trim() ? (
        results
      ) : (
        <List variant="card">
          {SECTIONS.map((s) => (
            <ListItem key={s.id} icon={s.icon} title={s.title} subtitle={s.blurb} to="reference" params={[s.id]} wrap />
          ))}
        </List>
      )}
    </Page>
  );
}

/** The sections as a vertical list of links, the current one marked. */
function SectionNav({ current }: { current: SectionId }) {
  return (
    <nav aria-label="Sections">
      <ul className={styles.nav}>
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <a className={cx(styles.navLink, s.id === current && styles.navCurrent)} href={href('reference', s.id)} aria-current={s.id === current ? 'page' : undefined}>
              <Icon name={s.icon} size="sm" />
              <span>{s.title}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Search results grouped by section, each a link straight to the item. */
function SearchResults({ query, hits, onPick, compact }: { query: string; hits: SearchHit[]; onPick: () => void; compact: boolean }) {
  const groups = useMemo(() => {
    const by = new Map<SectionId, SearchHit[]>();
    for (const h of hits) by.set(h.entry.section, [...(by.get(h.entry.section) ?? []), h]);
    // Sections in the order of their best hit.
    return [...by.entries()];
  }, [hits]);

  if (!query.trim()) return null;
  return (
    <div className={cx(styles.results, compact && styles.resultsCompact)} data-results={hits.length}>
      <p className={styles.resultCount} role="status" aria-live="polite">
        {hits.length === 0 ? `Nothing found for “${query.trim()}”. Try a note name, a chord symbol or a plain word.` : `${hits.length === 40 ? '40+' : hits.length} result${hits.length === 1 ? '' : 's'}`}
      </p>
      {groups.map(([sectionId, list]) => (
        <section key={sectionId} className={styles.resultGroup} aria-label={sectionById(sectionId)!.title}>
          <h3 className={styles.resultHeading}>
            <Icon name={sectionById(sectionId)!.icon} size="xs" />
            {sectionById(sectionId)!.title}
          </h3>
          <ul className={styles.resultList}>
            {list.map(({ entry }) => (
              <li key={entry.id}>
                <a className={styles.result} href={href('reference', entry.section, entry.item ?? undefined)} onClick={onPick} data-result={entry.id}>
                  <span className={styles.resultTitle}>{entry.title}</span>
                  <span className={styles.resultSub}>{entry.subtitle}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
