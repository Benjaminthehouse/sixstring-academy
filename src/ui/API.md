# `@/ui` — the general UI kit

```tsx
import { Page, Section, Stack, Grid, Button, Card, toast, useIsMobile, cx } from '@/ui';
```

Everything below is exported from `@/ui`. Music components (Fretboard, ChordDiagram, TabView …) are
in `@/ui/music`. Live gallery of every component and state: route `#kit` (one group: `#kit--inputs`).

Conventions that hold for the whole kit:

- **Tokens only.** Colours, type, space, radii and shadows come from `src/ui/tokens.css`.
- **Change handlers give the value**, not the event: `onChange(value)`.
- **Icon slots** (`icon`, `iconLeft` …) take a lucide name (`"Flame"`), a component imported from
  `lucide-react`, or an element.
- **Link props**: anything clickable that navigates takes `to` + `params` (route name and slug
  params, built with the router's `href()`) or a ready `href`. It then renders a real `<a>`.
- **Touch targets are 44 px** even where the visual is smaller (invisible hit areas). Do not shrink.
- **Contrast is part of the kit.** Text is 4.5:1, large text and anything you must see to use a control
  is 3:1, in both themes. Three tokens do not get there by themselves, so use them like this:
  `--fg-faint` for icons, hairline details and large text only (small text is `--fg-muted`, or
  `<Text tone="faint">`, which is adjusted to pass); `--line-strong` for dividers and labelled buttons,
  not for the edge of an input, checkbox or switch (those use the darker edge already built into
  `TextField`, `Select`, `Checkbox`, `Switch`, `Stepper`); `--accent` / `--accent-strong` as fills
  under `--accent-fg`, never as text or a thin icon on a light surface (that is `--accent-text`).
  Coloured status text goes through `<Text tone="ok | warn | bad | info">`, not the raw token.
- Every component accepts `className`; most spread the remaining DOM props onto their root element.
- `?` marks an optional prop. Defaults are in brackets.

---

## Rules for composing a screen

**Do**

- Start every screen with `<Page title>`: it gives the only `h1`, the gutters and the max width.
  Group content in `<Section title>` (an `h2`); use `level={3}` inside another section.
- Space things with `Stack`, `Row`, `Cluster`, `Grid` and their `gap` steps. No hand-written margins.
- Write copy with `Text` / `Heading` (or your own CSS module using tokens). Numbers that change get
  `tabular`; tab, frets and timings get `mono`.
- One `variant="primary"` button per view: the thing the screen is for. Everything else is
  secondary (default) or ghost. Put the primary action last in a `ButtonGroup`.
- Navigation is a link (`LinkButton`, `Card to`, `ListItem to`); an action is a `Button`.
- Use a `Card` for a discrete object (a song, a lesson, a setting group). A list of many similar
  things is a `List` of `ListItem`s. A plain block of content is just a `Section`.
- Give every input its `label`. Icon-only controls use `IconButton label="…"`.
- Open in a useful state, then show honest states: `Skeleton` while loading a known shape,
  `Spinner` for an unknown wait, `ProgressBar` when you can measure, `EmptyState` when there is
  nothing yet, `ErrorState` when a region failed, `MediaBlocked` when the mic or camera is unavailable.
- Pick feedback by lifetime: `toast` for a passing confirmation, `Banner` for a state that lasts,
  `Callout` for an aside in lesson text, `confirmDialog()` before anything that cannot be undone.
- On phones: filters are a `ChipGroup` (one swipeable row), options go in a `Sheet`, wide content
  scrolls inside its own container. Check 360 px.
- "Selected" always looks the same: amber-soft fill, amber edge and a check mark (`Chip`,
  `Card selected`, `RadioGroup variant="cards"`, pressed buttons). Reuse those; do not invent another.
- Game numbers use `XpChip`, `StreakChip`, `HeartsChip`, `GemChip`, `LevelBadge`, `StarRating`
  with values read from `core/progress`.

**Do not**

- No `window.alert` / `confirm` / `prompt`, no `title=""` tooltips, no `<div onClick>`.
- No literal colours, no inline `style` for colour or type, no new font sizes. Inline `style` is for
  computed geometry only.
- No fixed pixel boxes around text. Sizes that hold words or numbers are in `rem` (or left to the
  content), so they grow with the learner's text size: `ProgressRing` and `CountdownRing` already do.
  A row that cannot fit at 320 px or at 200 % text must wrap (`Row wrap`, `Cluster`), not push the page wide.
- Do not wrap every block in a card, centre everything, or add gradient heroes. The page is a calm
  desk: left-aligned, hairlines between groups, cards only where there is an object.
- No emoji as icons or decoration. Icons come from `<Icon>`.
- Amber is for the primary action and for selection. Do not use it as decoration; status uses the
  semantic tones (`ok`, `info`, `warn`, `bad`) and always comes with an icon or wording, never colour alone.
- Do not put buttons or links inside a clickable `Card` / `ListItem` (one control per row), and
  never more than one `PlayButton` on a screen.
- Do not hide essential information in a `Tooltip` (phones never see it) or in placeholder text.
- Do not drive per-frame visuals through React state (use `useRafLoop` + refs / canvas).
- Do not `import { icons } from 'lucide-react'` or `import * as …`: that pulls 1 MB of icons into
  your chunk. Named imports of single icons are fine.
- Frosted bars: write `-webkit-backdrop-filter` first and `backdrop-filter` after it (or only the
  standard one). In the other order the production build keeps just the prefixed line, which
  Chrome and Firefox ignore, and the blur silently disappears outside the dev server.

**For the app shell**

- Wrap the app once in `UIProvider` (`<UIProvider>{app}</UIProvider>`): it mounts the toast stack
  and the `confirmDialog()` host. Both self-mount if it is missing, but belong in the app tree.
  (Its two halves are also exported: `ToastProvider` / `ToastViewport` and `ConfirmHost`.)
- `Page` owns horizontal gutters (16 px on phones, 32 px from 720 px) and `--content-max`. The
  shell's `<main>` must not add horizontal padding; if it does, set `--page-gutter: 0px` on it.
  `--page-max` overrides the width. Its root carries `data-ui-page`, which the shell uses to tell a
  screen built on `Page` from a bare element.
- `ActionBar` is `position: sticky; bottom: var(--sticky-bottom, 0px)`. If the phone tab bar is
  `position: fixed`, set `--sticky-bottom` on `<main>` to its height so the bar sits above it.
- Bottom clearance: `--action-bar-h` on `<html>` is the room taken, above `--sticky-bottom`, by
  controls that sit at the bottom of the screen *right now* (a stuck `ActionBar`, or anything passed
  to `useBottomClearance`). A bar that ends mid-screen publishes nothing. Toasts add it; so must any
  screen-made fixed bottom layer. While at least one of them is mounted, stuck or not, `<html>` also
  carries `data-ui-bottom-controls` (the shell moves toasts to the top of an immersive phone screen
  that has none, so they cannot land on its unregistered bottom controls).
- Breakpoints: `useIsMobile()` is `< 720 px` (`BREAKPOINTS.mobile`); `BREAKPOINTS.wide` is 1080.
- Toasts sit above `--nav-h` on phones (the shell sets it to 0 while an immersive screen hides its
  tab bar). Layers: modal/sheet 200 < popover/menu 250 < toast 300 < tooltip 400 < celebration 500
  (`LAYERS`). Toasts never cover an open dialog: see "Toasts" below.

---

## Layout

| Component | Props | Notes |
|---|---|---|
| `Page` | `title`, `subtitle?`, `eyebrow?`, `back?: string \| { to?, params?, label?, onClick? }`, `actions?`, `width?: 'content' \| 'prose' \| 'full'` [content], `gap?` [8], `hideHeader?` | Screen wrapper. `back="songs"` renders a real link; name the destination with `label`. |
| `Section` | `title?`, `description?`, `eyebrow?`, `actions?`, `level?: 2 \| 3`, `divided?`, `gap?` [4] | Titled block; no card. |
| `ActionBar` | `start?`, `stretchOnMobile?` [true], `clearance?` [true], children (the buttons) | Sticks to the bottom of the screen while content scrolls: a lesson's "Check" / "Continue". Last child of a `Page`, primary button last (the shell's "Jump to the main action" link focuses it). While it sits at the bottom of the screen it publishes its height as `--action-bar-h` on `<html>`; ended mid-screen (a short page, made static beside the content on wide screens) it publishes nothing. Toasts add it, and any other fixed bottom layer should too. `clearance={false}` opts out. |
| `Stack` | `gap?` [4], `align?`, `justify?`, `as?` | Vertical flow. |
| `Row` | `gap?` [3], `align?`, `justify?`, `wrap?`, `stackOnMobile?`, `as?` | One line, centred vertically. |
| `Cluster` | `gap?` [2], `align?`, `justify?`, `as?` | Wrapping group of small things. |
| `Grid` | `min?` ["16rem"], `columns?`, `keepOnMobile?`, `mode?: 'fit' \| 'fill'`, `gap?` [4], `as?` | Responsive equal columns; `columns` fixes the count (one column on phones unless `keepOnMobile`). |
| `Divider` | `orientation?`, `label?` | Hairline. |
| `Spacer` | `size?` | Flexible gap in a Row/Stack, or a fixed step. |
| `Text` | `variant?: 'body' \| 'lead' \| 'caption' \| 'label' \| 'eyebrow' \| 'prose'`, `size?`, `tone?`, `weight?`, `mono?`, `tabular?`, `truncate?`, `align?`, `as?` | Copy. `prose` is a readable column for long text. |
| `Heading` | `level?: 1–4` [2], `size?`, `display?`, `tone?` | `level` is semantics, `size` is looks. |

