/**
 * The Plan tab: "How long do you have?", the routine it gives (each block with its reason, its
 * minutes and a way to swap, move or remove it), focus goals at a glance, and Start.
 */
import { useId, useState } from 'react';
import { href, navigate } from '@/app/router';
import { useDailyGoal, useStreak, xpFor } from '@/core/progress';
import { Badge, Button, Icon, IconButton, LinkButton, List, ListItem, Menu, Modal, ProgressBar, Sheet, Stepper, TextField, cx, toast } from '@/ui';
import { AREA_INFO } from '../model/areas';
import { openGoals } from '../model/goals';
import {
  DURATIONS,
  addBlock,
  alternativesFor,
  moveBlock,
  removeBlock,
  replaceBlock,
  setBlockMinutes,
  totalMinutes,
  type PlanBlock,
} from '../model/planner';
import { createRoutine, updateRoutineBlocks } from '../model/routines';
import { getPracticeData, updatePracticeData } from '../model/store';
import { autoDraft, currentPlannerInput, setDraft, usePracticeData, type PlanDraft } from '../usePracticeData';
import { AreaTag, DurationTiles, ReasonLine } from './parts';
import { planTitle } from './start';
import styles from './Plan.module.css';

/** The title a session from this draft runs under. */
export function draftTitle(draft: PlanDraft): string {
  return draft.source.kind === 'routine' ? draft.source.name : planTitle(totalMinutes(draft.blocks));
}

/** "15 min · 4 blocks · about 23 XP". */
export function draftSummary(draft: PlanDraft): string {
  const total = totalMinutes(draft.blocks);
  const xp = xpFor('practice', { durationSec: total * 60 });
  return `${total} min · ${draft.blocks.length} ${draft.blocks.length === 1 ? 'block' : 'blocks'} · about ${xp} XP`;
}

function BlockCard({
  block,
  index,
  count,
  onMinutes,
  onMove,
  onRemove,
  onSwap,
}: {
  block: PlanBlock;
  index: number;
  count: number;
  onMinutes: (m: number) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
  onSwap: () => void;
}) {
  return (
    <li className={styles.block} data-block={block.area}>
      <span className={styles.step} aria-hidden="true">
        {index + 1}
      </span>
      <div className={styles.blockBody}>
        <div className={styles.blockHead}>
          <AreaTag area={block.area} />
          <span className={styles.blockMinutes}>{block.minutes} min</span>
        </div>
        <p className={styles.blockTitle}>
          <span className="sr-only">Block {index + 1}: </span>
          {block.title}
        </p>
        {block.reason && <ReasonLine kind={block.reasonKind}>{block.reason}</ReasonLine>}
        <div className={styles.blockControls}>
          <Stepper label={`Minutes for ${block.title}`} hideLabel value={block.minutes} onChange={onMinutes} min={1} max={60} unit="min" className={styles.stepper} />
          <span className={styles.controlsEnd}>
            <Button size="sm" variant="ghost" iconLeft="Shuffle" onClick={onSwap} aria-label={`Swap ${block.title}`}>
              Swap
            </Button>
            <Menu
              trigger={<IconButton icon="EllipsisVertical" label={`More for ${block.title}`} size="sm" />}
              items={[
                { label: 'Move up', icon: 'ArrowUp', disabled: index === 0, onSelect: () => onMove(-1) },
                { label: 'Move down', icon: 'ArrowDown', disabled: index === count - 1, onSelect: () => onMove(1) },
                'separator',
                { label: 'Remove block', icon: 'Trash2', danger: true, disabled: count <= 1, onSelect: onRemove },
              ]}
            />
          </span>
        </div>
      </div>
    </li>
  );
}

