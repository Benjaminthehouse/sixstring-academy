/**
 * "Check with the mic": strum the chord and the app says whether all its notes rang, and if not,
 * which string to look at. A finished check is a chord practice for core/progress.
 */
import { useEffect, useRef, useState } from 'react';
import { playUi } from '@/core/audio';
import type { Voicing } from '@/core/guitar';
import { waitForChord } from '@/core/pitch';
import { getProgress, recordActivity } from '@/core/progress';
import { formatNote } from '@/core/theory';
import { Banner, Button, MediaBlocked, Sheet, Spinner, Text } from '@/ui';
import { useMusicSettings } from '@/ui/music';
import { useMic } from '../hooks/useMic';
import { MIC_EXPLAINER, strumHint, type StrumHint } from '../model/hints';
import { RING_TRUE, specOf } from '../model/listen';
import { mergeChordData } from '../model/known';
import { chordParam, chordSkillId, displaySymbol } from '../model/symbols';
import { MarkedDiagram } from './MarkedDiagram';
import styles from './Trainer.module.css';

type Phase = 'intro' | 'listening' | 'ok';

/** The microphone check of one chord, in a sheet. */
export function MicCheckSheet({ open, onClose, symbol, voicing }: { open: boolean; onClose: () => void; symbol: string; voicing: Voicing }) {
  const { naming } = useMusicSettings();
  const mic = useMic();
  const [phase, setPhase] = useState<Phase>('intro');
  const [hint, setHint] = useState<StrumHint | null>(null);
  const [tries, setTries] = useState(0);
  const waitRef = useRef<{ cancel: () => void } | null>(null);
  const startedAt = useRef(0);
  const name = displaySymbol(symbol, { system: naming });

  const stopAll = () => {
    waitRef.current?.cancel();
    waitRef.current = null;
    mic.stop();
  };

  // Closing the sheet (or a new chord) releases the microphone.
  useEffect(() => {
    if (!open) {
      stopAll();
      setPhase('intro');
      setHint(null);
      setTries(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, voicing.id]);

  const listen = async () => {
    setHint(null);
    setTries(0);
    const tracker = await mic.start();
    if (!tracker) return;
    setPhase('listening');
    startedAt.current = Date.now();
    let failed = 0;
    const w = waitForChord(tracker, specOf(voicing), {
      threshold: RING_TRUE,
      onAttempt: (m) => {
        failed++;
        setTries(failed);
        setHint(strumHint(voicing, m, (n) => formatNote(n, { system: naming })));
      },
    });
    waitRef.current = w;
    const r = await w;
    if (waitRef.current !== w || !r.ok) return;
    waitRef.current = null;
    mic.stop();
    playUi('correct');
    setHint(null);
    setPhase('ok');
    const id = chordSkillId(symbol);
    recordActivity({
      kind: 'chord-practice',
      id,
      title: `${displaySymbol(symbol)} chord`,
      accuracy: 1 / (1 + 0.5 * r.failedAttempts),
      mistakes: r.failedAttempts,
      durationSec: Math.max(5, Math.round((Date.now() - startedAt.current) / 1000)),
      route: 'chords',
      params: [chordParam(symbol)],
      // Played cleanly for the microphone: the chord joins My chords, even if its mark was taken back.
      data: mergeChordData(getProgress().skills[id]?.data, { known: true }),
    });
  };

  const close = () => {
    stopAll();
    onClose();
  };

  const footer =
    phase === 'ok' ? (
      <>
        <Button onClick={() => void listen()}>Check again</Button>
        <Button variant="primary" onClick={close}>
          Done
        </Button>
      </>
    ) : phase === 'listening' ? (
      <Button onClick={close}>Stop listening</Button>
    ) : mic.status === 'failed' ? null : (
      <>
        <Button onClick={close}>Not now</Button>
        <Button variant="primary" iconLeft="Mic" loading={mic.status === 'starting'} onClick={() => void listen()} data-autofocus>
          Start listening
        </Button>
      </>
    );

  return (
    <Sheet open={open} onClose={close} title={`Check your ${name}`} footer={footer}>
      <div className={styles.micCheck} data-mic-sheet data-phase={phase}>
        <MarkedDiagram voicing={voicing} size="md" title={name} strings={hint?.strings ?? []} />
        {mic.status === 'failed' && mic.failure ? (
          <MediaBlocked reason={mic.failure} device="microphone" onRetry={() => void listen()} onContinueWithout={close} continueLabel="Use your ears instead" framed={false} level={3}>
            Strum the chord one string at a time and listen: each string should ring clearly, with no buzz and no dead thud.
          </MediaBlocked>
        ) : (
          <div className={styles.micStatus} aria-live="polite">
            {phase === 'intro' && <Text>Hold the shape, strum once firmly and let it ring. The app tells you whether every note of {name} came through.</Text>}
            {phase === 'listening' && (
              <>
                <Text weight="semibold">
                  <Spinner size={16} /> Listening… strum {name} now.
                </Text>
                {hint && (
                  <Banner tone="warn" title={tries > 1 ? `Not yet (${tries} tries)` : 'Not quite'} live>
                    {hint.text}
                  </Banner>
                )}
              </>
            )}
            {phase === 'ok' && (
              <Banner tone="ok" title="That rang true" live>
                Every note of {name} came through{tries ? ` after ${tries === 1 ? 'one more try' : `${tries} more tries`}` : ' on the first strum'}. It counts as chord practice.
              </Banner>
            )}
          </div>
        )}
        <Text variant="caption" tone="muted">
          {MIC_EXPLAINER}
        </Text>
      </div>
    </Sheet>
  );
}
