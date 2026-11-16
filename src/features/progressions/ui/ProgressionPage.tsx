/**
 * One progression (`#progressions--<id>--<key>`): pick a key (guitar-friendly ones first, a capo
 * when the key is awkward), read the chart bar by bar, see the shapes chosen to keep the changes
 * small, learn why it works, what to try and where it is heard, and go jam with the band.
 *
 * Keyboard: ←/→ key down/up a semitone, Space hears the chords, J opens the jam.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { href, navigate, redirect } from '@/app/router';
import { useScreenTitle } from '@/app/shell';
import { homeKey, type Progression, type ResolvedChord } from '@/content/progressions';
import { noteSlug } from '@/core/theory';
import {
  ActionBar, Banner, Button, Kbd, LinkButton, List, ListItem, Page, Section, SegmentedControl, Tag, Text,
  useEventListener, useIsMobile, useLocalState,
} from '@/ui';
import { useMusicSettings } from '@/ui/music';
import { playPreview, previewPlaying, stopPreview, strumChord } from '../audio/preview';
import { displayName, previewChords, primaryGroup } from '../model/browse';
import { progressionParams } from '../model/address';
import { capoAdvice, stepTonic, type CapoAdvice } from '../model/keys';
import { pageModel, type ChordCard } from '../model/page';
import type { ChartPos } from '../model/jam';
import type { ShapeMode } from '../model/voicings';
import { Chart, ChordShapes, KeyPicker } from './Pieces';
import { chordName, dialogOpen, keyName, noteName, ownsKey, scaleName, useRemembered } from './shared';
import { BACKING_STYLES } from '@/core/audio';
import styles from './Progressions.module.css';

/** Props for {@link ProgressionPage}. */
export interface ProgressionPageProps {
  progression: Progression;
  tonic: string;
}

