import { useState } from 'react';
import { ActionBar, Button, ButtonGroup, Cluster, Divider, Grid, IconButton, LinkButton, PlayButton, Row, Section, Spacer, Stack, Text, toast } from '@/ui';
import { Box, Demo, Group, Specimen, kitStyles as styles } from './parts';

/** Page furniture and spacing primitives. */
export function LayoutGroup() {
  return (
    <Group id="layout" index="02" title="Layout" blurb="A screen is a Page holding Sections. Inside, Stack, Row, Cluster and Grid do the spacing so nobody writes margins.">
      <Specimen name="Page" note="This screen is a Page: title, subtitle, back link, actions slot, max width and gutters.">
        <Text variant="caption">
          Widths: content 72rem (default), prose 40rem for reading, full for edge-to-edge tools. A shell that pads its own content area sets --page-gutter: 0px.
        </Text>
      </Specimen>

      <Specimen name="Section" note="A titled block. Plain by default: no card, no border.">
        <div className={styles.frame}>
          <Section title="Continue where you left off" description="Two lessons in progress." actions={<LinkButton to="learn" variant="ghost" size="sm" iconRight="ArrowRight">See all</LinkButton>}>
            <Box>section content</Box>
          </Section>
        </div>
        <div className={styles.frame}>
          <Section level={3} eyebrow="Warm-up" title="Level 3 heading with an eyebrow" divided>
            <Box>section content</Box>
          </Section>
        </div>
      </Specimen>

      <Specimen name="ActionBar" note="Actions that stay in reach at the bottom of a long screen. Here boxed in a short scroll area.">
        <div className={styles.scrollFrame}>
          <Stack>
            <Text variant="eyebrow">Question 3 of 8</Text>
            <Text variant="lead">Which note is on the open fifth string?</Text>
            {['E', 'A', 'D', 'G'].map((n) => (
              <Box key={n}>{n}</Box>
            ))}
            <Text variant="caption">Scroll: the bar stays put.</Text>
          </Stack>
          <ActionBar start={<Text tone="muted">Pick an answer</Text>}>
            <Button variant="ghost">Skip</Button>
            <Button variant="primary">Check</Button>
          </ActionBar>
        </div>
      </Specimen>

      <Specimen name="Stack" note="Vertical flow with one gap. Default 16 px.">
        <Grid min="12rem">
          <Stack gap={2}>
            <Box>gap 2</Box>
            <Box>gap 2</Box>
            <Box>gap 2</Box>
          </Stack>
          <Stack>
            <Box>gap 4</Box>
            <Box>gap 4</Box>
            <Box>gap 4</Box>
          </Stack>
          <Stack gap={6} align="start">
            <Box>gap 6, align start</Box>
            <Box>short</Box>
          </Stack>
        </Grid>
      </Specimen>

      <Specimen name="Row" note="One line, vertically centred, no wrapping. Spacer pushes things apart.">
        <Row>
          <Box>title</Box>
          <Spacer />
          <Box>meta</Box>
          <Box>action</Box>
        </Row>
        <Demo label="stackOnMobile">
          <Row stackOnMobile>
            <Box>one</Box>
            <Box>two</Box>
            <Box>three</Box>
          </Row>
        </Demo>
      </Specimen>

      <Specimen name="Cluster" note="Small things that wrap: chips, tags, counters.">
        <Cluster>
          {['A', 'A♯ / B♭', 'B', 'C', 'C♯ / D♭', 'D', 'D♯ / E♭', 'E', 'F', 'F♯ / G♭', 'G', 'G♯ / A♭'].map((n) => (
            <Box key={n}>{n}</Box>
          ))}
        </Cluster>
      </Specimen>

      <Specimen name="Grid" note="As many equal columns as fit the minimum width; one column on a phone.">
        <Demo label='min="10rem"'>
          <Grid min="10rem">
            {[1, 2, 3, 4, 5].map((n) => (
              <Box key={n} tall>
                {n}
              </Box>
            ))}
          </Grid>
        </Demo>
        <Demo label="columns={3} keepOnMobile">
          <Grid columns={3} keepOnMobile gap={2}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <Box key={n}>{n}</Box>
            ))}
          </Grid>
        </Demo>
      </Specimen>

      <Specimen name="Divider" note="A hairline, optionally labelled, or vertical inside a Row.">
        <Stack>
          <Divider />
          <Divider label="or" />
          <Row>
            <Text>Capo 2</Text>
            <Divider orientation="vertical" />
            <Text>Key of D</Text>
            <Divider orientation="vertical" />
            <Text>92 BPM</Text>
          </Row>
        </Stack>
      </Specimen>
    </Group>
  );
}

