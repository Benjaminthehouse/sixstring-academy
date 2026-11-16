/**
 * Proofreading printed music: the learner's picture and the tab it was read into, side by side on
 * a wide screen (toggled on a phone), with the doubtful notes marked on both, a correction panel
 * for the selected note or bar, playback to hear mistakes, undo, the AI helper as a second reader,
 * and "Save and play". Keyboard: arrows move, digits set frets, Delete removes, Ctrl+Z undoes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionBar, Badge, Banner, Button, Icon, IconButton, Menu, Page, SegmentedControl, Spinner, Text, confirmDialog, cx, toast, useEventListener, useIsMobile, useMediaQuery, useRafLoop } from '@/ui';
import { TabView, noteKey, type TabNoteState, type TabSeek, type TabViewHandle } from '@/ui/music';
import { href } from '@/app/router';
import { AI_SETTINGS_PARAMS, showNotation } from '@/core/settings';
import type { NoteValue } from '@/core/song';
import type { ScanState } from '../engine/useScan';
import { saveErrorMessage } from '../engine/useScan';
import { usePreviewPlayer } from '../engine/preview';
import { type AiAvailability, aiAvailability } from '../engine/read';
import { type Draft, GUESS, viewSong } from '../model/draft';
import { roomFor } from '../model/room';
import { type EditResult, addNote, confirm, deleteBeat, deleteNote, evenBar, fitBar, insertBeat, rearrange, setDetails, setFret, setPitch, setString, setTuning, setValue, splitBar } from '../model/edit';
import { type FretTyping, keyCommand, typeDigit } from '../model/keys';
import { type Selection, firstSelection, itemsToCheck, moveSelection, nextToCheck, selectBeat } from '../model/select';
import { DetailsSheet, type DetailsChange } from './DetailsSheet';
import { Inspector, type InspectorActions, type InspectorTab } from './Inspector';
import { Saved } from './Saved';
import { SourceView, type SourcePage } from './SourceView';
import { typingTarget } from './Capture';
import styles from './Proofread.module.css';

const TWO_PANE = '(min-width: 1000px)';

function useRoom(): { short: boolean; tight: boolean } {
  const measure = () => {
    if (typeof window === 'undefined') return { short: false, tight: false };
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return roomFor(window.innerWidth, window.innerHeight, rem);
  };
  const [room, setRoom] = useState(measure);
  useEventListener(window, 'resize', () => {
    const next = measure();
    setRoom((r) => (r.short === next.short && r.tight === next.tight ? r : next));
  });
  return room;
}

/** Is the key event aimed at a control that uses the key itself? */
function controlTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.closest('[data-tab-view]') && !el.closest('button')) return false;
  return typingTarget(el) || !!el.closest('button, a, [role="radio"], [role="slider"], [role="spinbutton"], [role="menu"], [role="dialog"]');
}