`gap` is a step of the 4 px scale: `0 1 2 3 4 5 6 8 10 12 16`. `align`: `start center end stretch
baseline`. `justify`: `start center end between around evenly`. `size`: `xs sm md lg xl 2xl 3xl 4xl`.
`tone`: `default muted faint accent ok bad warn info`.

```tsx
<Page title="A minor pentatonic" subtitle="Five notes, five positions." back={{ to: 'scales', label: 'All scales' }}
      actions={<Button variant="primary" iconLeft="Play">Play along</Button>}>
  <Section title="Positions" description="Start with box one." actions={<LinkButton to="arcade" variant="ghost" size="sm">Practise</LinkButton>}>
    <Grid min="14rem">{positions.map((p) => <Card key={p.id} to="scales" params={[p.id]}>…</Card>)}</Grid>
  </Section>
</Page>
```

## Icon

- `Icon` — `name` (lucide PascalCase name or a lucide component), `size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number` [md = 20],
  `strokeWidth?` [1.75], `label?`. Decorative unless `label` is set.
- About 350 common names draw immediately (list: `src/ui/icon/bundled-names.txt`; every route icon
  is in it). Any other lucide name also works: the full set loads once, on demand. Unknown names
  draw a dashed ring and warn in the console. `isBundledIcon(name)`, `preloadAllIcons()`.
