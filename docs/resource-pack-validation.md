# Resource-pack validation

Project 42 groups related field guides in versioned manifests under
`content/resource-packs/`. A manifest is an acceptance contract: it declares the
exact resource files and IDs in the pack, required provider coverage, and minimum
source count. Packs can additionally require an exact count, explicit verification
and recovery guidance, and reusable artifacts that reject common destructive
command patterns.

Run the deterministic gate with:

```bash
npm run resources:validate
```

The gate verifies:

- exact agreement between declared IDs and JSON files under each resource root;
- stable IDs and slugs, required metadata, and provider-neutral scope;
- pack-level Anthropic, OpenAI, Google, and provider-neutral coverage where
  declared;
- a reusable artifact and explicit expected-result/evidence verification section
  for every guide;
- optional pack-specific verification and rollback/recovery guidance;
- optional reusable-artifact checks for recursive deletion, destructive Git
  reset/clean, download-to-shell pipelines, and PowerShell expression execution;
- allowlisted primary-source families and valid, non-future review dates within
  each resource cadence; and
- common credential and private-key patterns.

`npm run check` includes this deterministic gate. It does not make live internet
requests.

Before release, verify that the pack's cited pages still resolve:

```bash
npm run sources:links -- prompting-context-verification
```

For the coding-agent and MCP operational pack:

```bash
npm run sources:links -- coding-agent-mcp-operations
```

The live command follows redirects, uses bounded concurrency and timeouts, retries
once, and fails on network errors or non-2xx/3xx responses. It is a release check,
not a normal CI dependency, because public documentation sites and networks can
fail independently of the source change.
