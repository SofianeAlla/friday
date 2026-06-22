// Reads a fetch streaming response body and yields complete text lines.
// Both the Anthropic and OpenAI wire formats are line-delimited SSE, so the
// adapters share this and parse the `data:`/`event:` lines themselves.
export async function* streamLines(res: Response): AsyncGenerator<string> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, "");
      buf = buf.slice(nl + 1);
      yield line;
    }
  }
  if (buf.length) yield buf;
}

export async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const j = JSON.parse(text);
    return j?.error?.message || j?.message || text || `HTTP ${res.status}`;
  } catch {
    return text || `HTTP ${res.status} ${res.statusText}`;
  }
}