/** Buttons and their relatives. */
export function ActionsGroup() {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [loop, setLoop] = useState(true);
  const [saving, setSaving] = useState(false);
  const save = () => {
    setSaving(true);
    window.setTimeout(() => {
      setSaving(false);
      toast.ok('Tuning saved');
    }, 1200);
  };
  return (
    <Group id="actions" index="03" title="Actions" blurb="One primary action per screen. Labels say what happens. Anything that navigates is a real link.">
      <Specimen name="Button" note="primary, secondary (default), ghost, danger.">
        <Demo label="Variants">
          <Cluster gap={3}>
            <Button variant="primary">Start lesson</Button>
            <Button>Practice again</Button>
            <Button variant="ghost">Skip for now</Button>
            <Button variant="danger">Delete recording</Button>
          </Cluster>
        </Demo>
        <Demo label="Sizes: sm 36, md 44, lg 52">
          <Cluster gap={3}>
            <Button variant="primary" size="sm">
              Small
            </Button>
            <Button variant="primary">Medium</Button>
            <Button variant="primary" size="lg">
              Large
            </Button>
            <Button size="sm">Small</Button>
            <Button>Medium</Button>
            <Button size="lg">Large</Button>
          </Cluster>
        </Demo>
        <Demo label="Icons">
          <Cluster gap={3}>
            <Button variant="primary" iconLeft="Play">
              Play along
            </Button>
            <Button iconRight="ArrowRight">Next exercise</Button>
            <Button variant="ghost" iconLeft="RotateCcw">
              Start over
            </Button>
            <Button iconLeft="Mic" pressed>
              Listening
            </Button>
          </Cluster>
        </Demo>
        <Demo label="States">
          <Cluster gap={3}>
            <Button variant="primary" loading={saving} onClick={save}>
              {saving ? 'Saving' : 'Save tuning'}
            </Button>
            <Button variant="primary" loading>
              Loading
            </Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
            <Button disabled>Disabled</Button>
            <Button variant="ghost" disabled>
              Disabled
            </Button>
            <Button variant="danger" disabled>
              Disabled
            </Button>
          </Cluster>
        </Demo>
        <Demo label="Full width" width="narrow">
          <Button variant="primary" size="lg" fullWidth iconRight="ArrowRight">
            Continue
          </Button>
          <Button fullWidth>Not now</Button>
        </Demo>
      </Specimen>

      <Specimen name="LinkButton" note="Looks like a button, is an anchor. Use to + params, or href().">
        <Cluster gap={3}>
          <LinkButton to="tuner" variant="primary" iconLeft="Gauge">
            Open the tuner
          </LinkButton>
          <LinkButton to="scales" params={['a-minor']} iconRight="ArrowRight">
            A minor scale
          </LinkButton>
          <LinkButton to="learn" variant="ghost">
            Theory path
          </LinkButton>
          <LinkButton to="songs" disabled>
            Disabled link
          </LinkButton>
        </Cluster>
      </Specimen>

      <Specimen name="IconButton" note="Icon only. The label is required: it names the control and shows as a tooltip.">
        <Demo label="Variants and sizes">
          <Cluster gap={3}>
            <IconButton icon="SkipBack" label="Previous bar" />
            <IconButton icon="Settings2" label="Display options" variant="secondary" />
            <IconButton icon="Plus" label="Add to practice plan" variant="primary" />
            <IconButton icon="Trash2" label="Delete" variant="danger" />
            <IconButton icon="Heart" label="Add to favourites" round variant="secondary" />
            <IconButton icon="X" label="Close" size="sm" />
            <IconButton icon="Maximize2" label="Full screen" size="lg" variant="secondary" />
          </Cluster>
        </Demo>
        <Demo label="Toggles (aria-pressed), loading, disabled">
          <Cluster gap={3}>
            <IconButton icon={muted ? 'VolumeX' : 'Volume2'} label={muted ? 'Unmute' : 'Mute'} pressed={muted} onClick={() => setMuted((m) => !m)} variant="secondary" />
            <IconButton icon="Repeat" label="Loop this section" pressed={loop} onClick={() => setLoop((l) => !l)} variant="secondary" />
            <IconButton icon="Download" label="Download" loading variant="secondary" />
            <IconButton icon="Share2" label="Share" disabled variant="secondary" />
          </Cluster>
        </Demo>
      </Specimen>

      <Specimen name="ButtonGroup" note="Related buttons with consistent spacing. Primary goes last.">
        <Demo label="Default">
          <ButtonGroup>
            <Button>Cancel</Button>
            <Button variant="primary">Save changes</Button>
          </ButtonGroup>
        </Demo>
        <Demo label="attached">
          <ButtonGroup attached aria-label="Playback speed">
            <Button>50%</Button>
            <Button pressed>75%</Button>
            <Button>100%</Button>
          </ButtonGroup>
        </Demo>
        <Demo label="fullWidth" width="narrow">
          <ButtonGroup fullWidth>
            <Button iconLeft="ChevronLeft">Back</Button>
            <Button variant="primary" iconRight="ChevronRight">
              Next
            </Button>
          </ButtonGroup>
        </Demo>
        <Demo label="stackOnMobile + align end">
          <ButtonGroup stackOnMobile align="end">
            <Button variant="ghost">Discard</Button>
            <Button>Save as draft</Button>
            <Button variant="primary">Add to library</Button>
          </ButtonGroup>
        </Demo>
      </Specimen>

      <Specimen name="PlayButton" note="The big round transport control. One per screen.">
        <Cluster gap={5} align="center">
          <PlayButton size="md" playing={playing} onClick={() => setPlaying((p) => !p)} />
          <PlayButton playing={playing} onClick={() => setPlaying((p) => !p)} />
          <PlayButton size="xl" playing={playing} onClick={() => setPlaying((p) => !p)} />
          <PlayButton icon="Mic" label="Start listening" tone="neutral" />
          <PlayButton icon="Square" filled label="Stop recording" tone="danger" />
          <PlayButton loading label="Loading audio" />
          <PlayButton disabled />
        </Cluster>
      </Specimen>
    </Group>
  );
}
