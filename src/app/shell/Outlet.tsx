import { Component, Suspense, lazy, memo, useCallback, useState, type ComponentType, type ErrorInfo, type ReactNode } from 'react';
import { Button, ErrorState, LinkButton, Page, Skeleton } from '@/ui';
import { back } from '../router';
import { routeDef, type RouteDef, type RouteProps } from '../routes';
import { isLoadFailure, recoveryFor } from './failure';
import { upTarget } from './nav';
import styles from './Shell.module.css';

type LazyFeature = ReturnType<typeof lazy<ComponentType<RouteProps>>>;

const lazyCache = new Map<string, LazyFeature>();

/** The lazy component of a route, created once per route. */
function featureFor(name: string): LazyFeature {
  let feature = lazyCache.get(name);
  if (!feature) {
    feature = lazy(routeDef(name).load);
    lazyCache.set(name, feature);
  }
  return feature;
}

/** Forget a route's lazy component, so a retry downloads the screen again instead of replaying the failure. */
function forgetFeature(name: string): void {
  lazyCache.delete(name);
}

interface BoundaryProps {
  /** Changes on every navigation; a change clears the error. */
  resetKey: string;
  /** `retries` counts the times "Try again" was already pressed on this screen. */
  fallback: (error: Error, retry: () => void, retries: number) => ReactNode;
  onRetry: () => void;
  children: ReactNode;
}

/** Catches a screen that throws while rendering or loading, so one broken screen never takes the app down. */
class ScreenBoundary extends Component<BoundaryProps, { error: Error | null; retries: number }> {
  state = { error: null as Error | null, retries: 0 };

  static getDerivedStateFromError(error: unknown): { error: Error } {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep the trace findable for whoever debugs the screen; the learner sees the friendly panel.
    console.error('[shell] a screen failed to render', error, info.componentStack);
  }

  componentDidUpdate(previous: BoundaryProps): void {
    if (previous.resetKey !== this.props.resetKey && (this.state.error || this.state.retries > 0)) this.setState({ error: null, retries: 0 });
  }

  retry = (): void => {
    this.props.onRetry();
    this.setState((state) => ({ error: null, retries: state.retries + 1 }));
  };

  render(): ReactNode {
    if (this.state.error) return this.props.fallback(this.state.error, this.retry, this.state.retries);
    return this.props.children;
  }
}

/** The placeholder shown while a screen's code is on its way: the outline of a page, not a blank. */
export function ScreenFallback({ title }: { title: string }) {
  return (
    <Page title={title} hideHeader aria-busy="true" data-shell-fallback="">
      <div className={styles.fallback}>
        <span className="sr-only" role="status">
          Loading {title}
        </span>
        <Skeleton variant="block" width="min(18rem, 70%)" height={40} />
        <Skeleton variant="text" width="min(28rem, 90%)" />
        <div className={styles.fallbackGrid}>
          <Skeleton variant="block" height={132} />
          <Skeleton variant="block" height={132} />
          <Skeleton variant="block" height={132} />
        </div>
        <Skeleton variant="text" lines={3} />
      </div>
    </Page>
  );
}

function ScreenError({ def, params, error, retry, retries }: { def: RouteDef; params: readonly string[]; error: Error; retry: () => void; retries: number }) {
  const up = upTarget(def.name, params);
  const neverArrived = isLoadFailure(error);
  // One main button, and it is always one that can work: see `failure.ts`.
  const reload = recoveryFor(error, retries) === 'reload';
  return (
    <Page title={`${def.title} could not open`} hideHeader width="prose">
      <ErrorState
        title={neverArrived ? `${def.title} did not load` : `${def.title} hit a problem`}
        level={2}
        icon={neverArrived ? 'WifiOff' : undefined}
        error={error}
        onRetry={reload ? () => window.location.reload() : retry}
        retryLabel={reload ? 'Reload the app' : 'Try again'}
        actions={
          up === def.name ? (
            <LinkButton iconLeft="ArrowLeft" to={up}>
              Start this screen over
            </LinkButton>
          ) : (
            <Button iconLeft="ArrowLeft" onClick={() => back(up)}>
              Go back
            </Button>
          )
        }
      >
        {neverArrived
          ? 'The app could not fetch this screen. The connection may have dropped, or the app was updated while it was open. Reload to fetch it again. Your progress is saved.'
          : reload
            ? 'It failed again. Reloading the app usually clears this. Your progress is saved, and the rest of the app still works in the meantime.'
            : 'Something went wrong on this screen. Your progress is saved and the rest of the app still works. Try again, or go back and carry on from there.'}
      </ErrorState>
    </Page>
  );
}

/** Props for `<Outlet>`. */
export interface OutletProps {
  def: RouteDef;
  /** Slug-safe params of the current route, handed to the screen. */
  params: string[];
}

/**
 * Renders the screen for the current route: lazily through the registry, inside Suspense and an
 * error boundary that resets on navigation, and passes it `params`. Memoised, so chrome state
 * (title, immersion, the stats sheet) never re-renders a screen.
 */
export const Outlet = memo(function Outlet({ def, params }: OutletProps) {
  // Bumped by "Try again" so the screen is mounted afresh.
  const [attempt, setAttempt] = useState(0);
  const Feature = featureFor(def.name);
  const onRetry = useCallback(() => {
    forgetFeature(def.name);
    setAttempt((n) => n + 1);
  }, [def.name]);
  return (
    <ScreenBoundary resetKey={`${def.name}/${params.join('/')}`} onRetry={onRetry} fallback={(error, retry, retries) => <ScreenError def={def} params={params} error={error} retry={retry} retries={retries} />}>
      <Suspense fallback={<ScreenFallback title={def.title} />}>
        <Feature key={`${def.name}:${attempt}`} params={params} />
      </Suspense>
    </ScreenBoundary>
  );
});
