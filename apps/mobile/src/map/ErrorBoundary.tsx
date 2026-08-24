import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback: (fout: Error) => ReactNode;
}

interface State {
  fout: Error | null;
}

/**
 * Vangt fouten uit de kaartcomponent op. De belangrijkste echte oorzaak:
 * de app draait in Expo Go, waar de native MapLibre-module niet bestaat.
 * Zonder deze grens is dat een wit scherm zonder uitleg.
 */
export class MapErrorBoundary extends Component<Props, State> {
  override state: State = { fout: null };

  static getDerivedStateFromError(fout: Error): State {
    return { fout };
  }

  override render(): ReactNode {
    return this.state.fout ? this.props.fallback(this.state.fout) : this.props.children;
  }
}
