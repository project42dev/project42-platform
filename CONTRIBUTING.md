# Contributing

Project 42 welcomes corrections, new learning material, assessment improvements, and
platform changes.

## Before opening a change

1. Open an issue for a new content type, provider, public API, or top-level directory.
2. Use primary sources for volatile product or model claims.
3. Include `lastVerified`, `sources`, and a responsible content owner.
4. Keep core concepts provider-neutral; add provider-specific behavior explicitly.
5. Do not include private data, credentials, learner records, or copied proprietary
   training material.

## Verify

```bash
npm ci
npm test
```

All catalog changes must pass schema validation. Knowledge-check answers require an
explanation, and every module requires an end-of-module check.
