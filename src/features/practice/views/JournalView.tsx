/**
 * The practice journal: this week against a weekly minutes goal, the streak nudge, and every
 * session listed by day with its blocks, a note and how it felt.
 */
import { useMemo, useState } from "react";
import {
  ACTIVITY_KINDS,
  addDays,
  getProgressStore,
  useDailyGoal,
  usePrefs,
  useProgress,
  useStreak,
  useWeek,
  type PracticeSession,
} from "@/core/progress";
import {
  Button,
  EmptyState,
  Icon,
  IconButton,
  LinkButton,
  Popover,
  ProgressBar,
  Sheet,
  Stepper,
  TextArea,
  confirmDialog,
  toast,
} from "@/ui";
import { AREA_INFO } from "../model/areas";
import { DURATIONS } from "../model/planner";
import {
  dayLabel,
  defaultWeeklyGoal,
  durationCovering,
  FEELS,
  formatMinutes,
  groupByDay,
  MAX_NOTE,
  streakNudge,
  type JournalEntry,
} from "../model/journal";
import {
  addJournalEntry,
  clampWeekly,
  removeJournalEntry,
  updateJournalEntry,
  updatePracticeData,
} from "../model/store";
import { autoDraft, usePracticeData } from "../usePracticeData";
import { AreaTag, FeelPicker, OutcomeMark } from "./parts";
import { beginSession, planTitle } from "./start";
import styles from "./Journal.module.css";

const TIME = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

/** The week as seven thin bars, minutes above them, and the daily share of the weekly goal as a guide. */
function WeekChart({ goalMin }: { goalMin: number }) {
  const week = useWeek();
  const perDay = goalMin / 7;
  const max = Math.max(perDay * 1.3, ...week.map((d) => d.sec / 60), 1);
  const guide = (perDay / max) * 100;
  return (
    <div className={styles.chart}>
      <div className={styles.plotWrap}>
        <ol
          className={styles.plot}
          aria-label="Minutes practised each day this week"
        >
          {week.map((d) => {
            const minutes = Math.round(d.sec / 60);
            const h = Math.min(100, (d.sec / 60 / max) * 100);
            return (
              <li
                key={d.day}
                className={styles.col}
                data-today={d.isToday || undefined}
              >
                <span className="sr-only">
                  {d.label}
                  {d.isToday ? " (today)" : ""}: {minutes}{" "}
                  {minutes === 1 ? "minute" : "minutes"}
                  {d.met ? ", daily goal met" : ""}
                </span>
                {minutes > 0 && (
                  <span
                    className={styles.barValue}
                    style={{ bottom: `calc(${h}% + 4px)` }}
                    aria-hidden="true"
                  >
                    {minutes}
                  </span>
                )}
                <span
                  className={styles.bar}
                  style={{ height: minutes > 0 ? `max(${h}%, 4px)` : "0px" }}
                  aria-hidden="true"
                />
              </li>
            );
          })}
        </ol>
        <span
          className={styles.guide}
          style={{ bottom: `${guide}%` }}
          aria-hidden="true"
        />
      </div>
      <div className={styles.labels} aria-hidden="true">
        {week.map((d) => (
          <span
            key={d.day}
            className={styles.label}
            data-today={d.isToday || undefined}
          >
            {d.isToday ? "Today" : d.label}
            {d.met && (
              <Icon
                name="Check"
                size={12}
                strokeWidth={3}
                className={styles.met}
              />
            )}
          </span>
        ))}
      </div>
      <p className={styles.caption}>
        <span className={styles.captionLine} aria-hidden="true" />
        {Math.round(perDay)} min a day reaches your weekly goal
        <span className={styles.captionMet}>
          <Icon name="Check" size={12} strokeWidth={3} className={styles.met} />{" "}
          daily goal met
        </span>
      </p>
    </div>
  );
}

