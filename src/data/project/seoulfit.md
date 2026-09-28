---
title: 'SeoulFit'
excerpt: 'A conversational Seoul trip planner — LangGraph intake, RAG over a course dataset, and a critic-repair loop that checks every itinerary before it ships.'
publishDate: 2026-09-28T00:00:00Z
order: 10
stack: ['FastAPI', 'LangGraph', 'Gemini', 'FAISS', 'NeMo Guardrails', 'Flutter']
draft: false
# repo: 'https://github.com/…'   # TODO: add once the repo is public
---

## Overview

SeoulFit is a Flutter app with a FastAPI backend that plans a Seoul trip through
conversation instead of a form. The user talks about the trip they want; the backend
extracts the trip slots one at a time, retrieves candidate courses, and generates a
day-by-day itinerary. On-trip, the same backend answers "what's nearby" questions —
cafes, sights, shopping, festivals, and the nearest ER with live bed counts.

<!-- TODO: what you personally owned, timeline, team size. -->

## Problem

<!-- TODO: the user problem and why an itinerary generator is the right shape for it. -->

## Architecture

The backend is a LangGraph state machine over a `TravelState`, checkpointed with
`MemorySaver` per conversation thread:

- **Input guardrail** — a NeMo Guardrails `self check input` rail in front of `/chat`.
  Only the input rail runs, so LangGraph still produces every reply. It costs one extra
  Gemini call per message.
- **Intake** — slot extraction, one question at a time, over the six trip fields.
- **Retrieval** — region and interest act as hard filters over the course dataset;
  embedding similarity only ranks what survives the filter. That ordering is deliberate:
  if the vector index is missing or the embedding budget is gone, itineraries still come
  out — just unranked.
- **Planning** — the anchor courses plus the confirmed fields go to Gemini, which returns
  a structured day-by-day plan. Google Places is queried per requested area, not once, so
  a multi-neighborhood trip gets real cafes and restaurants in each.
- **Critic-repair** — every generated itinerary is scored, repaired, and scored again.

## Implementation

Notes worth keeping:

- **Critic-repair checks** area coverage, per-day POI count, meal slots, duplicate POIs,
  geographic coherence, and drops POIs that appear in neither the candidate courses nor
  the Google Places results — the hallucination guard.
- **Both critic scores are persisted**, before and after repair, one row per generation,
  in Postgres in production and SQLite locally. The score used to be attached to the
  response and thrown away, which made "are we getting better?" unanswerable.
- **The rate limiter and `X-Forwarded-For`.** uvicorn's `ProxyHeadersMiddleware` is on by
  default and rewrites `request.client.host` from the _first_ forwarded hop — the one the
  client sends and can forge. The limiter buckets on that value, so a fresh header meant a
  fresh quota. With the middleware on, eight requests against a limit of five all returned
  200; with `--no-proxy-headers`, the sixth returned 429.
- **One worker only.** The LangGraph `MemorySaver` is per-process, so a second uvicorn
  worker resets conversations at random.

## Evaluation

<!-- TODO: what the critic scores, how the eval set was built, what the numbers are.
     The log is there (one row per generation, both scores) — put the real query and
     the real numbers here, not a summary. -->

## Results

<!-- TODO: measured outcomes only. -->

## Lessons learned

<!-- TODO. -->
