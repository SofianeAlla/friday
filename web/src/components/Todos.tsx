// Right-rail "Plan" panel. Renders the agent's todo list with a progress bar.
// Reads `todos` from the store. If empty, renders nothing (App hides the rail).

import { useFriday } from "@/store";
import type { Todo } from "@/lib/api";

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}

export function Todos() {
  const { todos } = useFriday();
  if (todos.length === 0) return null;

  const total = todos.length;
  const done = todos.filter((t) => t.status === "completed").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-bespoke-caps text-accent">Plan</span>
        <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
          {done}/{total}
        </span>
      </div>

      <div className="mt-3 h-1 rounded-full bg-border overflow-hidden">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="mt-4 space-y-2.5">
        {todos.map((todo) => (
          <TodoRow key={todo.id} todo={todo} />
        ))}
      </ul>
    </div>
  );
}

function TodoRow({ todo }: { todo: Todo }) {
  if (todo.status === "completed") {
    return (
      <li className="flex items-start gap-2.5 text-sm">
        <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border border-accent text-accent">
          <CheckIcon className="h-3 w-3" />
        </span>
        <span className="line-through text-muted-foreground">{todo.content}</span>
      </li>
    );
  }

  if (todo.status === "in_progress") {
    return (
      <li className="flex items-start gap-2.5 text-sm">
        <span className="mt-1 grid h-4 w-4 shrink-0 place-items-center">
          <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
        </span>
        <span className="text-foreground font-medium">{todo.content}</span>
      </li>
    );
  }

  return (
    <li className="flex items-start gap-2.5 text-sm">
      <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border border-muted-foreground/50" />
      <span className="text-muted-foreground">{todo.content}</span>
    </li>
  );
}
