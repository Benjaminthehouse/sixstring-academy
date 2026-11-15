/**
 * "Changing to …": both shapes side by side with the fingers that stay down circled and the ones
 * that slide dashed, the engine's tips in words, a way to hear the change and a way to practise it.
 */
import { useMemo, useState } from 'react';
import { closestVoicing, type Voicing } from '@/core/guitar';
import { Badge, Button, ChipGroup, Icon, LinkButton, Section, Text } from '@/ui';
import { useMusicSettings } from '@/ui/music';
import { strumSequence } from '../hooks/sound';
import { chordParam, displaySymbol } from '../model/symbols';
import { tipsForVoicings, type ChangeTips } from '../model/tips';
import { difficultyWord, voicingSet } from '../model/voicings';
import { MarkedDiagram } from './MarkedDiagram';
import markStyles from './MarkedDiagram.module.css';
import styles from './Tips.module.css';

/** Props of the panel. */
export interface ChangeTipsPanelProps {
  symbol: string;
  /** The shape of this chord the learner is looking at. */
  voicing: Voicing;
  partners: readonly string[];
  tuning: string;
}

/** The legend for the rings, drawn the same way as on the diagrams. */
export function RingLegend({ anchors, guides }: { anchors: boolean; guides: boolean }) {
  if (!anchors && !guides) return null;
  return (
    <ul className={markStyles.legend}>
      {anchors && (
        <li>
          <svg className={markStyles.swatch} viewBox="0 0 20 20" aria-hidden>
            <circle cx="10" cy="10" r="7" className={markStyles.anchor} strokeWidth={2.4} />
          </svg>
          stays down
        </li>
      )}
      {guides && (
        <li>
          <svg className={markStyles.swatch} viewBox="0 0 20 20" aria-hidden>
            <circle cx="10" cy="10" r="7" className={markStyles.guide} strokeWidth={2.2} />
          </svg>
          slides along its string
        </li>
      )}
    </ul>
  );
}

/** Both diagrams of a change with their marks, an arrow between them. */
export function ChangePair({ tips, size = 'md' }: { tips: ChangeTips; size?: 'sm' | 'md' }) {
  const { naming } = useMusicSettings();
  return (
    <div className={styles.pair}>
      <MarkedDiagram voicing={tips.from} size={size} title={displaySymbol(tips.from.chord, { system: naming })} marks={tips.fromMarks} />
      <Icon name="ArrowRight" size="lg" className={styles.arrow} />
      <MarkedDiagram voicing={tips.to} size={size} title={displaySymbol(tips.to.chord, { system: naming })} marks={tips.toMarks} />
    </div>
  );
}

/** The change-tips section of a chord page. */
export function ChangeTipsPanel({ symbol, voicing, partners, tuning }: ChangeTipsPanelProps) {
  const { naming } = useMusicSettings();
  const [partner, setPartner] = useState(partners[0]);
  const active = partners.includes(partner) ? partner : partners[0];
  const tips = useMemo(() => {
    const candidates = voicingSet(active, tuning).all.filter((v) => v.notes.length >= 3);
    const to = closestVoicing(voicing, candidates) ?? candidates[0];
    return to ? tipsForVoicings(voicing, to) : null;
  }, [active, voicing, tuning]);
  if (!tips) return null;
  const name = displaySymbol(symbol, { system: naming });
  const other = displaySymbol(active, { system: naming });
  const hear = () => strumSequence([tips.from, tips.to, tips.from, tips.to], 1.2);
  const anchors = tips.fromMarks.some((m) => m.role === 'anchor');
  const guides = tips.fromMarks.some((m) => m.role === 'guide');
  return (
    <Section title={`Changing from ${name}`} description="Pick the chord you change to. Fingers that can stay down are circled; save them the trip." data-change-tips>
      <ChipGroup aria-label="Change to" options={partners.map((p) => ({ value: p, label: displaySymbol(p, { system: naming }) }))} value={active} onChange={setPartner} />
      <div className={styles.layout}>
        <div className={styles.visual}>
          <ChangePair tips={tips} />
          <RingLegend anchors={anchors} guides={guides} />
        </div>
        <div className={styles.words}>
          <div className={styles.headline}>
            <Text weight="semibold">
              {name} to {other}
            </Text>
            <Badge tone={tips.difficulty <= 3.5 ? 'ok' : tips.difficulty <= 5.5 ? 'info' : 'warn'}>{difficultyWord(tips)} change</Badge>
          </div>
          <ul className={styles.tips} aria-live="polite">
            {tips.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <div className={styles.actions}>
            <Button iconLeft="Volume2" onClick={hear}>
              Hear the change
            </Button>
            <LinkButton iconLeft="Repeat" to="chords" params={['trainer', chordParam(symbol), chordParam(active)]}>
              Practise {name} to {other}
            </LinkButton>
          </div>
        </div>
      </div>
    </Section>
  );
}
