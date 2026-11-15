import { Component, type ErrorInfo, type ReactNode } from 'react';

interface QuietBoundaryProps {
  /** What this part is, for the console message. */
  name: string;
  /** Called once when the part fails (for example to close what it had opened). */
  onError?: () => void;
  children: ReactNode;
}

/**
 * An error boundary for the extras that live above all screens (toasts and celebrations, the
 * stats sheet, the first-run flow). If one of them breaks it simply disappears: the learner keeps
 * the app, and the screen boundary keeps handling screens.
 */
export class QuietBoundary extends Component<QuietBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[shell] ${this.props.name} failed and was switched off`, error, info.componentStack);
    this.props.onError?.();
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
