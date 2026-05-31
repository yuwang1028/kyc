import { AppProvider, useApp } from "@/state";
import { Sidebar } from "@/components/layout/Sidebar";
import { Dashboard } from "@/views/Dashboard";
import { Cases } from "@/views/Cases";
import { CaseDetail } from "@/views/CaseDetail";
import { Intake } from "@/views/Intake";
import { Tasks } from "@/views/Tasks";

function Router() {
  const { view } = useApp();
  switch (view.kind) {
    case "dashboard": return <Dashboard />;
    case "cases": return <Cases />;
    case "case": return <CaseDetail id={view.id} />;
    case "intake": return <Intake />;
    case "tasks": return <Tasks />;
  }
}

function Shell() {
  return (
    <div className="min-h-screen bg-surface-fog text-ink font-sans">
      <div className="flex">
        <Sidebar />
        <main className="flex-1 min-w-0">
          <Router />
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