/** Choose a replacement for a block, or a block to add. */
function ChooseSheet({ draft, index, onClose }: { draft: PlanDraft; index: number | null; onClose: () => void }) {
  const open = index !== null;
  const adding = index === -1;
  const block = index !== null && index >= 0 ? draft.blocks[index] : undefined;
  const size = block?.minutes ?? (totalMinutes(draft.blocks) >= 30 ? 5 : 3);
  const alt = open ? alternativesFor(draft.blocks, index ?? -1, currentPlannerInput(totalMinutes(draft.blocks), draft.seed), size) : { sameArea: [], otherAreas: [] };

  const pick = (b: PlanBlock) => {
    const blocks = adding ? addBlock(draft.blocks, b) : block ? replaceBlock(draft.blocks, block.id, b) : draft.blocks;
    setDraft({ ...draft, blocks, edited: true });
    onClose();
    toast.ok(adding ? `Added “${b.title}”` : `Swapped in “${b.title}”`);
  };

  const row = (b: PlanBlock) => (
    <ListItem
      key={b.id}
      wrap
      onClick={() => pick(b)}
      leading={<AreaTag area={b.area} iconOnly />}
      title={b.title}
      subtitle={b.reason ?? AREA_INFO[b.area].label}
      trailing={<span className={styles.altMinutes}>{b.minutes} min</span>}
    />
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={adding ? 'Add a block' : `Swap “${block?.title ?? ''}”`}
      description={adding ? `It goes before free play and adds ${size} minutes.` : `Same ${size} minutes, something else.`}
      size="md"
    >
      <div className={styles.sheetBody}>
        {alt.sameArea.length > 0 && block && (
          <section className={styles.altGroup} aria-label={`Other ${AREA_INFO[block.area].label} exercises`}>
            <p className={styles.altHeading}>Other {AREA_INFO[block.area].noun}</p>
            <List variant="card">{alt.sameArea.map(row)}</List>
          </section>
        )}
        <section className={styles.altGroup} aria-label="Something else">
          <p className={styles.altHeading}>{block ? 'Something else' : 'Pick an area'}</p>
          <List variant="card">{alt.otherAreas.map(row)}</List>
        </section>
      </div>
    </Sheet>
  );
}

