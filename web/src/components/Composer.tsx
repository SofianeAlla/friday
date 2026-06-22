// The input. Auto-growing textarea, Enter to send (Shift+Enter for a newline),
// a round accent send button when idle, a Stop button while streaming, and a hint
// row showing the active provider + keyboard cues.

import { useEffect, useRef, useState } from "react";
import { useFriday } from "@/store";
import { CHANNEL_LABEL } from "@/lib/brand";

function ArrowUpIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </svg>
  );
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
    </svg>
  );
}

const CHANNEL_BY_KIND: Record<string, keyof typeof CHANNEL_LABEL> = {
  anthropic: "api",
  openai: "api",
  cli: "cli",
};

export function Composer() {
  const { send, stop, streaming, activeProvider, settings } = useFriday();
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grow up to ~200px.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const canSend = text.trim().length > 0 && !!activeProvider && !streaming;

  function submit() {
    if (!canSend) return;
    send(text.trim());
    setText("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const channel = activeProvider ? CHANNEL_LABEL[CHANNEL_BY_KIND[activeProvider.kind] ?? "api"] : null;

  return (
    <div>
      <div className="relative">
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Ask Friday to build, fix, or explain… (code stays hidden unless you dig in)"
          className="bg-secondary border border-border rounded-md pl-4 pr-14 py-3 focus:border-accent outline-none w-full resize-none text-sm placeholder:text-muted-foreground/70"
        />
        <div className="absolute right-2.5 bottom-2.5">
          {streaming ? (
            <button
              type="button"
              onClick={stop}
              aria-label="Stop"
              className="h-9 w-9 grid place-items-center rounded-full border border-border bg-secondary text-foreground hover:border-accent transition-colors"
            >
              <StopIcon className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              aria-label="Send"
              className="h-9 w-9 grid place-items-center rounded-full bg-accent text-accent-foreground transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ArrowUpIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 text-[10px] text-muted-foreground flex justify-between gap-3">
        <span className="truncate">
          {activeProvider ? (
            <>
              {channel && <span className="text-accent">{channel}</span>} {activeProvider.label}
              {activeProvider.model && <span className="text-muted-foreground/70"> · {activeProvider.model}</span>}
              <span className="text-muted-foreground/70"> · {settings.permissionMode}</span>
            </>
          ) : (
            <span>No model selected</span>
          )}
        </span>
        <span className="shrink-0 tabular-nums">⏎ send · ⇧⏎ newline</span>
      </div>
    </div>
  );
}
