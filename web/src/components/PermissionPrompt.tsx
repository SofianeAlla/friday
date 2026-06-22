// The "ask" gate. When the agent wants to touch something while permission mode is
// "ask", the store surfaces a pendingPermission and this card lets the user resolve it.

import { useFriday } from "@/store";

export function PermissionPrompt() {
  const { pendingPermission, resolvePermission } = useFriday();
  if (!pendingPermission) return null;

  const request = pendingPermission;

  return (
    <div className="border border-accent/40 bg-accent/5 rounded-md p-3 mb-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium uppercase tracking-bespoke-caps text-accent border border-accent/40 rounded-sm px-1.5 py-0.5">
          {request.toolName}
        </span>
      </div>
      <div className="mt-2 text-sm font-medium text-foreground">{request.title}</div>
      {request.detail && (
        <div className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">{request.detail}</div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => resolvePermission(request.id, true)}
          className="px-3 py-2 text-xs font-medium uppercase tracking-bespoke-caps rounded-sm border bg-accent text-accent-foreground border-accent transition-colors"
        >
          Allow
        </button>
        <button
          type="button"
          onClick={() => resolvePermission(request.id, false)}
          className="px-3 py-2 text-xs font-medium uppercase tracking-bespoke-caps rounded-sm border bg-secondary text-foreground border-border hover:border-accent transition-colors"
        >
          Deny
        </button>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Friday is asking because permission mode is set to “ask”.
      </div>
    </div>
  );
}
