/**
 * Focus goals: up to three pinned goals with an area, an optional target date and progress the
 * learner marks; achieved ones are kept below. The planner gives open goals time first.
 */
import { useState } from 'react';
import { useProfile, useProgress } from '@/core/progress';
import { Button, Celebration, Chip, EmptyState, Icon, IconButton, List, ListItem, Menu, Select, Sheet, Slider, TextField, confirmDialog, toast, usePrefersReducedMotion } from '@/ui';
import { AREA_INFO, FOCUS_AREAS, type Area } from '../model/areas';
import { GOAL_SUGGESTIONS, MAX_OPEN_GOALS, achievedGoals, addGoal, daysLeft, editGoal, markGoal, openGoals, removeGoal, setGoalProgress, type FocusGoal } from '../model/goals';
import { dayLabel } from '../model/journal';
import { makeId } from '../model/random';
import { getPracticeData, updatePracticeData } from '../model/store';
import { usePracticeData } from '../usePracticeData';
import { AreaTag } from './parts';
import styles from './Goals.module.css';

const AREA_OPTIONS = FOCUS_AREAS.map((a) => ({ value: a, label: AREA_INFO[a].label }));

function whenText(goal: FocusGoal, today: string): string {
  const left = daysLeft(goal, today);
  if (left === null || !goal.targetDay) return 'No target date';
  const date = dayLabel(goal.targetDay, today, '');
  if (left < 0) return `Target was ${date}`;
  if (left === 0) return 'Target: today';
  return `By ${date} · ${left} ${left === 1 ? 'day' : 'days'} left`;
}

/** Add or edit a goal. */
function GoalSheet({ goal, open, onClose }: { goal: FocusGoal | null; open: boolean; onClose: () => void }) {
  const profile = useProfile();
  const today = useProgress((s) => s.meta.today);
  const [title, setTitle] = useState('');
  const [area, setArea] = useState<Area>('chords');
  const [day, setDay] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [shownFor, setShownFor] = useState<string | null>(null);
  const key = open ? (goal?.id ?? 'new') : null;
  if (key !== shownFor) {
    setShownFor(key);
    setTitle(goal?.title ?? '');
    setArea(goal?.area ?? 'chords');
    setDay(goal?.targetDay ?? '');
    setError(undefined);
  }

  const save = () => {
    if (!title.trim()) {
      setError('Give your goal a name, for example “Clean F barre chord”.');
      return;
    }
    if (goal) {
      updatePracticeData((d) => ({ ...d, goals: editGoal(d.goals, goal.id, { title, area, targetDay: day || null }) }));
      toast.ok('Goal updated');
    } else {
      const result = addGoal(getPracticeData().goals, { title, area, targetDay: day || null }, Date.now(), makeId('g'));
      if (result.error === 'full') {
        setError('Three goals are pinned. Achieve or remove one first.');
        return;
      }
      updatePracticeData((d) => ({ ...d, goals: result.goals }));
      toast.ok('Goal pinned', { description: 'Your next plans give it time first.' });
    }
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={goal ? 'Edit goal' : 'Pin a focus goal'}
      description="Something specific you can tell you have reached."
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} data-goal-save="">
            {goal ? 'Save goal' : 'Pin goal'}
          </Button>
        </>
      }
    >
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <TextField label="Goal" value={title} onChange={(v) => { setTitle(v); setError(undefined); }} error={error} maxLength={80} placeholder="Clean F barre chord" data-autofocus />
        {!goal && (
          <div className={styles.suggestions}>
            <p className={styles.suggestLabel}>Or pick one</p>
            <div className={styles.chips}>
              {GOAL_SUGGESTIONS[profile.experience].map((s) => (
                <Chip
                  key={s.title}
                  type="button"
                  selected={title === s.title}
                  onClick={() => {
                    setTitle(s.title);
                    setArea(s.area);
                    setError(undefined);
                  }}
                >
                  {s.title}
                </Chip>
              ))}
            </div>
          </div>
        )}
        <Select label="Area" value={area} onChange={(v) => setArea(v as Area)} options={AREA_OPTIONS} hint="Plans put this goal's time in a block of this kind." />
        <TextField label="Target date" optional type="date" value={day} min={today} onChange={setDay} />
      </form>
    </Sheet>
  );
}

