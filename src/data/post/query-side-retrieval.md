---
title: 'Fixing Retrieval From the Query Side'
excerpt: 'Multi-query expansion and embedding adaptors improve retrieval without touching your index. How each works, what it costs per query, and how each one fails.'
publishDate: 2026-09-29T00:00:00Z
category: 'RAG'
tags:
  - retrieval
  - embeddings
  - query-expansion
draft: false
---

Most retrieval advice targets the index: chunk better, embed better, add a keyword branch. But a
similarity comparison has two sides, and the query side is cheaper to change. Your index might hold
millions of embeddings. Your query is one string.

[HyDE](/engineering/advanced-retrieval-pipeline) is one query-side fix. This post covers the other
two from labs 3–5 of DeepLearning.AI's
[Advanced Retrieval for AI with Chroma](https://www.deeplearning.ai/short-courses/advanced-retrieval-for-ai/):
rewriting one query into several, and learning a transformation of the query vector. Neither
requires re-embedding your corpus.

## The mismatch

A question and the passage that answers it are different kinds of text. The question is short,
interrogative, and uses whatever words the user picked. The passage is long, declarative, and uses
the author's vocabulary. Cosine similarity between them is a lossy proxy for "does this answer
that."

There are three escalating responses:

|             | How                                   | Cost per query            | Training? |
| ----------- | ------------------------------------- | ------------------------- | --------- |
| Multi-query | Rewrite the query several ways        | 1 LLM call + N retrievals | No        |
| HyDE        | Embed a generated answer              | 1 LLM call                | No        |
| Adaptor     | Learn a transform of the query vector | 1 matrix multiply         | Yes       |

They aren't exclusive, but they fail in different ways, and that's the useful part.

The lab also shows a HyDE variant from [Jagerman et al.](https://arxiv.org/abs/2305.03653):
concatenate the question and the generated answer and embed both together. The original wording
stays in the vector, which hedges against a hallucinated answer pulling the query somewhere the user
never meant.

## Multi-query expansion

One query gives you one point in embedding space. If that point lands slightly off, everything you
retrieve is slightly off, and nothing recovers it.

So have an LLM write several phrasings, retrieve for each, and merge the lists with
[reciprocal rank fusion](/engineering/advanced-retrieval-pipeline). RRF doesn't care whether its
lists came from different retrievers or from one retriever run on different queries. A document
found by several phrasings collects score from each and rises. Being robust across phrasings is
better evidence of relevance than one high cosine score.

Things to get right:

- **Keep the original query in the list.** Rewrites can all drift the same way, and the original is
  your anchor.
- **Ask for different vocabulary, not different topics.** Ask for ten variants and the model starts
  inventing neighboring questions. Four is usually plenty.
- **Deduplicate before reranking.** Overlap between result sets is expected. Fusing by document ID
  stops a reranker from scoring the same chunk five times.
- **Cost is one LLM call plus N retrievals,** not N LLM calls. One generation produces all the
  variants, and the retrievals run in parallel.

### Aspects instead of phrasings, and why that needs a reranker

The lab's prompt asks for something different: questions that cover _different aspects_ of the
topic. Given "what were the most important factors that contributed to increases in revenue?", it
produced questions about revenue sources, pricing strategy, product lines, new customers, and
factors that contributed to _decreases_ in revenue.

That last one is the tell. Aspect queries reach parts of the corpus one query never would, which is
the point for a broad question. They also pull in chunks that answer a neighboring question, and
six queries times k results is far more than you want to give the model.

The re-ranking lab's fix: score every deduplicated candidate with a cross-encoder against the
**original** query, not the variant that found it, and keep the top few. The variants widen the net,
and the original decides what stays in it. Without the rerank, expansion just hands the model more
noise.

With an LLM in the retrieval loop, the prompt becomes a parameter. Phrasings versus aspects is one
prompt choice with very different results, so try both on your own queries.

### Decomposition solves a different problem

If the question has several parts ("how did margins and headcount both change?"), no single passage
covers both, so no single retrieval finds one. Split it into sub-questions, retrieve for each, and
give the model the union.

Rewriting hedges against bad phrasing. Decomposition handles an answer that's genuinely spread
across documents. The mechanism is the same and the diagnosis differs, so detect which case you're
in rather than always doing both.

## Embedding adaptors

Query expansion works around the embedding model. An adaptor changes what it outputs.

Your embedding model learned a general notion of similarity. Your corpus and your users' questions
are specific. In principle there's a transformation of the query vector that makes relevant
documents score higher _in your domain_, and you can learn it.

The setup is minimal: multiply the query embedding by a learned square matrix before comparing. For
a 384-dimension model that's about 147K parameters, small enough to train on a laptop. Only the query
passes through it. Document embeddings don't change.

### Labels without hand-labeling

Training needs (query, document, relevant or not) examples.

- **Best source: your users.** If your app collects thumbs up or down on answers, join that back to
  the retrieved chunks. That beats anything synthetic.
- **Without users, synthesize.** Have an LLM write questions typical of your domain, retrieve for
  each with your existing pipeline, and have an LLM judge each pair. The lab uses 15 questions times
  10 chunks, 150 pairs, and trains in seconds.

Labels are **+1 / −1**, not 1 / 0, because the target is cosine similarity, which ranges from −1 to

1. Training pushes relevant pairs toward 1 and irrelevant pairs toward −1.

### What the matrix learned

Multiply the adaptor by a vector of ones and plot each output dimension. Some come out large
(stretched: this direction matters for your queries), some near zero (squeezed: ignore it), and some
negative (flipped: it points away from what users want). That's the intuition for the whole
technique. It stretches and squeezes embedding space along the directions your domain cares about.
Each bar mixes in off-diagonal weights, so treat the plot as a picture, not a measurement.

### Why it's attractive

- **Your index never changes.** Fine-tuning the embedding model means re-embedding the whole corpus,
  which for a big index is a migration. An adaptor is one matrix multiply on one vector. You can A/B
  test it, roll it back, or keep several for different query types.
- **No LLM call at query time.** The LLM work happens once, offline, to build the training set.

### What to be skeptical about

- **The judge is your ceiling.** The labels are an LLM's opinion of relevance. If the judge is
  systematically wrong, you train a matrix that faithfully reproduces the error. Hand-check a sample
  of labels first. This step is the most likely to quietly invalidate the result.
- **It's linear.** A single matrix can rotate and scale the query space and nothing more. The lab
  suggests a small MLP as a next step. Linearity is also a safety property, since it's hard for a
  linear map to do something wild on an unusual query.
- **It's tied to the embedding model and the corpus.** Change the model and the adaptor is
  meaningless. If the documents drift, retrain.
- **Teaching code isn't production code.** The lab has no held-out set. Do it properly with batches
  and a validation split you never train on, so "it improved" is a measurement. A UMAP plot showing
  adapted queries moving toward the documents proves something happened, not that retrieval got
  better.

## How I'd sequence it

1. **Start with multi-query, reranked against the original query.** No training and no data, and it
   reuses the fusion and reranker from a hybrid pipeline. It's the most value per unit of effort here.
2. **Try a domain-specific embedding model** before building a labeling pipeline. Sometimes the fix
   is swapping the model, which is less machinery to own.
3. **Use adaptors when you have volume and a tight latency budget.** They're the only option without
   a generation call on the critical path, which makes them right at high query rates. They're also
   the only one with a training pipeline to maintain, so you need enough traffic to justify that.

Every technique here is a hypothesis about your data. I haven't run these on a corpus I care about
yet, so there are no numbers. When I do, the eval harness ships with the post.
