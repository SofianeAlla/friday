# Friday - UI build guide (read this before writing any component)

Friday is an **AI-first local coding agent** - a Claude Code-style experience as a
desktop-feeling web app. The user brings any model (Claude, Codex, Mistral, Gemini,
Qwen, local Ollama) and can **switch between them mid-conversation without losing
context**. The product personality is "F.R.I.D.A.Y." (Iron Man's assistant).

**AI-first means: code is hidden by default.** Tool activity (file edits, command
output, searches) renders as compact, collapsed cards. The developer expands a card
only when they want to "dig deeper". Lead with the conversation, not walls of code.

## Frozen contracts - READ THESE FILES, do not guess
- `web/src/store.tsx` - `useFriday()` returns the `FridayStore`. This is your single
  source of truth. Exports: `useFriday`, `FridayProvider`, `ToolView`, `clientToolTitle`.
- `web/src/lib/api.ts` - all data types (`Message`, `ContentBlock`, `ToolMeta`,
  `ProviderConfig`, `ProviderPreset`, `Todo`, `Settings`, `PermissionRequest`,
  `ActiveProviderInfo`, `AgentEvent`) and the `api` object (`fsTree`, `fsFile`, …).
- `web/src/lib/brand.ts` - `APP_NAME`, `APP_TAGLINE`, `APP_SUBTITLE`, `APP_BACKRONYM`,
  `THEME_COLORS`, `DEFAULT_THEME_COLOR`, `ThemeColor`, `CHANNEL_LABEL`.
- `web/src/lib/theme.ts` - `applyAccent`, `loadAccent`, `matchPreset`, `applyMode`, `loadMode`.
- `web/src/components/FridayLogo.tsx` - `<FridayLogo className glow />` (arc reactor mark).
- `web/src/index.css` - the available CSS (prose-friday, hljs styles, utilities).
- `web/src/App.tsx` - already written; shows how components compose. DO NOT edit it.

## Hard rules
- TypeScript strict. React 18 function components. Default import alias `@` = `web/src`.
- **Only these runtime deps exist**: `react`, `react-dom`, `react-markdown`, `remark-gfm`,
  `rehype-highlight`. No icon library, no UI kit, no state lib. **Draw all icons as
  inline SVGs** (small local components). Do not import anything else.
- Read everything from `useFriday()`. Components are zero-prop EXCEPT where noted.
- Dark theme is the default (`<html class="dark">`).
- Write each file with the Write tool at its exact path. Keep imports to files that
  exist or that another agent is creating per this guide (names below are authoritative).

## Design language (carried from "Marshmallow" by Bespoke AI)
Warm-dark beige palette, cyan-by-default **accent that the user can recolour live**.
Always use the semantic Tailwind tokens so recolouring + light/dark just work:
- Surfaces: `bg-background` (app), `bg-card` (raised), `bg-secondary` (inputs/chips),
  `bg-sidebar` (rails). Text: `text-foreground`, `text-muted-foreground`.
- Borders: `border-border`, `border-sidebar-border`. Accent: `text-accent`,
  `bg-accent text-accent-foreground`, `border-accent`. Use accent sparingly - active
  states, the logo, focus, emphasis.
- Radius is small; use `rounded-sm` / `rounded-md`. Numbers use `tabular-nums`.
- **Section labels** (the signature look): `text-[11px] font-medium uppercase tracking-bespoke-caps text-accent`
  (or `text-muted-foreground` for secondary). The wordmark "Friday" uses `font-display`
  (Instrument Serif). Body is DM Sans (default). Code is `font-mono` (JetBrains Mono).
- **Buttons** (standard pattern):
  `px-3 py-2 text-xs font-medium uppercase tracking-bespoke-caps rounded-sm border transition-colors`
  - active: `bg-accent text-accent-foreground border-accent`;
  - idle: `bg-secondary text-foreground border-border hover:border-accent`.
- Utilities available: `accent-glow`, `bg-grid`, `animate-pulse-ring`, `animate-shimmer`,
  `prose-friday` (markdown container), `font-serif-italic`.

## Markdown rendering recipe (use everywhere assistant/user prose is shown)
```tsx
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
// ...
<div className="prose-friday">
  <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{text}</Markdown>
</div>
```
`prose-friday` and the `hljs-*` classes are already styled in index.css.

## The FridayStore shape (from store.tsx - authoritative)
```
ready, error, providers, presets, activeProviderId, activeProvider, settings,
messages, live ({ text, toolIds, providerLabel } | null), tools (Record<id, ToolView>),
todos, streaming, pendingPermission, codePanelOpen, openFile, settingsOpen,
send(text), stop(), reset(), setActive(id), addProvider(cfg), deleteProvider(id),
updateSettings(patch), resolvePermission(id, allowed), toggleCodePanel(),
setOpenFile(path|null), setSettingsOpen(v), dismissError()
```
`ToolView = { id, name, title, input, status: "running"|"ok"|"error", resultPreview?, meta? }`.
`ToolMeta` is a discriminated union on `.kind`: `file | diff | command | list | search | glob | todos | text` (see api.ts for fields).

---

# Component specs (exact file paths + export names)

### `web/src/components/Header.tsx` → `export function Header()`
Top bar: `h-14 px-5 flex items-center justify-between border-b border-sidebar-border bg-sidebar shrink-0`.
- Left: `<FridayLogo className="h-8 w-8" />` + a stacked wordmark - `Friday` in
  `font-display text-2xl leading-none`, and under it `APP_TAGLINE` in
  `text-[10px] uppercase tracking-bespoke-caps text-muted-foreground`.
- Right cluster (gap-2, items-center): `<ProviderSwitcher />`, a permission-mode
  segmented control (auto / plan / ask reading `settings.permissionMode`, calling
  `updateSettings({ permissionMode })`), a "dig deeper" code toggle button (`</>` icon,
  active styling when `codePanelOpen`, calls `toggleCodePanel()`), `<ThemePopover />`,
  a "new session" icon button (`reset()`), and a settings gear (`setSettingsOpen(true)`).
- Inline SVG icons. Icon buttons: `h-9 w-9 grid place-items-center rounded-sm border border-border hover:border-accent text-muted-foreground hover:text-foreground`.

### `web/src/components/ProviderSwitcher.tsx` → `export function ProviderSwitcher()`
THE headline feature. A button showing the active provider: a channel badge
(`CHANNEL_LABEL[channel]` - API/CLI/Local), the label, the model in muted text, and a
chevron. Click toggles a dropdown (`bg-card border border-border rounded-md shadow-lg`,
absolute, min-w-72, z-50). List every provider; configured ones are selectable
(`setActive(id)` then close), the active one highlighted with accent + a check;
unconfigured ones dimmed with a "needs setup" tag. A footer caption in the dropdown:
"Switching keeps the full conversation - your new model picks up exactly where the last
one left off." A "+ Add or manage models" row calls `setSettingsOpen(true)`. Close on
outside click (mousedown listener on document) and on Escape. If no `activeProvider`,
the button reads "Select a model".

### `web/src/components/ThemePopover.tsx` → `export function ThemePopover()`
Round swatch button (`h-9 w-9 rounded-full border border-border`) filled with
`hsl(var(--accent))`. Click → popover (`bg-card border rounded-md shadow-lg p-3 w-64
absolute right-0 z-50`): a grid of `THEME_COLORS` swatches (circle buttons; active one
ringed; click → `updateSettings({ accent: { h, s, l } })`), a hue `<input type=range>`
0-360 that calls `updateSettings({ accent: { h: value, s: 70, l: 48 } })` (live), and a
dark/light segmented toggle (`updateSettings({ mode })`). Use `matchPreset(settings.accent)`
to mark the active swatch. Close on outside click / Escape.

### `web/src/components/Chat.tsx` → `export function Chat()`
`flex-1 min-h-0 flex flex-col`. A scroll area `flex-1 overflow-y-auto` containing a
centered column `max-w-3xl mx-auto w-full px-6 py-6 space-y-5`:
- If `messages.length === 0 && !live` → render `<Welcome />`.
- Else map `messages` → `<Message key={i} message={m} />`.
- If `live` → render `<Live />` after the messages.
Auto-scroll: keep a bottom ref and `scrollIntoView` in a `useEffect` on `[messages, live]`.
Below the scroll area, a pinned footer (`border-t border-sidebar-border`) with a centered
`max-w-3xl mx-auto w-full px-6 py-4` column containing `<PermissionPrompt />` then `<Composer />`.

### `web/src/components/Composer.tsx` → `export function Composer()`
Auto-growing `<textarea>` (max-h ~200px, `bg-secondary border border-border rounded-md
px-4 py-3 focus:border-accent outline-none w-full resize-none text-sm`). Placeholder:
"Ask Friday to build, fix, or explain… (code stays hidden unless you dig in)". Enter sends
(Shift+Enter = newline). A round send button (accent, arrow-up icon) when idle; when
`streaming`, a Stop button (`stop()`). Disable send when empty or `!activeProvider`.
Hint row under it (`text-[10px] text-muted-foreground flex justify-between`): left shows
active provider label + model + permission mode; right shows "⏎ send · ⇧⏎ newline".

### `web/src/components/Welcome.tsx` → `export function Welcome()`
Centered empty-state hero: `<FridayLogo className="h-20 w-20" />`, "Friday" in
`font-display text-5xl`, then `APP_SUBTITLE`, then a subtle Iron-Man line (e.g.
"Like Tony's assistant - but for your codebase."). A responsive grid (2 cols) of 4
example-prompt cards (`bg-card border border-border rounded-md p-4 text-left
hover:border-accent`); clicking calls `send(prompt)`. Examples like: "Scaffold a REST API
with Express and tests", "Find and fix the failing test", "Explain how auth works in this
repo", "Add a dark-mode toggle to the settings page". Below: a status line - if there are
configured providers show "Ready · <activeProvider label>"; if none, a prominent accent
button "Add your first model" → `setSettingsOpen(true)".

### `web/src/components/PermissionPrompt.tsx` → `export function PermissionPrompt()`
If `!pendingPermission` return null. Card `border border-accent/40 bg-accent/5 rounded-md
p-3 mb-3`: a small `toolName` badge, the `request.title` (font-medium), the `request.detail`
(muted), and two buttons - Allow (accent) → `resolvePermission(request.id, true)`, Deny →
`resolvePermission(request.id, false)`. One line: "Friday is asking because permission
mode is set to “ask”."

### `web/src/components/Message.tsx` → `export function Message({ message }: { message: Message })`
Render one canonical message. Get `tools` and `clientToolTitle` from the store/import.
- `message.role === "user"`: if the content has NO text block (only `tool_result`) →
  return `null` (internal). Otherwise a right-aligned bubble: `ml-auto max-w-[85%]
  bg-secondary border border-border rounded-md px-4 py-2.5 text-sm whitespace-pre-wrap`
  containing the joined text.
- `message.role === "assistant"`: a left-aligned block (full width). If
  `message.providerLabel`, show it as a tiny muted uppercase tracked badge above. Then
  iterate `message.content` in order: `text` blocks → markdown (prose-friday); `tool_use`
  blocks → `<ToolActivity view={tools[block.id] ?? makeFallback(block)} />` where the
  fallback is `{ id: block.id, name: block.name, title: clientToolTitle(block.name,
  block.input), input: block.input, status: "ok" }`.

### `web/src/components/Live.tsx` → `export function Live()`
Reads `live`, `tools`, `streaming` from the store. Mirrors an assistant `Message`:
optional provider label, the `live.text` rendered as markdown, then the tool chips for
`live.toolIds` in order via `<ToolActivity />`. If `live.text` is empty and no tools yet,
show a thinking indicator (three pulsing dots or a shimmer bar using `animate-pulse`/
`animate-shimmer`). Add a subtle blinking caret at the end while `streaming`.

### `web/src/components/ToolActivity.tsx` → `export function ToolActivity({ view }: { view: ToolView })`
The most important AI-first piece. **Collapsed by default.** Local `useState(false)` for expanded.
- Header row (clickable, toggles expand): `w-full flex items-center gap-2 bg-secondary/40
  border border-border rounded-sm px-2.5 py-1.5 hover:border-accent text-left`:
  - a tool icon (inline SVG per `view.name`: read=eye/doc, write=plus-doc, edit=pencil,
    list=folder, glob=search-files, grep=search, run_command=terminal, todo_write=checklist),
  - a status indicator: `running` → pulsing accent dot (`animate-pulse`), `ok` → small
    accent/green check, `error` → red dot,
  - `view.title` (text-sm, truncate),
  - right side: a compact stat from `view.meta` + a chevron that rotates when expanded.
    Stats: diff → `+{added} −{removed}` (created badge if `created`); command →
    `exit {exitCode}` (red if non-zero); search → `{matches.length} hits`; glob →
    `{files.length} files`; list → `{entries.length} items`.
- Expanded panel (`mt-1 border border-border rounded-sm bg-card overflow-hidden`): switch on
  `view.meta?.kind`:
  - `diff`: path header; a mono `<pre>` (`max-h-80 overflow-auto text-xs`) where lines
    beginning with `+` are green (`text-emerald-400`), `-` red (`text-red-400`), else muted.
  - `file`: path header; mono `<pre>` of `content` (max-h-80 overflow-auto); show "(truncated)" if `truncated`.
  - `command`: a `$ {command}` line; stdout in mono; stderr in `text-red-400` mono; an
    `exit {code}` badge. (max-h-80 overflow-auto)
  - `list`: entries as rows (folder icon for dir, file icon for file); clicking a file row
    calls `useFriday().setOpenFile(meta.path + "/" + name)`? - actually entries don't carry
    full path; just render names (dirs first). Non-clickable is fine.
  - `search`: rows `path:line` (accent) + matched `text` (muted mono); clicking a row calls
    `setOpenFile(path)`.
  - `glob`: file paths as a mono list; clicking calls `setOpenFile(path)`.
  - `todos`: render the todo list with status markers.
  - else / `text`: show `view.resultPreview` in a mono `<pre>` if present, else nothing.
- If `view.status === "running"` and no meta yet, show a subtle "working…" shimmer in the body.

### `web/src/components/Todos.tsx` → `export function Todos()`
Right-rail "Plan" panel (`p-5`). A section label "Plan" + `{done}/{total}` count and a thin
progress bar (`h-1 rounded-full bg-border` with an inner `bg-accent` width = done/total).
List `todos`: `completed` → accent check + `line-through text-muted-foreground`;
`in_progress` → pulsing accent dot + `text-foreground font-medium`; `pending` → empty
muted circle + `text-muted-foreground`. If no todos, render nothing (App hides the rail).

### `web/src/components/CodePanel.tsx` → `export function CodePanel()`
"Dig deeper" explorer + viewer. Header (`px-4 h-12 flex items-center justify-between
border-b border-sidebar-border`): a "Code" section label + a close button
(`toggleCodePanel()`). Body splits vertically: a file tree (`h-1/3 min-h-[160px]
overflow-auto border-b border-sidebar-border p-2`) and a viewer (`flex-1 overflow-auto`).
- Tree: on mount call `api.fsTree()` for the root; render entries (dirs first, folder/file
  icons). Folders expand/collapse on click, lazily loading children via
  `api.fsTree(path)` and caching in local state (a `Record<path, entries>` + a `Set` of
  open paths). Files: on click call `setOpenFile(path)` and load `api.fsFile(path)`.
- Viewer: when a file is loaded, show its path then the content syntax-highlighted. Easiest:
  render with react-markdown by wrapping content in a fenced code block string of the file's
  language (so rehype-highlight colours it), inside `prose-friday`. Cap nothing extra - the
  backend already truncates large files. If `openFile` is null, show a muted hint
  "Select a file to inspect." React to `openFile` changes via `useEffect`.

### `web/src/components/Settings.tsx` → `export function Settings()`
A right-hand drawer over a scrim: outer `fixed inset-0 z-50 bg-black/50 flex justify-end`
(clicking the scrim calls `setSettingsOpen(false)`); inner panel `w-full max-w-[600px] h-full
bg-background border-l border-sidebar-border overflow-y-auto` (stopPropagation on click).
Header (sticky): "Settings" + close button. Sections, each led by a section label:
1. **Models** - list `providers`: each row shows channel badge (`CHANNEL_LABEL`), label,
   model, and `configured`/active state. Actions: "Use" (`setActive(id)`, hidden/disabled
   if active or not configured), "Edit" (inline expand with fields by kind - `apiKey`
   (type=password, show `••••••` placeholder if already set), `baseUrl`, `model`, `command`
   - Save calls `addProvider({ id, ...fields })`), "Delete" (`deleteProvider(id)`).
   Then "**Add a model**": render `presets` grouped by `channel` (api / cli / local) as
   cards (label + blurb + a badge). Clicking a preset reveals a small form pre-filled from
   the preset's `default*` values, asking for the fields in `preset.needs`; Save calls
   `addProvider({ preset: preset.preset, label, model, apiKey, baseUrl, command })`.
   Make the three channels legible: API = paste a key; CLI = uses an installed agent /
   your subscription; Local = offline via Ollama.
2. **Working directory** - text input bound to `settings.cwd` + a Save button
   (`updateSettings({ cwd })`). Caption: "The project Friday reads and edits."
3. **Permissions** - segmented auto / plan / ask (`updateSettings({ permissionMode })`)
   with one-line descriptions (auto = run freely; plan = never writes/runs; ask = confirm
   each change).
4. **Appearance** - `THEME_COLORS` swatches (`updateSettings({ accent })`), a hue slider,
   and a dark/light toggle (`updateSettings({ mode })`).
Use inline SVG icons. Keep inputs styled like the rest (`bg-secondary border border-border
rounded-sm px-3 py-2 text-sm focus:border-accent outline-none`).