/** The proofreader. */
export function Proofread({ scan }: { scan: ScanState }) {
  const draft = scan.draft!;
  const mobile = useIsMobile();
  const twoPane = useMediaQuery(TWO_PANE);
  // A phone held sideways has the width of a tablet but little height: keep the panel compact. Large
  // text on a phone is the same squeeze upright: a slim header and a panel that folds away.
  const { short, tight } = useRoom();
  const compact = mobile || short || tight;
  const [panelOpen, setPanelOpen] = useState(!tight);
  useEffect(() => setPanelOpen(!tight), [tight]);
  const [sel, setSel] = useState<Selection | null>(() => {
    const first = nextToCheck(draft, null);
    return first ? selectBeat(draft, first.bar, first.beat ?? 0, first.note !== null ? draft.song.tracks[0].measures[first.bar].beats[first.beat ?? 0]?.notes[first.note]?.string ?? 1 : 1) : firstSelection(draft);
  });
  const [pane, setPane] = useState<'tab' | 'sheet'>('tab');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('note');
  const [details, setDetails_] = useState(false);
  const [position, setPosition] = useState(1);
  const [saving, setSaving] = useState(false);
  const [hideHard, setHideHard] = useState(false);
  const [ai, setAi] = useState<AiAvailability | null>(null);
  const [aiMessage, setAiMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const tab = useRef<TabViewHandle | null>(null);
  const tabBox = useRef<HTMLDivElement | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const typing = useRef<FretTyping | null>(null);

  const view = useMemo(() => viewSong(draft), [draft]);
  const player = usePreviewPlayer(view);
  const items = useMemo(() => itemsToCheck(draft), [draft]);
  const notation = draft.hasNotation || showNotation();
  const pages: SourcePage[] = useSourcePages(scan);

  useEffect(() => {
    let live = true;
    void aiAvailability().then((a) => live && setAi(a));
    return () => {
      live = false;
    };
  }, []);

  // Keep the selection on something that exists after an edit or an undo.
  useEffect(() => {
    if (!sel) return;
    const beats = draft.song.tracks[0].measures[sel.bar]?.beats;
    if (!beats) {
      setSel(firstSelection(draft));
      return;
    }
    if (sel.beat === null) return;
    const beat = beats[sel.beat];
    if (!beat) {
      setSel(beats.length ? selectBeat(draft, sel.bar, beats.length - 1, sel.string) : { bar: sel.bar, beat: null, note: null, string: null });
      return;
    }
    if (sel.note !== null && !beat.notes[sel.note]) setSel(selectBeat(draft, sel.bar, sel.beat, sel.string));
  }, [draft, sel]);

  // The tab follows the selection; while playing it follows the sound.
  const beatStart = sel && sel.beat !== null ? draft.song.tracks[0].measures[sel.bar]?.beats[sel.beat]?.start ?? 0 : 0;
  const cursor = useMemo(() => (sel && !player.playing ? { bar: sel.bar, tick: beatStart } : null), [sel, beatStart, player.playing]);
  useRafLoop(() => tab.current?.setPlayerPosition(player.position()), player.playing);

  const states = useMemo(() => {
    const m = new Map<string, TabNoteState>();
    draft.marks.forEach((bm, bar) =>
      bm.beats.forEach((b, beat) =>
        b.notes.forEach((nm, i) => {
          const n = draft.song.tracks[0].measures[bar]?.beats[beat]?.notes[i];
          if (!n) return;
          if (!nm.checked && nm.confidence < GUESS) m.set(noteKey(bar, beat, n.string), 'miss');
          else if (nm.checked && nm.source === 'user') m.set(noteKey(bar, beat, n.string), 'hit');
        }),
      ),
    );
    if (sel && sel.beat !== null && sel.note !== null) {
      const n = draft.song.tracks[0].measures[sel.bar]?.beats[sel.beat]?.notes[sel.note];
      if (n) m.set(noteKey(sel.bar, sel.beat, n.string), 'target');
    }
    return m;
  }, [draft, sel]);

  // ---- edits ---------------------------------------------------------------------------------
  const act = useCallback(
    (r: EditResult, next?: (d: typeof draft) => Selection | null) => {
      if (!r.ok) {
        toast.warn(r.message);
        return false;
      }
      scan.apply(r.draft);
      if (next) {
        const s = next(r.draft);
        if (s) setSel(s);
      }
      return true;
    },
    [scan],
  );

  const noteRef = sel && sel.beat !== null && sel.note !== null ? { bar: sel.bar, beat: sel.beat, note: sel.note } : null;
  const beatRef = sel && sel.beat !== null ? { bar: sel.bar, beat: sel.beat } : null;

  const actions: InspectorActions = {
    setFret: (f) => noteRef && act(setFret(draft, noteRef, f)),
    setString: (s) => noteRef && act(setString(draft, noteRef, s, draft.notationOnly ? 'pitch' : 'fret'), (d) => selectBeat(d, noteRef.bar, noteRef.beat, s)),
    setValue: (v: NoteValue) => beatRef && act(setValue(draft, beatRef, v)),
    stepPitch: (by) => {
      if (!noteRef) return;
      const n = draft.song.tracks[0].measures[noteRef.bar].beats[noteRef.beat].notes[noteRef.note];
      act(setPitch(draft, noteRef, n.midi + by), (d) => {
        const b = d.song.tracks[0].measures[noteRef.bar].beats[noteRef.beat];
        const i = b.notes.findIndex((x) => x.midi === n.midi + by);
        return i >= 0 ? { bar: noteRef.bar, beat: noteRef.beat, note: i, string: b.notes[i].string } : null;
      });
    },
    deleteNote: () => noteRef && act(deleteNote(draft, noteRef), (d) => selectBeat(d, noteRef.bar, noteRef.beat, sel?.string ?? null)),
    deleteBeat: () => beatRef && act(deleteBeat(draft, beatRef), (d) => {
      const beats = d.song.tracks[0].measures[beatRef.bar].beats;
      return beats.length ? selectBeat(d, beatRef.bar, Math.min(beatRef.beat, beats.length - 1), sel?.string ?? null) : { bar: beatRef.bar, beat: null, note: null, string: null };
    }),
    // "It's right" vouches for what is shown: the doubtful note, and the beat's length when that was in doubt.
    confirm: () => beatRef && act(confirmShown(draft, beatRef, sel?.note ?? null), (d) => {
      const next = nextToCheck(d, sel);
      return next ? selFromItem(d, next) : null;
    }),
    addNote: (s, f) => beatRef && act(addNote(draft, beatRef, s, f), (d) => selectBeat(d, beatRef.bar, beatRef.beat, s)),
    insertBeat: () => beatRef && act(insertBeat(draft, beatRef, 'after'), (d) => selectBeat(d, beatRef.bar, beatRef.beat + 1, sel?.string ?? 1)),
    fitBar: () => sel && act(fitBar(draft, sel.bar)),
    evenBar: () => sel && act(evenBar(draft, sel.bar)),
    splitBar: () => sel && act(splitBar(draft, sel.bar), (d) => selectBeat(d, sel.bar, 0, sel.string)),
    select: (s) => setSel(s),
  };

  const goNext = useCallback(() => {
    const next = nextToCheck(draft, sel);
    if (!next) {
      toast.ok('Nothing left to check. Play it through once to be sure.');
      return;
    }
    setSel(selFromItem(draft, next));
    tab.current?.scrollToBar(next.bar, { smooth: true });
  }, [draft, sel]);

  // ---- taps on the tab ---------------------------------------------------------------------------
  const onSeek = useCallback(
    (at: TabSeek) => {
      const beats = draft.song.tracks[0].measures[at.bar]?.beats ?? [];
      if (at.beat >= beats.length) {
        setSel({ bar: at.bar, beat: null, note: null, string: null });
        return;
      }
      // Which string was tapped: from the pointer's height on the staff.
      let string: number | null = sel?.string ?? null;
      const L = tab.current?.getLayout();
      const content = tabBox.current?.querySelector('[data-tab-view] > div') as HTMLElement | null;
      if (L && content && pointer.current) {
        const r = content.getBoundingClientRect();
        const y = pointer.current.y - r.top;
        const mi = L.measures.findIndex((m) => m.bar === at.bar);
        const sys = mi >= 0 ? L.systems[L.measures[mi].system] : null;
        if (sys) {
          const n = draft.song.tuning.length;
          const gap = (sys.staffBottom - sys.staffTop) / Math.max(1, n - 1);
          const s = Math.round((y - sys.y - sys.staffTop) / gap) + 1;
          if (s >= 1 && s <= n) string = s;
          else if (s < 1 && notation) string = null;
        }
      }
      pointer.current = null;
      setSel(selectBeat(draft, at.bar, at.beat, string));
    },
    [draft, sel, notation],
  );

  // ---- keyboard ------------------------------------------------------------------------------
  // On the window, so the keys work from the start: after reading, nothing inside has focus yet.
  const root = useRef<HTMLDivElement | null>(null);
  useEventListener(
    window,
    'keydown',
    (e) => {
      const at = e.target;
      if (e.defaultPrevented || !root.current || !(at instanceof Node) || !(at === document.body || root.current.contains(at))) return;
      onKey(e);
    },
    true,
  );
  const onKey = (e: KeyboardEvent) => {
    const cmd = keyCommand(e);
    if (!cmd) return;
    if (cmd.type === 'undo' || cmd.type === 'redo') {
      if (typingTarget(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      if (cmd.type === 'undo') scan.undo();
      else scan.redo();
      return;
    }
    if (controlTarget(e.target)) return;
    if (!sel && cmd.type === 'move') {
      e.preventDefault();
      setSel(firstSelection(draft));
      return;
    }
    if (!sel && cmd.type !== 'play' && cmd.type !== 'next') return;
    e.preventDefault();
    e.stopPropagation();
    switch (cmd.type) {
      case 'move':
        if (sel) {
          const s = moveSelection(draft, sel, cmd.dir);
          setSel(s);
          if (s.bar !== sel.bar) tab.current?.scrollToBar(s.bar);
        }
        break;
      case 'digit': {
        if (!beatRef) break;
        const target = `${sel!.bar}:${sel!.beat}:${sel!.string ?? ''}`;
        const t = typeDigit(typing.current, target, cmd.digit, performance.now(), 24);
        typing.current = t.typing;
        if (noteRef) actions.setFret(t.fret);
        else if (sel?.string) actions.addNote(sel.string, t.fret);
        break;
      }
      case 'step':
        if (noteRef) {
          const n = draft.song.tracks[0].measures[noteRef.bar].beats[noteRef.beat].notes[noteRef.note];
          if (draft.notationOnly) actions.stepPitch(cmd.by);
          else actions.setFret(Math.max(0, Math.min(24, n.fret + cmd.by)));
        }
        break;
      case 'delete':
        if (cmd.beat || !noteRef) actions.deleteBeat();
        else actions.deleteNote();
        break;
      case 'value': {
        const cur = beatRef ? draft.song.tracks[0].measures[beatRef.bar].beats[beatRef.beat]?.value : undefined;
        actions.setValue({ base: cmd.base, ...(cur?.base === cmd.base && cur.dots ? { dots: cur.dots } : {}) });
        break;
      }
      case 'dot': {
        const cur = beatRef ? draft.song.tracks[0].measures[beatRef.bar].beats[beatRef.beat]?.value : undefined;
        if (cur) actions.setValue({ base: cur.base, ...(cur.dots ? {} : { dots: 1 }) });
        break;
      }
      case 'confirm':
        actions.confirm();
        break;
      case 'next':
        goNext();
        break;
      case 'play':
        player.toggle(sel?.bar);
        break;
      case 'clear':
        setSel(null);
        break;
      default:
    }
  };

  // ---- details, AI, save -----------------------------------------------------------------------
  const applyDetails = (c: DetailsChange) => {
    setDetails_(false);
    let d = draft;
    const meta = setDetails(d, { ...(c.title ? { title: c.title } : {}), ...(c.bpm ? { bpm: c.bpm } : {}), ...(c.key !== undefined ? { key: c.key } : {}), ...(c.capo !== undefined ? { capo: c.capo } : {}) });
    if (!meta.ok) return toast.warn(meta.message);
    d = meta.draft;
    if (c.tuning) {
      const r = setTuning(d, c.tuning.midi, c.tuning.keep);
      if (!r.ok) return toast.warn(r.message);
      d = r.draft;
    }
    if (c.position !== undefined) {
      const r = rearrange(d, { preferPosition: c.position });
      if (!r.ok) return toast.warn(r.message);
      d = r.draft;
      setPosition(c.position);
    }
    if (d !== draft) scan.apply(d);
  };

  const runAi = async () => {
    if (!ai || ai.state !== 'ready') return;
    setAiMessage(null);
    const edits = scan.history?.past.length ?? 0;
    const go = await confirmDialog({
      title: 'Ask the AI helper to check it?',
      description: `It sends a picture of each line of music to Claude${ai.provider === 'anthropic' ? ' with your own key' : ''} and compares its reading with this one: notes both agree on stay, doubtful ones get settled, anything it adds is marked for you to check. Nothing else is sent.${edits > 0 ? ` Your ${edits} ${edits === 1 ? 'change' : 'changes'} will be replaced by the new reading; Undo brings them back.` : ''}`,
      confirmLabel: 'Send and compare',
    });
    if (!go) return;
    const r = await scan.improveWithAi();
    setAiMessage({ ok: r.ok, text: r.message });
  };

  const save = async () => {
    const bad = items.filter((i) => i.kind === 'bar');
    if (bad.length) {
      const go = await confirmDialog({
        title: bad.length === 1 ? 'One bar does not add up' : `${bad.length} bars do not add up`,
        description: `${bad.slice(0, 3).map((b) => b.text).join(' ')} If you save now, a bar that holds more than one bar is split into bars, a short bar gets a rest at the end, and a note that runs past a bar line is cut there.`,
        confirmLabel: 'Save anyway',
        cancelLabel: 'Fix them first',
      });
      if (!go) {
        setSel(selFromItem(draft, bad[0]));
        return;
      }
    }
    setSaving(true);
    player.stop();
    try {
      await scan.saveDraft();
    } catch (e) {
      toast.error('It could not be saved', { description: saveErrorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  if (scan.saved) return <Saved scan={scan} />;

  const summary = scan.summary;
  const left = items.length;
  const verdict = summary?.verdict ?? 'check';
  const verdictTone = left === 0 ? 'ok' : verdict === 'poor' ? 'bad' : 'warn';
  const headline = left === 0 ? 'All checked' : verdict === 'poor' ? 'A hard picture to read' : verdict === 'good' && left <= 3 ? 'Read well' : 'Read, with some doubts';
  // A poor reading with doubts left: checking comes before saving.
  const hard = verdict === 'poor' && left > 0;
  const showSource = (twoPane && !tight) || pane === 'sheet';
  const showTab = (twoPane && !tight) || pane === 'tab';

  return (
    <div ref={root} className={cx(styles.root, twoPane && !short && !tight && styles.fixed, short && styles.short)} data-scan="proof">
      <Page title={draft.song.meta.title} hideHeader width="full" gap={4} className={styles.page}>
        {!short && !tight && (<header className={styles.head}>
          <div className={styles.headMain}>
            <p className={styles.eyebrow}>Check the reading</p>
            <h2 className={styles.title}>
              {/* The title is the way to the song's details: it looks and acts like the button it is. */}
              <button type="button" className={styles.titleButton} onClick={() => setDetails_(true)} title="Rename, tempo, key, tuning and capo" data-scan-title="" data-scan-details="">
                <span className={styles.titleText}>{draft.song.meta.title}</span>
                <span className={styles.titleEdit} aria-hidden="true">
                  <Icon name="Pencil" size="sm" />
                </span>
                <span className={styles.srOnly}> (rename, tempo, key, tuning and capo)</span>
              </button>
            </h2>
            <div className={styles.verdict} aria-live="polite">
              <Badge tone={verdictTone} icon={verdictTone === 'ok' ? 'CircleCheck' : verdictTone === 'bad' ? 'CircleX' : 'Eye'}>
                {headline}
              </Badge>
              <Text size="sm" tone="muted" data-scan-left={left}>
                {left === 0 ? 'Nothing marked as doubtful is left.' : `${left} ${left === 1 ? 'thing' : 'things'} to check, marked with a dashed outline.`}
              </Text>
            </div>
          </div>
          <div className={styles.headActions}>
            <Button variant={hard ? 'secondary' : 'primary'} size={mobile ? 'md' : 'lg'} iconLeft="Check" loading={saving} onClick={() => void save()} data-scan-save="">
              Save and play
            </Button>
          </div>
        </header>)}

        {hard && !hideHard && !short && !tight && (
          <Banner
            tone="warn"
            title="This picture was hard to read"
            onDismiss={() => setHideHard(true)}
            actions={
              <Button
                size="sm"
                variant="primary"
                iconLeft="SkipForward"
                onClick={() => {
                  // The warning has done its job: give the music the room.
                  setHideHard(true);
                  goNext();
                }}
                data-scan-start-checking=""
              >
                Check them one by one
              </Button>
            }
          >
            Expect misread and missing notes: check the {left} marked ones against your picture, or retake it flat, close and in good light.
          </Banner>
        )}

        {!short && !tight && <AiOffer ai={ai} busy={scan.aiBusy} message={aiMessage} onRun={() => void runAi()} onStop={scan.stopAi} />}

        <div className={styles.toolbar} role="toolbar" aria-label="Proofreading tools">
          {(!twoPane || tight) && (
            <SegmentedControl
              aria-label="Show"
              size="sm"
              options={[
                { value: 'tab', label: 'Tab' },
                { value: 'sheet', label: 'Your sheet' },
              ]}
              value={pane}
              onChange={(v) => setPane(v as 'tab' | 'sheet')}
            />
          )}
          <div className={styles.tools}>
            <Button size="sm" variant={player.playing ? 'secondary' : 'ghost'} iconLeft={player.playing ? 'Square' : 'Play'} onClick={() => player.toggle(sel?.bar)} data-scan-play="" aria-keyshortcuts="Space">
              <span className={styles.playText}>{player.playing ? 'Stop' : sel && !mobile ? `Play from bar ${sel.bar + 1}` : 'Play'}</span>
            </Button>
            <IconButton icon="Undo2" label="Undo (Ctrl+Z)" size="sm" disabled={!scan.history?.past.length} onClick={() => {
              scan.undo();
              setAiMessage(null);
            }} data-scan-undo="" />
            {!mobile && <IconButton icon="Redo2" label="Redo (Ctrl+Shift+Z)" size="sm" disabled={!scan.history?.future.length} onClick={scan.redo} />}
            {/* A phone shows it only while something is left: "All checked" already says the rest. */}
            {(!mobile || left > 0) && (
              <Button size="sm" variant="ghost" iconLeft="SkipForward" onClick={goNext} disabled={left === 0} data-scan-next="" aria-keyshortcuts="N" aria-label={`Next to check, ${left} left`}>
                {mobile ? `${left}` : `Next to check (${left})`}
              </Button>
            )}
            <Menu
              trigger={<IconButton icon="SlidersHorizontal" label="Song details and more" size="sm" />}
              items={[
                { label: 'Title, tempo, key, tuning, capo', icon: 'Settings2', onSelect: () => setDetails_(true) },
              ...(mobile ? [{ label: 'Redo', icon: 'Redo2', disabled: !scan.history?.future.length, onSelect: scan.redo }] : []),
                ...((short || tight) && ai?.state === 'ready' ? [{ label: 'Improve with AI', icon: 'Sparkles', onSelect: () => void runAi() }] : []),
                { label: 'Back to the pages', icon: 'ArrowLeft', onSelect: () => scan.setPhase('pages') },
                { label: 'Keyboard shortcuts', icon: 'Keyboard', onSelect: () => toast.info('Keyboard', { description: 'Arrows move between notes. 0-9 set the fret (two digits quickly for 10-24), + and - step it. W H Q E S set the length, . adds a dot. Delete removes a note. Enter says it is right. N goes to the next doubt. Space plays. Ctrl+Z undoes.', duration: 12000 }) },
              ]}
            />
            {(short || tight) && (
              <Button variant="primary" size="sm" iconLeft="Check" loading={saving} onClick={() => void save()} data-scan-save="">
                Save and play
              </Button>
            )}
          </div>
        </div>

        <div className={cx(styles.body, twoPane && !short && !tight && styles.twoPane, short && styles.side)}>
          {showSource && pages.length > 0 && (
            <div className={styles.sourcePane}>
              <SourceView pages={pages} draft={draft} sel={sel} onSelect={(s) => setSel(s.beat === null ? { bar: s.bar, beat: null, note: null, string: null } : selectBeat(draft, s.bar, s.beat, draft.song.tracks[0].measures[s.bar]?.beats[s.beat]?.notes[s.note ?? 0]?.string ?? null))} className={styles.source} />
            </div>
          )}
          {showTab && (
            <div
              ref={tabBox}
              className={styles.tabPane}
              onPointerDownCapture={(e) => (pointer.current = { x: e.clientX, y: e.clientY })}
              onPointerUpCapture={(e) => (pointer.current = { x: e.clientX, y: e.clientY })}
              data-scan-tab=""
            >
              <TabView ref={tab} song={view} notation={notation} size={mobile ? 'md' : 'lg'} noteStates={states} cursor={cursor} onSeek={onSeek} selection={sel && sel.beat === null ? { from: sel.bar, to: sel.bar } : null} aria-label={`Tab of ${draft.song.meta.title}. Tap a note to check it; arrow keys move, digits set the fret.`} />
              {(summary?.lines.length || scan.readNotes.length) ? (
                <details className={styles.about}>
                  <summary>What the reader found</summary>
                  <ul>
                    {[...(summary?.lines ?? []), ...scan.readNotes].map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {draft.notationOnly && (
                <Text size="sm" tone="muted" className={styles.note}>
                  No tab was printed, so the strings and frets were chosen for you. Change where it sits on the neck in the song details.
                </Text>
              )}
            </div>
          )}
          {short && (
            <aside className={styles.sidePanel} aria-label="Correct the selection">
              <Inspector draft={draft} sel={sel} actions={actions} notationOnly={draft.notationOnly} compact tab={inspectorTab} onTab={setInspectorTab} />
            </aside>
          )}
        </div>

        {!short && (
          <ActionBar stretchOnMobile={false} className={styles.inspectorBar} aria-label="Correct the selection">
            <div className={styles.inspector}>
              <Inspector draft={draft} sel={sel} actions={actions} notationOnly={draft.notationOnly} compact={compact} tab={inspectorTab} onTab={setInspectorTab} {...(tight ? { open: panelOpen, onToggle: () => setPanelOpen((o) => !o) } : {})} />
            </div>
          </ActionBar>
        )}
      </Page>
      <DetailsSheet open={details} draft={draft} position={position} onClose={() => setDetails_(false)} onApply={applyDetails} />
    </div>
  );
}

/** Confirm the selected note, and the beat itself when its rhythm (or a note without its own doubt) is what was doubtful. */
function confirmShown(draft: Draft, beat: { bar: number; beat: number }, note: number | null): EditResult {
  const bm = draft.marks[beat.bar]?.beats[beat.beat];
  const nm = bm && note !== null ? bm.notes[note] : undefined;
  const noteDoubt = !!nm && !nm.checked && nm.confidence < GUESS;
  const rhythmDoubt = !!bm && !bm.checked && bm.confidence < GUESS;
  if (noteDoubt && !rhythmDoubt) return confirm(draft, { ...beat, note });
  const r = confirm(draft, { ...beat, note: null });
  return r;
}

function selFromItem(draft: Draft, item: { bar: number; beat: number | null; note: number | null }): Selection {
  if (item.beat === null) return { bar: item.bar, beat: null, note: null, string: null };
  const n = item.note !== null ? draft.song.tracks[0].measures[item.bar]?.beats[item.beat]?.notes[item.note] : undefined;
  return selectBeat(draft, item.bar, item.beat, n?.string ?? null);
}

/** The pictures the reading came from, with their staff space. */
function useSourcePages(scan: ScanState): SourcePage[] {
  const { readPages, doc } = scan;
  return useMemo(
    () => readPages.map((p, i) => ({ url: p.url, width: p.width, height: p.height, label: p.label, staffSpace: doc?.pages[i]?.staffSpace || 12 })),
    [readPages, doc],
  );
}

function AiOffer({ ai, busy, message, onRun, onStop }: { ai: AiAvailability | null; busy: ScanState['aiBusy']; message: { ok: boolean; text: string } | null; onRun: () => void; onStop: () => void }) {
  if (!ai || ai.state === 'unavailable' || ai.state === 'no-images') return null;
  if (busy) {
    return (
      <div className={styles.ai} data-scan-ai="busy" role="status">
        <Spinner size={18} tone="accent" />
        <Text size="sm">{busy.message}</Text>
        <Button size="sm" variant="ghost" onClick={onStop}>
          Stop
        </Button>
      </div>
    );
  }
  if (ai.state === 'settings') {
    return (
      <div className={styles.ai} data-scan-ai="settings">
        <Icon name="Sparkles" size="sm" />
        <Text size="sm" tone="muted">
          {ai.message}{' '}
          <a href={href('profile', ...AI_SETTINGS_PARAMS)} className={styles.inlineLink}>
            Open AI settings
          </a>
        </Text>
      </div>
    );
  }
  return (
    <div className={styles.ai} data-scan-ai="ready">
      <Icon name="Sparkles" size="sm" />
      <Text size="sm" tone={message ? (message.ok ? 'ok' : 'warn') : 'muted'} aria-live="polite">
        {message?.text ?? 'A second reader, the AI helper, can check the doubtful notes against your picture.'}
      </Text>
      <Button size="sm" iconLeft="Sparkles" onClick={onRun} data-scan-ai-run="">
        Improve with AI
      </Button>
    </div>
  );
}
