/**
 * The Songs screen (`#songs`): the built-in collection and the learner's own songs in one list,
 * sorted by what fits the learner now, with search and filters; one tap opens the Player
 * (`#play--<id>`). Songs are added from a file (picker or drop), a paste (text tab, a chord sheet,
 * ChordPro, SixTab) or the scanner (`#scan`).
 *
 * Layout: phones get the suggestions as swipeable cards, the list with thumbnails under each title,
 * and the filters in a bottom sheet. From 720 px the filters are popovers and the thumbnails sit
 * beside the titles; from 1080 px a preview pane on the right shows the song under the pointer
 * (or keyboard focus) with Play as its main button.
 *
 * Params: `#songs--<id>` selects (and highlights) a song, `#songs--add` opens "Add a song",
 * `#songs--paste` the paste box. Keyboard: `/` search, Up/Down move through the list, Enter plays.
 * Browser check: `node e2e/songs.cjs`. Songs come from `@/core/library` (see its API.md).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { RouteProps } from '@/app/routes';
import { useScreenTitle } from '@/app/shell';
import { attachDropZone } from '@/core/platform';
import { recordActivity, toggleFavourite } from '@/core/progress';
import { detectTextFormat } from '@/core/song';
import {
  SORT_NAMES,
  SONG_STYLES,
  filterSongs,
  getLibrary,
  goodNextSongs,
  isLibraryError,
  rankSongs,
  sortSongs,
  useSongList,
  LibraryError,
  type ImportedSong,
  type LibraryStatus,
  type SongListing,
  type SongSort,
  type SongSummary,
} from '@/core/library';
import {
  Button,
  ChipGroup,
  EmptyState,
  ErrorState,
  Icon,
  LinkButton,
  Page,
  SearchField,
  Section,
  Select,
  Sheet,
  Spinner,
  confirmDialog,
  toast,
  useEventListener,
  useIsMobile,
  useLocalState,
  useMediaQuery,
} from '@/ui';
import { SongActionsContext, type SongActions } from './actions';
import { AddSongSheet, type AddMode } from './components/AddSong';
import { EditDetails } from './components/EditDetails';
import { ExportSheet } from './components/ExportSheet';
import { ActiveFilters, FilterBar, FilterPanel, NO_FILTERS, filterCount, type Feature, type FilterValue } from './components/Filters';
import { ImportResultSheet, type ImportOutcome } from './components/ImportResult';
import { NextSongs } from './components/NextSongs';
import { SongDetails } from './components/SongDetails';
import { SongRow } from './components/SongRow';
import { useLearner } from './hooks';
import styles from './Songs.module.css';

/** A preview pane beside the list from this width. */
const TWO_PANE_QUERY = '(min-width: 1080px)';
/** Params that are not song ids. */
const COMMANDS = new Set(['add', 'paste']);
const SORTS: SongSort[] = ['fit', 'level', 'title', 'recent', 'length'];
type Scope = 'all' | 'mine' | 'favourites';

/** What the screen remembers between visits (through the platform storage layer). */
interface ViewState extends FilterValue {
  scope: Scope;
  sort: SongSort;
}
const DEFAULT_VIEW: ViewState = { ...NO_FILTERS, scope: 'all', sort: 'fit' };

/** Read a remembered view, dropping anything unknown. */
function sanitizeView(raw: unknown): ViewState {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof ViewState, unknown>>;
  const list = <T extends string>(x: unknown, allowed: readonly T[]): T[] => (Array.isArray(x) ? x.filter((e): e is T => allowed.includes(e as T)) : []);
  return {
    scope: v.scope === 'mine' || v.scope === 'favourites' ? v.scope : 'all',
    sort: SORTS.includes(v.sort as SongSort) ? (v.sort as SongSort) : 'fit',
    levels: list(v.levels, ['beginner', 'intermediate', 'expert'] as const),
    styles: list(v.styles, SONG_STYLES),
    skills: list(v.skills, ['melody', 'chords', 'strumming', 'fingerpicking', 'rhythm', 'singing', 'technique', 'form'] as const),
    features: list(v.features, ['chords', 'lyrics', 'tab'] as Feature[]),
  };
}

