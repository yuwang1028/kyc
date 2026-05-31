import * as React from "react";

export type View =
  | { kind: "dashboard" }
  | { kind: "cases" }
  | { kind: "case"; id: string }
  | { kind: "intake" }
  | { kind: "tasks" };

type Ctx = {
  view: View;
  go: (v: View) => void;
};

const AppCtx = React.createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [view, setView] = React.useState<View>({ kind: "dashboard" });
  return (
    <AppCtx.Provider value={{ view, go: setView }}>{children}</AppCtx.Provider>
  );
}

export function useApp() {
  const c = React.useContext(AppCtx);
  if (!c) throw new Error("AppProvider missing");
  return c;
}
