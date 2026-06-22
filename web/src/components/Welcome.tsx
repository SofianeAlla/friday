// Friday's empty-state hero. Big arc-reactor mark, the wordmark, an Iron-Man wink,
// four example-prompt cards (click → send), and a status / "add your first model" line.

import { useFriday } from "@/store";
import { FridayLogo } from "@/components/FridayLogo";
import { APP_SUBTITLE } from "@/lib/brand";

const EXAMPLES = [
  "Scaffold a REST API with Express and tests",
  "Find and fix the failing test",
  "Explain how auth works in this repo",
  "Add a dark-mode toggle to the settings page",
];

export function Welcome() {
  const { send, activeProvider, activeProject, providers, setSettingsOpen } = useFriday();
  const hasConfigured = providers.some((p) => p.configured);
  const ready = !!activeProject && !!activeProvider;

  return (
    <div className="flex flex-col items-center text-center py-10">
      <FridayLogo className="h-20 w-20" />
      <h1 className="font-display text-5xl leading-none mt-5">Friday</h1>
      <p className="mt-3 text-sm text-muted-foreground max-w-md">{APP_SUBTITLE}</p>
      <p className="mt-1 text-xs font-serif-italic text-muted-foreground/80">
        Like Tony's assistant - but for your codebase.
      </p>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
        {EXAMPLES.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => send(prompt)}
            disabled={!ready}
            className="bg-card border border-border rounded-md p-4 text-left text-sm text-foreground hover:border-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border"
          >
            {prompt}
          </button>
        ))}
      </div>

      <div className="mt-8 flex flex-col items-center gap-2">
        {!activeProject && (
          <div className="text-[11px] font-medium uppercase tracking-bespoke-caps text-muted-foreground">
            ← Add a repo in the sidebar to begin
          </div>
        )}
        {activeProject && !hasConfigured && (
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="px-3 py-2 text-xs font-medium uppercase tracking-bespoke-caps rounded-sm border bg-accent text-accent-foreground border-accent transition-colors accent-glow"
          >
            Add your first model
          </button>
        )}
        {ready && (
          <div className="text-[11px] font-medium uppercase tracking-bespoke-caps text-muted-foreground">
            Ready · <span className="text-foreground">{activeProject.name}</span> · <span className="text-accent">{activeProvider.label}</span>
          </div>
        )}
      </div>
    </div>
  );
}