function asLibraryError(e: unknown): LibraryError {
  return isLibraryError(e) ? e : new LibraryError('unreadable', 'Something went wrong while reading it. Try again.', e instanceof Error ? e.message : String(e));
}

/** Is this keyboard or paste event aimed at something that types? */
function typingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

/** The Songs screen. */
export default function SongsScreen({ params }: RouteProps) {
  const library = getLibrary();
  const { songs: listed, ready, error } = useSongList(library);
  const learner = useLearner();
  const isMobile = useIsMobile();
  const twoPane = useMediaQuery(TWO_PANE_QUERY);
  useScreenTitle(null);

  const [storedView, setStoredView] = useLocalState<unknown>('songs.view', DEFAULT_VIEW);
  const view = useMemo(() => sanitizeView(storedView), [storedView]);
  const setView = useCallback((patch: Partial<ViewState>) => setStoredView({ ...view, ...patch }), [setStoredView, view]);
  const [query, setQuery] = useState('');

  const [add, setAdd] = useState<AddMode | null>(null);
  const [pasteSeed, setPasteSeed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [editing, setEditing] = useState<SongListing | null>(null);
  const [exporting, setExporting] = useState<SongListing | null>(null);
  const [about, setAbout] = useState<SongListing | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<LibraryStatus | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const hoverTimer = useRef<number | undefined>(undefined);

  // ---- derived lists -------------------------------------------------------------------------
  // Built-in songs get their summary (length, what they hold) when their row scrolls into view, so
  // their notes load only when needed. Sorting by length or filtering by what a song includes needs
  // every summary: only then are they all worked out.
  const needsAll = view.sort === 'length' || view.features.length > 0;
  const [summaries, setSummaries] = useState<ReadonlyMap<string, SongSummary>>(new Map());
  useEffect(() => {
    if (!needsAll) return;
    const missing = listed.filter((s) => !s.summary && !summaries.has(s.id));
    if (!missing.length) return;
    let alive = true;
    void Promise.all(missing.map((s) => library.summary(s.id).then((sum) => [s.id, sum] as const, () => null))).then((pairs) => {
      if (!alive) return;
      setSummaries((prev) => {
        const next = new Map(prev);
        for (const p of pairs) if (p) next.set(p[0], p[1]);
        return next;
      });
    });
    return () => {
      alive = false;
    };
  }, [needsAll, listed, summaries, library]);
  const songs = useMemo(() => (summaries.size ? listed.map((s) => (s.summary || !summaries.has(s.id) ? s : { ...s, summary: summaries.get(s.id) })) : listed), [listed, summaries]);
  const favourites = learner.favourites;
  const ranked = useMemo(() => rankSongs(songs, learner), [songs, learner]);
  const fitOrder = useMemo(() => ranked.map((r) => r.listing.id), [ranked]);
  const picks = useMemo(() => goodNextSongs(songs, learner, 3), [songs, learner]);
  const filterValue: FilterValue = { levels: view.levels, styles: view.styles, skills: view.skills, features: view.features };
  const filtered = useMemo(
    () => filterSongs(songs, { query, scope: view.scope, levels: view.levels, styles: view.styles, skills: view.skills, features: view.features }, { favourites }),
    [songs, query, view.scope, view.levels, view.styles, view.skills, view.features, favourites],
  );
  const visible = useMemo(() => sortSongs(filtered, view.sort, { fitOrder, query }), [filtered, view.sort, fitOrder, query]);
  const availableStyles = useMemo(() => SONG_STYLES.filter((s) => songs.some((x) => x.style === s)), [songs]);
  const narrowed = !!query.trim() || filterCount(filterValue) > 0 || view.scope !== 'all';
  const featured = !narrowed && view.sort === 'fit' && picks.length > 0;
  const pickIds = useMemo(() => new Set(picks.map((p) => p.listing.id)), [picks]);
  const rest = featured ? visible.filter((s) => !pickIds.has(s.id)) : visible;
  const counts = useMemo(() => ({ all: songs.length, mine: songs.filter((s) => s.source === 'mine').length, favourites: songs.filter((s) => favourites.has(s.id)).length }), [songs, favourites]);
  const titleOf = useCallback((id: string) => songs.find((s) => s.id === id)?.title, [songs]);

  const previewListing = (previewId ? songs.find((s) => s.id === previewId) : null) ?? (featured ? picks[0]?.listing : visible[0]) ?? null;

  // ---- params: #songs--<id> / --add / --paste --------------------------------------------------
  const param = params[0] ?? null;
  useEffect(() => {
    if (!param) return;
    if (param === 'add') setAdd('choose');
    else if (param === 'paste') setAdd('paste');
  }, [param]);
  const handledParam = useRef<string | null>(null);
  useEffect(() => {
    if (!param || COMMANDS.has(param) || handledParam.current === param) return;
    const target = songs.find((s) => s.id === param);
    if (!target) return;
    handledParam.current = param;
    setPreviewId(param);
    setFlash(param);
    if (!twoPane) setAbout(target);
    requestAnimationFrame(() => document.querySelector(`[data-song-row="${param}"]`)?.scrollIntoView({ block: 'center' }));
  }, [param, songs, twoPane]);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 2500);
    return () => window.clearTimeout(t);
  }, [flash]);

  useEffect(() => {
    let alive = true;
    library.status().then((s) => alive && setStatus(s), () => {});
    return () => {
      alive = false;
    };
  }, [library, songs.length]);

  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  // ---- actions ------------------------------------------------------------------------------
  const flashSong = useCallback((id: string) => {
    setFlash(id);
    setPreviewId(id);
  }, []);

  const actions: SongActions = useMemo(
    () => ({
      edit: (s) => setEditing(s),
      exportSong: (s) => setExporting(s),
      duplicate: (s) => {
        library.duplicate(s.id).then(
          (copy) => {
            flashSong(copy.id);
            toast.ok('Copied to your songs', { description: copy.title, action: { label: 'Edit details', onClick: () => setEditing(copy) } });
          },
          (e) => toast.error('Could not make a copy', { description: asLibraryError(e).message }),
        );
      },
      remove: (s) => {
        void (async () => {
          const ok = await confirmDialog({ title: `Delete “${s.title}”?`, description: 'It goes from this device. You can undo it for a few seconds.', confirmLabel: 'Delete song', tone: 'danger' });
          if (!ok) return;
          try {
            const removed = await library.remove(s.id);
            setAbout((a) => (a?.id === s.id ? null : a));
            toast({
              title: `Deleted “${s.title}”`,
              action: {
                label: 'Undo',
                onClick: () => {
                  library.restore(removed).then((back) => flashSong(back.id), (e) => toast.error('Could not bring it back', { description: asLibraryError(e).message }));
                },
              },
            });
          } catch (e) {
            toast.error('Could not delete it', { description: asLibraryError(e).message });
          }
        })();
      },
      toggleFavourite: (s) => {
        toggleFavourite({ kind: 'song', id: s.id, title: s.title, route: 'play', params: [s.id] });
      },
      isFavourite: (id) => favourites.has(id),
      details: (s) => {
        if (twoPane) setPreviewId(s.id);
        else setAbout(s);
      },
      hover: (s, how) => {
        if (!twoPane) return;
        window.clearTimeout(hoverTimer.current);
        if (how === 'focus') setPreviewId(s.id);
        else hoverTimer.current = window.setTimeout(() => setPreviewId(s.id), 120);
      },
    }),
    [library, favourites, twoPane, flashSong],
  );

  // ---- importing ----------------------------------------------------------------------------
  const finishImport = useCallback(
    (result: ImportOutcome) => {
      setBusy(null);
      setAdd(null);
      setOutcome(result);
      const first = result.imported[0];
      if (first) {
        flashSong(first.listing.id);
        recordActivity({ kind: 'scan', count: result.imported.length, title: first.listing.title, route: 'play', params: [first.listing.id] });
      }
    },
    [flashSong],
  );

  const importFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setBusy(files.length === 1 ? `Reading ${files[0].name}…` : `Reading ${files.length} files…`);
      const result: ImportOutcome = { imported: [], failed: [] };
      for (const file of files) {
        try {
          result.imported.push(await library.importFile(file));
        } catch (e) {
          result.failed.push({ name: file.name, error: asLibraryError(e) });
        }
      }
      finishImport(result);
    },
    [library, finishImport],
  );

  const importPasted = useCallback(
    async (text: string, title: string) => {
      setBusy('Reading it…');
      const result: ImportOutcome = { imported: [], failed: [] };
      try {
        result.imported.push(await library.importText(text, { title: title.trim() || undefined }));
      } catch (e) {
        result.failed.push({ name: '', error: asLibraryError(e) });
      }
      finishImport(result);
    },
    [library, finishImport],
  );

  const undoImport = useCallback(
    async (o: ImportOutcome) => {
      setOutcome(null);
      for (const item of o.imported) await library.remove(item.listing.id).catch(() => {});
      toast.info(o.imported.length === 1 ? 'Import undone' : `${o.imported.length} imports undone`);
    },
    [library],
  );

  // Files dropped anywhere on the screen (wide screens; phones use the picker).
  useEffect(() => {
    const el = rootRef.current;
    if (!el || isMobile) return;
    return attachDropZone(el, { multiple: true, onFiles: (accepted, rejected) => void importFiles([...accepted, ...rejected]), onHover: setDragging });
  }, [importFiles, isMobile]);

  // Text pasted onto the screen (not into a field) opens the paste box with it.
  useEventListener(document, 'paste', (e: ClipboardEvent) => {
    if (typingTarget(e.target) || add || outcome || editing || exporting || document.querySelector('[role="dialog"]')) return;
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length) {
      e.preventDefault();
      void importFiles(files);
      return;
    }
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (text.trim() && detectTextFormat(text) !== 'unknown') {
      e.preventDefault();
      setPasteSeed(text);
      setAdd('paste');
    }
  });

  useEventListener(document, 'keydown', (e: globalThis.KeyboardEvent) => {
    if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !typingTarget(e.target) && !document.querySelector('[role="dialog"]')) {
      e.preventDefault();
      searchRef.current?.focus();
    }
  });

  const onListKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const links = Array.from(rootRef.current?.querySelectorAll<HTMLAnchorElement>('[data-song-row] > a, [data-next-song]') ?? []);
    const i = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (i < 0) return;
    e.preventDefault();
    links[Math.max(0, Math.min(links.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
  };

  // ---- pieces -------------------------------------------------------------------------------
  const addButton = (
    <Button iconLeft="Plus" onClick={() => setAdd('choose')} data-add-song="">
      Add a song
    </Button>
  );
  const headerActions = isMobile ? (
    addButton
  ) : (
    <div className={styles.headActions}>
      <LinkButton to="scan" iconLeft="ScanLine" variant="ghost">
        Scan a sheet
      </LinkButton>
      {addButton}
    </div>
  );

  const scopeChips = (
    <ChipGroup
      aria-label="Which songs"
      options={[
        { value: 'all', label: 'All songs', count: counts.all },
        { value: 'mine', label: 'My songs', count: counts.mine },
        { value: 'favourites', label: 'Favourites', count: counts.favourites },
      ]}
      value={view.scope}
      onChange={(scope) => setView({ scope: scope as Scope })}
    />
  );

  const sortSelect = (
    <Select
      label="Sort"
      hideLabel
      size="sm"
      prefix="ArrowUpDown"
      value={view.sort}
      onChange={(sort) => setView({ sort: sort as SongSort })}
      options={SORTS.map((s) => ({ value: s, label: SORT_NAMES[s] }))}
      className={styles.sort}
    />
  );

  const emptyState = (() => {
    if (view.scope === 'mine' && !counts.mine && !query.trim())
      return (
        <EmptyState
          icon="FileMusic"
          title="No songs of your own yet"
          actions={
            <>
              <Button variant="primary" iconLeft="Plus" onClick={() => setAdd('choose')}>
                Add a song
              </Button>
              <LinkButton to="scan" iconLeft="ScanLine">
                Scan a sheet
              </LinkButton>
            </>
          }
        >
          Bring in a Guitar Pro, MusicXML or tab file, paste tab or chords from a website, or scan a printed sheet. They stay on this device.
        </EmptyState>
      );
    if (view.scope === 'favourites' && !counts.favourites && !query.trim())
      return (
        <EmptyState icon="Heart" title="No favourites yet" actions={<Button onClick={() => setView({ scope: 'all' })}>Show all songs</Button>}>
          Tap the heart on a song you love and it waits for you here.
        </EmptyState>
      );
    return (
      <EmptyState
        icon="Search"
        title="No songs match"
        actions={
          <Button
            onClick={() => {
              setQuery('');
              setStoredView({ ...view, ...NO_FILTERS, scope: 'all' });
            }}
          >
            Clear search and filters
          </Button>
        }
      >
        {query.trim() ? `Nothing matches “${query.trim()}”` : 'Nothing matches these filters'}
        {filterCount(filterValue) ? ' with the filters that are on.' : '.'} Try fewer words or another level.
      </EmptyState>
    );
  })();

  const listTitle = featured ? 'More songs' : query.trim() ? 'Search results' : view.scope === 'mine' ? 'My songs' : view.scope === 'favourites' ? 'Favourites' : 'All songs';
  const rows = (list: SongListing[]) => (
    <ul className={styles.list} onKeyDown={onListKey} aria-label={listTitle}>
      {list.map((s) => (
        <SongRow key={s.id} listing={s} previewed={twoPane && previewListing?.id === s.id} flash={flash === s.id} showMine={view.scope !== 'mine'} />
      ))}
    </ul>
  );

  const main = (
    <div className={styles.main}>
      {error && (
        <ErrorState title="Your own songs could not be loaded" error={error.detail} onRetry={() => window.location.reload()} retryLabel="Reload">
          {error.message} The built-in songs are all here.
        </ErrorState>
      )}
      {featured && (
        <Section title="Good next songs for you" description={nextLine(learner.experience, picks.length)}>
          {twoPane ? (
            <ul className={styles.list} onKeyDown={onListKey} aria-label="Good next songs for you">
              {picks.map((p) => (
                <SongRow key={p.listing.id} listing={p.listing} previewed={previewListing?.id === p.listing.id} flash={flash === p.listing.id} reason={p.reason} />
              ))}
            </ul>
          ) : (
            <div onKeyDown={onListKey}>
              <NextSongs picks={picks} />
            </div>
          )}
        </Section>
      )}
      <Section
        title={
          <>
            {listTitle} <span className={styles.count}>{rest.length}</span>
          </>
        }
        actions={rest.length > 1 ? sortSelect : undefined}
        aria-busy={!ready}
      >
        {rest.length ? rows(rest) : !featured || narrowed ? emptyState : null}
      </Section>
    </div>
  );

  return (
    <SongActionsContext.Provider value={actions}>
      <Page title="Songs" subtitle="Play along with tab, chords and lyrics. The songs you import live here too." actions={headerActions} className={styles.page}>
        <div ref={rootRef} className={styles.screen} data-songs-ready={ready ? 'true' : 'false'}>
          <div className={styles.toolbar}>
            <div className={styles.searchRow}>
              <SearchField ref={searchRef} label="Search songs" placeholder={isMobile ? 'Search songs' : 'Search by title, composer or style'} value={query} onChange={setQuery} className={styles.search} aria-keyshortcuts="/" />
              {isMobile && (
                <Button iconLeft="SlidersHorizontal" onClick={() => setFiltersOpen(true)} pressed={filterCount(filterValue) > 0} aria-haspopup="dialog" className={styles.filtersButton}>
                  {filterCount(filterValue) ? `Filters · ${filterCount(filterValue)}` : 'Filters'}
                </Button>
              )}
            </div>
            <div className={styles.filterRow}>
              {scopeChips}
              {!isMobile && <FilterBar value={filterValue} onChange={(f) => setView(f)} styles={availableStyles} />}
            </div>
            <ActiveFilters value={filterValue} onChange={(f) => setView(f)} />
          </div>

          {twoPane ? (
            <div className={styles.twoPane}>
              {main}
              <aside className={styles.pane} aria-label="Song details">
                {previewListing ? <SongDetails key={previewListing.id} listing={previewListing} variant="pane" titleOf={titleOf} /> : null}
              </aside>
            </div>
          ) : (
            main
          )}
        </div>

        {dragging && (
          <div className={styles.dropOverlay} aria-hidden="true">
            <div className={styles.dropCard}>
              <Icon name="FileMusic" size="xl" />
              <p className={styles.dropTitle}>Drop to add to your songs</p>
              <p className={styles.dropHint}>Guitar Pro, MusicXML, MIDI, text tab, ChordPro or SixTab</p>
            </div>
          </div>
        )}
        {busy && !add && (
          <div className={styles.busy} role="status">
            <Spinner size={16} tone="accent">
              {busy}
            </Spinner>
          </div>
        )}

        <AddSongSheet
          open={add !== null}
          mode={add ?? 'choose'}
          onMode={(m) => {
            setPasteSeed(null);
            setAdd(m);
          }}
          onClose={() => {
            setAdd(null);
            setPasteSeed(null);
          }}
          onFiles={(files) => void importFiles(files)}
          onPaste={(text, title) => void importPasted(text, title)}
          pasteSeed={pasteSeed}
          busy={busy}
          status={status}
        />
        <ImportResultSheet
          outcome={outcome}
          onClose={() => setOutcome(null)}
          onUndo={(o) => void undoImport(o)}
          onEdit={(item: ImportedSong) => {
            setOutcome(null);
            setEditing(songs.find((s) => s.id === item.listing.id) ?? item.listing);
          }}
        />
        <EditDetails
          listing={editing}
          onClose={() => setEditing(null)}
          onSave={async (id, patch) => {
            try {
              const saved = await library.update(id, patch);
              setEditing(null);
              flashSong(saved.id);
              toast.ok('Details saved');
            } catch (e) {
              toast.error('Could not save the details', { description: asLibraryError(e).message });
            }
          }}
        />
        <ExportSheet listing={exporting} onClose={() => setExporting(null)} />
        <Sheet open={!!about} onClose={() => setAbout(null)} title={about?.title ?? 'Song'} hideTitle size="md">
          {about && <SongDetails listing={songs.find((s) => s.id === about.id) ?? about} variant="sheet" titleOf={titleOf} />}
        </Sheet>
        {isMobile && (
          <Sheet
            open={filtersOpen}
            onClose={() => setFiltersOpen(false)}
            title="Filters"
            footer={
              <>
                <Button variant="ghost" disabled={!filterCount(filterValue)} onClick={() => setView(NO_FILTERS)}>
                  Clear all
                </Button>
                <Button variant="primary" onClick={() => setFiltersOpen(false)}>
                  {visible.length === 1 ? 'Show 1 song' : `Show ${visible.length} songs`}
                </Button>
              </>
            }
          >
            <FilterPanel value={filterValue} onChange={(f) => setView(f)} styles={availableStyles} />
          </Sheet>
        )}
      </Page>
    </SongActionsContext.Provider>
  );
}

/** The line under "Good next songs for you". */
function nextLine(experience: string | null, n: number): string {
  if (!n) return '';
  if (experience === 'expert') return 'Picked for an experienced player, from what you have played so far.';
  if (experience === 'intermediate') return 'Picked for where you are now: a little stretch, nothing out of reach.';
  return 'Picked for where you are now: each one opens ready to slow down and loop.';
}

