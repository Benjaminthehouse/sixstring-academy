/**
 * Everything about one song, with Play as the one obvious action: level and facts, the first bars
 * as real tab, the chord shapes, what it teaches and how it should sound, and (for the learner's
 * own songs) where it came from and what the importer was unsure about. Used in the preview pane
 * on wide screens and in a sheet on phones.
 */
import { useMemo, useState } from 'react';
import { Badge, Button, Callout, Icon, IconButton, LinkButton, Menu, Skeleton, StarRating, Tag, Text, cx } from '@/ui';
import { ChordDiagram, TabView, TuningLabel } from '@/ui/music';
import { useSong, useSongSummary, KIND_NAMES, STYLE_NAMES, type SongListing } from '@/core/library';
import { songMenuItems, useSongActions } from '../actions';
import { songChordShapes } from '../chords';
import { bandLabel, bandTone, lengthLabel, originLine, sortedWarnings, tempoLabel, withoutRhythmNote } from '../format';
import { useSongSkill } from '../hooks';
import styles from './SongDetails.module.css';

const STANDARD = [40, 45, 50, 55, 59, 64];
/** Bars of real tab shown in the details. */
const PREVIEW_BARS = 4;

/** Props of `SongDetails`. */
export interface SongDetailsProps {
  listing: SongListing;
  /** `pane` (wide screens, beside the list) or `sheet` (phones). */
  variant: 'pane' | 'sheet';
  /** Title of another song by id (for "Your copy of ..."). */
  titleOf?: (id: string) => string | undefined;
}

/** The importer's notes on one of the learner's songs, the least certain first. */
function ImportNotes({ listing }: { listing: SongListing }) {
  const [all, setAll] = useState(false);
  const imported = listing.imported;
  const notes = useMemo(() => sortedWarnings(withoutRhythmNote(imported?.warnings ?? [], imported?.estimatedRhythm)), [imported]);
  if (!imported || (!notes.length && !imported.estimatedRhythm)) return null;
  const shown = all ? notes : notes.slice(0, 4);
  return (
    <div className={styles.block}>
      {imported.estimatedRhythm && (
        <Callout tone="warn" label="Check the rhythm" icon="TriangleAlert">
          The file did not say how long each note lasts, so the rhythm was worked out from the spacing. Listen in the player and compare it with a recording you know.
        </Callout>
      )}
      {notes.length > 0 && (
        <details className={styles.notes} open={notes.length <= 2}>
          <summary className={styles.notesSummary}>
            <Icon name="Info" size="sm" />
            {notes.length === 1 ? '1 note from the importer' : `${notes.length} notes from the importer`}
          </summary>
          <ul className={styles.noteList}>
            {shown.map((n) => (
              <li key={n.text} className={cx(n.unsure && styles.unsure)}>
                {n.unsure && <span className={styles.unsureTag}>Unsure</span>}
                {n.text}
                {n.count > 1 && <span className={styles.count}> (×{n.count})</span>}
              </li>
            ))}
          </ul>
          {notes.length > shown.length && (
            <Button size="sm" variant="ghost" onClick={() => setAll(true)}>
              Show all {notes.length}
            </Button>
          )}
        </details>
      )}
    </div>
  );
}

