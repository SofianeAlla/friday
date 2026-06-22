import { useFriday } from "./store";
import { Header } from "@/components/Header";
import { Chat } from "@/components/Chat";
import { Todos } from "@/components/Todos";
import { CodePanel } from "@/components/CodePanel";
import { Settings } from "@/components/Settings";
import { GitPanel } from "@/components/GitPanel";
import { ImportPanel } from "@/components/ImportPanel";
import { Barn } from "@/components/Barn";
import { Benchmarks } from "@/components/Benchmarks";
import { Sidebar } from "@/components/Sidebar";
import { FridayLogo } from "@/components/FridayLogo";

export default function App() {
  const { ready, error, dismissError, todos, codePanelOpen, settingsOpen, gitOpen, importOpen, view } = useFriday();

  if (!ready) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 bg-background text-foreground">
        <FridayLogo className="h-16 w-16" />
        <div className="text-sm uppercase tracking-bespoke-caps text-muted-foreground">Booting Friday…</div>
      </div>
    );
  }

  const showRightRail = todos.length > 0;

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <Header />

      {error && (
        <div className="shrink-0 flex items-center justify-between gap-4 bg-red-500/10 border-b border-red-500/30 px-5 py-2 text-xs text-red-300">
          <span className="truncate">{error}</span>
          <button onClick={dismissError} className="shrink-0 uppercase tracking-bespoke-caps text-[10px] hover:text-red-100">
            Dismiss
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 flex">
        {view === "chat" && (
          <>
            <Sidebar />
            <main className="flex-1 min-w-0 flex flex-col bg-grid">
              <Chat />
            </main>

            {showRightRail && (
              <aside className="w-[300px] shrink-0 border-l border-sidebar-border bg-sidebar overflow-y-auto hidden lg:block">
                <Todos />
              </aside>
            )}

            {codePanelOpen && (
              <aside className="w-[440px] shrink-0 border-l border-sidebar-border bg-sidebar overflow-hidden flex flex-col">
                <CodePanel />
              </aside>
            )}
          </>
        )}

        {view === "barn" && (
          <main className="flex-1 min-w-0 overflow-y-auto"><Barn /></main>
        )}
        {view === "benchmarks" && (
          <main className="flex-1 min-w-0 overflow-y-auto"><Benchmarks /></main>
        )}
      </div>

      {settingsOpen && <Settings />}
      {gitOpen && <GitPanel />}
      {importOpen && <ImportPanel />}
    </div>
  );
}