function WeekCard() {
  const prefs = usePrefs();
  const stored = usePracticeData((d) => d.weeklyGoalMin);
  const goalMin = stored ?? defaultWeeklyGoal(prefs.dailyGoalXp);
  const week = useWeek();
  const minutes = Math.round(week.reduce((s, d) => s + d.sec, 0) / 60);
  const left = Math.max(0, goalMin - minutes);
  const [draft, setDraftGoal] = useState(goalMin);
  return (
    <section className={styles.weekCard} aria-labelledby="journal-week">
      <div className={styles.weekHead}>
        <div>
          <h2 id="journal-week" className={styles.cardTitle}>
            This week
          </h2>
          <p className={styles.weekNumbers}>
            <strong>{minutes}</strong> of {goalMin} min
            <span className={styles.weekLeft}>
              {left > 0 ? ` · ${left} to go` : " · weekly goal reached"}
            </span>
          </p>
        </div>
        <Popover
          aria-label="Weekly goal"
          align="end"
          trigger={
            <IconButton
              icon="Pencil"
              label="Change the weekly goal"
              variant="ghost"
              size="sm"
            />
          }
          onOpenChange={(open) => open && setDraftGoal(goalMin)}
        >
          {({ close }) => (
            <div className={styles.goalPopover}>
              <Stepper
                label="Weekly goal"
                unit="min"
                min={15}
                max={1200}
                step={15}
                value={draft}
                onChange={setDraftGoal}
              />
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  updatePracticeData((d) => ({
                    ...d,
                    weeklyGoalMin: clampWeekly(draft),
                  }));
                  close();
                }}
              >
                Set goal
              </Button>
            </div>
          )}
        </Popover>
      </div>
      <ProgressBar
        aria-label={`${minutes} of ${goalMin} minutes this week`}
        value={Math.min(minutes, goalMin)}
        max={goalMin}
        tone={left === 0 ? "ok" : "info"}
        valueText={false}
      />
      <WeekChart goalMin={goalMin} />
    </section>
  );
}

function Nudge() {
  const goal = useDailyGoal();
  const streak = useStreak();
  const nudge = streakNudge(goal, streak);
  const start = () => {
    const minutes = durationCovering(nudge.minutes ?? 5, DURATIONS);
    const d = autoDraft(minutes);
    void beginSession(d.blocks, { title: planTitle(minutes) });
  };
  return (
    <div className={styles.nudge} data-tone={nudge.tone} role="status">
      <span className={styles.nudgeIcon} aria-hidden="true">
        <Icon
          name={nudge.tone === "ok" ? "ShieldCheck" : "Flame"}
          size={22}
          strokeWidth={2}
        />
      </span>
      <div className={styles.nudgeText}>
        <p className={styles.nudgeTitle}>{nudge.title}</p>
        <p className={styles.nudgeBody}>{nudge.text}</p>
      </div>
      {nudge.minutes !== null && (
        <Button
          size="sm"
          iconLeft="Play"
          onClick={start}
          className={styles.nudgeButton}
          data-practice-nudge=""
        >
          Start {durationCovering(nudge.minutes, DURATIONS)} min
        </Button>
      )}
    </div>
  );
}

function EntryCard({
  entry,
  onOpen,
}: {
  entry: JournalEntry;
  onOpen: () => void;
}) {
  const feel = FEELS.find((f) => f.value === entry.feel);
  const areas = [...new Set(entry.blocks.map((b) => b.area))];
  return (
    <button
      type="button"
      className={styles.entry}
      onClick={onOpen}
      data-journal-entry={entry.id}
    >
      <span className={styles.entryTop}>
        <span className={styles.entryTitle}>{entry.title}</span>
        <span className={styles.entryMinutes}>
          {formatMinutes(entry.practisedSec)}
        </span>
      </span>
      <span className={styles.entryMeta}>
        <span>{TIME.format(entry.endedAt)}</span>
        <span aria-hidden="true">·</span>
        <span>
          {entry.blocks.filter((b) => b.outcome === "done").length} of{" "}
          {entry.blocks.length} blocks
        </span>
        <span aria-hidden="true">·</span>
        <span>+{entry.xp} XP</span>
        {feel && (
          <span className={styles.entryFeel}>
            <Icon name={feel.icon} size={14} strokeWidth={2} /> {feel.label}
          </span>
        )}
      </span>
      <span className={styles.entryAreas}>
        {areas.map((a) => (
          <AreaTag key={a} area={a} iconOnly />
        ))}
      </span>
      {entry.note && <span className={styles.entryNote}>{entry.note}</span>}
    </button>
  );
}

