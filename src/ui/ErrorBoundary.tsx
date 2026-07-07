import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/** Catches render errors so a single screen bug never blanks the whole app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("OpoKiller error:", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="card" style={{ margin: 16 }}>
          <h2>Algo ha fallado en esta pantalla</h2>
          <p className="muted">
            Tus datos están a salvo. Puedes reintentar o volver a Hoy. Si se repite,
            exporta una copia desde Ajustes.
          </p>
          <pre className="faint" style={{ whiteSpace: "pre-wrap", overflowX: "auto" }}>
            {this.state.error.message}
          </pre>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={this.reset}>
              Reintentar
            </button>
            <a className="btn" href="#/hoy" onClick={this.reset}>
              Ir a Hoy
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
