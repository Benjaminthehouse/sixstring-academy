/**
 * Standard notation with the tab under it, engraved from the same measures: `TabView` with the
 * staff turned on (VexFlow loads on first use; tab only if it cannot). Every TabView prop works.
 *
 *   <ScoreView song={song} />
 *   <ScoreView song={song} layout="line" ref={view} rhythm />
 */
import { forwardRef } from 'react';
import { TabView, type TabViewHandle, type TabViewProps } from './TabView';

/** Props of `<ScoreView>`: those of `TabView` without `notation` (always on). */
export type ScoreViewProps = Omit<TabViewProps, 'notation'>;

/** The staff above the tab. See the module comment. */
export const ScoreView = forwardRef<TabViewHandle, ScoreViewProps>(function ScoreView(props, ref) {
  return <TabView ref={ref} {...props} notation />;
});
