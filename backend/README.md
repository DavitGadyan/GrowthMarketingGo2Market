# GrowthPilot backend

FastAPI + Claude Agent SDK. Runs the 14-stage growth-marketing / go-to-market
pipeline for a company, proposes execution tasks, and executes the ones you
approve through MCP integrations (Gmail drafts, Higgsfield creatives, Firecrawl
research).

## Run

```bash
cd backend
uv venv .venv --python 3.12 && . .venv/bin/activate
uv pip install -r requirements.txt
cp ../.env.example .env            # edit as needed
uvicorn app.main:app --reload --port 8000
```

Open http://localhost:8000/docs for the OpenAPI UI. The frontend expects the API
at `http://localhost:8000/api`.

## Modes

- **Real agents** (default): needs `ANTHROPIC_API_KEY` *or* a logged-in Claude
  Code CLI (`claude login`) on PATH. Stages use `claude-opus-5-5`; content
  tasks use `claude-sonnet-5-5`. Per-stage / per-task spend is capped by
  `MAX_BUDGET_USD_PER_STAGE` / `MAX_BUDGET_USD_PER_TASK`.
- **Fake agents**: `GROWTHPILOT_FAKE_AGENTS=1` runs a deterministic, network-free
  runner that produces schema-valid, course-example numbers (SAM $450M, SOM
  $13.5M, ...). Use it for demos without a key and for the tests.

## Integrations

| Name | Connected when | What the agents may do |
|---|---|---|
| anthropic | `ANTHROPIC_API_KEY` or `claude` CLI on PATH | run stages and tasks |
| firecrawl | `FIRECRAWL_API_KEY` | deep competitor crawls (`npx -y firecrawl-mcp`) |
| gmail | `GMAIL_MCP_COMMAND` (a stdio Gmail MCP server) or the `GOOGLE_OAUTH_*` triple | **create drafts only** - send tools are disallowed |
| higgsfield | `HIGGSFIELD_MCP_URL` + `HIGGSFIELD_MCP_TOKEN` | quote first; rendering is a separate task that needs its own approval |

Tasks that need an integration you have not connected are created as
`blocked` with the message "Connect <name> to run".

## Tests

```bash
.venv/bin/python -m pytest -q
```

## Layout

- `app/schemas.py` - company profile, stage output schemas, API shapes
- `app/calculators.py` - TAM/SAM/SOM, reverse waterfall, lift, CPM (course formulas)
- `app/prompts/` - one prompt per stage and per execution agent
- `app/runner.py` - `SdkRunner` (Claude Agent SDK) and `FakeRunner`
- `app/orchestrator.py` - the 14-stage pipeline
- `app/executors.py` - approved-task execution with MCP integrations
- `app/deliverables.py` - markdown renderers
- `app/main.py` - routes + SSE
- `knowledge/methodology.md` - distilled framework cards from the course transcripts