- To add a name to the immediate set: edit `bundled-names.txt`, run `node src/ui/icon/generate.mjs`.

```tsx
<Icon name="Flame" />   <Icon name={route.icon} size="lg" />   <Icon name="Info" label="More information" />
```

## Actions

| Component | Props | Notes |
|---|---|---|
| `Button` | `variant?: 'primary' \| 'secondary' \| 'ghost' \| 'danger'` [secondary], `size?: 'sm' \| 'md' \| 'lg'`, `iconLeft?`, `iconRight?`, `fullWidth?`, `wrap?`, `loading?`, `pressed?`, `disabled?` + button props | `loading` shows a spinner and ignores presses. `pressed` makes it a toggle (`aria-pressed`). A label wider than its container ends in an ellipsis; pass `wrap` when the label is a phrase that must stay whole. A primary `Button` / `LinkButton` (and the `PlayButton`) carries `data-ui-primary`: the shell's "Jump to the main action" link goes to the first one when the screen has no `ActionBar`. |
| `LinkButton` | Button's look props + `to?`, `params?`, `href?`, `disabled?` | An `<a>`. External URLs open in a new tab. |
| `IconButton` | `icon`, `label` (required), `variant?` [ghost], `size?`, `round?`, `pressed?`, `loading?`, `noTooltip?` | `label` is the accessible name and the tooltip. |
| `ButtonGroup` | `attached?`, `fullWidth?`, `align?: 'start' \| 'end'`, `stackOnMobile?` | `stackOnMobile` puts the last (primary) button on top. |
| `PlayButton` | `playing?`, `label?`, `size?: 'md' \| 'lg' \| 'xl'` (56/72/96), `icon?`, `filled?`, `tone?: 'accent' \| 'neutral' \| 'danger'`, `loading?` | Big round transport control. |