/** The progression page. */
export function ProgressionPage({ progression: p, tonic }: ProgressionPageProps) {
  const { naming } = useMusicSettings();
  const isPhone = useIsMobile();
  const [, remember] = useRemembered(p.id);
  const [shapes, setShapes] = useLocalState<ShapeMode>('progressions.shapes', 'smooth');
  const [capoOn, setCapoOn] = useState(false);
  const [advice, setAdvice] = useState<CapoAdvice | null>(null);
  const [now, setNow] = useState<ChartPos | null>(null);
  const owner = useRef({});
  const name = displayName(p);
  useScreenTitle(name);

  // The capo check walks every capo position: run it just after the key change has painted.
  useEffect(() => {
    setAdvice(null);
    const t = window.setTimeout(() => {
      try {
        setAdvice(capoAdvice(p, tonic));
      } catch {
        setAdvice(null);
      }
    }, 30);
    return () => window.clearTimeout(t);
  }, [p, tonic]);
  const capo = capoOn && advice ? advice.capo : 0;

  const model = useMemo(
    () => pageModel(p, tonic, { capo, capoShapes: capo && advice ? advice.shapes : undefined, shapes: shapes === 'standard' ? 'standard' : 'smooth' }),
    [p, tonic, capo, advice, shapes],
  );
  const home = homeKey(p, tonic);
  const setTonic = useCallback(
    (t: string) => {
      stopPreview(owner.current);
      remember({ tonic: t });
      redirect('progressions', ...progressionParams(p.id, t));
    },
    [p.id, remember],
  );

  useEffect(() => () => stopPreview(owner.current), []);
  useEffect(() => {
    stopPreview(owner.current);
    setNow(null);
  }, [tonic]);

  const shapeOf = useMemo(() => new Map(model.chords.map((c) => [c.symbol, c.voicing?.midi])), [model]);
  const hear = useCallback(() => {
    if (previewPlaying(owner.current)) {
      stopPreview(owner.current);
      return;
    }
    const steps = previewChords(p, tonic, { full: true });
    const bpm = Math.round((p.feel.tempo[0] + p.feel.tempo[1]) / 2);
    setNow({ bar: steps[0].bar, index: steps[0].index });
    void playPreview(
      owner.current,
      steps.map((s) => ({ symbol: s.symbol, beats: s.beats, midi: shapeOf.get(s.symbol) })),
      bpm,
      (i) => setNow(i === null ? null : { bar: steps[i].bar, index: steps[i].index }),
    );
  }, [p, tonic, shapeOf]);
  const playing = now !== null;

  const tapChord = useCallback((c: ResolvedChord) => {
    stopPreview(owner.current);
    void strumChord(c.symbol, shapeOf.get(c.symbol));
  }, [shapeOf]);
  const tapShape = useCallback((c: ChordCard) => {
    stopPreview(owner.current);
    void strumChord(c.symbol, c.voicing?.midi);
  }, []);

  const jamParams = progressionParams(p.id, tonic, true);
  useEventListener(window, 'keydown', (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || dialogOpen() || ownsKey(e.target, e.key)) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      setTonic(stepTonic(p, tonic, e.key === 'ArrowRight' ? 1 : -1));
    } else if (e.key === ' ') {
      e.preventDefault();
      hear();
    } else if (e.key === 'j' || e.key === 'J') {
      e.preventDefault();
      navigate('progressions', ...jamParams);
    }
  });

  const style = BACKING_STYLES[p.feel.backing];
  const chartFacts = `${p.bars.length} ${p.bars.length === 1 ? 'bar' : 'bars'} in ${p.feel.meter} · ${style.name}, ${p.feel.tempo[0]}–${p.feel.tempo[1]} BPM`;
  const nowSymbol = now ? model.resolved.bars[now.bar]?.[now.index]?.symbol ?? null : null;

  const jamButton = (
    <LinkButton to="progressions" params={jamParams} variant="primary" iconLeft="Play" size={isPhone ? 'md' : 'lg'} className={isPhone ? styles.grow : undefined} data-jam-link>
      Jam with the band
    </LinkButton>
  );
  const hearButton = (
    <Button iconLeft={playing ? 'Square' : 'Volume2'} onClick={hear} pressed={playing} data-hear>
      {playing ? 'Stop' : isPhone ? 'Listen' : 'Hear the chords'}
    </Button>
  );

  return (
    <Page
      title={name}
      eyebrow={`${primaryGroup(p).name} · Level ${p.level}`}
      subtitle={p.aka?.length ? `Also called ${p.aka.join(', ')}.` : undefined}
      back={{ to: 'progressions', label: 'All progressions' }}
      actions={isPhone ? undefined : jamButton}
      data-progressions="page"
      data-id={p.id}
      data-tonic={tonic}
      data-capo={capo}
      data-playing={playing ? 'true' : 'false'}
    >
      <div className={styles.pageGrid}>
        <div className={styles.mainCol}>
          <Section title={`In ${keyName(home, naming)}`} description="Pick a key. The ones shown first are easiest with open chords.">
            <KeyPicker progression={p} tonic={tonic} onChange={setTonic} naming={naming} />
            {model.keyNote && <Text tone="muted" size="sm">{model.keyNote}</Text>}
            {advice && (
              <Banner
                tone="tip"
                icon="Lightbulb"
                title={`Capo ${advice.capo}, then play ${noteName(advice.shapesTonic, naming)} shapes`}
                actions={
                  <Button size="sm" pressed={capoOn} iconLeft={capoOn ? 'Check' : undefined} onClick={() => setCapoOn((v) => !v)}>
                    {capoOn ? 'Showing capo shapes' : 'Show capo shapes'}
                  </Button>
                }
              >
                {`${noteName(tonic, naming)} needs barre chords here. With a capo on fret ${advice.capo}, the easy ${advice.shapes.map((s) => chordName(s.shape, naming)).join(', ')} shapes sound as ${advice.shapes.map((s) => chordName(s.chord, naming)).join(', ')}.`}
              </Banner>
            )}
          </Section>

          <Section title="The chart" description={chartFacts} actions={isPhone ? undefined : hearButton}>
            <Chart lines={model.lines} naming={naming} now={now} onTap={tapChord} />
            <div className={styles.kbdLine} aria-hidden="true">
              <Kbd>←</Kbd><Kbd>→</Kbd> key <Kbd>Space</Kbd> hear the chords <Kbd>J</Kbd> jam
            </div>
          </Section>

          <Section
            title="The shapes"
            description={capo ? `With the capo on fret ${capo}. Tap a shape to hear it.` : 'Chosen to keep your hand close between changes. Tap a shape to hear it.'}
            actions={
              <SegmentedControl
                aria-label="Which shapes"
                size="sm"
                options={[{ value: 'smooth', label: 'Close together' }, { value: 'standard', label: 'Standard' }]}
                value={shapes === 'standard' ? 'standard' : 'smooth'}
                onChange={(v) => setShapes(v as ShapeMode)}
              />
            }
          >
            <ChordShapes chords={model.chords} naming={naming} now={nowSymbol} onTap={tapShape} capo={capo} />
            {model.practise && (
              <div className={styles.tip}>
                <span className={styles.tipIcon}><Tag icon="Repeat">Practise</Tag></span>
                <div>
                  <Text weight="semibold">
                    {chordName(model.practise.from, naming)} to {chordName(model.practise.to, naming)} is the change to practise.
                  </Text>
                  {model.practise.tips[0] && <Text tone="muted" size="sm">{model.practise.tips[0]}</Text>}
                </div>
              </div>
            )}
          </Section>
        </div>

        <div className={styles.sideCol}>
          <Section title="Why it works">
            <Text variant="prose" className={styles.prose}>{p.why}</Text>
          </Section>

          <Section title="Try this">
            <Text variant="prose" className={styles.prose}><strong>Strum:</strong> {p.tryThis.strum}</Text>
            {p.tryThis.tip && <Text variant="prose" className={styles.prose}><strong>Tip:</strong> {p.tryThis.tip}</Text>}
            <Text weight="semibold" size="sm">Solo with</Text>
            <div className={styles.scaleLinks}>
              {model.scales.map((s) => (
                <LinkButton key={`${s.tonic}-${s.scale}`} to="scales" params={[noteSlug(s.tonic), s.scale]} size="sm" iconRight="ArrowRight">
                  {scaleName(s.tonic, s.scale, naming)}
                </LinkButton>
              ))}
            </div>
          </Section>

          {model.heardIn.length > 0 && (
            <Section title="Heard in" description="Listen for it in these recordings.">
              <ul className={styles.heard}>
                {model.heardIn.map((h) => (
                  <li key={`${h.title}-${h.by}`}>
                    <Text weight="semibold">{h.title}</Text>
                    <Text tone="muted" size="sm">{h.by}{h.note ? ` · ${h.note}` : ''}</Text>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <div className={styles.earCard}>
            <div className={styles.earText}>
              <Text weight="semibold">Can you hear it?</Text>
              <Text tone="muted" size="sm">Train your ear to pick progressions like this one out of a song.</Text>
            </div>
            <LinkButton to="ear" params={['progressions']} iconLeft="Ear" size="sm">Ear training</LinkButton>
          </div>

          {model.related.length > 0 && (
            <Section title="Related">
              <List variant="card">
                {model.related.map((r) => (
                  <ListItem key={r.id} title={displayName(r)} subtitle={`${primaryGroup(r).name} · Level ${r.level}`} href={href('progressions', r.id)} />
                ))}
              </List>
            </Section>
          )}
        </div>
      </div>

      {isPhone && (
        <ActionBar stretchOnMobile={false}>
          {hearButton}
          {jamButton}
        </ActionBar>
      )}
    </Page>
  );
}