/** The details of one song. */
export function SongDetails({ listing, variant, titleOf }: SongDetailsProps) {
  const actions = useSongActions();
  const { song, loading, error } = useSong(listing.id);
  const { summary } = useSongSummary(listing, true);
  const skill = useSongSkill(listing.id);
  const fav = actions.isFavourite(listing.id);
  const chords = useMemo(() => (song ? songChordShapes(song) : []), [song]);
  const length = summary ? lengthLabel(summary.seconds) : null;
  const origin = originLine(listing, titleOf);
  const nonStandard = summary && (summary.tuning.join(',') !== STANDARD.join(',') || summary.capo > 0);
  const bars = song ? Math.min(PREVIEW_BARS + (song.bars[0]?.length !== undefined ? 1 : 0), song.bars.length) : 0;
  const Title = variant === 'pane' ? 'h2' : 'h3';

  return (
    <article className={cx(styles.details, styles[variant])} aria-label={variant === 'pane' ? `${listing.title}: details` : undefined} data-song-details={listing.id}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>{listing.source === 'mine' ? 'Your song' : listing.kind ? KIND_NAMES[listing.kind] : 'Song'}</p>
        <Title className={styles.title}>{listing.title}</Title>
        {(listing.composer || listing.origin || origin) && (
          <p className={styles.by}>{[listing.composer, listing.source === 'mine' ? origin : listing.origin].filter(Boolean).join(' · ')}</p>
        )}
      </header>

      <div className={styles.facts}>
        <Badge tone={bandTone(listing.level)} variant="soft">
          Level {listing.level} · {bandLabel(listing.level)}
        </Badge>
        {listing.style && <Tag>{STYLE_NAMES[listing.style]}</Tag>}
        {listing.key && <Tag>{listing.key}</Tag>}
        {summary && <Tag mono>{summary.time}</Tag>}
        {summary && (
          <Tag mono>
            <span aria-hidden="true">{tempoLabel(summary.bpm, summary.time).short}</span>
            <span className="sr-only">{tempoLabel(summary.bpm, summary.time).spoken}</span>
          </Tag>
        )}
        {length && (
          <Tag icon="Clock" mono>
            <span aria-hidden="true">{length.short}</span>
            <span className="sr-only">{length.spoken}</span>
          </Tag>
        )}
      </div>
      {nonStandard && summary && <TuningLabel tuning={summary.tuning} capo={summary.capo} className={styles.tuning} />}

      <div className={styles.actions}>
        <LinkButton to="play" params={[listing.id]} variant="primary" size="lg" iconLeft="Play" className={styles.play}>
          Play
        </LinkButton>
        <IconButton icon="Heart" label={fav ? 'Remove from favourites' : 'Add to favourites'} pressed={fav} variant="secondary" size="lg" onClick={() => actions.toggleFavourite(listing)} className={cx(fav && styles.favOn)} />
        <Menu trigger={<IconButton icon="EllipsisVertical" label={`More for ${listing.title}`} variant="secondary" size="lg" />} items={songMenuItems(listing, actions)} />
      </div>

      {skill && skill.attempts > 0 && (
        <div className={styles.progress}>
          <StarRating value={skill.stars} size={18} label={`${skill.stars} of 3 stars`} />
          <Text size="sm" tone="muted">
            Played {skill.attempts} {skill.attempts === 1 ? 'time' : 'times'}
            {skill.bestAccuracy > 0 ? ` · best ${Math.round(skill.bestAccuracy * 100)}%` : ''}
          </Text>
        </div>
      )}

      <section className={styles.block} aria-label="How it starts">
        <h4 className={styles.blockTitle}>How it starts</h4>
        <div className={styles.tab}>
          {song ? (
            <TabView song={song} bars={[0, bars]} size="sm" pick="none" barNumbers={false} autoScroll={false} maxBarsPerSystem={variant === 'pane' ? 2 : 2} aria-label={`The first bars of ${listing.title}`} />
          ) : error ? (
            <Text size="sm" tone="muted">
              {error.message}
            </Text>
          ) : (
            <Skeleton variant="block" height="7rem" aria-busy={loading} />
          )}
        </div>
      </section>

      {chords.length > 0 && (
        <section className={styles.block} aria-label="Chords">
          <h4 className={styles.blockTitle}>{chords.length === 1 ? 'The chord' : 'The chords'}</h4>
          <div className={styles.chords}>
            {chords.map((c) => (
              <ChordDiagram key={c.sounding} chord={c.shape} frets={c.frets} size="sm" />
            ))}
          </div>
        </section>
      )}

      {listing.teaches.length > 0 && (
        <section className={styles.block} aria-label="What you will learn">
          <h4 className={styles.blockTitle}>What you will learn</h4>
          <ul className={styles.teaches}>
            {listing.teaches.map((t) => (
              <li key={t}>
                <Icon name="Check" size="sm" className={styles.tick} />
                {t}
              </li>
            ))}
          </ul>
        </section>
      )}

      {listing.about && (
        <section className={styles.block} aria-label="How to play it">
          <h4 className={styles.blockTitle}>How to play it</h4>
          <Text variant="prose" size="sm">
            {listing.about}
          </Text>
        </section>
      )}

      {listing.source === 'mine' && <ImportNotes listing={listing} />}

      {listing.notes && (
        <section className={styles.block} aria-label="Your notes">
          <h4 className={styles.blockTitle}>Your notes</h4>
          <Text size="sm">{listing.notes}</Text>
        </section>
      )}

      {listing.publicDomain && (
        <p className={styles.rights}>
          <Icon name="ShieldCheck" size="xs" />
          <span>{listing.publicDomain}</span>
        </p>
      )}
    </article>
  );
}
