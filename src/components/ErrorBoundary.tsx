import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Shows a readable message instead of a blank screen if any screen crashes. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('AS Signal Bot crashed:', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="app">
        <div className="card crash">
          <div className="label">Something went wrong</div>
          <p>The app hit an unexpected error. Your settings and signal log are saved.</p>
          <pre>{this.state.error.message}</pre>
          <button className="cta" type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
