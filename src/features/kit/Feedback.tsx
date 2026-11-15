import { useState } from 'react';
import {
  Banner,
  Button,
  Callout,
  Checkbox,
  Cluster,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Grid,
  IconButton,
  LinkButton,
  MediaBlocked,
  Menu,
  Modal,
  Popover,
  ProgressBar,
  ProgressRing,
  SegmentedControl,
  Sheet,
  Skeleton,
  Slider,
  Spinner,
  Stack,
  Switch,
  Text,
  TextField,
  Tooltip,
  confirmDialog,
  toast,
} from '@/ui';
import { Demo, Group, Specimen, kitStyles as styles } from './parts';

/** Messages, overlays, progress and the empty / error / blocked states. */
export function FeedbackGroup() {
  const [modal, setModal] = useState<null | 'md' | 'lg' | 'long'>(null);
  const [sheet, setSheet] = useState<null | 'sheet' | 'drawer'>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState('');
  const [name, setName] = useState('Greensleeves (fingerstyle)');
  const [showNames, setShowNames] = useState(true);
  const [showFingers, setShowFingers] = useState(false);
  const [frets, setFrets] = useState(12);
  const [sort, setSort] = useState('recent');
  const [dismissed, setDismissed] = useState(false);
  const [step, setStep] = useState(3);

  return (
    <Group id="feedback" index="05" title="Feedback" blurb="How the app answers back: passing toasts, standing banners, dialogs that ask, and honest states for loading, empty, failed and blocked.">
      <Specimen name="Toast" note="toast() from anywhere. Stacks, pauses under the pointer, announced through aria-live.">
        <Cluster gap={3}>
          <Button onClick={() => toast.ok('Tuning saved')}>Show success toast</Button>
          <Button onClick={() => toast.info('Slowed to 75%', { description: 'The pitch stays the same.' })}>Show info toast</Button>
          <Button onClick={() => toast.warn('That string is very flat', { description: 'Check that you are on the right peg.' })}>Show warning toast</Button>
          <Button onClick={() => toast.error('The file could not be read', { description: 'It may be damaged, or not a tab file.' })}>Show error toast</Button>
          <Button onClick={() => toast({ title: 'Removed from your library', action: { label: 'Undo', onClick: () => toast.ok('Restored') } })}>Show toast with undo</Button>
          <Button onClick={() => toast({ title: 'Recording in progress', duration: 0, icon: 'Mic' })}>Show sticky toast</Button>
        </Cluster>
      </Specimen>

      <Specimen name="Modal" note="Focus trap, Escape, scroll lock, focus returns to the opener. A bottom sheet on phones by default.">
        <Cluster gap={3}>
          <Button onClick={() => setModal('md')}>Open modal</Button>
          <Button onClick={() => setModal('lg')}>Open large modal</Button>
          <Button onClick={() => setModal('long')}>Open scrolling modal</Button>
        </Cluster>
        <Modal
          open={modal === 'md'}
          onClose={() => setModal(null)}
          title="Rename song"
          description="The new name shows in your library and on the practice plan."
          footer={
            <>
              <Button onClick={() => setModal(null)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => {
                  setModal(null);
                  toast.ok('Song renamed');
                }}
              >
                Save name
              </Button>
            </>
          }
        >
          <TextField label="Song title" value={name} onChange={setName} data-autofocus />
        </Modal>
        <Modal open={modal === 'lg'} onClose={() => setModal(null)} title="Choose a starting point" size="lg" footer={<Button variant="primary" onClick={() => setModal(null)}>Done</Button>}>
          <Grid min="12rem">
            <Skeleton variant="block" height={120} />
            <Skeleton variant="block" height={120} />
            <Skeleton variant="block" height={120} />
          </Grid>
        </Modal>
        <Modal open={modal === 'long'} onClose={() => setModal(null)} title="How the scoring works" footer={<Button variant="primary" onClick={() => setModal(null)}>Got it</Button>}>
          <Text variant="prose">
            {Array.from({ length: 9 }, (_, i) => (
              <p key={i}>
                Each note you play is compared with the note in the tab. A note counts when its pitch is within a quarter tone and it starts within a sixteenth note of the beat. Three stars need 95% of the notes; two stars need 80%.
              </p>
            ))}
          </Text>
        </Modal>
      </Specimen>

      <Specimen name="Sheet" note="Secondary choices. Slides up on phones (swipe down to close); a modal or a right-hand drawer on wide screens.">
        <Cluster gap={3}>
          <Button onClick={() => setSheet('sheet')} iconLeft="SlidersHorizontal">
            Open sheet
          </Button>
          <Button onClick={() => setSheet('drawer')} iconLeft="PanelRight">
            Open drawer
          </Button>
        </Cluster>
        <Sheet open={sheet !== null} onClose={() => setSheet(null)} title="Display options" desktop={sheet === 'drawer' ? 'drawer' : 'modal'} footer={<Button variant="primary" onClick={() => setSheet(null)}>Done</Button>}>
          <Stack gap={5}>
            <Stack gap={0}>
              <Switch label="Note names" checked={showNames} onChange={setShowNames} />
              <Switch label="Finger numbers" checked={showFingers} onChange={setShowFingers} />
            </Stack>
            <Slider label="Frets shown" min={5} max={24} value={frets} onChange={setFrets} />
          </Stack>
        </Sheet>
      </Specimen>

      <Specimen name="ConfirmDialog" note="Ask before anything that cannot be undone. The app never uses window.confirm.">
        <Cluster gap={3}>
          <Button variant="danger" onClick={() => setConfirm(true)}>
            Delete recording
          </Button>
          <Button
            onClick={async () => {
              const ok = await confirmDialog({ title: 'Reset this lesson?', description: 'Your answers so far will be cleared. Your XP stays.', confirmLabel: 'Reset lesson' });
              setAnswer(ok ? 'confirmed' : 'cancelled');
            }}
          >
            Ask with confirmDialog()
          </Button>
          {answer && (
            <Text variant="caption" aria-live="polite">
              Last answer: {answer}
            </Text>
          )}
        </Cluster>
        <ConfirmDialog
          open={confirm}
          title="Delete this recording?"
          description="Take 3 from today, 1 min 42 s. This cannot be undone."
          confirmLabel="Delete recording"
          tone="danger"
          busy={busy}
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setBusy(true);
            window.setTimeout(() => {
              setBusy(false);
              setConfirm(false);
              toast('Recording deleted');
            }, 900);
          }}
        />
      </Specimen>

      <Specimen name="Tooltip" note="A hint on hover or keyboard focus. Phones never see it, so it is never the only explanation.">
        <Cluster gap={3}>
          <Tooltip content="Plays a count-in first">
            <Button>Hover or focus me</Button>
          </Tooltip>
          <Tooltip content="Opens below" placement="bottom">
            <Button variant="ghost">Bottom</Button>
          </Tooltip>
          <IconButton icon="Repeat1" label="Loop one bar" variant="secondary" />
        </Cluster>
      </Specimen>

      <Specimen name="Popover" note="A few related controls anchored to a button.">
        <Cluster gap={3}>
          <Popover aria-label="Display options" trigger={<Button iconLeft="SlidersHorizontal">Display</Button>}>
            {({ close }) => (
              <Stack gap={3}>
                <SegmentedControl aria-label="Labels" options={['Notes', 'Degrees', 'None']} value="Notes" onChange={() => {}} fullWidth />
                <Checkbox label="Show open strings" checked={showNames} onChange={setShowNames} />
                <Button variant="primary" size="sm" onClick={close}>
                  Done
                </Button>
              </Stack>
            )}
          </Popover>
        </Cluster>
      </Specimen>

      <Specimen name="Menu" note="Actions behind a button. Arrow keys, typeahead, Enter, Escape.">
        <Cluster gap={3}>
          <Menu
            trigger={<IconButton icon="EllipsisVertical" label="More actions" variant="secondary" />}
            align="start"
            items={[
              { label: 'Rename', icon: 'Pencil', onSelect: () => toast('Rename') },
              { label: 'Add to practice plan', icon: 'CalendarCheck', onSelect: () => toast.ok('Added to your plan') },
              { label: 'Open in the player', icon: 'Play', to: 'play', params: ['greensleeves'] },
              { label: 'Export', icon: 'Download', disabled: true, hint: 'Soon' },
              'separator',
              { label: 'Delete', icon: 'Trash2', danger: true, onSelect: () => setConfirm(true) },
            ]}
          />
          <Menu
            trigger={<Button iconRight="ChevronDown">Sort: {sort === 'recent' ? 'Recently played' : sort === 'title' ? 'Title' : 'Difficulty'}</Button>}
            align="start"
            items={[
              { heading: 'Sort by' },
              { label: 'Recently played', checked: sort === 'recent', onSelect: () => setSort('recent') },
              { label: 'Title', checked: sort === 'title', onSelect: () => setSort('title') },
              { label: 'Difficulty', checked: sort === 'difficulty', onSelect: () => setSort('difficulty') },
            ]}
          />
        </Cluster>
      </Specimen>

      <Specimen name="Banner" note="A message that belongs to the screen. Icon and wording carry the meaning, not colour alone.">
        <Stack gap={3}>
          <Banner tone="info" title="You are offline">
            Everything here still works. Nothing needs the network.
          </Banner>
          <Banner tone="ok" title="Imported 3 songs" actions={<LinkButton to="songs" size="sm">Open library</LinkButton>}>
            They are in your library, ready to play.
          </Banner>
          <Banner tone="warn" title="Microphone is off">
            Tap the notes on the fretboard instead, or turn the microphone on to be heard.
          </Banner>
          <Banner tone="bad" title="This file could not be read">
            It may be damaged, or it is not a tab file. Try exporting it again.
          </Banner>
          {!dismissed && (
            <Banner tone="tip" onDismiss={() => setDismissed(true)}>
              New here? The Theory Path starts from zero and takes five minutes a day.
            </Banner>
          )}
          <Banner tone="neutral" icon={null}>
            Neutral, without an icon: a plain note.
          </Banner>
        </Stack>
      </Specimen>

      <Specimen name="Callout" note="An aside inside lesson text: a tip, a common mistake, what to listen for.">
        <Grid min="17rem">
          <Callout label="Mia's tip">Press just behind the fret wire. You need far less force than you think.</Callout>
          <Callout tone="warn" label="Common mistake">
            Letting the first finger lean on the string below mutes it. Arch the knuckle.
          </Callout>
          <Callout tone="info" label="Listen for" title="The half step">
            E to F and B to C are the only natural notes one fret apart.
          </Callout>
          <Callout tone="ok">You can now play the scale up and down at 60 BPM without stopping.</Callout>
        </Grid>
      </Specimen>

      <Specimen name="ProgressBar" note="How far along. Determinate, segmented for steps, or indeterminate.">
        <Grid min="16rem" gap={6}>
          <ProgressBar label="Daily goal" value={30} max={50} valueText="30 / 50 XP" tone="xp" />
          <ProgressBar label="Unit 2: Major scale" value={64} />
          <ProgressBar label="Accuracy" value={92} tone="ok" size="lg" />
          <ProgressBar label="Importing" indeterminate />
          <ProgressBar label="Storage used" value={18} size="sm" tone="neutral" valueText="18 of 100 MB" />
          <Stack gap={3}>
            <ProgressBar label="Lesson progress" value={step} max={8} segmented valueText="fraction" />
            <Cluster>
              <Button size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))}>
                Back a step
              </Button>
              <Button size="sm" onClick={() => setStep((s) => Math.min(8, s + 1))}>
                Next step
              </Button>
            </Cluster>
          </Stack>
        </Grid>
      </Specimen>

      <Specimen name="ProgressRing" note="Circular progress around a number or an icon.">
        <Cluster gap={6} align="center">
          <ProgressRing label="Lesson" value={25} size={48} />
          <ProgressRing label="Unit" value={64} />
          <ProgressRing label="Daily goal" value={30} max={50} tone="xp" size={104}>
            <Text as="span" size="xl" weight="bold" tabular>
              30
            </Text>
            <Text as="span" variant="caption" size="xs">
              of 50 XP
            </Text>
          </ProgressRing>
          <ProgressRing label="Accuracy" value={100} tone="ok" size={64} />
        </Cluster>
      </Specimen>

      <Specimen name="Spinner" note="Unknown wait. With reduced motion it pulses instead of spinning.">
        <Cluster gap={6} align="center">
          <Spinner label="Loading" />
          <Spinner size={32} tone="accent" label="Loading" />
          <Spinner tone="muted">Loading the song</Spinner>
        </Cluster>
      </Specimen>

      <Specimen name="Skeleton" note="A placeholder in the shape of what is loading.">
        <Demo width="medium">
          <div className={styles.frame} aria-busy="true">
            <Stack>
              <Cluster gap={3}>
                <Skeleton variant="circle" width={40} />
                <div style={{ flex: 1 }}>
                  <Skeleton width="45%" />
                  <Skeleton width="30%" />
                </div>
              </Cluster>
              <Skeleton variant="block" height={96} />
              <Skeleton lines={3} />
            </Stack>
          </div>
        </Demo>
      </Specimen>

      <Specimen name="EmptyState" note="What will be here, and the first step towards it.">
        <EmptyState icon="Music" title="No songs yet" actions={<><LinkButton to="scan" variant="primary" iconLeft="ScanLine">Scan a sheet</LinkButton><LinkButton to="songs">Browse the library</LinkButton></>}>
          Songs you scan or import show up here, ready for the interactive player.
        </EmptyState>
        <EmptyState framed align="center" icon="Search" title="Nothing matches “xylophone”">
          Check the spelling, or search for a key, a chord or a style instead.
        </EmptyState>
      </Specimen>

      <Specimen name="ErrorState" note="Plain words first, a way forward, the raw error tucked away.">
        <ErrorState title="This screen hit a problem" error={new Error('Unexpected token at bar 12: "x/5"')} onRetry={() => toast('Retrying')} actions={<LinkButton to="home" variant="ghost">Go to Today</LinkButton>}>
          Your progress is safe. Try again, or carry on somewhere else.
        </ErrorState>
      </Specimen>

      <Specimen name="MediaBlocked" note="The one standard way to say the microphone or camera is unavailable. Wording comes from explainMediaFailure().">
        <MediaBlocked framed reason="denied" device="microphone" onRetry={() => toast('Asking again')} onContinueWithout={() => toast('Tap mode')} continueLabel="Tap the notes instead" />
        <MediaBlocked framed reason="blocked-by-host" device="camera" onRetry={() => {}} onContinueWithout={() => toast('Showing the diagram')} continueLabel="Use the fretboard diagram" />
        <MediaBlocked reason="no-device" device="camera" onRetry={() => toast('Asking again')} />
      </Specimen>
    </Group>
  );
}
