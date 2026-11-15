import type { CSSProperties } from 'react';
import { Callout, Cluster, Heading, Icon, Kbd, Stack, Text, focusRing, cx } from '@/ui';
import { Demo, Group, Specimen, Swatch, kitStyles as styles } from './parts';

const TYPE_SCALE: Array<{ size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl'; px: string }> = [
  { size: '4xl', px: '48' },
  { size: '3xl', px: '36' },
  { size: '2xl', px: '28' },
  { size: 'xl', px: '22' },
  { size: 'lg', px: '18' },
  { size: 'md', px: '16' },
  { size: 'sm', px: '14' },
  { size: 'xs', px: '12' },
];

const ROUTE_ICONS = ['House', 'GraduationCap', 'Guitar', 'Wrench', 'Route', 'BookOpen', 'Music', 'Play', 'Waypoints', 'Gamepad2', 'Grid3x3', 'ListMusic', 'Rows4', 'Ear', 'Drum', 'Hand', 'CalendarCheck', 'Gauge', 'Timer', 'ScanEye', 'ScanLine', 'CircleUser'];
const GAME_ICONS = ['Zap', 'Flame', 'Heart', 'Gem', 'Trophy', 'Star', 'Crown', 'Target', 'Metronome', 'Mic', 'Camera', 'AudioLines'];

