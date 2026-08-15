# Observability

> Date: 2026-04-28

---

## What you need to observe

Running AI workstreams in production without observability is operating blind. You will not know which steps are slow, which prompts are degrading, or whether a model change improved or hurt quality.

The five things you need to observe:

| Signal | What it tells you | Example question it answers |
|---|---|---|
| **Latency** | How long each agent step takes | "Why did the build workstream take 4 minutes?" |
| **Cost** | Token spend per model, per workstream, per day | "The reviewer is spending more than the coder — why?" |
| **Quality / evals** | Whether the output meets the criteria you care about | "Did the last prompt change improve review accuracy?" |
| **Prompt versions** | Which prompt was active when a regression appeared | "Which version of the coder prompt shipped the bad output?" |
| **Session traces** | The full sequence of steps, tool calls, and handoffs in a workstream run | "Where exactly did the investigate workstream stall?" |

---

## Comparison

| Tool | License | Self-hostable? | Strengths | Best for |
|---|---|---|---|---|
| **Langfuse** | MIT | Yes (Docker) | ~21K+ GitHub stars; tracing + prompt management + evals in one tool; integrates with OpenAI SDK, LangChain, LlamaIndex, LiteLLM, Vercel AI SDK, Haystack, Mastra; cloud plan available | Teams that want a single tool for tracing, prompt versioning, and evals; self-hosters; LiteLLM users (native integration) |
| **LangSmith** | Commercial (no OSS core) | No (cloud only) | Deep LangChain/LangGraph integration; annotation queues for human labeling; native graph visualization | Teams deeply invested in LangChain or LangGraph; need annotation workflows |
| **Arize Phoenix** | OSS (Apache-2.0) | Yes | Strong production tracing; good RAG evaluation support; OpenTelemetry-compatible | Teams already using OpenTelemetry; RAG-heavy pipelines; strong eval needs |
| **OpenLLMetry** | OSS (Apache-2.0) | Yes | OpenTelemetry-compatible LLM tracing layer; fits into existing OTel infrastructure | Teams with existing OpenTelemetry pipelines who want LLM-aware spans without a new platform |

---

## The two-layer pattern

Observability and gateways are complementary. See [operations/gateways.md](gateways.md) for the gateway layer.

| Layer | What it gives you |
|---|---|
| Gateway (LiteLLM, Portkey, Helicone) | Cost tracking, caching, routing, failover — the operational plumbing |
| Observability platform (Langfuse, Phoenix) | Quality signals, eval results, prompt versioning, full session traces |

A gateway tells you that a call cost $0.04 and took 1.2 seconds. An observability platform tells you that the coder's output on that call was rated 3/5 on a correctness rubric, and that the prior prompt version rated 4/5. Both signals matter; neither alone is sufficient.

---

## Practical setup

### What to instrument first

Do not instrument every LLM call. Start at the workstream boundary — the point where a task enters and exits a workstream — and work inward from there.

**Priority order:**

1. **Workstream-level trace.** One trace per workstream run. Captures the full input, all agent steps, and the final output. This is the most valuable single instrumentation point.

2. **Agent-level spans.** Within a workstream trace, add one span per agent invocation (router, planner, coder, reviewer, documenter). Each span captures: agent name, model, token usage, latency, handoff payload.

3. **Tool call spans.** Within each agent span, capture tool calls (Read, Write, Bash, MCP calls) with their inputs and outputs. This is where latency spikes are usually found.

4. **Eval scores.** Attach an eval score to each reviewer span (correctness, security, style, pass/fail). This is what enables quality trending over time.

Do not start at level 4. Get level 1 working first. A single workstream-level trace with no spans is more useful than no tracing at all.

### Langfuse setup (recommended starting point)

Langfuse integrates with LiteLLM natively, which makes it the lowest-friction choice if you are already running a LiteLLM gateway:

```python
# In your LiteLLM proxy config (litellm_config.yaml)
litellm_settings:
  success_callback: ["langfuse"]
  failure_callback: ["langfuse"]

environment_variables:
  LANGFUSE_PUBLIC_KEY: "pk-..."
  LANGFUSE_SECRET_KEY: "sk-..."
  LANGFUSE_HOST: "https://cloud.langfuse.com"  # or your self-hosted URL
```

With this, every model call through the LiteLLM proxy is automatically traced in Langfuse. No per-call instrumentation needed.

For agent-level spans (adding structure within a trace), use the Langfuse SDK:

```python
from langfuse import Langfuse

langfuse = Langfuse()

# At workstream start
trace = langfuse.trace(name="workstream-build", input={"task": task_description})

# Per agent
span = trace.span(name="coder", input={"plan": plan_yaml})
# ... agent runs ...
span.end(output={"handoff": handoff_yaml}, usage={"input": 60000, "output": 20000})
```

### What a workstream trace looks like

A complete build workstream trace in Langfuse:

```
trace: workstream-build [4m 12s]
  span: router [3s]  — input: task, output: classification=build
  span: planner [28s]  — input: task, output: plan.yaml
  span: coder [2m 15s]  — input: plan + task, output: handoff.yaml
    tool: Read(src/auth/index.ts) [200ms]
    tool: Write(src/api/health.ts) [150ms]
    tool: Bash(npm test) [45s]
  span: reviewer [1m 12s]  — input: handoff.yaml, output: verdict=approve
    tool: Read(src/api/health.ts) [200ms]
  span: documenter [22s]  — input: handoff.yaml, output: docs/api/health.md
eval: correctness=4/5, security=pass, tests_added=true
```

This trace tells you exactly where time was spent, what each agent received and produced, and what the eval outcome was. When a workstream fails, this is where you look.

---

## Choosing for Project 42

| Situation | Recommendation |
|---|---|
| Starting fresh, want single tool | Langfuse (self-hosted via Docker or cloud) |
| Already using LangChain/LangGraph heavily | LangSmith |
| Existing OpenTelemetry infrastructure | OpenLLMetry + Arize Phoenix |
| Need RAG-specific evals | Arize Phoenix |
| Want managed, zero infra | Langfuse cloud or LangSmith cloud |

For new setups in this repo: use Langfuse self-hosted (Docker Compose, roughly 10 minutes to get running) or Langfuse cloud. The LiteLLM integration means you get workstream-level traces with minimal added code.

