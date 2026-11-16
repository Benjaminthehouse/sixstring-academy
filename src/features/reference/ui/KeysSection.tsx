/**
 * Key signatures: the order of sharps and flats with the sentences that spell them, how to name a
 * key from its signature, and all 15 signatures (30 keys). Open a row to see the staff and the
 * major and minor scales, and to hear them.
 */
import { useEffect, useMemo, useState } from 'react';
import { href } from '@/app/router';
import { IconButton, Icon, Section, Text, cx } from '@/ui';
import { NotationView } from '@/ui/music';
import { MNEMONICS, flatOrder, namingRules, raisedSeventh, rowOfKey, scaleLine, sharpOrder, signatureRows, type SignatureRow } from '../model/keys';
import type { SectionProps } from './SectionBody';
import { lineMidi, playLine } from './sound';
import styles from './Sections.module.css';

/** The key signatures page. */
export function KeysSection({ item, reveal, level, fmt, sounder }: SectionProps) {
  const rows = useMemo(() => signatureRows(), []);
  const [open, setOpen] = useState<number | null>(() => (item ? rowOfKey(rows, item)?.fifths ?? null : 0));
  useEffect(() => {
    const r = item ? rowOfKey(rows, item) : null;
    if (r) setOpen(r.fifths);
  }, [item, reveal, rows]);
  const rules = useMemo(() => namingRules(fmt.note), [fmt]);

  return (
    <div className={styles.stack}>
      <Section level={level} title="The order of sharps and flats" data-ref-item="order">
        <div className={styles.orders}>
          <OrderRow label="Sharps" notes={sharpOrder()} mnemonic={MNEMONICS.sharps} fmt={fmt} />
          <OrderRow label="Flats" notes={flatOrder()} mnemonic={MNEMONICS.flats} fmt={fmt} />
        </div>
        <Text tone="muted" variant="caption">
          A signature always takes them from the start of its row: three sharps are the first three sharps. Flats are the sharps’ order backwards.
        </Text>
      </Section>

      <Section level={level} title="Name the key from the signature">
        <ul className={styles.rules}>
          {rules.map((r) => (
            <li key={r.id} className={styles.rule}>
              <span className={styles.ruleTitle}>{r.title}</span>
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section level={level} title="All 15 signatures" description="Each signature belongs to one major key and its relative minor. Open a row for the staff and the scales.">
        <ul className={styles.sigList}>
          {rows.map((r) => (
            <SignatureItem key={r.fifths} row={r} open={open === r.fifths} onToggle={() => setOpen(open === r.fifths ? null : r.fifths)} fmt={fmt} sounder={sounder} />
          ))}
        </ul>
      </Section>
    </div>
  );
}

function OrderRow({ label, notes, mnemonic, fmt }: { label: string; notes: string[]; mnemonic: string; fmt: SectionProps['fmt'] }) {
  return (
    <div className={styles.order}>
      <span className={styles.orderLabel}>{label}</span>
      <span className={styles.tokens}>
        {notes.map((n, i) => (
          <span key={n} className={styles.token}>
            <span className={styles.tokenIndex}>{i + 1}</span>
            {fmt.note(n)}
          </span>
        ))}
      </span>
      <span className={styles.mnemonic}>“{mnemonic}”</span>
    </div>
  );
}

function sigShort(r: SignatureRow): string {
  if (r.count === 0) return '0';
  return `${r.count}${r.type === 'sharps' ? '♯' : '♭'}`;
}

function SignatureItem({ row, open, onToggle, fmt, sounder }: { row: SignatureRow; open: boolean; onToggle: () => void; fmt: SectionProps['fmt']; sounder: SectionProps['sounder'] }) {
  const panelId = `sig-${row.fifths}`;
  const words = row.count === 0 ? 'No sharps or flats' : `${row.count} ${row.type === 'sharps' ? 'sharp' : 'flat'}${row.count === 1 ? '' : 's'}`;
  return (
    <li className={cx(styles.sigItem, open && styles.sigOpen)} data-ref-item={row.major.id}>
      <span data-ref-item={row.minor.id} className={styles.anchor} aria-hidden="true" />
      <button type="button" className={styles.sigRow} aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <span className={cx(styles.sigCount, row.type === 'flats' && styles.sigFlat)} aria-hidden="true">
          {sigShort(row)}
        </span>
        <span className={styles.sigKeys}>
          <span className={styles.sigMajor}>{fmt.key(row.major.name)}</span>
          <span className={styles.sigMinor}>{fmt.key(row.minor.name)}</span>
        </span>
        <span className={styles.sigAcc}>
          <span className={styles.srOnly}>{words}: </span>
          {row.accidentals.length ? fmt.notes(row.accidentals) : '—'}
        </span>
        <Icon name="ChevronDown" size="sm" className={styles.chevron} />
      </button>
      {open && (
        <div id={panelId} className={styles.sigPanel}>
          {[row.major, row.minor].map((k) => {
            const line = scaleLine(k);
            const id = `scale:${k.id}`;
            const seventh = raisedSeventh(k);
            return (
              <div key={k.id} className={styles.sigScale}>
                <div className={styles.sigScaleHead}>
                  <IconButton icon={sounder.playing === id ? 'Square' : 'Play'} label={sounder.playing === id ? 'Stop' : `Play the ${fmt.key(k.name)} scale`} variant="secondary" round size="sm" pressed={sounder.playing === id} onClick={() => sounder.toggle(id, () => playLine(lineMidi(line)))} />
                  <div>
                    <p className={styles.sigScaleTitle}>{fmt.key(k.name)}</p>
                    <p className={styles.sigScaleNotes}>{fmt.notes(line.slice(0, 7))}</p>
                  </div>
                  <a className={styles.inlineLink} href={href('reference', 'circle', k.id)}>
                    On the circle
                  </a>
                </div>
                <div className={styles.staff}>
                  <NotationView notes={line.map((n) => ({ keys: n, duration: 'q' as const }))} keySignature={k.name} labels="names" naming={fmt.naming} aria-label={`${fmt.key(k.name)}: ${words}`} />
                </div>
                {seventh && (
                  <Text variant="caption" tone="muted">
                    Harmonic minor raises the 7th to {fmt.note(seventh)}, written as an accidental: the signature never shows it.
                  </Text>
                )}
              </div>
            );
          })}
        </div>
      )}
    </li>
  );
}
