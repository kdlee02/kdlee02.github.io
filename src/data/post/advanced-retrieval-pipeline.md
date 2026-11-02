---
title: 'Advanced Retrieval: HyDE, Hybrid Search, and Reranking'
excerpt: 'Vector search fails on identifiers and short queries. How query expansion, reciprocal rank fusion and a cross-encoder reranker each fix a different failure, and why hybrid search sets your recall ceiling while the reranker sets precision.'
publishDate: 2026-09-28T00:00:00Z
category: 'RAG'
tags:
  - retrieval
  - reranking
  - hybrid-search
draft: false
---

You have clean, well-chunked, embedded documents, and retrieval still misses. This post is about
three fixes that apply after indexing, each aimed at a different failure.

The reference is Venelin Valkov's
[Advanced Retrieval Pipeline for RAG](https://www.youtube.com/watch?v=_ZHM4wsUwPs) (Jan 2026). He
builds it locally with Postgres. The architecture is the part worth keeping, and there's one claim
in the video I think is backwards.

## Why embeddings fail on identifiers

Take two queries against a corpus of quarterly filings:

- _"data center revenue growth"_ is semantic. The right passage may never contain the word
  "growth," and embeddings handle that fine.
- _"NVDA Q3 2025"_ is three identifiers. You need the documents with those exact tokens. In
  embedding space, `Q3 2025` and `Q2 2024` are near neighbors, since both are "a fiscal quarter," so
  cosine similarity happily returns the wrong one.

Ticker symbols, error codes, SKUs, version numbers and proper nouns all fail this way. Embeddings
compress meaning, and compression loses exactly the detail that makes an identifier an identifier.
A better embedding model won't fix this. Using something besides embeddings will.

## The pipeline

```
query
  ↓
HyDE expansion          LLM writes a hypothetical answer, embed that
  ↓
  ├──────────────┐      run concurrently
vector search    keyword search (BM25, original query)
  └──────────────┘
  ↓
reciprocal rank fusion  merge two ranked lists into one
  ↓
cross-encoder rerank    score each candidate against the query
  ↓
threshold + top-k  →  LLM
```

The three stages are independent. You probably don't need all of them on day one.

## Hybrid search and reciprocal rank fusion

Run a vector search and a keyword search, then merge the two ranked lists. The merge is
**Reciprocal Rank Fusion**. Each document gets

```
score(d) = Σ over lists  1 / (k + rank of d in that list)      k ≈ 60
```

RRF throws the raw scores away, and that's deliberate. Cosine similarity and BM25 scores sit on
incomparable scales, and normalizing one against the other means inventing a conversion you can't
justify. Rank is the one thing both lists agree on. The constant `k` damps the top positions so one
list can't dominate.

A document found by _both_ methods collects score from both and rises. Agreement between two
independent retrieval strategies is evidence of relevance.

Two practical notes:

- **Watch where the keyword index lives.** An in-memory BM25 index is fine for thousands of chunks
  and wrong for millions. Database full-text search or a real search engine doesn't have that
  ceiling.
- **Filter on metadata before searching.** If the query names Q3 2025 and you stored `quarter` and
  `year`, filter on them instead of hoping the embedding works it out. Valkov keeps that metadata in
  a separate `documents` table, one row per filing, with database checks such as "a 10-Q's quarter
  is 1–4." Each chunk keeps a foreign key to its document. Bad metadata is rejected at insert time,
  and filtering becomes a join.

## HyDE: rewrite the query, not the index

You embed passages, which are declarative prose. Then you embed a query, which is a short question.
They're different kinds of text, and they don't land near each other even when the passage answers
the question exactly. Valkov puts it more broadly: queries are often too short, too long, or wrong.

Hypothetical Document Embeddings asks an LLM to _write an answer_, then embeds that instead of the
question. The generated paragraph is usually wrong on facts, and that doesn't matter, because nobody
reads it. It's shaped like a real answer, with declarative sentences, domain vocabulary and
passage-like length, so it's a better probe into a space full of passages. I'd aim its length near
your chunk size, since that's what it competes with.

Three cautions:

- **Send only the original query to the keyword branch.** The hypothetical text is full of invented
  specifics, and matching keywords on hallucinated tokens is worse than useless. Wire the two
  branches to read different inputs so it can't happen by accident.
- **The expansion model matters.** Valkov warns that a model too weak to write a coherent paragraph
  produces gibberish, and gibberish embeds as gibberish.
- **It's a full generation call before retrieval starts.** Under a latency budget, this is the first
  stage I'd cut.

## Reranking with a cross-encoder

Vector search uses a **bi-encoder**. It embeds the query and the document separately and compares
the vectors. Document vectors are computed once, which is what makes it fast enough for millions of
chunks.

A **cross-encoder** reads the query and the document together as one input, so attention runs
across both. It's much more accurate and far too slow for a whole corpus. So it goes last, over the
few dozen survivors of retrieval.

Two things to watch:

- **The passage window.** Cross-encoders truncate at their maximum input length. If your chunks are
  3,000 characters and the model takes 512 tokens, you're reranking the first third of each chunk,
  and a chunk whose answer got cut off is confidently ranked low.
- **Model size.** Small MiniLM-class rerankers are fine for demos. `bge-reranker-v2-m3` and Qwen3
  Reranker 0.6B are stronger and still run locally.

The output that changes your system is the **score**. Vector search always returns its top-k,
whether or not anything relevant exists. Similarity is relative, so the closest chunk in a corpus
with no answer is still "closest." A cross-encoder's score is a relevance judgment you can threshold,
and that makes returning _nothing_ possible. "I don't have information about that" beats a
confident synthesis of three irrelevant chunks.

Choose the threshold by scoring a handful of known-irrelevant pairs and seeing where they land. It's
specific to the model and doesn't transfer between rerankers.

## Orchestration: a graph earns its place later

The two retrieval branches are independent and should run concurrently, with fusion waiting for
both. I built it in LangGraph, where that's two edges out of the expansion step and two edges into
fusion.

For exactly this pipeline, a function with one concurrent gather would do as well. A graph pays off
when the next requirements arrive: skip HyDE for cheap queries, retry a branch that came back empty,
stream progress per stage, or trace which stage degraded in production.

## Correction: hybrid search raises recall, the reranker raises precision

Valkov sums up the pipeline as hybrid search giving precision and the reranker improving recall. I
think that's backwards, and it matters for tuning.

- **Recall**: of all relevant chunks, what fraction did you retrieve? Casting a wide net with two
  methods and fusing them raises recall. That's hybrid search's job.
- **Precision**: of what you returned, what fraction is relevant? Removing the junk the wide net
  dragged in raises precision. That's the reranker's job.

A reranker can't improve recall. It only reorders and filters what retrieval already found, so if
the right chunk didn't survive retrieval, no reranker brings it back.

That gives you the tuning rule: **hybrid search sets your recall ceiling, and the reranker decides how
much of it you convert into precision.** So retrieve generously. Forty candidates per branch feeding
a reranker that keeps three isn't waste, it's the design. The common mistake is retrieving five and
reranking five, which spends the cross-encoder reordering a list whose recall was already too low.

The re-ranking lab in DeepLearning.AI's
[Advanced Retrieval for AI with Chroma](https://www.deeplearning.ai/short-courses/advanced-retrieval-for-ai/)
shows this in miniature. It retrieves 10 instead of 5, reranks, and keeps 5. Two chunks from
positions 6–7 move into the top five, and they were never in a top-5 retrieval for the reranker to
find.

## Where I'd start

In order of value per unit of complexity:

1. **Hybrid search with RRF.** It fixes a real, reproducible failure on identifier queries and adds
   almost no latency when the branches run concurrently.
2. **Reranking.** The biggest quality gain of the three, and the only stage that lets you return
   nothing. One model, no new infrastructure.
3. **HyDE.** It's worth it when queries are short or badly phrased. It's also the most expensive,
   with an LLM call before retrieval, so it's the first thing to drop under latency pressure.

Every stage can also degrade silently: a reranker truncating passages, an expansion model drifting
into nonsense. Valkov's closing point holds. The pipeline is simple to run and needs monitoring
before you can trust it.

I haven't run this on a corpus of my own yet, so there are no benchmark numbers here. When I do,
the eval harness ships with the post. The [query-side post](/engineering/query-side-retrieval) covers
two more ways to fix retrieval without re-indexing.