/** Type, colour, spacing and icons: the raw material every component is built from. */
export function Foundations() {
  return (
    <Group id="foundations" index="01" title="Foundations" blurb="Tokens only: every colour, size and radius in the app comes from src/ui/tokens.css. Nothing here is a literal value.">
      <Specimen name="Heading" note="Bricolage Grotesque. level is semantics, size is looks.">
        <Stack gap={3}>
          {/* The Page already owns the only h1, so the display line here is an h4 dressed up. */}
          <Heading level={4} size="3xl" display>
            Play it slowly, play it right
          </Heading>
          <Heading level={4} size="xl">
            The minor pentatonic, box one
          </Heading>
          <Heading level={4} size="lg">
            Where the root notes sit
          </Heading>
          <Heading level={4} size="md">
            Fourth-level heading
          </Heading>
        </Stack>
      </Specimen>

      <Specimen name="Text" note="Instrument Sans for copy, JetBrains Mono for tab, frets and timings.">
        <Demo label="Variants" width="medium">
          <Text variant="eyebrow">Lesson 3 of 12</Text>
          <Text variant="lead">A scale is a set of notes that sound like they belong together.</Text>
          <Text>
            Rest your thumb behind the neck, roughly opposite your middle finger. Press just behind the fret wire, not on top of it: you need less force than you think.
          </Text>
          <Text variant="caption">Caption: about five minutes, no instrument needed.</Text>
          <Text variant="label">Label text</Text>
          <Text mono tabular>
            e|--0--3--5--| 120 BPM · fret 12
          </Text>
        </Demo>
        <Demo label="Tones">
          <Cluster gap={4}>
            <Text>default</Text>
            <Text tone="muted">muted</Text>
            <Text tone="faint">faint</Text>
            <Text tone="accent">accent</Text>
            <Text tone="ok">ok</Text>
            <Text tone="info">info</Text>
            <Text tone="warn">warn</Text>
            <Text tone="bad">bad</Text>
          </Cluster>
        </Demo>
        <Demo label="Scale">
          <div>
            {TYPE_SCALE.map((row) => (
              <div key={row.size} className={styles.typeRow}>
                <span className={styles.typeMeta}>
                  {row.size} · {row.px}
                </span>
                <Text size={row.size} truncate>
                  Six strings, twelve notes
                </Text>
              </div>
            ))}
          </div>
        </Demo>
      </Specimen>

      <Specimen name="Colour" note="Pearl-and-ink neutrals, one amber accent, semantic and game colours kept apart from it.">
        <Demo label="Neutrals">
          <div className={styles.swatches}>
            <Swatch token="--bg" />
            <Swatch token="--surface" />
            <Swatch token="--surface-2" />
            <Swatch token="--surface-3" />
            <Swatch token="--line" />
            <Swatch token="--line-strong" />
            <Swatch token="--fg-faint" fg="--bg" />
            <Swatch token="--fg-muted" fg="--bg" />
            <Swatch token="--fg" fg="--bg" />
          </div>
        </Demo>
        <Demo label="Accent">
          <div className={styles.swatches}>
            <Swatch token="--accent" fg="--accent-fg" />
            <Swatch token="--accent-strong" fg="--accent-fg" />
            <Swatch token="--accent-soft" fg="--accent-text" />
            <Swatch token="--accent-text" fg="--surface" />
          </div>
        </Demo>
        <Demo label="Semantic">
          <div className={styles.swatches}>
            <Swatch token="--ok" fg="--ok-fg" />
            <Swatch token="--ok-soft" />
            <Swatch token="--info" fg="--info-fg" />
            <Swatch token="--info-soft" />
            <Swatch token="--warn" fg="--warn-fg" />
            <Swatch token="--warn-soft" />
            <Swatch token="--bad" fg="--bad-fg" />
            <Swatch token="--bad-soft" />
          </div>
        </Demo>
        <Demo label="Game currency">
          <div className={styles.swatches}>
            <Swatch token="--xp" fg="--bg" label="XP" />
            <Swatch token="--xp-soft" />
            <Swatch token="--streak" fg="--accent-fg" label="Streak" />
            <Swatch token="--streak-soft" />
            <Swatch token="--heart" fg="--bg" label="Heart" />
            <Swatch token="--gem" fg="--bg" label="Gem" />
          </div>
        </Demo>
        <Demo label="Scale degrees (always with a label)">
          <div className={styles.swatches}>
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <Swatch key={d} token={`--deg-${d}`} fg={`--deg-${d}-fg`} label={d === 1 ? 'R' : String(d)} />
            ))}
            <Swatch token="--deg-x" fg="--deg-x-fg" label="x" />
          </div>
        </Demo>
      </Specimen>

      <Specimen name="Space, shape, depth" note="A 4 px grid, four radii, three shadows.">
        <Demo label="--sp-1 … --sp-16">
          <div className={styles.spaceRow}>
            {[1, 2, 3, 4, 5, 6, 8, 10, 12, 16].map((n) => (
              <div key={n} className={styles.spaceCell}>
                <div className={styles.spaceBar} style={{ '--size': `var(--sp-${n})` } as CSSProperties} />
                {n}
              </div>
            ))}
          </div>
        </Demo>
        <Demo label="Radius">
          <div className={styles.spaceRow}>
            {['sm', 'md', 'lg', 'xl', 'pill'].map((r) => (
              <div key={r} className={styles.spaceCell}>
                <div className={styles.radiusBox} style={{ '--radius': `var(--r-${r})` } as CSSProperties} />
                r-{r}
              </div>
            ))}
          </div>
        </Demo>
        <Demo label="Shadow">
          <div className={styles.spaceRow}>
            {[1, 2, 3].map((s) => (
              <div key={s} className={styles.spaceCell}>
                <div className={styles.shadowBox} style={{ '--shadow': `var(--shadow-${s})` } as CSSProperties} />
                shadow-{s}
              </div>
            ))}
          </div>
        </Demo>
      </Specimen>

      <Specimen name="Icon" note="lucide-react by name, so the route registry can store icon names. Decorative unless it has a label.">
        <Demo label="Route icons">
          <div className={styles.iconGrid}>
            {ROUTE_ICONS.map((name) => (
              <div key={name} className={styles.iconCell}>
                <Icon name={name} size="lg" />
                {name}
              </div>
            ))}
          </div>
        </Demo>
        <Demo label="Game and tools">
          <div className={styles.iconGrid}>
            {GAME_ICONS.map((name) => (
              <div key={name} className={styles.iconCell}>
                <Icon name={name} size="lg" />
                {name}
              </div>
            ))}
          </div>
        </Demo>
        <Demo label="Sizes: xs 14, sm 16, md 20, lg 24, xl 32">
          <Cluster gap={4} align="end">
            <Icon name="Guitar" size="xs" />
            <Icon name="Guitar" size="sm" />
            <Icon name="Guitar" size="md" />
            <Icon name="Guitar" size="lg" />
            <Icon name="Guitar" size="xl" />
            <Icon name="Info" label="More information" />
          </Cluster>
        </Demo>
        <Demo label="Any other lucide name loads on demand">
          <Cluster gap={4}>
            <Icon name="Telescope" size="lg" />
            <Icon name="Origami" size="lg" />
            <Icon name="Popcorn" size="lg" />
          </Cluster>
        </Demo>
      </Specimen>

      <Specimen name="Focus ring" note="Every control shows the same ring on keyboard focus. Custom controls use the focusRing class.">
        <Cluster gap={3}>
          <div role="button" tabIndex={0} className={cx(styles.focusDemo, focusRing)}>
            Tab to me
          </div>
          <Text variant="caption">
            Press <Kbd>Tab</Kbd> to move through this page.
          </Text>
        </Cluster>
        <Callout tone="info" label="Convention">
          Never remove an outline without replacing it. Small visuals keep a 44 px touch target through an invisible hit area.
        </Callout>
      </Specimen>
    </Group>
  );
}
