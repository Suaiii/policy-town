# Stable policy-package settlement

## Problem

The player-visible policy packages are generated during the deliberation preview and
persisted in a cache.  On selection, the settlement engine currently regenerates
the deliberation through the LLM.  A non-deterministic second generation can produce
a different negotiated amount, so a valid visible package is rejected.

## Decision

Persist the complete preview deliberation and pass that exact object into the
settlement engine for the selected company.  The engine will use it instead of
calling `deliberate` again.  Other companies retain their normal processing.

## Behaviour

- The preview endpoint remains the sole live-LLM call for a company/stage.
- A selected cached proposal always settles with the same capital amount shown to
  the player.
- The server still rejects unknown proposal IDs and maintains idempotency.
- Cache misses retain the existing preview-then-settle fallback.

## Verification

An API regression test supplies a preview snapshot whose selected proposal is 24
points and makes a fresh deliberation return 25 points.  Selection must return 200,
spend 24 points, and not invoke the fresh deliberation path.
