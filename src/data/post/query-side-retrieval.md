---
title: 'Why AI Search Brings Back the Wrong Pages (Part 1)'
excerpt: 'Part 1 of 2 on the Chroma course: what a vector database actually does, why its results can miss even on simple questions, and two ways an AI can rewrite your question so search finds more of what you need.'
publishDate: 2026-07-20T00:00:00Z
category: 'RAG'
tags:
  - retrieval
  - embeddings
  - query-expansion
draft: false
---

_Based on lessons 2 and 3 of DeepLearning.AI's
[Advanced Retrieval for AI with Chroma](https://www.deeplearning.ai/short-courses/advanced-retrieval-for-ai/) and
their notebooks._

When you ask an AI app a question about your own documents, it first has to find the right pages. That step is called
**retrieval**, and it's often handled by a **vector database**: a database that finds text by meaning instead of by
exact words. The course uses one called **Chroma**.

This is part 1 of 2, and it covers two lessons. The first shows how a simple Chroma search can go wrong, even on easy
questions. The second shows how an AI can rewrite your question before searching, so the search lands in a better spot.
[Part 2](/engineering/reranking-and-embedding-adaptors) covers the rest of the course: reranking, embedding adaptors,
and what's next.

## What Chroma does

Every example in the course searches one document: Microsoft's 2022 annual report. It's cut into small pieces called
**chunks** (349 of them), and each chunk is saved in a Chroma **collection**, which is like a table for one set of
documents.

When a chunk is saved, an **embedding model** turns it into a list of 384 numbers that captures what the chunk means.
Chunks with similar meanings end up with similar numbers. When you ask a question, the same model turns your question
into 384 numbers, and Chroma returns the chunks whose numbers are closest. The course asks for 5 each time.

![How Chroma works. Saving, done once: the annual report is cut into 349 chunks, an embedding model turns each chunk into 384 numbers, and the chunks are saved with their numbers in a Chroma collection. Searching: your question goes through the same embedding model, and Chroma returns the 5 chunks whose numbers are closest.](../../assets/images/query-side-explained/chroma-collection.svg)

Think of each chunk as a pin on a giant map, where pins about similar things sit near each other. Your question becomes
one more pin, and Chroma hands back the 5 nearest ones.

## Seeing the map

There's a catch with that map: it has 384 directions instead of two, so no one can picture it. The course uses a tool
called **UMAP** to flatten it to two dimensions, the way a world map flattens a globe. Like a world map, some shapes get
stretched in the process, so two pins that look far apart on the flat version might be close in the real one. It's
still a good way to build intuition.

Here's what four questions look like on the flattened map. These are redrawn from the plots the notebook produced:

![Four questions plotted on a flattened map of the 349 chunks, with the 5 chunks Chroma returned circled. Total revenue lands inside the cloud and its results sit close together. The AI strategy question lands right on a chunk, with four close results and one stray. The R&D question lands in a gap and its results are spread out. The Michael Jordan question has nothing nearby, and its results come from all over the map.](../../assets/images/query-side-explained/query-maps.svg)

- **"What is the total revenue?"** lands in the middle of the cloud, and the results are close together. Most are
  revenue tables, including the one with total revenue of $198,270 million for 2022. But a couple are about _unearned_
  revenue and how costs are split between business groups. They're about money, just not the question.
- **"What is the strategy around AI?"** lands right on top of a chunk, so that result is extremely relevant. Most
  results mention AI, like Microsoft's responsible AI standard with its 17 goals. But one is mostly about databases, and
  another mixes in the metaverse.
- **"What has been the investment in research and development?"** lands in a gap, so its results are spread out.
- **"What has Michael Jordan done for us lately?"** has nothing to do with the report, and its results come from all
  over the map.

There's a pattern here. Picture all your chunks as a cloud of points. A question that lands _inside_ the cloud finds
neighbors packed tightly around it. A question that lands _outside_ the cloud reaches for the nearest points in every
direction, so its results come from all over.

## Distractors: results that hurt

Look closer at the research and development question. Three of its five results are useful. The best one says R&D
spending was $24,512 million, up 18% from the year before. The other two are off topic: one is about 23 million people
getting digital skills training, and one is about a partner growth program.

![The R&D question returned 5 chunks. Three are about research and development, including R&D expenses of $24,512 million, up 18 percent. Two are distractors about digital skills training and a partner growth program. The Michael Jordan question returned 5 chunks and none are relevant.](../../assets/images/query-side-explained/distractors.svg)

The course calls results like these **distractors**. They're bad because the search hands all five chunks to the AI,
and the AI tends to get pulled off course by the irrelevant ones. Worse, a wrong answer caused by a distractor is hard
to trace. Neither the user nor the engineer can easily see why the AI said what it did.

The Michael Jordan question shows the extreme case. None of its five results are relevant: business metrics, employee
rewards, and the CEO's closing letter. But Chroma returned five anyway, because a nearest-neighbor search always returns
the nearest neighbors, even when none of them are near. Every chunk the AI gets is a distractor.

### Why this happens

The embedding model was trained to capture meaning in general. It knows nothing about _your_ task. When you search the
annual report for "total revenue," it can't tell that you want the one headline number rather than anything
money-related. You're asking a general tool to do a specific job.

The next lesson tries to close that gap by fixing the question before it goes to search.

## Query expansion: rewrite the question first

A search engine can only work with the question it's given. **Query expansion** uses an AI to improve that question
before the search runs. The course shows two ways to do it.

_A note on sources: the notebook for this lesson didn't run for me, because the AI model it calls wasn't available. So
the examples below come from the lesson video, and the maps are my redrawings of the plots shown there._

### Way 1: Glue a pretend answer onto the question

Ask an AI to write a pretend answer to the question, as if it came from an annual report. Then glue the question and the
pretend answer together, and search with the whole thing.

In the video, the AI is told it's a "helpful expert financial research assistant" and asked for an example answer "that
might be found in a document like an annual report." The question was "Was there significant turnover in the executive
team?" and the AI wrote that there was no significant turnover and the core members of the team stayed the same.

![The question "Was there significant turnover in the executive team?" goes to an AI, which writes a pretend answer. The question and pretend answer are glued together and used as the new search text. On the map, the glued search point moves from the plain question into a group of chunks about leadership and the board.](../../assets/images/query-side-explained/generated-answer.svg)

The instructor admits this is basically asking the AI to make things up, but the made-up text is useful. It reads like
the kind of passage you're hoping to find, so it moves the search pin to a better neighborhood. In the video, the
results were about leadership, Microsoft's directors and its board committees.

This is close to the HyDE trick in the [advanced retrieval post](/engineering/advanced-retrieval-pipeline), with one
difference. HyDE searches with the pretend answer alone. Here the original question stays in, so if the pretend answer
wanders off, the question still pulls the search back toward what the user asked. The idea comes from a 2023 paper by
[Jagerman and others](https://arxiv.org/abs/2305.03653).

### Way 2: Ask several related questions

One question is one pin on the map, and one pin can only reach one neighborhood. A broad question might need answers
from several parts of the report.

So ask an AI to suggest a few _related_ questions, then search with all of them. The video's prompt asks for:

- up to five extra questions,
- short ones, without compound sentences,
- covering _different aspects_ of the topic, not just the same question reworded,
- each a complete question that's still related to the original.

The original question was "What were the most important factors that contributed to increases in revenue?" The AI
suggested questions about factors behind _decreases_ in revenue, the sources of revenue, how sales split across product
lines, changes in pricing strategy, and whether the company gained new customers.

![The original question about what increased revenue goes to an AI, which writes five related questions. All six go to Chroma in one call, each returns 5 chunks, and duplicates are removed. On the map, the extra questions land in different places, so the results come from several parts of the report instead of one.](../../assets/images/query-side-explained/multiple-queries.svg)

Chroma can take a whole list of questions in one call, so all six go together and each gets its own 5 results. Since the
questions are related, the same chunk often shows up more than once, so you remove duplicates before passing anything
on. In the video, the results covered Windows revenue growth, sales and marketing costs, investments and taxes. On the
map, the new questions land in several different spots, reaching parts of the report the original question never would
have.

### An example of my own

To try the idea on a question from the first lesson, here's how I might expand the research and development question.
I wrote these myself and haven't run them, so they show the idea, not a result:

- How much did research and development spending grow this year?
- Which areas drove the increase in research and development?
- What does Microsoft Research work on?
- How does research and development compare with sales and marketing spending?

Each one points at something specific that the report actually covers, like the spending table or Microsoft Research.
That should pull in more of the useful chunks and leave less room for distractors like the digital skills programs.

It's also worth thinking about what expansion _can't_ fix. Ask the AI to expand the Michael Jordan question and it will
happily write a pretend answer or five new questions. But nothing in the report is about him, so a better question
still finds nothing relevant. Expansion helps when the answer exists and the question is aimed badly, not when the
answer isn't there.

## The catch: more results to sort

Way 2 creates a new problem. Six questions times five results is up to 30 chunks instead of 5, and some of them answer a
neighboring question rather than yours. The "decreases in revenue" question is a good example: it's related, but it's
not what was asked.

So you need a way to score every chunk against the _original_ question and keep only the best. That's the job of a
**reranker**, which reads the question and each chunk together and scores how well they match. That's the course's next
lesson, and it's where [part 2](/engineering/reranking-and-embedding-adaptors) picks up.

## Things to take away

- **Look at your results, not just the answer.** A plot like the ones above shows quickly whether a question landed
  inside your data or outside it.
- **Search always returns something.** If nothing in your documents fits, you still get the closest chunks, and every
  one of them is a distractor.
- **Rewrite the question when it's aimed badly.** Glue on a pretend answer for short questions, or split broad ones into
  related questions.
- **The prompt is part of your search now.** Once an AI writes your questions, small prompt changes give very different
  results. The instructor's advice is to experiment with the prompts, the questions and the models.

Next up, [part 2](/engineering/reranking-and-embedding-adaptors): sorting the results with a reranker, and training a
small adjustment that makes questions land in the right place.
