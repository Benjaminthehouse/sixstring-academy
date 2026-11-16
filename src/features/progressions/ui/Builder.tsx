/**
 * Build your own progression (`#progressions--builder`): tap numerals from the key's chords (and,
 * for the curious, borrowed and secondary chords), see the theory engine's likely next chords and
 * the cadences as they form, set how long each chord lasts, play it with the band, transpose it,
 * name it and save it. The working draft is kept on the device, so nothing is lost on the way out.
 *
 * Keyboard: 1–7 add the key's chords, Backspace removes the selected (or last) chord, Space plays
 * and pauses, ←/→ move the key a half step.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { href } from '@/app/router';
import { useScreenTitle } from '@/app/shell';
import { backingFor, formatSlot, resolveSlot } from '@/content/progressions';
import { BACKING_STYLES, BACKING_STYLE_IDS, type BackingStyleId } from '@/core/audio';
import { awardXp, touchRecent } from '@/core/progress';
import {
  ActionBar, Badge, Button, Icon, EmptyState, IconButton, Kbd, LinkButton, List, ListItem, Menu, Modal, Page, PlayButton,
  Section, SegmentedControl, Select, Stepper, Switch, Text, TextField, confirmDialog, cx, toast, useEventListener, useIsMobile,
} from '@/ui';
import { useMusicSettings } from '@/ui/music';
import { strumChord } from '../audio/preview';
import {
  MAX_SLOTS, SLOT_LENGTHS, STARTER_DRAFT, addSlot, degreeChord, draftBars, draftCadences, draftHome, draftLayout, draftProgression, draftTitle,
  latestCadence, moveSlot, palette, removeSlot, setKey, setLength, spellKey, suggestNext, transposeDraft,
  type BuilderDraft, type BuilderMode, type PaletteChord, type SlotLength,
} from '../model/builder';
import { clampTempo, feelFor, positionOf } from '../model/jam';
import { BUILT_XP, deleteSaved, draftFromSaved, restoreSaved, saveDraft, renameSaved, useSavedProgressions, type SavedProgression } from '../model/saved';
import { chordName, dialogOpen, keyName, noteName, ownsKey, useJamSettings } from './shared';
import { useBand, useBandLog } from './useBand';
import styles from './Builder.module.css';

const LENGTH_LABEL: Record<SlotLength, string> = { 0.5: '½ bar', 1: '1 bar', 2: '2 bars', 4: '4 bars' };
const ROLE_LABEL = { home: 'Home', away: 'Away', tension: 'Tension' } as const;

/** Props for {@link Builder}. */
export interface BuilderProps {
  draft: BuilderDraft;
  setDraft: (next: BuilderDraft | ((prev: BuilderDraft) => BuilderDraft)) => void;
}

