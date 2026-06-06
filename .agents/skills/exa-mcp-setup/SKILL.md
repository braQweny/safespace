---
name: exa-mcp-setup
description: Configure or verify the Exa Web Search MCP server for Codex. Use when the user asks to install Exa MCP, add Exa web search/page fetch tools to Codex, enable Exa advanced search, check Exa MCP auth, troubleshoot missing Exa MCP tools, or turn Exa MCP setup docs into an executable Codex workflow.
---

# Exa MCP Setup

Configure the remote Exa MCP server for Codex without touching project code. The canonical reference is `https://docs.exa.ai/reference/exa-mcp`; if local instructions and live docs disagree, follow the live docs and report the stale detail.

## Inputs

Accept a short mode from the user:

- `default` or no mode: use `https://mcp.exa.ai/mcp`.
- `advanced`: use `https://mcp.exa.ai/mcp?tools=web_search_advanced_exa`.
- `all`: use `https://mcp.exa.ai/mcp?tools=web_search_exa,web_fetch_exa,web_search_advanced_exa`.
- `verify`: inspect current config and tool visibility only.
- `replace`: replace an existing `exa` MCP entry after confirming the current value is wrong.

If the user provides a full Exa MCP URL, use it after validating that it starts with `https://mcp.exa.ai/mcp`.

## Workflow

1. Check current Codex MCP syntax before giving or running commands:

```bash
codex mcp add --help
codex mcp login --help
codex mcp get exa
```

2. Fetch the canonical Exa MCP docs when any of these are true:
   - The user asks for the latest/current setup.
   - Auth, tool names, API key behavior, or URL parameters are relevant.
   - A pasted guide says "OAuth only" or "no API key needed" but the docs mention API key or headers.
   - `codex mcp add --help` no longer supports `--url`.

3. Choose the target URL:

```text
default:  https://mcp.exa.ai/mcp
advanced: https://mcp.exa.ai/mcp?tools=web_search_advanced_exa
all:      https://mcp.exa.ai/mcp?tools=web_search_exa,web_fetch_exa,web_search_advanced_exa
```

4. If `codex mcp get exa` shows no server, add it:

```bash
codex mcp add exa --url '<target-url>'
```

5. If `exa` already exists:
   - If the URL matches the target, do not re-add it. Continue to auth and verification.
   - If the URL differs and the user did not request `replace`, show the current and target URLs and ask before changing.
   - If replacement is confirmed or explicitly requested, run:

```bash
codex mcp remove exa
codex mcp add exa --url '<target-url>'
```

6. Authentication:
   - Prefer the remote MCP/OAuth flow when available:

```bash
codex mcp login exa
```

   - Do not request, print, or commit Exa API keys unless the user explicitly needs higher rate limits or production use.
   - If current Exa docs require an API key for the selected path, tell the user this is a staleness change from OAuth-only guidance. Keep secrets out of repo files and shell history where possible.

7. Verification:

```bash
codex mcp get exa
codex mcp list
```

Then tell the user to restart Codex if tools do not appear. In a new Codex session, confirm that Exa tools are discoverable before relying on them.

## Staleness Reporting

When live docs differ from pasted instructions, report the delta briefly:

- `setup command`: current docs say `<current>`, pasted guide said `<old>`.
- `tool set`: current docs list `<current>`.
- `auth`: current docs say `<current>`, pasted guide said `<old>`.
- `manual action`: restart Codex, run `codex mcp login exa`, or add an API key only if docs require it.

Current known doc shape, verified from Exa docs on 2026-06-06:

- Codex setup command: `codex mcp add exa --url https://mcp.exa.ai/mcp`.
- Default tools: `web_search_exa`, `web_fetch_exa`.
- Optional advanced tool: `web_search_advanced_exa` via `tools=` query param.
- Deprecated tools should not be enabled for new setups.
- Exa docs describe an optional API key path for rate limits/production; do not assume OAuth-only behavior without re-checking.

## Boundaries

- Do not modify application source, `AGENTS.md`, `.env`, `.dev.vars`, or repo deployment files for this setup.
- Do not write secrets to project files.
- Do not silently overwrite an existing MCP server with a different URL.
- Do not keep troubleshooting from memory when the canonical Exa page or `codex mcp --help` is available.