function SaveRoutineModal({ draft, open, onClose }: { draft: PlanDraft; open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const fallback = `My ${totalMinutes(draft.blocks)}-minute routine`;
  const save = () => {
    const routine = createRoutine(name.trim() || fallback, draft.blocks, Date.now());
    updatePracticeData((d) => ({ ...d, routines: [routine, ...d.routines] }));
    setDraft({ ...draft, source: { kind: 'routine', routineId: routine.id, name: routine.name, builtIn: false }, edited: false });
    onClose();
    setName('');
    toast({ title: `Saved “${routine.name}”`, description: 'Find it under Routines.', tone: 'ok', action: { label: 'Open Routines', onClick: () => navigate('practice', 'routines') } });
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Save as a routine"
      description="Rusty-skill and goal blocks are saved as “planner’s choice”, so each time they aim at what needs work that day."
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" iconLeft="Save" onClick={save}>
            Save routine
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <TextField label="Routine name" value={name} onChange={setName} placeholder={fallback} maxLength={60} data-autofocus />
      </form>
    </Modal>
  );
}

/** The plan header: duration tiles, the plan's numbers and (on wide screens) Start. */
function PlanHeader({ draft, onStart, wide, defaultMinutes, live }: { draft: PlanDraft; onStart: () => void; wide: boolean; defaultMinutes: number; live: boolean }) {
  const labelId = useId();
  const goal = useDailyGoal();
  const streak = useStreak();
  const total = totalMinutes(draft.blocks);
  const xp = xpFor('practice', { durationSec: total * 60 });
  const auto = draft.source.kind === 'auto';
  const selected = auto && !draft.edited ? draft.minutes : null;

  const choose = (minutes: number) => {
    const previous = draft;
    setDraft(autoDraft(minutes, 0));
    if (previous.edited || previous.source.kind === 'routine') {
      toast({ title: `New ${minutes}-minute plan`, description: 'Your changes to the old one were replaced.', action: { label: 'Undo', onClick: () => setDraft(previous) } });
    }
  };
  const remix = () => {
    const previous = draft;
    setDraft(autoDraft(auto ? draft.minutes : defaultMinutes, draft.seed + 1));
    if (previous.edited) toast({ title: 'A new mix', action: { label: 'Undo', onClick: () => setDraft(previous) } });
  };

  const goalNote = goal.met
    ? 'Today’s goal is already met: this is all bonus.'
    : xp >= goal.remaining
      ? streak.current > 0
        ? `Enough to meet today’s goal and keep your ${streak.current}-day streak.`
        : 'Enough to meet today’s goal.'
      : `Gets you ${xp} of the ${goal.remaining} XP left today.`;

  return (
    <div className={styles.header}>
      <div className={styles.headerTop}>
        <p id={labelId} className={styles.question}>
          How long do you have?
        </p>
        {auto && (
          <Button size="sm" variant="ghost" iconLeft="Shuffle" onClick={remix} className={styles.remix}>
            New mix
          </Button>
        )}
      </div>
      <DurationTiles options={DURATIONS} value={selected} onChange={choose} labelId={labelId} />
      {!auto && draft.source.kind === 'routine' && (
        <div className={styles.routineNote}>
          <Icon name="ListChecks" size={18} />
          <span>
            Routine: <strong>{draft.source.name}</strong>
            {draft.edited && ' (edited)'}
          </span>
        </div>
      )}
      {auto && draft.edited && (
        <div className={styles.routineNote}>
          <Icon name="Pencil" size={18} />
          <span>Your own version of the {draft.minutes}-minute plan.</span>
        </div>
      )}
      <div className={styles.numbers} aria-live="polite">
        <p className={styles.summary}>{draftSummary(draft)}</p>
        <p className={styles.goalNote}>{goalNote}</p>
      </div>
      {wide && (
        <Button variant={live ? 'secondary' : 'primary'} size="lg" iconLeft="Play" onClick={onStart} fullWidth data-practice-start="">
          Start {total}-minute session
        </Button>
      )}
    </div>
  );
}

/** Pinned goals, small, under the plan. */
function FocusStrip() {
  const goals = usePracticeData((d) => d.goals);
  const open = openGoals(goals);
  if (open.length === 0) {
    return (
      <div className={styles.focusEmpty}>
        <Icon name="Target" size={20} />
        <p>
          Working toward something? <a href={href('practice', 'goals')}>Pin a focus goal</a> and every plan gives it time first.
        </p>
      </div>
    );
  }
  return (
    <section className={styles.focus} aria-labelledby="practice-focus">
      <div className={styles.focusHead}>
        <h2 id="practice-focus" className={styles.focusTitle}>
          Focus goals
        </h2>
        <LinkButton to="practice" params={['goals']} size="sm" variant="ghost" iconRight="ArrowRight">
          Goals
        </LinkButton>
      </div>
      <ul className={styles.focusList}>
        {open.map((g) => (
          <li key={g.id} className={styles.focusItem}>
            <AreaTag area={g.area} iconOnly />
            <span className={styles.focusText}>
              <span className={styles.focusName}>{g.title}</span>
              <ProgressBar aria-label={`${g.title}: ${g.progress} percent`} value={g.progress} size="sm" tone="info" valueText={false} />
            </span>
            <span className={styles.focusPct}>{g.progress}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The Plan tab. */
export function PlanView({ draft, onStart, wide, defaultMinutes, live = false }: { draft: PlanDraft; onStart: () => void; wide: boolean; defaultMinutes: number; live?: boolean }) {
  const [choosing, setChoosing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const routine = draft.source.kind === 'routine' ? getPracticeData().routines.find((r) => draft.source.kind === 'routine' && r.id === draft.source.routineId) : undefined;

  const edit = (blocks: PlanBlock[]) => setDraft({ ...draft, blocks, edited: true });
  const remove = (b: PlanBlock) => {
    const previous = draft;
    edit(removeBlock(draft.blocks, b.id));
    toast({ title: `Removed “${b.title}”`, action: { label: 'Undo', onClick: () => setDraft(previous) } });
  };
  const saveChanges = () => {
    if (!routine) return;
    const next = updateRoutineBlocks(routine, draft.blocks, Date.now());
    updatePracticeData((d) => ({ ...d, routines: d.routines.map((r) => (r.id === next.id ? next : r)) }));
    setDraft({ ...draft, edited: false });
    toast.ok(`Saved changes to “${next.name}”`);
  };

  return (
    <div className={styles.plan}>
      <PlanHeader draft={draft} onStart={onStart} wide={wide} defaultMinutes={defaultMinutes} live={live} />

      <section aria-labelledby="practice-blocks" className={styles.blocksSection}>
        <div className={styles.blocksHead}>
          <h2 id="practice-blocks" className={styles.blocksTitle}>
            Your plan
          </h2>
          {draft.source.kind === 'routine' && routine && draft.edited && (
            <Badge tone="info" icon="Pencil">
              Unsaved changes
            </Badge>
          )}
        </div>
        <ol className={styles.blocks}>
          {draft.blocks.map((b, i) => (
            <BlockCard
              key={b.id}
              block={b}
              index={i}
              count={draft.blocks.length}
              onMinutes={(m) => edit(setBlockMinutes(draft.blocks, b.id, m))}
              onMove={(d) => edit(moveBlock(draft.blocks, b.id, d))}
              onRemove={() => remove(b)}
              onSwap={() => setChoosing(i)}
            />
          ))}
        </ol>
        <div className={cx(styles.planActions)}>
          <Button iconLeft="Plus" onClick={() => setChoosing(-1)}>
            Add a block
          </Button>
          {routine && draft.edited ? (
            <Button iconLeft="Save" onClick={saveChanges}>
              Save changes to routine
            </Button>
          ) : (
            <Button iconLeft="Bookmark" variant="ghost" onClick={() => setSaving(true)}>
              Save as routine
            </Button>
          )}
        </div>
      </section>

      <FocusStrip />

      <ChooseSheet draft={draft} index={choosing} onClose={() => setChoosing(null)} />
      <SaveRoutineModal draft={draft} open={saving} onClose={() => setSaving(false)} />
    </div>
  );
}