/** The builder screen. */
export function Builder({ draft, setDraft }: BuilderProps) {
  const { naming } = useMusicSettings();
  const isPhone = useIsMobile();
  const saved = useSavedProgressions();
  const [settings] = useJamSettings();
  const [selected, setSelected] = useState<number | null>(null);
  const [nameDialog, setNaming] = useState<{ open: boolean; value: string; then?: 'save' | 'copy' }>({ open: false, value: '' });
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  useScreenTitle(draft.name.trim() || 'Build a progression');

  const home = draftHome(draft);
  const layout = useMemo(() => draftLayout(draft), [draft]);
  const progression = useMemo(() => draftProgression(draft), [draft]);
  const pal = useMemo(() => palette(draft), [draft]);
  const suggestions = useMemo(() => suggestNext(draft, 4), [draft]);
  const cadences = useMemo(() => draftCadences(draft), [draft]);
  const latest = useMemo(() => latestCadence(draft), [draft]);
  const symbols = useMemo(() => draft.slots.map((s) => {
    try {
      return resolveSlot(s.token, home).symbol;
    } catch {
      return '?';
    }
  }), [draft.slots, home]);

  // ── The band ────────────────────────────────────────────────────────────────────────────
  const setup = useMemo(() => {
    if (!progression) return null;
    return backingFor(progression, draft.tonic, { feel: feelFor(draft.style), tempo: draft.tempo, loop: true, choruses: 1, countInBars: settings.countIn });
  }, [progression, draft.tonic, draft.style, draft.tempo, settings.countIn]);
  const band = useBand(setup, { muted: settings.muted });
  const playing = band.status === 'playing' || band.status === 'count-in';
  // Playing along with the band here is a jam like any other.
  useBandLog(band, {
    skillId: 'progression:builder',
    title: `Jam: ${draft.name.trim() || draftTitle(draft)}`,
    params: draft.savedId ? ['builder', draft.savedId] : ['builder'],
    data: { tonic: draft.tonic, tempo: draft.tempo, style: draft.style },
  });
  const playingSlot = useMemo(() => {
    if (!band.heard || !setup || band.status === 'idle') return null;
    const pos = positionOf(setup.resolved, band.heard.segment);
    return layout.barSlots[pos.bar]?.[pos.index] ?? null;
  }, [band.heard, band.status, setup, layout]);

  // ── Editing ─────────────────────────────────────────────────────────────────────────────
  const add = useCallback((token: string) => {
    if (draft.slots.length >= MAX_SLOTS) {
      toast.info(`A progression holds up to ${MAX_SLOTS} chords`, { id: 'progressions-full', description: 'Remove one to make room, or save this one and start another.' });
      return;
    }
    setDraft((d) => {
      const at = selected !== null && selected < d.slots.length ? selected + 1 : undefined;
      const next = addSlot(d, token, 1, at);
      return next;
    });
    setSelected((s) => (s !== null ? s + 1 : null));
    let symbol = token;
    try {
      symbol = resolveSlot(token, home).symbol;
    } catch {
      /* keep the token */
    }
    if (!playing) void strumChord(symbol);
  }, [setDraft, selected, home, playing, draft.slots.length]);

  const remove = useCallback((index: number) => {
    setDraft((d) => removeSlot(d, index));
    setSelected((s) => (s === null ? null : s >= index && s > 0 ? s - 1 : s === index ? null : s));
  }, [setDraft]);

  const clearAll = useCallback(() => {
    const before = draft;
    setDraft({ ...draft, slots: [] });
    setSelected(null);
    toast({ title: 'Cleared the chords', action: { label: 'Undo', onClick: () => setDraft(before) } });
  }, [draft, setDraft]);

  const transpose = useCallback((by: number) => setDraft((d) => transposeDraft(d, by)), [setDraft]);

  // ── Saving ──────────────────────────────────────────────────────────────────────────────
  const doSave = useCallback((name: string, asCopy = false) => {
    const r = saveDraft({ ...draft, name }, { asCopy });
    if (!r) return;
    setDraft(draftFromSaved(r.saved));
    if (r.created) {
      // A new progression is a small win: a few XP and a place in "Continue". It is not a jam:
      // the jam (kind 'progression') is logged from the time the band actually plays.
      awardXp(BUILT_XP, `Built: ${r.saved.name}`, 'theory');
      touchRecent({ route: 'progressions', params: ['builder', r.saved.id], title: r.saved.name, kind: 'progression' });
    }
    if (r.persisted) toast.ok(r.created ? `Saved “${r.saved.name}”` : `Updated “${r.saved.name}”`, { description: 'Find it under Yours in Progressions.' });
    else toast.warn('Saved for now', { description: 'This browser will not keep it after you close the app.' });
  }, [draft, setDraft]);

  const save = useCallback((asCopy = false) => {
    if (!draft.slots.length) return;
    if (!draft.name.trim() || asCopy) {
      setNaming({ open: true, value: asCopy ? `${draft.name.trim() || draftTitle(draft)} (copy)` : draftTitle(draft), then: asCopy ? 'copy' : 'save' });
      return;
    }
    doSave(draft.name);
  }, [draft, doSave]);

  const startNew = useCallback(async () => {
    if (draft.slots.length && !draft.savedId) {
      const ok = await confirmDialog({ title: 'Start a new progression?', description: 'The chords you have now are not saved. Save them first if you want to keep them.', confirmLabel: 'Start new', tone: 'danger' });
      if (!ok) return;
    }
    band.stop();
    setDraft({ ...STARTER_DRAFT, slots: [], tonic: draft.tonic, mode: draft.mode, style: draft.style, tempo: draft.tempo });
    setSelected(null);
  }, [draft, setDraft, band]);

  const removeSaved = useCallback((s: SavedProgression) => {
    const gone = deleteSaved(s.id);
    if (!gone) return;
    if (draft.savedId === s.id) setDraft((d) => ({ ...d, savedId: null }));
    toast({ title: `Deleted “${s.name}”`, action: { label: 'Undo', onClick: () => restoreSaved(gone) } });
  }, [draft.savedId, setDraft]);

  // ── Keyboard ────────────────────────────────────────────────────────────────────────────
  useEventListener(window, 'keydown', (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || dialogOpen() || ownsKey(e.target, e.key)) return;
    if (/^[1-7]$/.test(e.key)) {
      const c = degreeChord(draft, Number(e.key));
      if (c) {
        e.preventDefault();
        add(c.token);
      }
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      if (!draft.slots.length) return;
      e.preventDefault();
      remove(selected ?? draft.slots.length - 1);
    } else if (e.key === ' ') {
      e.preventDefault();
      void band.toggle();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      transpose(e.key === 'ArrowRight' ? 1 : -1);
    }
  });

  useEffect(() => {
    if (selected !== null && selected >= draft.slots.length) setSelected(draft.slots.length ? draft.slots.length - 1 : null);
  }, [selected, draft.slots.length]);

  // ── Pieces ──────────────────────────────────────────────────────────────────────────────
  const keyOptionsList = useMemo(
    () => Array.from({ length: 12 }, (_, pc) => {
      const t = spellKey(draft, pc);
      return { value: t, label: noteName(t, naming) };
    }),
    [draft, naming],
  );
  const cadenceAt = useMemo(() => new Map(cadences.filter((c) => !c.loop).map((c) => [c.at, c])), [cadences]);
  const loopCadence = cadences.find((c) => c.loop) ?? null;
  const bars = draftBars(draft);
  const meter = feelFor(draft.style).meter;

  const paletteTile = (c: PaletteChord) => (
    <button
      key={c.token}
      type="button"
      className={cx(styles.tile, c.group !== 'diatonic' && styles.tileColour)}
      onClick={() => add(c.token)}
      aria-label={`Add ${chordName(c.symbol, naming)}, ${formatSlot(c.token)}${c.role ? `, ${ROLE_LABEL[c.role]}` : c.leadsTo ? `, leads to ${chordName(c.leadsTo, naming)}` : ''}`}
      data-add={c.token}
    >
      <span className={styles.tileNumeral}>{formatSlot(c.token)}</span>
      <span className={styles.tileChord}>{chordName(c.symbol, naming)}</span>
      <span className={styles.tileFoot}>
        {c.role ? (
          <span className={styles.role} data-role={c.role}>{ROLE_LABEL[c.role]}</span>
        ) : (
          <span className={styles.role}>{c.leadsTo ? `Leads to ${chordName(c.leadsTo, naming)}` : 'Borrowed'}</span>
        )}
        {c.degree !== null && !isPhone && <Kbd>{c.degree}</Kbd>}
      </span>
    </button>
  );

  const sel = selected !== null ? draft.slots[selected] : null;

  return (
    <Page
      title="Build a progression"
      subtitle="Tap chords to add them, then play it with the band."
      back={{ to: 'progressions', label: 'All progressions' }}
      data-progressions="builder"
      data-slots={draft.slots.map((s) => s.token).join(' ')}
      data-tonic={draft.tonic}
      data-mode={draft.mode}
      data-status={band.status}
      data-playing-slot={playingSlot ?? -1}
      data-saved-id={draft.savedId ?? ''}
    >
      <div className={styles.layout}>
        <div className={styles.main}>
          <Section
            title={draft.name.trim() || draftTitle(draft)}
            description={`${keyName(home, naming)} · ${bars} ${bars === 1 ? 'bar' : 'bars'} in ${meter}${layout.padded ? ' · the last chord fills its bar' : ''}`}
            actions={draft.slots.length ? <Button variant="ghost" size="sm" iconLeft="Eraser" onClick={clearAll}>Clear</Button> : undefined}
          >
            <div className={styles.keyRow}>
              <Select label="Key" size="sm" value={draft.tonic} onChange={(t) => setDraft((d) => setKey(d, t))} options={keyOptionsList} className={styles.keySelect} />
              <SegmentedControl aria-label="Major or minor" size="sm" options={[{ value: 'major', label: 'Major' }, { value: 'minor', label: 'Minor' }]} value={draft.mode} onChange={(m) => setDraft((d) => setKey(d, d.tonic, m as BuilderMode))} />
              <span className={styles.transposeField}>
                <span className={styles.caption} aria-hidden="true">Transpose</span>
                <span className={styles.transpose} role="group" aria-label="Transpose">
                  <IconButton icon="Minus" label="Transpose down a half step (←)" variant="secondary" onClick={() => transpose(-1)} />
                  <IconButton icon="Plus" label="Transpose up a half step (→)" variant="secondary" onClick={() => transpose(1)} />
                </span>
              </span>
            </div>

            {draft.slots.length ? (
              <ol className={styles.strip} aria-label="Your chords">
                {draft.slots.map((s, i) => {
                  const cad = cadenceAt.get(i);
                  return (
                    <li key={i} className={styles.stripItem}>
                      <button
                        type="button"
                        className={cx(styles.slot, selected === i && styles.slotSelected, playingSlot === i && styles.slotPlaying)}
                        aria-pressed={selected === i}
                        aria-label={`Chord ${i + 1}: ${chordName(symbols[i], naming)}, ${formatSlot(s.token)}, ${LENGTH_LABEL[s.length]}`}
                        onClick={() => {
                          setSelected(selected === i ? null : i);
                          if (!playing) void strumChord(symbols[i]);
                        }}
                        data-slot-index={i}
                        data-playing={playingSlot === i ? 'true' : undefined}
                      >
                        <span className={styles.slotNumeral}>{formatSlot(s.token)}</span>
                        <span className={styles.slotChord}>{chordName(symbols[i], naming)}</span>
                        <span className={styles.slotLength}>{LENGTH_LABEL[s.length]}</span>
                      </button>
                      {cad && <Badge tone="info" size="sm" className={styles.cadence}>{cad.cadence.name.replace(' cadence', '')}</Badge>}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <EmptyState icon="ListMusic" title="No chords yet" align="start">
                Tap a chord below to start, or press 1 for the home chord. Most songs start at home.
              </EmptyState>
            )}

            {sel && selected !== null && (
              <div className={styles.slotTools} role="group" aria-label={`Chord ${selected + 1}`}>
                <SegmentedControl
                  aria-label="How long"
                  size="sm"
                  options={SLOT_LENGTHS.map((l) => ({ value: String(l), label: LENGTH_LABEL[l] }))}
                  value={String(sel.length)}
                  onChange={(v) => setDraft((d) => setLength(d, selected, Number(v) as SlotLength))}
                />
                <span className={styles.toolButtons}>
                  <IconButton icon="ChevronLeft" label="Move earlier" variant="secondary" disabled={selected === 0} onClick={() => { setDraft((d) => moveSlot(d, selected, -1)); setSelected(selected - 1); }} />
                  <IconButton icon="ChevronRight" label="Move later" variant="secondary" disabled={selected >= draft.slots.length - 1} onClick={() => { setDraft((d) => moveSlot(d, selected, 1)); setSelected(selected + 1); }} />
                  <IconButton icon="Trash2" label="Remove this chord (Backspace)" variant="secondary" onClick={() => remove(selected)} />
                  <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Done</Button>
                </span>
              </div>
            )}

            <div aria-live="polite" className={styles.live} data-cadence-live>
              {latest ? (
                <p className={styles.cadenceLine}>
                  <Icon name="Sparkles" size="sm" className={styles.cadenceIcon} />
                  <span>
                    <strong>{latest.cadence.name}: {latest.cadence.romans.map((r) => formatSlot(r)).join(' → ')}.</strong> {latest.cadence.description}
                  </span>
                </p>
              ) : loopCadence && draft.slots.length > 2 ? (
                <Text size="sm" tone="muted">Going round again makes a {loopCadence.cadence.name.toLowerCase()}: {loopCadence.cadence.romans.map((r) => formatSlot(r)).join(' → ')}.</Text>
              ) : null}
            </div>
          </Section>

          <Section title={draft.slots.length ? 'Add a chord' : 'Start with a chord'} description={selected !== null ? `New chords go after chord ${selected + 1}.` : undefined}>
            {suggestions.length > 0 && (
              <div className={styles.suggest}>
                <Text size="sm" weight="semibold">{draft.slots.length ? `Likely after ${chordName(symbols[symbols.length - 1], naming)}` : 'A good first chord'}</Text>
                <div className={styles.suggestRow}>
                  {suggestions.map((s, i) => (
                    <Button key={s.token} size="sm" variant={i === 0 ? 'secondary' : 'ghost'} onClick={() => add(s.token)} data-suggest={s.token} aria-label={`Add ${chordName(s.symbol, naming)}, ${formatSlot(s.token)}: ${s.reason}`}>
                      <span className={styles.suggestNumeral}>{formatSlot(s.token)}</span> {chordName(s.symbol, naming)}
                    </Button>
                  ))}
                </div>
                <Text size="sm" tone="muted">{suggestions[0].reason}</Text>
              </div>
            )}

            <div className={styles.paletteHead}>
              <Text weight="semibold">Chords in {keyName(home, naming)}</Text>
              <span className={styles.toggles}>
                <Switch label="Sevenths" checked={draft.sevenths} onChange={(v) => setDraft((d) => ({ ...d, sevenths: v }))} side="start" />
                <Switch label="More colours" checked={draft.advanced} onChange={(v) => setDraft((d) => ({ ...d, advanced: v }))} side="start" />
              </span>
            </div>
            <div className={styles.palette} data-palette="diatonic">{pal.diatonic.map(paletteTile)}</div>

            {draft.advanced && (
              <>
                <div>
                  <Text weight="semibold">Borrowed chords</Text>
                  <Text size="sm" tone="muted">From the parallel {draft.mode === 'major' ? 'minor' : 'major and Dorian'}: the same home, a different colour.</Text>
                </div>
                <div className={styles.palette} data-palette="borrowed">{pal.borrowed.map(paletteTile)}</div>
                <div>
                  <Text weight="semibold">Secondary dominants</Text>
                  <Text size="sm" tone="muted">Each one points at a chord of the key and wants to resolve to it.</Text>
                </div>
                <div className={styles.palette} data-palette="secondary">{pal.secondary.map(paletteTile)}</div>
              </>
            )}
          </Section>
        </div>

        <aside className={styles.side}>
          <Section title="The band" description="It loops what you build. Change anything and it starts again from the top.">
            <Select label="Style" value={draft.style} onChange={(v) => setDraft((d) => ({ ...d, style: v as BackingStyleId, tempo: BACKING_STYLES[v as BackingStyleId].tempo.default }))} options={BACKING_STYLE_IDS.map((id) => ({ value: id, label: BACKING_STYLES[id].name }))} />
            <Stepper label="Tempo" unit="BPM" min={clampTempo(draft.style, 0)} max={clampTempo(draft.style, 999)} step={2} largeStep={10} value={draft.tempo} onChange={(t) => setDraft((d) => ({ ...d, tempo: clampTempo(d.style, t) }))} />
            <LinkButton to="progressions" params={['builder', 'jam']} iconLeft="Maximize2" disabled={!draft.slots.length}>
              Jam full screen
            </LinkButton>
          </Section>

          <Section
            title="Yours"
            description={saved.length ? 'Saved on this device.' : 'Save a progression and it shows up here and in Progressions.'}
            actions={<Button variant="ghost" size="sm" iconLeft="Plus" onClick={() => void startNew()}>New</Button>}
          >
            {saved.length > 0 && (
              <List variant="card">
                {saved.map((s) => (
                  <ListItem
                    key={s.id}
                    title={s.name}
                    subtitle={`${keyName({ tonic: s.tonic, tonality: s.mode }, naming)} · ${draftTitle(s, 5)}`}
                    selected={draft.savedId === s.id}
                    trailing={
                      <Menu
                        trigger={<IconButton icon="EllipsisVertical" label={`More for ${s.name}`} />}
                        items={[
                          { label: 'Open', icon: 'FolderOpen', href: href('progressions', 'builder', s.id) },
                          { label: 'Rename', icon: 'Pencil', onSelect: () => setRenaming({ id: s.id, value: s.name }) },
                          'separator',
                          { label: 'Delete', icon: 'Trash2', danger: true, onSelect: () => removeSaved(s) },
                        ]}
                      />
                    }
                    data-saved={s.id}
                  />
                ))}
              </List>
            )}
            <LinkButton to="ear" params={['progressions']} variant="ghost" size="sm" iconLeft="Ear">Can you hear it? Train your ear</LinkButton>
          </Section>
        </aside>
      </div>

      <ActionBar
        stretchOnMobile={false}
        start={!isPhone ? <span className={styles.kbd} aria-hidden="true"><Kbd>1</Kbd>–<Kbd>7</Kbd> add <Kbd>⌫</Kbd> remove <Kbd>Space</Kbd> play <Kbd>←</Kbd><Kbd>→</Kbd> key</span> : undefined}
      >
        {draft.savedId && (
          <IconButton icon="Copy" label="Save as a copy" variant="secondary" onClick={() => save(true)} />
        )}
        <Button iconLeft="Save" disabled={!draft.slots.length} onClick={() => save(false)} data-save>
          {draft.savedId ? 'Save changes' : 'Save'}
        </Button>
        <PlayButton playing={playing} loading={band.status === 'loading'} disabled={!draft.slots.length} onClick={() => void band.toggle()} size="md" label={playing ? 'Pause the band (Space)' : 'Play it with the band (Space)'} data-play />
      </ActionBar>

      <Modal
        open={nameDialog.open}
        onClose={() => setNaming({ open: false, value: '' })}
        title={nameDialog.then === 'copy' ? 'Save a copy' : 'Name your progression'}
        size="sm"
        footer={
          <>
            <Button onClick={() => setNaming({ open: false, value: '' })}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!nameDialog.value.trim()}
              onClick={() => {
                const name = nameDialog.value.trim();
                setNaming({ open: false, value: '' });
                doSave(name, nameDialog.then === 'copy');
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <TextField
          label="Name"
          value={nameDialog.value}
          onChange={(v) => setNaming((n) => ({ ...n, value: v.slice(0, 60) }))}
          hint="You can rename it later."
          data-autofocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && nameDialog.value.trim()) {
              e.preventDefault();
              const name = nameDialog.value.trim();
              setNaming({ open: false, value: '' });
              doSave(name, nameDialog.then === 'copy');
            }
          }}
        />
      </Modal>

      <Modal
        open={!!renaming}
        onClose={() => setRenaming(null)}
        title="Rename"
        size="sm"
        footer={
          <>
            <Button onClick={() => setRenaming(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!renaming?.value.trim()}
              onClick={() => {
                if (!renaming) return;
                const s = renameSaved(renaming.id, renaming.value);
                if (s && draft.savedId === s.id) setDraft((d) => ({ ...d, name: s.name }));
                setRenaming(null);
              }}
            >
              Rename
            </Button>
          </>
        }
      >
        <TextField label="Name" value={renaming?.value ?? ''} onChange={(v) => setRenaming((r) => (r ? { ...r, value: v.slice(0, 60) } : r))} data-autofocus />
      </Modal>
    </Page>
  );
}
