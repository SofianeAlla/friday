<div align="center">

# ⚡ Friday

**Your coding agent, on call.**

An AI-first, local coding agent with the exact feel of Claude Code - but you bring
*any* model (Claude, Codex, Mistral, Gemini, Qwen, or a local open-source model),
and you can **switch between them mid-task without losing context.**

*No VS Code. No ugly terminal. Code stays hidden until you want to dig in.*

</div>

---

## Why Friday

> "I hate VS Code, the CLI is ugly, and I want to switch from one coding agent to
> another without losing my context."

Friday solves exactly that:

- **One conversation, many brains.** Every message lives in a single
  *provider-neutral* transcript. Switching the active model just re-serialises that
  same history for the next model - so Claude can start a task, Gemini can continue it,
  and Qwen (running locally) can finish it, all with full context.
- **AI-first.** You talk to the agent. File edits, diffs, command output and searches
  show up as **collapsed cards** - expand one only when you want to see the code.
- **Bring your own everything.** Add a provider by **API key**, by **CLI** (drive your
  installed `claude` / `codex` / `gemini` in print mode - uses your subscription), or
  **fully local** via Ollama. Switch with one click in the header.
- **Switch model *and* provider.** A **Model** switcher in the bottom bar (below the chat,
  Claude Code-style) changes the exact model for the active provider - including CLIs like
  Claude Code (Friday passes it through as `--model`). Picking the model also sets the right
  **context window** in the meter (e.g. Claude → 1M instead of the 128K default).
- **Remote control from your phone** - drive Friday while it codes, from anywhere.
  **Telegram (recommended, free):** create a bot with @BotFather, name it "Friday" + set its
  logo, paste the token in Settings → Remote, Connect, and `/start` your bot - you get a real
  **"Friday" chat with a logo**, officially and for free, with no tunnel (it long-polls).
  **WhatsApp (beta):** link via QR (uses your own "Message yourself" chat). Either way it's
  locked to you, remote autonomy is capped (Plan / Ask / Auto-edit - never Full-auto), "Ask"
  sends a *reply YES/NO*, and a built-in **Simulate** tester exercises the bridge with no setup.
- **Projects & conversations** - add a repo/folder as a **project**; each project keeps its
  own list of **conversations** (just like Claude Code). Switch projects to swap the working
  directory + conversation history; start as many threads per repo as you like.
- **Autonomy levels** - **Plan** (read-only) → **Ask** (confirm each step) → **Auto-edit**
  (apply edits, confirm commands) → **Full-auto**. And a **reasoning-effort** control
  (default→max) that appears automatically when the active model's API supports it
  (Claude Opus/​Fable, GPT-5.x, Grok 4, Gemini 3, Mistral Medium, Qwen3, DeepSeek V4…).
