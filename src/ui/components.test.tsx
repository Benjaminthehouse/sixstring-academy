// @vitest-environment jsdom
import { act, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROUTES } from '@/app/routes';
import { explainMediaFailure } from '@/core/platform/media';
import Kit from '@/features/kit';
import {
  Avatar,
  Button,
  Card,
  Checkbox,
  ChipGroup,
  ErrorState,
  HeartsChip,
  Icon,
  IconButton,
  LevelBadge,
  LinkButton,
  ListItem,
  List,
  MediaBlocked,
  Modal,
  Page,
  ProgressBar,
  RadioGroup,
  SegmentedControl,
  Select,
  Slider,
  StarRating,
  Stepper,
  StreakChip,
  Switch,
  Tabs,
  TextField,
  XpChip,
  confirmDialog,
  isBundledIcon,
  preloadAllIcons,
  resolveIcon,
  toast,
} from './index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Array<{ root: Root; el: HTMLElement }> = [];
function mount(node: ReactNode) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => root.render(node));
  roots.push({ root, el });
  return { el, rerender: (next: ReactNode) => act(() => root.render(next)) };
}
const click = (el: Element | null | undefined) => act(() => void (el as HTMLElement).click());
const q = <T extends Element = HTMLElement>(root: ParentNode, selector: string) => root.querySelector<T>(selector)!;

afterEach(() => {
  act(() => toast.clear());
  while (roots.length) {
    const { root, el } = roots.pop()!;
    act(() => root.unmount());
    el.remove();
  }
  vi.useRealTimers();
});

describe('Icon', () => {
  it('bundles every icon the route registry names, so navigation never waits for the lazy chunk', () => {
    const missing = ROUTES.map((r) => r.icon).filter((name) => !isBundledIcon(name));
    expect(missing).toEqual([]);
  });

  it('resolves lucide aliases and reports unknown names', () => {
    expect(resolveIcon('Music')).not.toBeNull();
    expect(resolveIcon('House')).not.toBeNull();
    expect(resolveIcon('DefinitelyNotAnIcon')).toBeNull();
  });

  it('is decorative by default and an image when labelled', () => {
    const { el } = mount(
      <>
        <Icon name="Flame" />
        <Icon name="Info" label="More information" size="lg" />
      </>,
    );
    const [plain, labelled] = Array.from(el.querySelectorAll('svg'));
    expect(plain.getAttribute('aria-hidden')).toBe('true');
    expect(plain.getAttribute('width')).toBe('20');
    expect(labelled.getAttribute('role')).toBe('img');
    expect(labelled.getAttribute('aria-label')).toBe('More information');
    expect(labelled.getAttribute('width')).toBe('24');
  });

  it('reserves space for a name outside the bundled set, then draws it once the full set has loaded', async () => {
    const { el } = mount(<Icon name="Telescope" size={32} />);
    const placeholder = q(el, 'span');
    expect(placeholder.style.width).toBe('32px');
    expect(placeholder.getAttribute('aria-hidden')).toBe('true');
    await act(async () => {
      await preloadAllIcons();
    });
    expect(el.querySelector('span')).toBeNull();
    expect(q(el, 'svg').getAttribute('width')).toBe('32');
    expect(q(el, 'svg').children.length).toBeGreaterThan(0);
  });
});

