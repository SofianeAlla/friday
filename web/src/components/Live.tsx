// The in-flight assistant turn. Mirrors an assistant Message: optional provider
// label, streaming markdown, then the live tool chips in order. While nothing has
// arrived yet, show a thinking indicator; while streaming, a blinking caret.

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useFriday, clientToolTitle, type ToolView } from "@/store";
import { ToolActivity } from "@/components/ToolActivity";

export function Live() {
  const { live, tools, streaming } = useFriday();
  if (!live) return null;

  const hasText = live.text.trim().length > 0;
  const hasTools = live.toolIds.length > 0;

  return (
    <div className="space-y-2">
      {live.providerLabel && (
        <div className="text-[10px] font-medium uppercase tracking-bespoke-caps text-muted-foreground">
          {live.providerLabel}
        </div>
      )}

      {hasText && (
        <div className="prose-friday">
          <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
            {streaming ? live.text + "█" : live.text}
          </Markdown>
        </div>
      )}

      {live.toolIds.map((id) => {
        const view: ToolView =
          tools[id] ?? {
            id,
            name: "",
            title: clientToolTitle("", {}),
            input: {},
            status: "running",
          };
        return <ToolActivity key={id} view={view} />;
      })}

      {!hasText && !hasTools && <ThinkingDots />}
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1.5 py-1" aria-label="Friday is thinking">
      <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" style={{ animationDelay: "0ms" }} />
      <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" style={{ animationDelay: "150ms" }} />
      <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" style={{ animationDelay: "300ms" }} />
    </div>
  );
}
