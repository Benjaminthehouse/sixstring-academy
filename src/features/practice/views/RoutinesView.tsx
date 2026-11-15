/**
 * My routines: the learner's saved routines (start, open in the planner, rename, duplicate,
 * delete) and the built-in ones for their level and goal (start, or duplicate to change).
 */
import { useState } from 'react';
import { navigate } from '@/app/router';
import { useProfile } from '@/core/progress';
import { Badge, Button, EmptyState, IconButton, LinkButton, Menu, Modal, TextField, confirmDialog, toast } from '@/ui';
import { planFromRoutine, builtInsFor, duplicateRoutine, renameRoutine, routineMinutes, type Routine } from '../model/routines';
import { getPracticeData, updatePracticeData } from '../model/store';
import { currentPlannerInput, routineDraft, setDraft, usePracticeData } from '../usePracticeData';
import { AreaTag } from './parts';
import { beginSession } from './start';
import styles from './Routines.module.css';

const LEVEL_LABEL: Record<Routine['level'], string> = { any: 'Any level', beginner: 'Beginner', intermediate: 'Intermediate', expert: 'Expert' };

function startRoutine(r: Routine): void {
  const plan = planFromRoutine(r, currentPlannerInput(routineMinutes(r)));
  void beginSession(plan, { title: r.name, routineId: r.id });
}

function openInPlanner(r: Routine): void {
  setDraft(routineDraft(r));
  navigate('practice');
}

function duplicate(r: Routine): Routine {
  const names = getPracticeData().routines.map((x) => x.name);
  const copy = duplicateRoutine(r, names, Date.now());
  updatePracticeData((d) => ({ ...d, routines: [copy, ...d.routines] }));
  toast.ok(`Made “${copy.name}”`, { description: 'It is yours to change.' });
  return copy;
}

/** A routine's blocks as one bar of segments sized by minutes, each with its area icon. */
function Shape({ routine }: { routine: Routine }) {
  return (
    <ol className={styles.shape} aria-label="Blocks">
      {routine.blocks.map((b, i) => (
        <li key={i} className={styles.shapeBlock} style={{ flexGrow: b.minutes }}>
          <AreaTag area={b.area} iconOnly />
          <span className={styles.shapeText}>
            {b.minutes}
            <span aria-hidden="true">′</span>
            <span className="sr-only"> minutes</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function RoutineCard({ routine, onRename }: { routine: Routine; onRename: (r: Routine) => void }) {
  const minutes = routineMinutes(routine);
  const remove = async () => {
    const ok = await confirmDialog({ title: `Delete “${routine.name}”?`, description: 'Sessions you already ran stay in your journal.', confirmLabel: 'Delete routine', tone: 'danger' });
    if (!ok) return;
    const before = getPracticeData().routines;
    updatePracticeData((d) => ({ ...d, routines: d.routines.filter((r) => r.id !== routine.id) }));
    toast({ title: `Deleted “${routine.name}”`, action: { label: 'Undo', onClick: () => updatePracticeData((d) => ({ ...d, routines: before })) } });
  };
  const items = routine.builtIn
    ? [{ label: 'Duplicate to change it', icon: 'Copy', onSelect: () => openInPlanner(duplicate(routine)) }]
    : [
        { label: 'Rename', icon: 'Pencil', onSelect: () => onRename(routine) },
        { label: 'Duplicate', icon: 'Copy', onSelect: () => void duplicate(routine) },
        'separator' as const,
        { label: 'Delete', icon: 'Trash2', danger: true, onSelect: () => void remove() },
      ];
  return (
    <article className={styles.card} data-routine={routine.id}>
      <div className={styles.cardHead}>
        <div className={styles.cardTitles}>
          <h3 className={styles.name}>{routine.name}</h3>
          <p className={styles.meta}>
            <span>{minutes} min</span>
            <span aria-hidden="true">·</span>
            <span>
              {routine.blocks.length} {routine.blocks.length === 1 ? 'block' : 'blocks'}
            </span>
            {routine.builtIn && <Badge tone="neutral">{LEVEL_LABEL[routine.level]}</Badge>}
          </p>
        </div>
        <Menu trigger={<IconButton icon="EllipsisVertical" label={`More for ${routine.name}`} />} items={items} />
      </div>
      {routine.description && <p className={styles.description}>{routine.description}</p>}
      <Shape routine={routine} />
      <div className={styles.actions}>
        <Button iconLeft="Play" onClick={() => startRoutine(routine)} data-routine-start="">
          Start
        </Button>
        <Button variant="ghost" iconLeft="SlidersHorizontal" onClick={() => openInPlanner(routine)}>
          {routine.builtIn ? 'Adjust first' : 'Edit in planner'}
        </Button>
      </div>
    </article>
  );
}

/** The Routines tab. */
export function RoutinesView() {
  const profile = useProfile();
  const mine = usePracticeData((d) => d.routines);
  const builtIns = builtInsFor(profile.experience);
  const [renaming, setRenaming] = useState<Routine | null>(null);
  const [name, setName] = useState('');

  const saveName = () => {
    if (!renaming) return;
    const next = renameRoutine(renaming, name, Date.now());
    updatePracticeData((d) => ({ ...d, routines: d.routines.map((r) => (r.id === next.id ? next : r)) }));
    setRenaming(null);
  };

  return (
    <div className={styles.routines}>
      <section aria-labelledby="routines-mine" className={styles.group}>
        <h2 id="routines-mine" className={styles.groupTitle}>
          Your routines
        </h2>
        {mine.length === 0 ? (
          <EmptyState
            icon="ListChecks"
            title="Save a plan you like"
            align="start"
            framed
            level={3}
            actions={
              <LinkButton to="practice" iconLeft="CalendarCheck">
                Go to your plan
              </LinkButton>
            }
          >
            On the Plan tab, “Save as routine” keeps it here to start again with one tap. Or duplicate a built-in one below and make it yours.
          </EmptyState>
        ) : (
          <div className={styles.grid}>
            {mine.map((r) => (
              <RoutineCard
                key={r.id}
                routine={r}
                onRename={(x) => {
                  setName(x.name);
                  setRenaming(x);
                }}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="routines-built-in" className={styles.group}>
        <div>
          <h2 id="routines-built-in" className={styles.groupTitle}>
            Ready-made
          </h2>
          <p className={styles.groupNote}>Written for this app, the ones for your level first. Blocks marked by area alone are filled each day with what needs work.</p>
        </div>
        <div className={styles.grid}>
          {builtIns.map((r) => (
            <RoutineCard key={r.id} routine={r} onRename={() => undefined} />
          ))}
        </div>
      </section>

      <Modal
        open={!!renaming}
        onClose={() => setRenaming(null)}
        title="Rename routine"
        size="sm"
        footer={
          <>
            <Button onClick={() => setRenaming(null)}>Cancel</Button>
            <Button variant="primary" onClick={saveName}>
              Save name
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveName();
          }}
        >
          <TextField label="Routine name" value={name} onChange={setName} maxLength={60} data-autofocus />
        </form>
      </Modal>
    </div>
  );
}