function GoalCard({ goal, today, onEdit, onAchieved }: { goal: FocusGoal; today: string; onEdit: () => void; onAchieved: () => void }) {
  const left = daysLeft(goal, today);
  const remove = async () => {
    const ok = await confirmDialog({ title: `Remove “${goal.title}”?`, description: 'Plans stop giving it time.', confirmLabel: 'Remove goal', tone: 'danger' });
    if (!ok) return;
    const before = getPracticeData().goals;
    updatePracticeData((d) => ({ ...d, goals: removeGoal(d.goals, goal.id) }));
    toast({ title: 'Goal removed', action: { label: 'Undo', onClick: () => updatePracticeData((d) => ({ ...d, goals: before })) } });
  };
  return (
    <article className={styles.card} data-goal={goal.id}>
      <div className={styles.cardHead}>
        <AreaTag area={goal.area} />
        <Menu
          trigger={<IconButton icon="EllipsisVertical" label={`More for ${goal.title}`} size="sm" />}
          items={[
            { label: 'Edit', icon: 'Pencil', onSelect: onEdit },
            'separator',
            { label: 'Remove', icon: 'Trash2', danger: true, onSelect: () => void remove() },
          ]}
        />
      </div>
      <h3 className={styles.title}>{goal.title}</h3>
      <p className={styles.when} data-late={left !== null && left < 0 ? '' : undefined}>
        <Icon name="CalendarDays" size={15} /> {whenText(goal, today)}
      </p>
      <Slider
        label="Progress"
        value={goal.progress}
        min={0}
        max={100}
        step={10}
        format={(v) => `${v}%`}
        showValue
        onChange={(v) => updatePracticeData((d) => ({ ...d, goals: setGoalProgress(d.goals, goal.id, v) }))}
      />
      <div className={styles.cardActions}>
        <Button
          size="sm"
          variant={goal.progress >= 100 ? 'primary' : 'secondary'}
          iconLeft="Trophy"
          onClick={() => {
            updatePracticeData((d) => ({ ...d, goals: markGoal(d.goals, goal.id, true, Date.now()) }));
            onAchieved();
            toast.ok(`Achieved: ${goal.title}`, { description: 'Nicely done. It stays on record below.' });
          }}
        >
          Mark achieved
        </Button>
      </div>
    </article>
  );
}

/** The Goals tab. */
export function GoalsView() {
  const goals = usePracticeData((d) => d.goals);
  const today = useProgress((s) => s.meta.today);
  const reduced = usePrefersReducedMotion();
  const [editing, setEditing] = useState<FocusGoal | 'new' | null>(null);
  const [burst, setBurst] = useState(0);
  const open = openGoals(goals);
  const achieved = achievedGoals(goals);
  const full = open.length >= MAX_OPEN_GOALS;

  return (
    <div className={styles.goals}>
      <Celebration fire={!reduced && burst > 0 ? burst : null} intensity="medium" />
      <section aria-labelledby="goals-open" className={styles.group}>
        <div className={styles.groupHead}>
          <div>
            <h2 id="goals-open" className={styles.groupTitle}>
              Focus goals
            </h2>
            <p className={styles.groupNote}>Pin up to three. Every plan gives them time first, the nearest date first.</p>
          </div>
          {open.length > 0 && (
            <Button variant={full ? 'secondary' : 'primary'} iconLeft="Plus" disabled={full} onClick={() => setEditing('new')} data-goal-add="">
              Add a goal
            </Button>
          )}
        </div>
        {open.length === 0 ? (
          <EmptyState
            icon="Target"
            title="What are you working toward?"
            align="start"
            framed
            level={3}
            actions={
              <Button variant="primary" iconLeft="Plus" onClick={() => setEditing('new')} data-goal-add="">
                Pin your first goal
              </Button>
            }
          >
            A clean F barre chord, a scale at a tempo, a song start to finish. Pin it and your plans give it time first.
          </EmptyState>
        ) : (
          <div className={styles.grid}>
            {open.map((g) => (
              <GoalCard key={g.id} goal={g} today={today} onEdit={() => setEditing(g)} onAchieved={() => setBurst((n) => n + 1)} />
            ))}
          </div>
        )}
        {full && <p className={styles.groupNote}>Three goals are pinned. Mark one achieved, or remove one, to pin another.</p>}
      </section>

      {achieved.length > 0 && (
        <section aria-labelledby="goals-done" className={styles.group}>
          <h2 id="goals-done" className={styles.groupTitle}>
            Achieved
          </h2>
          <List variant="card">
            {achieved.map((g) => (
              <ListItem
                key={g.id}
                icon="Trophy"
                title={g.title}
                subtitle={`${AREA_INFO[g.area].label} · achieved ${new Date(g.doneAt ?? 0).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}
                trailing={
                  <Menu
                    trigger={<IconButton icon="EllipsisVertical" label={`More for ${g.title}`} size="sm" />}
                    items={[
                      { label: 'Work on it again', icon: 'RotateCcw', disabled: full, onSelect: () => updatePracticeData((d) => ({ ...d, goals: markGoal(d.goals, g.id, false, Date.now()) })) },
                      { label: 'Remove', icon: 'Trash2', danger: true, onSelect: () => updatePracticeData((d) => ({ ...d, goals: removeGoal(d.goals, g.id) })) },
                    ]}
                  />
                }
              />
            ))}
          </List>
        </section>
      )}

      <GoalSheet goal={editing && editing !== 'new' ? editing : null} open={editing !== null} onClose={() => setEditing(null)} />
    </div>
  );
}
