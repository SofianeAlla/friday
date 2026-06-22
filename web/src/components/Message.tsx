// One canonical transcript message. AI-first: tool activity renders as compact
// collapsed cards (ToolActivity), so prose leads and code hides until you dig in.
// User messages that carry only a tool_result (no text) are internal - render null.

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useFriday, clientToolTitle, type ToolView } from "@/store";
import type { Message as MessageData } from "@/lib/api";
import { ToolActivity } from "@/components/ToolActivity";

export function Message({ message }: { message: MessageData }) {
  const { tools } = useFriday();

  if (message.role === "user") {
    const text = message.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    // tool_result-only user turns are internal plumbing - don't show them.
    if (!text) return null;
    return (
      <div className="ml-auto max-w-[85%] bg-secondary border border-border rounded-md px-4 py-2.5 text-sm whitespace-pre-wrap">
        {text}
      </div>
    );
  }

  // assistant - left-aligned, full width, content in order.
  return (
    <div className="space-y-2">
      {message.providerLabel && (
        <div className="text-[10px] font-medium uppercase tracking-bespoke-caps text-muted-foreground">
          {message.providerLabel}
        </div>
      )}
      {message.content.map((block, i) => {
        if (block.type === "text") {
          if (!block.text.trim()) return null;
          return (
            <div key={i} className="prose-friday">
              <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                {block.text}
              </Markdown>
            </div>
          );
        }
        if (block.type === "tool_use") {
          const view: ToolView =
            tools[block.id] ?? {
              id: block.id,
              name: block.name,
              title: clientToolTitle(block.name, block.input),
              input: block.input,
              status: "ok",
            };
          return <ToolActivity key={block.id} view={view} />;
        }
        // tool_result blocks inside an assistant message are not rendered here.
        return null;
      })}
    </div>
  );
}
