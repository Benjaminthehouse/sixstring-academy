/**
 * "My chords" (`#chords--mine`): the chords the learner knows (their `chord:` skills), the next one
 * on the path, and a way to practise changes between them. Marking is one tap on the first chords;
 * taking a mark back is one tap too, with an undo.
 */
import { useMemo, useState } from 'react';
import { Button, LinkButton, Section, Text, toast } from '@/ui';
import { useMusicSettings } from '@/ui/music';
import { setKnown } from '../hooks/data';
import { FIRST_CHORDS, nextToLearn, PATH, stageProgress } from '../model/catalog';
import { chordParam, displaySymbol } from '../model/symbols';
import { canonicalOrder } from '../model/trainer';
import { ChordTile } from './ChordTile';
import styles from './Library.module.css';

/** The My chords view. */
export function MyChords({ known, tuning }: { known: ReadonlySet<string>; tuning: string }) {
  const { naming } = useMusicSettings();
  const [editing, setEditing] = useState(known.size === 0);
  const list = useMemo(() => canonicalOrder([...known]).sort((a, b) => rank(a) - rank(b)), [known]);
  const next = nextToLearn(known);
  const pair = list.length >= 2 ? [list[list.length - 2], list[list.length - 1]] : null;

  const toggle = (symbol: string) => {
    const was = known.has(symbol);
    setKnown(symbol, !was);
    if (was) toast({ title: `${displaySymbol(symbol, { system: naming })} taken out of My chords`, action: { label: 'Undo', onClick: () => setKnown(symbol, true) } });
  };

  return (
    <div className={styles.panel} data-my-chords={list.join(',')}>
      {list.length > 0 && !editing && (
        <Section title={`${list.length} ${list.length === 1 ? 'chord' : 'chords'} you can play`} actions={<Button size="sm" variant="ghost" iconLeft="Pencil" onClick={() => setEditing(true)}>Edit</Button>}>
          <div className={styles.grid}>
            {list.map((s) => (
              <ChordTile key={s} symbol={s} tuning={tuning} known />
            ))}
          </div>
          <div className={styles.typeHits}>
            {pair && (
              <LinkButton variant="primary" iconLeft="Repeat" to="chords" params={['trainer', ...pair.map(chordParam)]}>
                Practise {displaySymbol(pair[0], { system: naming })} to {displaySymbol(pair[1], { system: naming })}
              </LinkButton>
            )}
            {next && (
              <LinkButton iconRight="ArrowRight" to="chords" params={[chordParam(next)]}>
                Learn {displaySymbol(next, { system: naming })} next
              </LinkButton>
            )}
          </div>
        </Section>
      )}
      {editing && (
        <Section
          title={list.length ? 'Mark the chords you know' : 'Which of these can you already play?'}
          description="Tap a chord to add it to My chords; tap it again to take it out. A chord you play cleanly for the microphone joins by itself."
          actions={list.length ? <Button size="sm" variant="primary" onClick={() => setEditing(false)}>Done</Button> : undefined}
        >
          {PATH.map((stage) => {
            const p = stageProgress(stage, known);
            return (
              <div key={stage.id} className={styles.stage}>
                <div className={styles.stageHead}>
                  <h3 className={styles.stageTitle}>{stage.title}</h3>
                  <span className={styles.stageCount}>
                    {p.known}/{p.total}
                  </span>
                </div>
                <div className={styles.grid}>
                  {stage.chords.map((s) => (
                    <ChordTile key={s} symbol={s} tuning={tuning} known={known.has(s)} current={known.has(s)} onPick={toggle} />
                  ))}
                </div>
              </div>
            );
          })}
          {list.length === 0 && <Text tone="muted">None yet? Start with E minor: two fingers, and every string rings.</Text>}
        </Section>
      )}
    </div>
  );
}

function rank(symbol: string): number {
  const i = FIRST_CHORDS.indexOf(symbol);
  return i < 0 ? 1000 : i;
}
