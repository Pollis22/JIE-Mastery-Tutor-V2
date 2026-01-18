import { Suspense, ComponentType, LazyExoticComponent, Component as ReactComponent } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { Redirect, Route } from "wouter";

type LazyOrRegularComponent = ComponentType<any> | LazyExoticComponent<ComponentType<any>>;

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class LazyLoadErrorBoundary extends ReactComponent<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[LazyLoad] Failed to load component:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Page Failed to Load</h2>
          <p className="text-muted-foreground mb-4 max-w-md">
            There was an issue loading this page. This may be due to a network issue or an outdated cached version.
          </p>
          <button
            onClick={this.handleRetry}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            <RefreshCw className="h-4 w-4" />
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function ComponentWrapper({ Component }: { Component: LazyOrRegularComponent }) {
  return (
    <LazyLoadErrorBoundary>
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-border" />
        </div>
      }>
        <Component />
      </Suspense>
    </LazyLoadErrorBoundary>
  );
}

export function ProtectedRoute({
  path,
  component: Component,
}: {
  path: string;
  component: LazyOrRegularComponent;
}) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Route path={path}>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-border" />
        </div>
      </Route>
    );
  }

  if (!user) {
    return (
      <Route path={path}>
        <Redirect to="/auth" />
      </Route>
    );
  }

  return (
    <Route path={path}>
      <ComponentWrapper Component={Component} />
    </Route>
  );
}

export function PublicOrAuthRoute({
  path,
  publicComponent: PublicComponent,
  authComponent: AuthComponent,
}: {
  path: string;
  publicComponent: LazyOrRegularComponent;
  authComponent: LazyOrRegularComponent;
}) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Route path={path}>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-border" />
        </div>
      </Route>
    );
  }

  return (
    <Route path={path}>
      {user ? <ComponentWrapper Component={AuthComponent} /> : <ComponentWrapper Component={PublicComponent} />}
    </Route>
  );
}

export function LazyRoute({
  path,
  component: Component,
}: {
  path?: string;
  component: LazyOrRegularComponent;
}) {
  return (
    <Route path={path}>
      <ComponentWrapper Component={Component} />
    </Route>
  );
}