```tsx
<Button variant="primary" iconLeft="Play" onClick={start}>Start lesson</Button>
<LinkButton to="tuner" iconRight="ArrowRight">Tune up first</LinkButton>
<IconButton icon="Repeat" label="Loop this section" pressed={loop} onClick={toggleLoop} />
<PlayButton playing={playing} onClick={toggle} />
```

## Inputs

All take `label` (required), `hideLabel?`, `hint?`, `error?` (also marks the control invalid),
`disabled?`. `size?: 'sm' | 'md' | 'lg'` where noted.

| Component | Props | Notes |
|---|---|---|
| `TextField` | `value`, `onChange(value)`, `icon?`, `prefix?`, `suffix?`, `size?`, `mono?`, `optional?`, `aside?` + input props | |
| `TextArea` | `value`, `onChange(value)`, `autoGrow?`, `rows?` [3], `maxLength?` (adds a counter), `mono?` | |
| `Select` | `value`, `onChange(value)`, `options: Array<string \| { value, label, disabled? } \| { group, options }>`, `placeholder?`, `prefix?` (icon), `size?` | Native select. |
| `SearchField` | `value`, `onChange(value)`, `onSubmit?`, `label?` [Search, hidden], `showLabel?`, `placeholder?`, `size?` | Escape or the cross clears. |
| `SegmentedControl` | `options: Array<T \| { value, label, icon?, ariaLabel?, disabled? }>`, `value`, `onChange`, `aria-label`, `size?`, `fullWidth?` | 2–5 short choices. Radio group. Labels are never cut short: segments that do not fit one row (a narrow phone, 200 % text) wrap onto a second row. |
| `Tabs` | `items: Array<{ id, label, icon?, badge?, disabled?, content? }>`, `value?`, `defaultValue?`, `onChange?`, `aria-label`, `variant?: 'underline' \| 'pills'`, `fitted?`, `keepMounted?` | Renders the panels. Leave out every `content` to get just the strip. Underline tabs scroll sideways inside their strip when they do not fit; pills wrap onto a second row. |
| `Switch` | `checked`, `onChange(checked)`, `label?`, `description?`, `side?: 'start' \| 'end'` [end] | Immediate settings. Bare: pass `aria-label`. |
| `Checkbox` | `checked`, `onChange(checked)`, `label?`, `description?`, `indeterminate?` | |
| `RadioGroup` | `label`, `options: Array<T \| { value, label, description?, disabled? }>`, `value`, `onChange`, `variant?: 'list' \| 'cards'`, `orientation?`, `minCardWidth?` | |
| `Slider` | `value`, `onChange`, `onCommit?`, `min?` [0], `max?` [100], `step?` [1], `format?`, `marks?: Array<{ value, label? }>`, `bubble?: 'auto' \| 'always' \| 'never'`, `showValue?` | Continuous values. |
| `Stepper` | `value`, `onChange`, `min?`, `max?`, `step?`, `largeStep?`, `unit?`, `format?`, `size?: 'md' \| 'lg'`, `editable?` [true] | Exact numbers; hold to repeat; type or arrow keys. |
| `FileDrop` | `onFiles(files)`, `onReject?`, `accept?`, `multiple?`, `maxBytes?`, `capture?: 'environment' \| 'user'`, `title?`, `hint?`, `browseLabel?`, `captureLabel?`, `icon?`, `compact?`, `busy?: boolean \| string` | `capture` adds "Take a photo" on touch devices. |
| `Chip` | `selected?`, `icon?`, `count?` + button props | A toggle pill. |
| `ChipGroup` | `options: Array<T \| { value, label, icon?, count?, disabled? }>`, `aria-label`, then `value: T \| null` + `onChange(value)`, or `multiple` + `value: T[]` + `onChange(values)`; `scroll?: 'auto' \| 'always' \| 'never'`, `bleed?` | Filters. `auto`: wraps on wide screens, one swipeable row on phones. |
| `Field` | `label`, `hint?`, `error?`, `htmlFor?`, `labelAs?` … | The label/hint/error furniture for a custom control. |

