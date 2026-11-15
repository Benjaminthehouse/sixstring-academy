import { useState } from 'react';
import {
  AnimatedNumber,
  Avatar,
  Badge,
  Button,
  Card,
  Celebration,
  Cluster,
  CountdownRing,
  GemChip,
  Grid,
  HeartsChip,
  Heading,
  Icon,
  Kbd,
  LevelBadge,
  List,
  ListItem,
  Meter,
  ProgressBar,
  Row,
  Slider,
  Spacer,
  Stack,
  StarRating,
  Stat,
  StreakChip,
  Switch,
  Tag,
  Text,
  XpChip,
} from '@/ui';
import { Demo, Group, Specimen, kitStyles as styles } from './parts';

const PATHS = [
  { id: 'mia', name: 'Mia Brooks', level: 'Beginner', line: 'From never held a guitar to your first songs.' },
  { id: 'dev', name: 'Dev Okafor', level: 'Intermediate', line: 'From open chords to the whole neck.' },
  { id: 'elena', name: 'Prof. Elena Varga', level: 'Expert', line: 'Advanced harmony, technique and style.' },
];

/** Surfaces, rows, labels, numbers and the game pieces. */
export function DisplayGroup() {
  const [teacher, setTeacher] = useState('mia');
  const [xp, setXp] = useState(1250);
  const [stars, setStars] = useState(2);
  const [fire, setFire] = useState(0);
  const [level, setLevel] = useState(0.55);
  const [running, setRunning] = useState(false);
  const [round, setRound] = useState(0);
  const [hearts, setHearts] = useState(3);
  const [tags, setTags] = useState(['Blues', 'Shuffle', '12-bar']);
  const [notify, setNotify] = useState(true);

  return (
    <Group id="display" index="06" title="Display" blurb="Cards for discrete things, rows for lists, and the small pieces that show state, numbers and progress in the game.">
      <Specimen name="Card" note="plain, sunken, raised, outline. With onClick or to, the whole card is one control.">
        <Grid min="13rem">
          <Card>
            <Text variant="eyebrow">plain</Text>
            <Heading level={4} size="lg">
              Surface and a hairline
            </Heading>
            <Text variant="caption">The default. No shadow.</Text>
          </Card>
          <Card variant="sunken">
            <Text variant="eyebrow">sunken</Text>
            <Heading level={4} size="lg">
              A tinted well
            </Heading>
            <Text variant="caption">For supporting detail.</Text>
          </Card>
          <Card variant="raised">
            <Text variant="eyebrow">raised</Text>
            <Heading level={4} size="lg">
              Lifted off the desk
            </Heading>
            <Text variant="caption">Use sparingly.</Text>
          </Card>
          <Card variant="outline">
            <Text variant="eyebrow">outline</Text>
            <Heading level={4} size="lg">
              Border only
            </Heading>
            <Text variant="caption">Quiet grouping.</Text>
          </Card>
        </Grid>
        <Demo label="Interactive (links) and disabled">
          <Grid min="15rem">
            <Card to="scales" params={['a-minor-pentatonic']}>
              <Stack gap={3}>
                <Row>
                  <Icon name="Waypoints" size="lg" />
                  <Spacer />
                  <Badge tone="ok" dot>
                    Mastered
                  </Badge>
                </Row>
                <div>
                  <Heading level={4} size="lg">
                    A minor pentatonic
                  </Heading>
                  <Text variant="caption">Five notes, five positions.</Text>
                </div>
                <ProgressBar aria-label="Positions learned" value={5} max={5} segmented size="sm" tone="ok" />
              </Stack>
            </Card>
            <Card to="scales" params={['c-major']}>
              <Stack gap={3}>
                <Row>
                  <Icon name="Waypoints" size="lg" />
                  <Spacer />
                  <Badge tone="accent" dot>
                    In progress
                  </Badge>
                </Row>
                <div>
                  <Heading level={4} size="lg">
                    C major
                  </Heading>
                  <Text variant="caption">Seven notes, no sharps or flats.</Text>
                </div>
                <ProgressBar aria-label="Positions learned" value={2} max={5} segmented size="sm" />
              </Stack>
            </Card>
            <Card onClick={() => {}} disabled>
              <Stack gap={3}>
                <Row>
                  <Icon name="Lock" size="lg" />
                  <Spacer />
                  <Badge>Locked</Badge>
                </Row>
                <div>
                  <Heading level={4} size="lg">
                    Harmonic minor
                  </Heading>
                  <Text variant="caption">Finish natural minor first.</Text>
                </div>
                <ProgressBar aria-label="Positions learned" value={0} max={5} segmented size="sm" />
              </Stack>
            </Card>
          </Grid>
        </Demo>
        <Demo label="Selectable (buttons with aria-pressed)">
          <Grid min="14rem">
            {PATHS.map((p) => (
              <Card key={p.id} selected={teacher === p.id} onClick={() => setTeacher(p.id)}>
                <Stack gap={3}>
                  <Avatar name={p.name} size="lg" decorative />
                  <div>
                    <Text variant="eyebrow">{p.level}</Text>
                    <Heading level={4} size="lg">
                      {p.name}
                    </Heading>
                    <Text variant="caption">{p.line}</Text>
                  </div>
                </Stack>
              </Card>
            ))}
          </Grid>
        </Demo>
      </Specimen>

      <Specimen name="List / ListItem" note="Rows at least 56 px tall. Plain on the page, or inside one card.">
        <Grid min="18rem" gap={6}>
          <List>
            <ListItem icon="Music" title="Greensleeves" subtitle="Traditional · A minor · 3/4" to="play" params={['greensleeves']} trailing={<StarRating value={3} size={14} />} />
            <ListItem icon="Music" title="Scarborough Fair" subtitle="Traditional · D Dorian · 3/4" to="play" params={['scarborough-fair']} trailing={<StarRating value={1} size={14} />} />
            <ListItem icon="Music" title="Lágrima" subtitle="Francisco Tárrega · E major" to="play" params={['lagrima']} trailing={<Badge tone="accent">New</Badge>} />
            <ListItem icon="Lock" title="Recuerdos de la Alhambra" subtitle="Unlocks at level 12" disabled onClick={() => {}} />
          </List>
          <List variant="card">
            <ListItem leading={<Avatar name="Dev Okafor" decorative />} title="Dev Okafor" subtitle="Intermediate · 4 of 18 lessons" onClick={() => {}} selected />
            <ListItem icon="Bell" title="Practice reminders" subtitle="Every day at 18:30" trailing={<Switch aria-label="Practice reminders" checked={notify} onChange={setNotify} />} />
            <ListItem icon="Guitar" title="Tuning" trailing={<Tag mono>E A D G B E</Tag>} />
            <ListItem icon="Info" title="A row that wraps its text when the title is long enough to need two lines" subtitle="wrap" wrap />
          </List>
        </Grid>
      </Specimen>

      <Specimen name="Badge" note="A status or a count. Ink text on a tint; the dot or icon carries the tone.">
        <Demo label="soft">
          <Cluster>
            <Badge>Draft</Badge>
            <Badge tone="accent" dot>
              In progress
            </Badge>
            <Badge tone="ok" dot>
              Mastered
            </Badge>
            <Badge tone="info" icon="Clock">
              Due today
            </Badge>
            <Badge tone="warn" icon="TriangleAlert">
              Rusty
            </Badge>
            <Badge tone="bad" dot>
              Failed
            </Badge>
            <Badge tone="xp" icon="Zap">
              Double XP
            </Badge>
            <Badge tone="streak" icon="Flame">
              7 days
            </Badge>
          </Cluster>
        </Demo>
        <Demo label="solid, outline, md">
          <Cluster>
            <Badge variant="solid" tone="accent">
              New
            </Badge>
            <Badge variant="solid" tone="ok">
              Passed
            </Badge>
            <Badge variant="solid" tone="bad">
              3
            </Badge>
            <Badge variant="solid" tone="info">
              Beta
            </Badge>
            <Badge variant="solid" tone="warn">
              Check
            </Badge>
            <Badge variant="solid" tone="xp">
              +15 XP
            </Badge>
            <Badge variant="solid" tone="streak">
              On fire
            </Badge>
            <Badge variant="solid">12</Badge>
            <Badge variant="outline" tone="ok" dot>
              Synced
            </Badge>
            <Badge size="md" tone="accent" icon="Crown">
              Level 7
            </Badge>
          </Cluster>
        </Demo>
      </Specimen>

      <Specimen name="Tag" note="A neutral property: style, key, tuning, length.">
        <Cluster>
          <Tag>Fingerstyle</Tag>
          <Tag icon="Clock">4 min</Tag>
          <Tag mono>Drop D</Tag>
          <Tag mono>92 BPM</Tag>
          {tags.map((t) => (
            <Tag key={t} onRemove={() => setTags((prev) => prev.filter((x) => x !== t))} removeLabel={`Remove ${t}`}>
              {t}
            </Tag>
          ))}
          {tags.length < 3 && (
            <Button size="sm" variant="ghost" onClick={() => setTags(['Blues', 'Shuffle', '12-bar'])}>
              Reset tags
            </Button>
          )}
        </Cluster>
      </Specimen>

      <Specimen name="Stat" note="A labelled big number. No card needed.">
        <Grid min="9rem" gap={6}>
          <Stat label="Accuracy" value={92} unit="%" hint="+4 this week" trend="up" />
          <Stat label="Top speed" value={132} unit="BPM" hint="-8 since Monday" trend="down" />
          <Stat label="Practice time" icon="Clock" value="3:40" unit="h" hint="this week" />
          <Stat label="Total XP" value={<AnimatedNumber value={xp} />} size="lg" />
          <Stat label="Notes learned" value="38" unit="/ 72" size="sm" />
        </Grid>
      </Specimen>

      <Specimen name="AnimatedNumber" note="Counts to its new value. Screen readers get the final number at once.">
        <Cluster gap={4} align="center">
          <Heading level={4} size="3xl" display>
            <AnimatedNumber value={xp} />
          </Heading>
          <Button onClick={() => setXp((v) => v + 150)} iconLeft="Plus">
            Add 150 XP
          </Button>
          <Button variant="ghost" onClick={() => setXp(1250)}>
            Reset
          </Button>
        </Cluster>
      </Specimen>

      <Specimen name="Avatar" note="Image, icon or initials on a colour that stays with the name.">
        <Cluster gap={4} align="center">
          <Avatar name="Mia Brooks" size="xs" />
          <Avatar name="Mia Brooks" size="sm" />
          <Avatar name="Mia Brooks" />
          <Avatar name="Dev Okafor" size="lg" />
          <Avatar name="Prof. Elena Varga" size="xl" ring />
          <Avatar name="You" icon="User" tone="neutral" size="lg" />
          <Avatar name="Guest" tone={5} size="lg" />
        </Cluster>
      </Specimen>

      <Specimen name="Kbd" note="Shortcut hints (hide them on phones).">
        <Text>
          <Kbd>Space</Kbd> play or pause · <Kbd>←</Kbd> <Kbd>→</Kbd> previous or next bar · <Kbd>L</Kbd> loop · <Kbd>Shift</Kbd> + <Kbd>↑</Kbd> faster
        </Text>
      </Specimen>

      <Specimen name="Meter" note="A live reading inside a known range. Tone follows low / high unless fixed.">
        <Grid min="15rem" gap={6}>
          <Stack gap={3}>
            <Meter label="Input level" showLabel value={level} low={0.15} high={0.9} valueText={level < 0.15 ? 'Too quiet' : level >= 0.9 ? 'Too loud' : 'Good level'} />
            <Slider label="Simulated level" hideLabel showValue={false} min={0} max={1} step={0.01} value={level} onChange={setLevel} bubble="never" />
          </Stack>
          <Meter label="Timing" showLabel value={0.62} segments={0} tone="accent" />
          <Meter label="Too loud" showLabel value={0.97} low={0.15} high={0.9} segments={24} />
        </Grid>
        <Demo label="vertical">
          <Cluster gap={5} align="stretch">
            <Meter label="Left channel" orientation="vertical" value={level} low={0.15} high={0.9} segments={12} />
            <Meter label="Right channel" orientation="vertical" value={Math.max(0, level - 0.2)} low={0.15} high={0.9} segments={12} />
            <Meter label="Sustain" orientation="vertical" value={0.4} segments={0} tone="accent" />
          </Cluster>
        </Demo>
      </Specimen>

      <Specimen name="StarRating" note="Zero to three stars for a round or a skill.">
        <Cluster gap={6} align="center">
          <StarRating value={0} />
          <StarRating value={1} />
          <StarRating value={2} />
          <StarRating value={3} />
          <StarRating value={4} max={5} size={18} />
        </Cluster>
        <Cluster gap={4} align="center">
          <StarRating key={stars} value={stars} size={40} animate />
          <Button onClick={() => setStars((s) => (s + 1) % 4)}>Change result</Button>
        </Cluster>
      </Specimen>

      <Specimen name="Counter chips" note="XP, streak, hearts, gems. Presentational: numbers come from core/progress.">
        <Demo label="sm (nav bars, lists)">
          <Cluster gap={3}>
            <XpChip value={1250} />
            <XpChip value={15} gain />
            <StreakChip days={12} />
            <StreakChip days={12} active={false} />
            <HeartsChip value={hearts} />
            <HeartsChip value={hearts} max={5} pips />
            <GemChip value={240} />
            <XpChip value={48200} />
          </Cluster>
        </Demo>
        <Demo label="lg, and without the pill">
          <Cluster gap={4}>
            <XpChip value={30} gain size="lg" />
            <StreakChip days={7} size="lg" />
            <HeartsChip value={hearts} pips size="lg" />
            <GemChip value={240} size="lg" />
            <XpChip value={1250} pill={false} />
            <StreakChip days={12} pill={false} />
            <HeartsChip value={0} pill={false} />
            <GemChip value={5} pill={false} />
          </Cluster>
        </Demo>
        <Cluster>
          <Button size="sm" onClick={() => setHearts((h) => Math.max(0, h - 1))}>
            Lose a heart
          </Button>
          <Button size="sm" onClick={() => setHearts(5)}>
            Refill
          </Button>
        </Cluster>
      </Specimen>

      <Specimen name="LevelBadge" note="The player's level, on a guitar pick.">
        <Cluster gap={5} align="center">
          <LevelBadge level={1} size={28} />
          <LevelBadge level={7} />
          <LevelBadge level={24} size={56} />
          <LevelBadge level={100} size={72} />
          <LevelBadge level={8} muted />
        </Cluster>
      </Specimen>

      <Specimen name="CountdownRing" note="Drains as time runs out. Turns red for the last three seconds.">
        <Cluster gap={5} align="center">
          <CountdownRing seconds={10} running={running} resetKey={round} onDone={() => setRunning(false)} />
          <CountdownRing seconds={90} running={false} size={56} tone="info" />
          <Button onClick={() => setRunning((r) => !r)} iconLeft={running ? 'Pause' : 'Play'}>
            {running ? 'Pause timer' : 'Start timer'}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setRunning(false);
              setRound((r) => r + 1);
            }}
          >
            Reset timer
          </Button>
        </Cluster>
      </Specimen>

      <Specimen name="Celebration" note="Confetti for real milestones. Reduced motion: nothing moves.">
        <div className={`${styles.frame} ${styles.relative}`}>
          <Stack gap={3} align="start">
            <StarRating value={3} size={32} />
            <Heading level={4} size="xl">
              Lesson complete
            </Heading>
            <Cluster>
              <XpChip value={30} gain size="lg" />
              <StreakChip days={8} size="lg" />
            </Cluster>
            <Button variant="primary" onClick={() => setFire((n) => n + 1)} iconLeft="PartyPopper">
              Celebrate
            </Button>
          </Stack>
          <Celebration fire={fire} contained />
        </div>
      </Specimen>
    </Group>
  );
}
