import { useEffect, useState, type ComponentType } from 'react';
import { navigate } from '@/app/router';
import type { RouteProps } from '@/app/routes';
import { ChipGroup, LinkButton, Page, Row, SegmentedControl, Spacer } from '@/ui';
import { DisplayGroup } from './Display';
import { FeedbackGroup } from './Feedback';
import { Foundations } from './Foundations';
import { HooksGroup } from './Hooks';
import { InputsGroup } from './Inputs';
import { ActionsGroup, LayoutGroup } from './LayoutActions';

const GROUPS: Array<{ id: string; label: string; Component: ComponentType }> = [
  { id: 'foundations', label: 'Foundations', Component: Foundations },
  { id: 'layout', label: 'Layout', Component: LayoutGroup },
  { id: 'actions', label: 'Actions', Component: ActionsGroup },
  { id: 'inputs', label: 'Inputs', Component: InputsGroup },
  { id: 'feedback', label: 'Feedback', Component: FeedbackGroup },
  { id: 'display', label: 'Display', Component: DisplayGroup },
  { id: 'hooks', label: 'Hooks', Component: HooksGroup },
];

type ThemeChoice = 'system' | 'light' | 'dark';

/**
 * Gallery of the general UI kit (`#kit`), for visual checks in both themes and at both widths.
 * `#kit--inputs` shows a single group.
 */
export default function Kit({ params }: RouteProps) {
  const only = GROUPS.find((g) => g.id === params[0]);
  const shown = only ? [only] : GROUPS;
  const [theme, setTheme] = useState<ThemeChoice>('system');

  // A local override for checking both themes; the app's real theme setting is restored on leaving.
  useEffect(() => {
    if (theme === 'system') return;
    const root = document.documentElement;
    const before = root.getAttribute('data-theme');
    root.setAttribute('data-theme', theme);
    return () => {
      if (before == null) root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', before);
    };
  }, [theme]);

  return (
    <Page
      title="UI kit"
      eyebrow="Sixstring Academy"
      subtitle="Every general-purpose component in its states. Fretboards, chord diagrams and notation live in the music kit."
      actions={
        <LinkButton to="kit-music" variant="secondary" iconRight="ArrowRight">
          Music kit
        </LinkButton>
      }
    >
      <Row wrap gap={3}>
        <ChipGroup
          aria-label="Component group"
          value={only?.id ?? 'all'}
          onChange={(id) => navigate('kit', id === 'all' ? undefined : id)}
          options={[{ value: 'all', label: 'Everything' }, ...GROUPS.map((g) => ({ value: g.id, label: g.label }))]}
        />
        <Spacer />
        <SegmentedControl
          aria-label="Theme"
          size="sm"
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'system', label: 'System', icon: 'Monitor' },
            { value: 'light', label: 'Light', icon: 'Sun' },
            { value: 'dark', label: 'Dark', icon: 'Moon' },
          ]}
        />
      </Row>
      {shown.map(({ id, Component }) => (
        <Component key={id} />
      ))}
    </Page>
  );
}