```tsx
<TextField label="Song title" value={title} onChange={setTitle} hint="Shown in your library." />
<Select label="Tuning" value={tuning} onChange={setTuning} options={['Standard', 'Drop D', 'DADGAD']} />
<SegmentedControl aria-label="Accidentals" options={['Sharps', 'Flats']} value={acc} onChange={setAcc} />
<Tabs aria-label="Scale views" items={[{ id: 'neck', label: 'Neck', content: <Neck /> }, { id: 'staff', label: 'Staff', content: <Staff /> }]} />
<Slider label="Tempo" min={40} max={220} value={bpm} onChange={setBpm} format={(v) => `${v} BPM`} />
<Stepper label="Tempo" unit="BPM" min={30} max={260} value={bpm} onChange={setBpm} size="lg" />
<ChipGroup aria-label="Level" options={['All', 'Beginner', 'Intermediate', 'Expert']} value={level} onChange={setLevel} />
<FileDrop accept=".pdf,image/*,.gp5,.musicxml" capture="environment" hint="PDF, photo, Guitar Pro or MusicXML" onFiles={([f]) => importFile(f)} />
```

## Feedback

**Toasts** — callable from anywhere, also outside React.

```tsx
toast.ok('Tuning saved');
toast.error('The file could not be read', { description: 'It may be damaged.' });
toast({ title: 'Removed from your library', action: { label: 'Undo', onClick: restore } });
```

`toast(options | string)`, `toast.ok / .info / .warn / .error(title, options?)`, `toast.dismiss(id)`,
`toast.clear()`; `useToast()` returns the same object. Options: `title`, `description?`, `tone?`,
`icon?`, `duration?` (ms; 0 = sticky; default 4 s, 6 s for warn/error, 8 s with an action),
`action?: { label, onClick }`, `id?` (reuse to replace in place), `news?` (see below).

At most three toasts show at once (`MAX_TOASTS`): a new one pushes the oldest off. A toast with
`news: true` is something the learner did not just ask for (the shell's rewards, a sync result): it
never pushes another off but waits its turn, and **while a Modal or Sheet is open it waits** and
shows when the last one closes (news already on screen steps aside and comes back with at least 3 s
left). Toasts that are replies to a tap still show while a dialog is open, at the top edge, clear of
a bottom sheet's buttons; over a dialog that reaches the top (a tall sheet, a drawer) they go just
under its header instead, so its title and Close stay clear. `useDialogOpen()` tells you whether
any kit dialog is open.

Toasts are announced (a polite live region; `warn` / `error` as alerts). From the keyboard, **Alt+T**
moves focus to the newest toast (its action first), which also pauses the countdowns; Escape there
dismisses it and focus returns to where it was. Never make a toast the only way to do something.

**Dialogs**

| Component | Props | Notes |
|---|---|---|
| `Modal` | `open`, `onClose`, `title`, `hideTitle?`, `description?`, `footer?`, `size?: 'sm' \| 'md' \| 'lg' \| 'full'`, `dismissable?` [true], `flush?`, `phone?: 'sheet' \| 'center' \| 'full'` [sheet] | Focus trap, Escape, scroll lock, focus returns. Mark the first control with `data-autofocus`. The phone's Back gesture (and the browser's Back) calls `onClose` instead of leaving the screen (see below). |
| `Sheet` | Modal's props + `desktop?: 'modal' \| 'drawer'` [modal] | Bottom sheet on phones (swipe down closes). Back closes it, as for `Modal`. |
| `ConfirmDialog` | `open`, `title`, `description?`, `confirmLabel?`, `cancelLabel?`, `tone?: 'default' \| 'danger'`, `busy?`, `onConfirm`, `onCancel` | Declarative form. |
| `confirmDialog(options)` | `{ title, description?, confirmLabel?, cancelLabel?, tone? }` → `Promise<boolean>` | The replacement for `window.confirm`. `useConfirm()` returns it. |
| `Tooltip` | `content`, `placement?` [top], `delay?`, `disabled?`, one child element | Hover / keyboard focus only. |
| `Popover` | `trigger` (element), `aria-label`, `placement?` [bottom], `align?` [start], `open?`, `onOpenChange?`, `flush?`, children or `({ close }) => node` | A few controls anchored to a button. |
| `Menu` | `trigger`, `items: Array<{ label, icon?, onSelect?, danger?, disabled?, checked?, hint?, to?, params?, href? } \| 'separator' \| { heading }>`, `aria-label?`, `placement?`, `align?` [end] | Arrow keys, typeahead, Enter, Escape. |