- **Context + cost meter** - above the composer: how full the model's **context window**
  is (live bar + %), and billing that matches how you actually pay - **API key** → metered
  cost estimate (tokens × per-model price); **CLI agent** (Claude Code / Codex / Gemini) →
  *"Your plan / subscription - not metered here"* (or, if you give the CLI an API key in
  Settings, *"Your API key - billed by provider"*; either way the CLI bills you, not Friday);
  **local Ollama** → *free*. Plus the **credit balance** where the provider's API exposes it
  (e.g. DeepSeek; most don't - it says so honestly).
- **The Barn 🐎** - a curated stable of the best open-weight coding models (GLM, DeepSeek,
  Kimi, MiniMax, Qwen, Devstral, Codestral…). Click **Install**: **local models run through a
  runtime Friday provisions for you** (it downloads & runs the official open-source engine
  into the app's own data dir on first use - no separate install, fully offline); **for API
  models you paste your key right on the card** ("Add API key" → "Connect & use") and you're
  coding immediately - no Settings detour. Already-pulled local models show **"Use"** instead
  of "Install"; **Settings → Local models** lists what's installed (with size) and lets you
  remove them. Every model shows its brand logo.
- **Benchmarks 📊** - see who leads at coding across **closed-source**, **open-weight**, or
  **all**, sorted by SWE-bench Verified / SWE-Bench Pro / LiveBench.
- **Make it yours.** The whole app recolours live - pick an accent (Arc Reactor cyan,
  Stark Gold, Repulsor Blue…) or drag the hue slider.
- **Same toolbelt as Claude Code:** read / write / edit files, list / glob / grep,
  run shell commands, a live task plan, and a permission mode (auto / plan / ask).

The visual identity is carried over from the **Marshmallow** design language
(warm-dark beige, Instrument Serif display, cyan accent), with Friday's own
Iron-Man arc-reactor mark.

---

## Quick start - Windows · Linux · macOS

> Requires **Node 18+** (20+ recommended). Identical on all three OSes.

**One command:**

```bash
# macOS / Linux
./install.sh
```
```powershell
# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

**Or manually (any OS):**

```bash
cd Friday
npm run setup      # installs root + server + web deps
npm run dev        # backend (:8787) + frontend (:5173), auto-opens your browser
```

Friday opens at **http://localhost:5173**. The local-model runtime and agent CLIs are
installed on demand - Ollama via download, Claude/Codex/Gemini via npm, Mistral Vibe via
`uv`/`pip` - with the right method per OS and no manual setup. Set **`FRIDAY_HOME`** to pin
where Friday stores its config + managed runtimes (defaults to `.friday/` in the app folder).

On first launch Friday reads any provider keys it finds in your environment
(see `.env.example`) and pre-fills the matching models. You can also add/edit
everything from **Settings → Models** - nothing leaves your machine except the calls
you make to the providers you configure (config is stored in `server/.friday/`).

### Add a model

Open **Settings** (gear, top-right) → **Models** → **Add a model**, then pick a preset:

| Channel | Examples | What you provide |
|---|---|---|
| **API** | Claude, OpenAI/Codex, **Grok (xAI)**, Mistral, Gemini, Qwen, plus **Custom** (any OpenAI-compatible API: OpenRouter, Together, Groq, Fireworks, vLLM…) | an API key (base URL + model pre-filled, all editable) |
| **CLI** | Claude Code, Codex, Gemini CLIs | **Friday installs the CLI for you** (managed npm install, in its own dir) and runs it in print mode - uses your subscription/login. Already-installed CLIs are detected and used as-is. |
| **Local** | Qwen3-Coder, Devstral, Codestral | one-click from **The Barn** - Friday installs & runs the local engine for you (no separate install), fully offline, no key |

Switch the active model anytime from the **provider switcher** in the header. The
conversation (and your task plan) carry over untouched.

---

## How it works

```
web/  (Vite + React + Tailwind)         server/  (Node + Express, run with tsx)
 ├─ AI-first chat UI                      ├─ providers/   anthropic · openai-compatible · cli
 ├─ provider switcher (live)             │                + catalog of presets
 ├─ collapsed tool cards (dig deeper)     ├─ tools/        read/write/edit/list/glob/grep/run/todos
 ├─ live recolour + dark/light            ├─ agent/        provider-neutral agentic loop + SSE events
 └─ file explorer ("Code" panel)          ├─ session/      persisted canonical transcript
                                          └─ index.ts      REST + SSE + permission broker
```

**The trick to lossless model-switching** lives in
[`server/src/providers/types.ts`](server/src/providers/types.ts): one canonical message
shape (`text` / `tool_use` / `tool_result` blocks). Each adapter only translates that
shape to/from its own wire format:

- **Anthropic** - native Messages API (the canonical shape *is* Anthropic's shape).
- **OpenAI-compatible** - one adapter for OpenAI/Codex, Mistral, Gemini's compat
  endpoint, Qwen/DashScope, Ollama, LM Studio, vLLM… (just a base URL + model + key).
- **CLI** - spawns an external agent in print mode and streams its stdout; the same
  transcript is rendered into the prompt so context still carries over.

Because the transcript is never stored in a provider-specific format, changing the
active provider is just "serialise the same history for the next model."

---

## Scripts

| Command | What |
|---|---|
| `npm run setup` | install all dependencies (root + server + web) |
| `npm run dev` | run backend + frontend together (hot reload) |
| `npm run build` | type-check + build the web app to `web/dist` |
| `npm start` | run the backend; if `web/dist` exists it's served at `:8787` |

Per-package: `npm --prefix server run typecheck` and `npm --prefix web run typecheck`.

---

## Autonomy levels (bottom bar, below the chat - least → most autonomous)

- **Plan** - read-only; Friday plans but never writes or runs.
- **Ask** - confirm every file edit and shell command.
- **Auto-edit** - auto-apply file edits; still confirm shell commands.
- **Full-auto** - full autonomy, no prompts.

Plus a **reasoning-effort** selector (default / low / medium / high / max) that appears
only when the active model's API exposes it - sent as `output_config.effort` (Anthropic)
or `reasoning_effort` (OpenAI-compatible).

---

## Verification

The catalog (base URLs, model IDs, Ollama tags) was **web-verified against official docs
on 2026-06-16**, including a dedicated "latest closed model" pass:
- **Claude** `claude-opus-4-8` (coding default; Fable 5 is more capable but its access is
  currently suspended industry-wide), **OpenAI** `gpt-5.5` (powers Codex), **Gemini**
  `gemini-3.5-flash` (newest GA; 3.5 Pro not yet callable), **Grok** `grok-4.3`,
  **Mistral** `mistral-medium-2604` (Mistral Medium 3.5 - *now beats Devstral 2*).
- Open-weight: Z.ai `glm-5.2`, DeepSeek `deepseek-v4-pro` (`api.deepseek.com`),
  `MiniMax-M3`, `kimi-k2.6`, DashScope `qwen3-coder-plus`, and Ollama tags
  `qwen3-coder:30b` / `qwen3.6:27b` / `devstral` / `codestral` / `qwen2.5-coder:14b`.

Every model space moves monthly, so all of these are **editable defaults** (Settings →
Models → Edit), and each configured provider has a backend **test-connection** check
(the small `Test` button) that makes a 1-token ping with your real key and reports ✅/❌.

## Notes

- **Local runtime is managed for you.** The first time you install a local model from The
  Barn, Friday reuses a system install if you have one, otherwise downloads the official
  open-source engine (Apache-2.0) into `server/.friday/runtime/` and runs it as a child
  process with its own model store. No manual install, and it's removed if you delete that
  folder. (The one-time runtime download is large; it streams with a progress bar.)
- **CLIs are managed too.** Pick a CLI provider (Claude Code / Codex / Gemini / Mistral Vibe)
  and, if it isn't found, **Settings → Models shows "Install CLI for me"** - Friday installs
  it with the right tool (npm for Claude/Codex/Gemini into `server/.friday/runtime/cli/`;
  **`uv`/`pip`** for Mistral Vibe, which is a Python tool) and points the provider at the
  binary. If the needed installer or package is missing, you get the exact reason + the manual
  command. Each CLI still handles its own login/auth. (The Barn's heavy-model cards also warn when a local model
  needs more memory than your machine has.)
- **Remote: Telegram is the recommended free channel.** It's official, free, gives a named
  "Friday" bot with a logo, and needs no public tunnel (long-polling). The bridge (owner
  allowlist, autonomy cap, routing) is solid and testable via **Simulate**; the live bot
  needs your BotFather token. **WhatsApp is best-effort** - `whatsapp-web.js` links *as you*
  (no separate "Friday" contact; you use your "Message yourself" chat), drives a headless
  browser, and uses the unofficial protocol (small risk to the number). Prefer Telegram.
- Default model ids are sensible, *editable* defaults - type a newer model in Settings
  anytime; new releases never block you.
- The "Code" panel is read-only and sandboxed to your working directory.
- Friday is a local dev tool; commands run with your user's permissions. Use **Ask**
  mode if you want a confirmation gate.

<div align="center"><sub>Brand identity adapted from Marshmallow · "F.R.I.D.A.Y." is an Iron-Man wink.</sub></div>
