import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import i18n from "@/i18n";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /**
   * Rendu de repli personnalisé en cas de crash (ex. overlays transparents :
   * on veut un repli discret, pas la carte plein écran avec bouton « accueil »).
   * `null` = ne rien afficher (l'élément fautif disparaît sans écran blanc).
   */
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Filet de sécurité global : tout crash de rendu dans l'arbre enfant est capturé
 * ici au lieu de produire un écran blanc. L'utilisateur peut réessayer (remonte
 * l'arbre) ou revenir au tableau de bord. Composant *classe* obligatoire :
 * `componentDidCatch` / `getDerivedStateFromError` n'ont pas d'équivalent hook.
 * On lit les traductions via l'instance `i18n` (pas de hook dans une classe).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Pas de service de crash distant (app 100 % locale) : on trace en console
    // pour que l'utilisateur puisse copier l'erreur dans un rapport de bug.
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  private goHome = () => {
    window.location.hash = "";
    window.location.href = "/";
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    // Repli personnalisé (overlays) : on ne rend pas la carte plein écran.
    if (this.props.fallback !== undefined) return this.props.fallback;

    const t = i18n.t.bind(i18n);
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md w-full rounded-lg border border-border/60 bg-card p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <h1 className="text-lg font-semibold">{t("errorBoundary.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("errorBoundary.desc")}
          </p>

          <div className="mt-5 flex items-center justify-center gap-2">
            <Button onClick={this.reset}>
              <RotateCcw className="h-4 w-4" />
              {t("errorBoundary.retry")}
            </Button>
            <Button variant="outline" onClick={this.goHome}>
              <Home className="h-4 w-4" />
              {t("errorBoundary.home")}
            </Button>
          </div>

          {error.message && (
            <details className="mt-5 text-left">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                {t("errorBoundary.details")}
              </summary>
              <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted/50 p-2 text-[10px] text-muted-foreground whitespace-pre-wrap">
                {error.message}
                {error.stack ? `\n\n${error.stack}` : ""}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}