**Back closes the dialog.** While a Modal or Sheet is open it owns one history entry (same address,
marked in `history.state`); Back pops it and calls `onClose` (a dialog with `dismissable={false}`
stays, and so does the screen). Closed any other way, the entry is taken off again, so the next Back
leaves the screen as before. Nothing to do in a screen; it also copes with a link inside a sheet
(the left-behind entry is skipped, after a reload too) and with a sheet opened from the address that
`redirect()`s when it closes (`#songs--add`: Back never brings the sheet back). It switches off where
a sandboxed host refuses `pushState`. Closing a dialog by its button steps history back by one a
moment later: a screen that reloads the page right after a dialog closes waits for that step.

```tsx
if (await confirmDialog({ title: 'Delete this song?', description: 'This cannot be undone.', confirmLabel: 'Delete song', tone: 'danger' })) remove();

<Modal open={open} onClose={() => setOpen(false)} title="Rename song"
       footer={<><Button onClick={close}>Cancel</Button><Button variant="primary" onClick={save}>Save name</Button></>}>
  <TextField label="Song title" value={name} onChange={setName} data-autofocus />
</Modal>

<Menu trigger={<IconButton icon="EllipsisVertical" label="More actions" />} items={[
  { label: 'Rename', icon: 'Pencil', onSelect: rename }, 'separator',
  { label: 'Delete', icon: 'Trash2', danger: true, onSelect: remove }]} />
```

**Messages and states**

| Component | Props | Notes |
|---|---|---|
| `Banner` | `tone?: 'info' \| 'ok' \| 'warn' \| 'bad' \| 'tip' \| 'neutral'` [info], `title?`, `icon?` (`null` = none), `actions?`, `onDismiss?`, `live?` | A message that belongs to the screen. `live` announces it when it appears. |
| `Callout` | `tone?` [tip], `label?` (kicker: "Tip", "Common mistake"), `title?`, `icon?` | An aside inside lesson or reference text. |
| `ProgressBar` | `value?`, `max?` [100], `label?` or `aria-label`, `valueText?: 'percent' \| 'fraction' \| string \| false`, `tone?`, `size?`, `segmented?`, `indeterminate?` | `segmented` draws `max` steps. |
| `ProgressRing` | `value`, `max?`, `size?` [64], `thickness?`, `tone?`, `label`, children (centre; `null` = empty) | `size` is px at the default text size; the ring grows with the text. |
| `Meter` | `value`, `min?` [0], `max?` [1], `low?`, `high?`, `label`, `showLabel?`, `valueText?`, `segments?` [16; 0 = smooth], `tone?`, `orientation?` | A live reading (mic level), not task progress. |
| `Spinner` | `size?` [20], `tone?: 'current' \| 'accent' \| 'muted'`, `label?`, children (visible text) | |
| `Skeleton` | `variant?: 'text' \| 'block' \| 'circle'`, `width?`, `height?`, `lines?` | Put `aria-busy` on the loading region. |
| `EmptyState` | `title`, `icon?`, children, `actions?`, `align?: 'start' \| 'center'`, `framed?`, `level?: 2 \| 3 \| 4` [3] | `level` is the title's heading level. |
| `ErrorState` | `title?`, children, `error?`, `onRetry?`, `retryLabel?`, `actions?`, `icon?`, `align?`, `framed?`, `level?` | The raw error goes into a collapsed "Technical details". |
| `MediaBlocked` | `reason: MediaFailure`, `device: 'microphone' \| 'camera'`, `onRetry?`, `onContinueWithout?`, `continueLabel?`, children, `align?`, `framed?`, `level?` | Wording from `explainMediaFailure()`. Retry only shows when it can help. |