describe('actions', () => {
  it('Button is type=button and blocks presses while loading', () => {
    const onClick = vi.fn();
    const { el, rerender } = mount(<Button onClick={onClick}>Save</Button>);
    const button = q<HTMLButtonElement>(el, 'button');
    expect(button.type).toBe('button');
    click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(
      <Button onClick={onClick} loading>
        Save
      </Button>,
    );
    expect(button.getAttribute('aria-busy')).toBe('true');
    click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('LinkButton renders a real route link, or inert text when disabled', () => {
    const { el } = mount(
      <>
        <LinkButton to="scales" params={['a-minor']}>
          Open
        </LinkButton>
        <LinkButton to="songs" disabled>
          Off
        </LinkButton>
        <LinkButton href="https://example.org">Out</LinkButton>
      </>,
    );
    const [open, off, out] = Array.from(el.querySelectorAll('a'));
    expect(open.getAttribute('href')).toBe('#scales--a-minor');
    expect(off.hasAttribute('href')).toBe(false);
    expect(off.getAttribute('aria-disabled')).toBe('true');
    expect(out.getAttribute('target')).toBe('_blank');
    expect(out.getAttribute('rel')).toContain('noopener');
  });

  it('IconButton always carries its accessible name and toggle state', () => {
    const { el } = mount(<IconButton icon="Repeat" label="Loop this section" pressed />);
    const button = q(el, 'button');
    expect(button.getAttribute('aria-label')).toBe('Loop this section');
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('inputs', () => {
  it('TextField ties label, hint and error to the input', () => {
    const onChange = vi.fn();
    const { el } = mount(<TextField label="Tempo" value="12o" onChange={onChange} hint="Beats per minute." error="Enter a number." />);
    const input = q<HTMLInputElement>(el, 'input');
    const label = q<HTMLLabelElement>(el, 'label');
    expect(label.htmlFor).toBe(input.id);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const described = input.getAttribute('aria-describedby')!.split(' ');
    expect(described).toHaveLength(2);
    expect(described.map((id) => document.getElementById(id)?.textContent)).toEqual(['Beats per minute.', 'Enter a number.']);
    expect(q(el, '[role="alert"]').textContent).toBe('Enter a number.');
  });

  it('Select renders plain, object and grouped options', () => {
    const onChange = vi.fn();
    const { el } = mount(<Select label="Tuning" value="drop-d" onChange={onChange} placeholder="Choose" options={['standard', { value: 'drop-d', label: 'Drop D' }, { group: 'Open', options: ['open-g'] }]} />);
    const select = q<HTMLSelectElement>(el, 'select');
    expect(select.value).toBe('drop-d');
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Choose', 'standard', 'Drop D', 'open-g']);
    expect(el.querySelectorAll('optgroup')).toHaveLength(1);
  });

  it('SegmentedControl is a radio group with one tab stop', () => {
    function Demo() {
      const [v, setV] = useState('Sharps');
      return <SegmentedControl aria-label="Accidentals" options={['Sharps', 'Flats']} value={v} onChange={setV} />;
    }
    const { el } = mount(<Demo />);
    const radios = Array.from(el.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    expect(q(el, '[role="radiogroup"]').getAttribute('aria-label')).toBe('Accidentals');
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1]);
    click(radios[1]);
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true']);
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0]);
  });

  it('Tabs links tabs and panels and mounts only the selected panel', () => {
    const { el } = mount(
      <Tabs
        aria-label="Views"
        items={[
          { id: 'neck', label: 'Neck', content: <p>neck panel</p> },
          { id: 'staff', label: 'Staff', content: <p>staff panel</p> },
          { id: 'off', label: 'Off', disabled: true, content: <p>off panel</p> },
        ]}
      />,
    );
    const tabs = Array.from(el.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(el.querySelectorAll('[role="tabpanel"]')).toHaveLength(1);
    expect(q(el, '[role="tabpanel"]').textContent).toBe('neck panel');
    click(tabs[1]);
    const panel = q(el, '[role="tabpanel"]');
    expect(panel.textContent).toBe('staff panel');
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[1].id);
    expect(tabs[1].getAttribute('aria-controls')).toBe(panel.id);
    expect(tabs[2].disabled).toBe(true);
  });

  it('ChipGroup supports single and multiple selection', () => {
    function Demo() {
      const [one, setOne] = useState<string | null>('All');
      const [many, setMany] = useState<string[]>(['Blues']);
      return (
        <>
          <ChipGroup aria-label="Level" options={['All', 'Beginner']} value={one} onChange={setOne} />
          <ChipGroup multiple aria-label="Styles" options={['Blues', 'Folk']} value={many} onChange={setMany} />
        </>
      );
    }
    const { el } = mount(<Demo />);
    const radios = Array.from(el.querySelectorAll('[role="radio"]'));
    click(radios[1]);
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true']);
    const toggles = Array.from(el.querySelectorAll('[role="group"] button'));
    click(toggles[1]);
    expect(toggles.map((t) => t.getAttribute('aria-pressed'))).toEqual(['true', 'true']);
    click(toggles[0]);
    expect(toggles.map((t) => t.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
  });

  it('Checkbox, Switch and RadioGroup use native inputs', () => {
    const onChange = vi.fn();
    const { el } = mount(
      <>
        <Checkbox label="All strings" checked={false} indeterminate onChange={onChange} />
        <Switch label="Left-handed" checked onChange={onChange} />
        <RadioGroup label="Hand" value="right" onChange={onChange} options={['right', 'left']} />
      </>,
    );
    const checkbox = q<HTMLInputElement>(el, 'input[type="checkbox"]:not([role])');
    expect(checkbox.indeterminate).toBe(true);
    const sw = q<HTMLInputElement>(el, '[role="switch"]');
    expect(sw.checked).toBe(true);
    click(sw);
    expect(onChange).toHaveBeenLastCalledWith(false);
    const radios = Array.from(el.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    expect(new Set(radios.map((r) => r.name)).size).toBe(1);
    expect(q(el, 'legend').textContent).toBe('Hand');
    click(radios[1]);
    expect(onChange).toHaveBeenLastCalledWith('left');
  });

  it('Slider and Stepper expose their values to assistive tech', () => {
    const { el } = mount(
      <>
        <Slider label="Tempo" min={40} max={220} value={92} onChange={() => {}} format={(v) => `${v} BPM`} />
        <Stepper label="Capo" unit="fret" min={0} max={12} value={2} onChange={() => {}} />
      </>,
    );
    const range = q<HTMLInputElement>(el, 'input[type="range"]');
    expect(range.getAttribute('aria-valuetext')).toBe('92 BPM');
    expect(q<HTMLLabelElement>(el, 'label').htmlFor).toBe(range.id);
    const spin = q(el, '[role="spinbutton"]');
    expect(spin.getAttribute('aria-valuenow')).toBe('2');
    expect(spin.getAttribute('aria-valuemax')).toBe('12');
    expect(spin.getAttribute('aria-valuetext')).toBe('2 fret');
    expect(Array.from(el.querySelectorAll('button')).map((b) => b.getAttribute('aria-label'))).toEqual(['Decrease Capo', 'Increase Capo']);
  });
});

describe('feedback', () => {
  it('ProgressBar reports its value, and draws one cell per step when segmented', () => {
    const { el } = mount(
      <>
        <ProgressBar label="Daily goal" value={30} max={50} />
        <ProgressBar aria-label="Lesson" value={3} max={8} segmented />
      </>,
    );
    const [bar, steps] = Array.from(el.querySelectorAll('[role="progressbar"]'));
    expect(bar.getAttribute('aria-valuenow')).toBe('30');
    expect(bar.getAttribute('aria-valuemax')).toBe('50');
    expect(bar.getAttribute('aria-valuetext')).toBe('60%');
    expect(steps.getAttribute('aria-label')).toBe('Lesson');
    expect(steps.children).toHaveLength(8);
  });

  it('MediaBlocked uses the shared wording and only offers a retry when it can help', () => {
    const retry = vi.fn();
    const { el, rerender } = mount(<MediaBlocked reason="denied" device="microphone" onRetry={retry} onContinueWithout={() => {}} />);
    expect(q(el, 'h3').textContent).toBe(explainMediaFailure('denied', 'microphone').title);
    expect(el.textContent).toContain(explainMediaFailure('denied', 'microphone').fix);
    expect(Array.from(el.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Try again', 'Continue without the microphone']);
    click(q(el, 'button'));
    expect(retry).toHaveBeenCalledTimes(1);
    rerender(<MediaBlocked reason="blocked-by-host" device="camera" onRetry={retry} onContinueWithout={() => {}} continueLabel="Use the diagram" />);
    expect(q(el, 'h3').textContent).toBe(explainMediaFailure('blocked-by-host', 'camera').title);
    expect(Array.from(el.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Use the diagram']);
  });

  it('ErrorState tucks the raw error into details', () => {
    const { el } = mount(<ErrorState error={new Error('bad token at bar 12')} onRetry={() => {}} />);
    expect(q(el, 'h3').textContent).toBe('Something went wrong');
    expect(q(el, 'details pre').textContent).toBe('bad token at bar 12');
    expect(q(el, 'button').textContent).toBe('Try again');
  });

  it('Modal renders a labelled dialog in the body only while open', () => {
    const onClose = vi.fn();
    const { rerender } = mount(
      <Modal open={false} onClose={onClose} title="Rename song">
        <p>body</p>
      </Modal>,
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    rerender(
      <Modal open onClose={onClose} title="Rename song" description="Pick a new name.">
        <p>body</p>
      </Modal>,
    );
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe('Rename song');
    expect(document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent).toBe('Pick a new name.');
    expect(document.documentElement.style.overflow).toBe('hidden');
    act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a non-dismissable Modal ignores Escape and has no close button', () => {
    const onClose = vi.fn();
    mount(
      <Modal open onClose={onClose} title="Importing" dismissable={false}>
        <p>working</p>
      </Modal>,
    );
    act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"] button[aria-label="Close"]')).toBeNull();
  });

  it('toast() works without a provider by mounting its own viewport', () => {
    act(() => void toast.ok('Tuning saved'));
    const region = document.querySelector('[aria-label="Notifications"]')!;
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.querySelector('[role="status"]')?.textContent).toContain('Tuning saved');
    act(() => void toast.error('Could not read the file'));
    expect(region.querySelector('[role="alert"]')?.textContent).toContain('Could not read the file');
    expect(document.querySelectorAll('[aria-label="Notifications"]')).toHaveLength(1);
  });

  it('confirmDialog() resolves with the answer', async () => {
    let answer: boolean | null = null;
    await act(async () => {
      void confirmDialog({ title: 'Reset this lesson?', confirmLabel: 'Reset lesson' }).then((ok) => (answer = ok));
    });
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Reset this lesson?');
    const confirm = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Reset lesson')!;
    await act(async () => {
      confirm.click();
    });
    expect(answer).toBe(true);
    // The answered dialog stays mounted for its exit animation before the next question appears.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
    });
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(0);
    let second: boolean | null = null;
    await act(async () => {
      void confirmDialog({ title: 'Delete?', tone: 'danger' }).then((ok) => (second = ok));
    });
    const cancel = Array.from(document.querySelectorAll('[role="dialog"] button')).filter((b) => b.textContent === 'Cancel').pop()!;
    await act(async () => {
      (cancel as HTMLElement).click();
    });
    expect(second).toBe(false);
  });
});

describe('display', () => {
  it('Card is a link, a button or a plain block depending on its props', () => {
    const { el } = mount(
      <>
        <Card to="scales" params={['c-major']}>
          link
        </Card>
        <Card onClick={() => {}} selected>
          button
        </Card>
        <Card>plain</Card>
      </>,
    );
    expect(q(el, 'a').getAttribute('href')).toBe('#scales--c-major');
    expect(q(el, 'button').getAttribute('aria-pressed')).toBe('true');
    expect(el.lastElementChild?.tagName).toBe('DIV');
  });

  it('ListItem rows live in a list and link through the router', () => {
    const { el } = mount(
      <List>
        <ListItem title="Greensleeves" subtitle="Traditional" to="play" params={['greensleeves']} />
        <ListItem title="Plain row" />
      </List>,
    );
    expect(el.querySelectorAll('ul > li')).toHaveLength(2);
    expect(q(el, 'a').getAttribute('href')).toBe('#play--greensleeves');
  });

  it('game pieces speak their meaning', () => {
    const { el } = mount(
      <>
        <StarRating value={2} />
        <XpChip value={1250} />
        <XpChip value={15} gain />
        <StreakChip days={12} active={false} />
        <HeartsChip value={3} max={5} pips />
        <LevelBadge level={7} />
        <Avatar name="Prof. Elena Varga" />
      </>,
    );
    const labels = Array.from(el.querySelectorAll('[role="img"]')).map((n) => n.getAttribute('aria-label'));
    expect(labels).toEqual(['2 of 3 stars', '1,250 XP', 'plus 15 XP', '12 day streak, not extended today', '3 of 5 hearts left', 'Level 7', 'Prof. Elena Varga']);
    expect(el.textContent).toContain('EV');
    expect(el.textContent).toContain('+15');
  });

  it('StarRating clamps and draws max stars', () => {
    const { el } = mount(<StarRating value={9} max={5} />);
    expect(q(el, '[role="img"]').getAttribute('aria-label')).toBe('5 of 5 stars');
    expect(el.querySelectorAll('svg')).toHaveLength(5);
  });
});

describe('Page', () => {
  it('renders one h1, a real back link and the actions slot', () => {
    const { el } = mount(
      <Page title="A minor pentatonic" subtitle="Five notes." back={{ to: 'scales', label: 'All scales' }} actions={<Button>Play</Button>}>
        <p>content</p>
      </Page>,
    );
    expect(el.querySelectorAll('h1')).toHaveLength(1);
    expect(q(el, 'h1').textContent).toBe('A minor pentatonic');
    const back = q(el, 'header a');
    expect(back.getAttribute('href')).toBe('#scales');
    expect(back.textContent).toBe('All scales');
  });

  it('keeps the title for screen readers when the header is hidden', () => {
    const { el } = mount(
      <Page title="Player" hideHeader>
        <p>content</p>
      </Page>,
    );
    expect(q(el, 'h1').className).toContain('sr-only');
    expect(el.querySelector('header')).toBeNull();
  });
});

describe('the gallery', () => {
  it('renders every group without throwing', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { el } = mount(<Kit params={[]} />);
    expect(el.querySelectorAll('[data-kit-group]')).toHaveLength(7);
    expect(el.querySelectorAll('[data-specimen]').length).toBeGreaterThan(60);
    expect(el.querySelectorAll('h1')).toHaveLength(1);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('shows a single group for #kit--inputs', () => {
    const { el } = mount(<Kit params={['inputs']} />);
    expect(Array.from(el.querySelectorAll('[data-kit-group]')).map((n) => n.getAttribute('data-kit-group'))).toEqual(['inputs']);
  });
});
