import { Suspense, ComponentType, LazyExoticComponent } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect, Route } from "wouter";

type LazyOrRegularComponent = ComponentType<any> | LazyExoticComponent<ComponentType<any>>;

function ComponentWrapper({ Component }: { Component: LazyOrRegularComponent }) {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    }>
      <Component />
    </Suspense>
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