Tones for progress, rings and meters: `accent ok info warn bad xp streak neutral`.

```tsx
const res = await requestMic();
if (!res.ok) return <MediaBlocked reason={res.reason} device="microphone" onRetry={start} onContinueWithout={useTapMode} continueLabel="Tap the notes instead" />;

<EmptyState icon="Music" title="No songs yet" actions={<LinkButton to="scan" variant="primary">Scan a sheet</LinkButton>}>
  Songs you scan or import show up here.
</EmptyState>
<ProgressBar label="Daily goal" value={30} max={50} valueText="30 / 50 XP" tone="xp" />
```

## Display

| Component | Props | Notes |
|---|---|---|
| `Card` | `variant?: 'plain' \| 'sunken' \| 'raised' \| 'outline'`, `padding?: 'none' \| 'sm' \| 'md' \| 'lg'`, `to?`/`params?`/`href?`, `onClick?`, `selected?`, `disabled?` | With `to` it is a link, with `onClick` a button (`aria-pressed` when `selected`). |
| `List` | `variant?: 'plain' \| 'card'` | A `ul` of rows. |
| `ListItem` | `title`, `subtitle?`, `icon?`, `leading?`, `trailing?`, `to?`/`params?`/`href?`, `onClick?`, `selected?`, `disabled?`, `wrap?` | 56 px rows; links get a chevron. |
| `Badge` | `tone?: 'neutral' \| 'accent' \| 'ok' \| 'warn' \| 'bad' \| 'info' \| 'xp' \| 'streak'`, `variant?: 'soft' \| 'solid' \| 'outline'`, `size?`, `icon?`, `dot?` | A status or a count. |
| `Tag` | `icon?`, `mono?`, `onRemove?`, `removeLabel?` | A neutral property (style, key, tuning). |
| `Stat` | `label`, `value`, `unit?`, `hint?`, `trend?: 'up' \| 'down'`, `icon?`, `size?` | Labelled big number. |
| `Avatar` | `name`, `src?`, `icon?`, `size?: 'xs' … 'xl' \| number`, `tone?: 1–7 \| 'neutral'`, `ring?`, `decorative?` | Initials on a colour derived from the name. |
| `Kbd` | children | Keyboard key. |
| `StarRating` | `value`, `max?` [3], `size?` [24], `animate?`, `label?` | |
| `XpChip` | `value`, `gain?` ("+15"), `size?: 'sm' \| 'lg'`, `pill?` [true], `compact?` | |
| `StreakChip` | `days`, `active?` [true], `size?`, `pill?` | `active={false}` until today counts. |
| `HeartsChip` | `value`, `max?` [5], `pips?`, `size?`, `pill?` | |
| `GemChip` | `value`, `size?`, `pill?`, `compact?` | |
| `LevelBadge` | `level`, `size?` [40], `muted?`, `label?` | The level on a guitar pick. From 10,000 the pick shows a compact count ("12k"); the accessible name keeps the full number. |
| `AnimatedNumber` | `value`, `duration?` [700], `from?`, `format?` | Counts to the new value. |
| `CountdownRing` | `seconds`, `running?` [true], `resetKey?`, `onDone?`, `onSecond?`, `size?` [72], `tone?`, `urgentBelow?` [3], `label?`, children `(secondsLeft) => node` | |
| `Celebration` | `fire` (bursts when it changes to a truthy value), `intensity?: 'low' \| 'medium' \| 'high'`, `origin?: { x, y }`, `contained?`, `onDone?` | Confetti canvas. Nothing moves under reduced motion. |