function EntrySheet({
  entry,
  today,
  yesterday,
  onClose,
}: {
  entry: JournalEntry | null;
  today: string;
  yesterday: string;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  if (entry && shown !== entry.id) {
    setShown(entry.id);
    setNote(entry.note);
  }
  const close = () => {
    if (entry && note !== entry.note) updateJournalEntry(entry.id, { note });
    onClose();
  };
  const remove = async () => {
    if (!entry) return;
    const ok = await confirmDialog({
      title: "Delete this session from the journal?",
      description:
        "Your XP and streak stay as they are; only the journal entry goes.",
      confirmLabel: "Delete entry",
      tone: "danger",
    });
    if (!ok) return;
    const removed = removeJournalEntry(entry.id);
    onClose();
    if (removed)
      toast({
        title: "Entry deleted",
        action: { label: "Undo", onClick: () => addJournalEntry(removed) },
      });
  };
  return (
    <Sheet
      open={!!entry}
      onClose={close}
      title={entry?.title ?? ""}
      description={
        entry
          ? `${dayLabel(entry.day, today, yesterday)}, ${TIME.format(entry.startedAt)} · ${formatMinutes(entry.practisedSec)} practised`
          : undefined
      }
      size="md"
      footer={
        <>
          <Button variant="ghost" iconLeft="Trash2" onClick={remove}>
            Delete
          </Button>
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        </>
      }
    >
      {entry && (
        <div className={styles.sheet}>
          <FeelPicker
            value={entry.feel}
            onChange={(feel) => updateJournalEntry(entry.id, { feel })}
          />
          <TextArea
            label="Note"
            optional
            value={note}
            onChange={setNote}
            autoGrow
            rows={3}
            maxLength={MAX_NOTE}
            placeholder="What went well, what to try next time"
          />
          <ol className={styles.sheetBlocks} aria-label="Blocks">
            {entry.blocks.map((b, i) => (
              <li key={`${b.title}-${i}`} className={styles.sheetBlock}>
                <OutcomeMark outcome={b.outcome} />
                <span className={styles.sheetBlockText}>
                  <span>{b.title}</span>
                  <span className={styles.sheetBlockMeta}>
                    {AREA_INFO[b.area].label}
                  </span>
                </span>
                <span className={styles.sheetBlockTime}>
                  {Math.round(b.spentSec / 60)} /{" "}
                  {Math.round(b.plannedSec / 60)} min
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Sheet>
  );
}

/** Other things recorded that day (games, songs ...), in one line. */
function alsoLine(
  log: readonly PracticeSession[],
  day: string,
  timeZone: string | undefined,
): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const sec = new Map<string, number>();
  for (const e of log) {
    if (e.kind === "practice" || e.durationSec < 30) continue;
    if (fmt.format(e.startedAt) !== day) continue;
    const label = ACTIVITY_KINDS[e.kind]?.label ?? "Other";
    sec.set(label, (sec.get(label) ?? 0) + e.durationSec);
  }
  return [...sec.entries()]
    .map(([label, s]) => `${label} ${formatMinutes(s)}`)
    .join(", ");
}

const PAGE_DAYS = 14;

/** The journal. `compact` drops the empty-state call to action (the plan is right beside it). */
export function JournalView({ compact = false }: { compact?: boolean }) {
  const journal = usePracticeData((d) => d.journal);
  const log = useProgress((s) => s.log);
  const today = useProgress((s) => s.meta.today);
  const [open, setOpen] = useState<string | null>(null);
  const [days, setDays] = useState(PAGE_DAYS);
  const groups = useMemo(() => groupByDay(journal), [journal]);
  const yesterday = addDays(today, -1);
  const tz = getProgressStore().timeZone();
  const entry = open ? (journal.find((e) => e.id === open) ?? null) : null;

  return (
    <div className={styles.journal}>
      <WeekCard />
      <Nudge />
      <section aria-labelledby="journal-sessions" className={styles.sessions}>
        <h2 id="journal-sessions" className={styles.cardTitle}>
          Sessions
        </h2>
        {groups.length === 0 ? (
          <EmptyState
            icon="NotebookPen"
            title="Your journal starts with your first session"
            align="start"
            framed
            actions={
              compact ? undefined : (
                <LinkButton to="practice" variant="primary" iconLeft="Play">
                  Plan a session
                </LinkButton>
              )
            }
          >
            Each planned session lands here by day, with its blocks, the minutes
            and a note on how it felt.
          </EmptyState>
        ) : (
          <>
            {groups.slice(0, days).map((g) => {
              const also = alsoLine(log, g.day, tz);
              return (
                <div key={g.day} className={styles.day}>
                  <h3 className={styles.dayHead}>
                    <span>{dayLabel(g.day, today, yesterday)}</span>
                    <span className={styles.dayMinutes}>{g.minutes} min</span>
                  </h3>
                  <div className={styles.dayEntries}>
                    {g.entries.map((e) => (
                      <EntryCard
                        key={e.id}
                        entry={e}
                        onOpen={() => setOpen(e.id)}
                      />
                    ))}
                  </div>
                  {also && <p className={styles.also}>Also played: {also}</p>}
                </div>
              );
            })}
            {groups.length > days && (
              <Button
                variant="ghost"
                iconLeft="ChevronDown"
                onClick={() => setDays((n) => n + PAGE_DAYS)}
              >
                Show older days
              </Button>
            )}
          </>
        )}
      </section>
      <EntrySheet
        entry={entry}
        today={today}
        yesterday={yesterday}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}
