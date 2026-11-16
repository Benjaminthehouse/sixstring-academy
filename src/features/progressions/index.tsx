/**
 * Progressions (`#progressions`): the chord progressions of every style, in any key, with a band.
 *
 *   #progressions                         browse by style and level, search; cards play a preview
 *   #progressions--<id>[--<key>]          one progression: key picker (capo when awkward), chart,
 *                                         shapes chosen to keep changes small, why it works, try this
 *   #progressions--<id>[--<key>]--jam     jam with the band: big now/next chords, the neck, a scale
 *   #progressions--builder                build your own (draft kept on the device), save, transpose
 *   #progressions--builder--jam           jam over the draft
 *   #progressions--builder--<my-id>       open a saved progression in the builder
 *
 * How it is put together: `model/` is pure and unit-tested (keys and capo, the page model, voice-
 * led shapes, browsing, the jam's position and scales, the builder, saved progressions);
 * `audio/preview.ts` strums previews; `ui/useBand.ts` drives the `BackingBand`; `ui/` draws it with
 * the kit. Browser check: `node e2e/progressions.cjs`.
 */
import { useCallback, useEffect, useMemo } from 'react';
import { redirect } from '@/app/router';
import type { RouteProps } from '@/app/routes';
import { progressionSkillId, type Progression } from '@/content/progressions';
import { toast, useLocalState } from '@/ui';
import { parseAddress, progressionParams } from './model/address';
import { STARTER_DRAFT, draftProgression, draftTitle, sanitizeDraft, setKey, type BuilderDraft } from './model/builder';
import { feelFor } from './model/jam';
import { defaultTonic, tonicFromParam } from './model/keys';
import { DRAFT_KEY, draftFromSaved, getSavedById, isDirty } from './model/saved';
import { Browse } from './ui/Browse';
import { Builder } from './ui/Builder';
import { JamView } from './ui/Jam';
import { ProgressionPage } from './ui/ProgressionPage';
import { useRemembered } from './ui/shared';
import { displayName } from './model/browse';

/** The builder's draft, kept on the device and always readable. */
function useDraft(): [BuilderDraft, (next: BuilderDraft | ((prev: BuilderDraft) => BuilderDraft)) => void] {
  const [raw, setRaw] = useLocalState<unknown>(DRAFT_KEY, STARTER_DRAFT);
  const draft = useMemo(() => sanitizeDraft(raw), [raw]);
  const setDraft = useCallback(
    (next: BuilderDraft | ((prev: BuilderDraft) => BuilderDraft)) =>
      setRaw((prev: unknown) => (typeof next === 'function' ? next(sanitizeDraft(prev)) : next)),
    [setRaw],
  );
  return [draft, setDraft];
}

/** A catalog progression's key: the address, else the one remembered, else its first friendly key. */
function useTonic(p: Progression, fromAddress: string | null): [string, (patch: { tonic?: string; tempo?: number; style?: Progression['feel']['backing'] }) => void, { tempo?: number; style?: Progression['feel']['backing'] }] {
  const [remembered, remember] = useRemembered(p.id);
  const tonic = fromAddress ?? tonicFromParam(p, remembered.tonic) ?? defaultTonic(p);
  return [tonic, remember, remembered];
}

function PageRoute({ progression, tonic: fromAddress }: { progression: Progression; tonic: string | null }) {
  const [tonic] = useTonic(progression, fromAddress);
  return <ProgressionPage progression={progression} tonic={tonic} />;
}

function JamRoute({ progression: p, tonic: fromAddress }: { progression: Progression; tonic: string | null }) {
  const [tonic, remember, remembered] = useTonic(p, fromAddress);
  const onTonic = useCallback(
    (t: string) => {
      remember({ tonic: t });
      redirect('progressions', ...progressionParams(p.id, t, true));
    },
    [p.id, remember],
  );
  return (
    <JamView
      progression={p}
      tonic={tonic}
      onTonic={onTonic}
      back={{ to: 'progressions', params: progressionParams(p.id, tonic), label: 'Chart' }}
      title={displayName(p)}
      skillId={progressionSkillId(p.id)}
      activityParams={progressionParams(p.id, tonic, true)}
      remembered={remembered}
      remember={remember}
    />
  );
}

function BuilderJamRoute({ draft, setDraft }: { draft: BuilderDraft; setDraft: (next: BuilderDraft | ((prev: BuilderDraft) => BuilderDraft)) => void }) {
  const p = useMemo(() => draftProgression(draft), [draft]);
  useEffect(() => {
    if (!p) redirect('progressions', 'builder');
  }, [p]);
  const remember = useCallback(
    (patch: { tempo?: number; style?: BuilderDraft['style'] }) => setDraft((d) => ({ ...d, ...(patch.style ? { style: patch.style } : {}), ...(patch.tempo ? { tempo: patch.tempo } : {}) })),
    [setDraft],
  );
  const onTonic = useCallback((t: string) => setDraft((d) => setKey(d, t)), [setDraft]);
  if (!p) return null;
  return (
    <JamView
      progression={p}
      tonic={draft.tonic}
      onTonic={onTonic}
      back={{ to: 'progressions', params: ['builder'], label: 'Builder' }}
      title={draft.name.trim() || draftTitle(draft)}
      skillId="progression:builder"
      activityParams={draft.savedId ? ['builder', draft.savedId] : ['builder']}
      remembered={{ tempo: draft.tempo, style: draft.style }}
      remember={remember}
      feels={[feelFor(draft.style)]}
    />
  );
}

/** The progressions screen. */
export default function Progressions({ params }: RouteProps) {
  const address = useMemo(() => parseAddress(params), [params]);
  const [draft, setDraft] = useDraft();

  useEffect(() => {
    if (address.view === 'unknown') {
      redirect('progressions');
    } else if (address.view === 'open-saved') {
      const s = getSavedById(address.id);
      if (s) {
        const before = draft;
        const putAside = before.savedId !== s.id && isDirty(before) && JSON.stringify(before.slots) !== JSON.stringify(STARTER_DRAFT.slots);
        setDraft(draftFromSaved(s));
        if (putAside) toast({ title: `Opened “${s.name}”`, description: 'Your unsaved chords were put aside.', action: { label: 'Bring them back', onClick: () => setDraft(before) } });
      } else {
        toast.warn('That progression is not saved on this device');
      }
      redirect('progressions', 'builder');
    } else if ((address.view === 'page' || address.view === 'jam') && address.tonic) {
      // A key spelled another way (a-sharp for B flat) is rewritten the way the page spells it.
      const want = address.canonical;
      if (want.join('--') !== params.join('--')) redirect('progressions', ...want);
    }
    // The draft is read at the moment the address changes; later edits must not re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  switch (address.view) {
    case 'page':
      return <PageRoute key={address.progression.id} progression={address.progression} tonic={address.tonic} />;
    case 'jam':
      return <JamRoute key={address.progression.id} progression={address.progression} tonic={address.tonic} />;
    case 'builder':
      return <Builder draft={draft} setDraft={setDraft} />;
    case 'builder-jam':
      return <BuilderJamRoute draft={draft} setDraft={setDraft} />;
    case 'open-saved':
    case 'unknown':
      return null;
    default:
      return <Browse />;
  }
}

