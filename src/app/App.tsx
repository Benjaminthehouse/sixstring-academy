/**
 * App shell (minimal bootstrap version; the shell agent replaces this with the real navigation).
 * Contract that must survive: render the feature for the current route via the registry, inside
 * Suspense and an error boundary, passing `params`.
 */
import { Component, Suspense, lazy, useMemo, type ReactNode } from 'react';
import { ROUTES, routeDef } from './routes';
import { href, useRoute } from './router';

class Boundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (this.state.error) {
      return (
        <div role="alert" style={{ padding: 'var(--sp-6) 0' }}>
          <h2>This screen hit a problem</h2>
          <p style={{ color: 'var(--fg-muted)' }}>{this.state.error.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

const lazyCache = new Map<string, ReturnType<typeof lazy>>();
function featureFor(name: string) {
  let c = lazyCache.get(name);
  if (!c) {
    c = lazy(routeDef(name).load);
    lazyCache.set(name, c);
  }
  return c;
}

export default function App() {
  const route = useRoute();
  const def = routeDef(route.name);
  const Feature = useMemo(() => featureFor(def.name), [def.name]);
  return (
    <div style={{ paddingLeft: 'var(--gutter)', paddingRight: 'var(--gutter-r)', maxWidth: 'var(--content-max)', margin: '0 auto' }}>
      <nav aria-label="All screens" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', paddingBlock: 'var(--sp-3)' }}>
        {ROUTES.map((r) => (
          <a key={r.name} href={href(r.name)} aria-current={r.name === def.name ? 'page' : undefined}>
            {r.title}
          </a>
        ))}
      </nav>
      <main id="main" data-route={def.name}>
        <Boundary resetKey={route.name + route.params.join('/')}>
          <Suspense fallback={<p style={{ color: 'var(--fg-muted)' }}>Loading…</p>}>
            <Feature params={route.params} />
          </Suspense>
        </Boundary>
      </main>
    </div>
  );
}