```tsx
<List variant="card">
  <ListItem icon="Music" title="Greensleeves" subtitle="Traditional · A minor" to="play" params={['greensleeves']} trailing={<StarRating value={2} size={14} />} />
</List>
<Card selected={teacher === 'mia'} onClick={() => setTeacher('mia')}>…</Card>
<Stat label="Total XP" value={<AnimatedNumber value={xp} />} />
<Cluster><XpChip value={xp} /><StreakChip days={streak} active={practisedToday} /><HeartsChip value={hearts} pips /></Cluster>
<Celebration fire={passed} />
```

## Hooks and utilities

| Export | Use |
|---|---|
| `useMediaQuery(query)`, `useIsMobile()`, `usePrefersReducedMotion()`, `useIsTouch()` | Live media queries. `BREAKPOINTS`, `MOBILE_QUERY`, `WIDE_QUERY`. `usePrefersReducedMotion()` is the learner's own motion setting in the app when they chose one (`data-motion` on `<html>`), otherwise the device's: use it for anything animated from JavaScript. |
| `useElementSize<T>()` → `[ref, { width, height }]` | ResizeObserver on a callback ref (size a canvas or fretboard to its container). Safe under StrictMode. |
| `useLocalState(key, initial)` → `[value, set, reset]` | `useState` persisted through the platform storage layer. For small screen preferences only; progress lives in `core/progress`. |
| `useInterval(fn, ms \| null)`, `useTimeout(fn, ms \| null)` | `null` pauses. Not for musical timing. |
| `useRafLoop(fn(dtMs, timeMs), running?)` | Frame loop with cleanup; delta capped at `MAX_FRAME_MS`. |
| `useEventListener(target, type, handler, options?)` | `target`: window, document, element, ref or any EventTarget. |
| `useLatest(value)` | Ref that always holds the newest value. |
| `useDebounced(value, ms?)`, `useDebouncedCallback(fn, ms?)` | The latter has `.cancel()` and `.flush()`. |
| `useWakeLock(active)` → `{ supported, held }` | Keeps the screen on; tolerant of refusal. |
| `useBottomClearance(ref, active?)` | For bottom controls that are not an `ActionBar` (a one-screen tool's Start and tempo buttons): while they sit at the bottom of the screen, toasts and other bottom layers stay above them (`--action-bar-h`). Re-measures on scroll and resize. `bottomClearance(box, floor, viewportHeight, zone)` is the pure rule. |
| `useDialogOpen()` | True while any kit Modal or Sheet is open. |
| `useControllableState(value, defaultValue, onChange?)` | Controlled-or-uncontrolled state for your own components. |
| `useFocusTrap(ref, active)`, `useScrollLock(active)`, `useDismiss(refs, active, onDismiss)`, `usePressHold(action, opts?)` | The building blocks of the overlays and the Stepper. |
| `cx(...parts)` | Class joiner: strings, falsy values, `{ name: condition }`, arrays. |
| `VisuallyHidden` | Screen-reader-only text. |
| `focusRing`, `focusRingInset`, `focusRingWithin` | Class names for the standard focus ring on custom controls; set `--focus-radius` to match the corner. |
| `Portal` | Render at the end of `<body>`. |
| `clamp`, `lerp`, `fraction`, `snapToStep`, `easeOutCubic` | Number helpers. |
| `formatCount` (1.2k), `formatInt` (1,250), `formatClock` (1:30), `formatBytes`, `initials` | Display helpers. |
| `rovingIndex`, `rovingKeyFor`, `typeaheadIndex`, `placeFloating`, `matchesAccept`, `partitionFiles`, `resolveHref` | The pure logic behind the components, for building your own. |

```tsx
const [ref, { width }] = useElementSize<HTMLDivElement>();
const [key, setKey] = useLocalState('scales.key', 'A');
useRafLoop((dt) => { /* draw to a canvas, mutate refs */ }, playing);
useWakeLock(playing);
<div role="button" tabIndex={0} className={cx(styles.pad, focusRing)} />
```
