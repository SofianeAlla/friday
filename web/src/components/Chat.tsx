// The conversation column. Scrolls the transcript (or the Welcome hero when empty),
// renders the live streaming turn, auto-scrolls to the bottom on new content, and
// pins the permission prompt + composer to the footer.

import { useEffect, useRef } from "react";
import { useFriday } from "@/store";
import { Message } from "@/components/Message";
import { Live } from "@/components/Live";
import { Welcome } from "@/components/Welcome";
import { Composer } from "@/components/Composer";
import { PermissionPrompt } from "@/components/PermissionPrompt";
import { Meter } from "@/components/Meter";
import { ModelSwitcher } from "@/components/ModelSwitcher";
import { AutonomyToggle } from "@/components/AutonomyToggle";

export function Chat() {
  const { messages, live, compactionNote } = useFriday();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, live]);

  const empty = messages.length === 0 && !live;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto w-full px-6 py-6 space-y-5">
          {empty ? (
            <Welcome />
          ) : (
            <>
              {messages.map((m, i) => (
                <Message key={i} message={m} />
              ))}
              {live && <Live />}
            </>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-sidebar-border">
        <div className="max-w-3xl mx-auto w-full px-6 py-4">
          <PermissionPrompt />
          {compactionNote && (
            <div className="mb-2 flex items-start gap-2 rounded-sm border border-border bg-secondary/50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              <svg viewBox="0 0 24 24" width="13" height="13" className="mt-0.5 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4" /></svg>
              <span>{compactionNote}</span>
            </div>
          )}
          <Meter />
          <Composer />
          <div className="mt-2 flex items-center justify-between gap-3">
            <ModelSwitcher up />
            <AutonomyToggle />
          </div>
        </div>
      </div>
    </div>
  );
}
