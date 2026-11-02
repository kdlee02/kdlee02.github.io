---
title: 'The 5 Levels of Text Splitting, and What to Actually Use'
excerpt: 'Greg Kamradt’s chunking taxonomy, from fixed-character splits to agentic chunking: what each level assumes about your text, what it costs, and why the levels are a menu rather than a ranking.'
publishDate: 2026-09-28T00:00:00Z
category: 'RAG'
tags:
  - retrieval
  - chunking
draft: false
---

Chunking happens before embedding, before retrieval, before the model sees anything, so a bad split
caps the quality of everything downstream. No reranker rescues a chunk that cut a definition in
half.

Greg Kamradt's [The 5 Levels Of Text Splitting For Retrieval](https://www.youtube.com/watch?v=8OJC21T2SL4)
(Jan 2024) is still the clearest map of the options. Each level drops an assumption the previous
one made about your text, and each costs more. The
[companion notebook](https://github.com/FullStackRetrieval-com/RetrievalTutorials/blob/main/tutorials/LevelsOfTextSplitting/5_Levels_Of_Text_Splitting.ipynb)
has code for every level. This post sticks to the ideas.

## Why split at all

1. **Context limits.** You can't pass unlimited text to a model.
2. **Signal to noise.** Even when everything fits, irrelevant text hurts. Kamradt quotes Anton
   Troynikov (Chroma) on this: distracting content in the context degrades the whole application.

His "Chunking Commandment" sets the goal:

> Your goal is not to chunk for chunking sake, our goal is to get our data in a format where it
> can be retrieved for value later.

So chunking is a retrieval design decision, not a preprocessing chore.

## Level 1: Fixed characters

Cut every N characters, ignoring words and structure. At 35 characters, "I would like to chunk up"
becomes `...like to ch` and `unk up...`. That's the whole failure mode in one example. Changing the
size only moves the bad cut somewhere else.

This level introduces two settings that every later level keeps:

- **Chunk size**: how much text goes in each chunk.
- **Chunk overlap**: how much of the end of one chunk is repeated at the start of the next, so an
  idea crossing a boundary appears whole at least once. The cost is duplicated text in the index.

Nobody uses this in production, Kamradt says. It's useful because the failure is so visible. His
[ChunkViz](https://www.chunkviz.com/) tool lets you drag the size slider and watch boundaries land
in bad places.

## Level 2: Recursive character splitting

Instead of one cut rule, use an ordered list of separators: paragraph break, line break, space,
then individual characters as a last resort. Split on the first. Any piece still over the size limit
gets split again with the next separator.

The effect is that cuts snap to the nearest natural boundary. On three paragraphs of a Paul Graham
essay, a size of 450 splits them exactly at the paragraphs, and so does 469. Nearby sizes give
identical splits, which makes this forgiving to tune. One quirk: a period isn't in the default list,
so sentence ends aren't preferred over spaces.

Kamradt calls it the swiss army knife and his default starting point: one line, fast, high return
on effort. His real-world starting range is roughly **2,000 to 6,000 characters**, rising as
long-context models improve. I'd go further: most production systems should _stay_ here until an
eval says otherwise.

## Level 3: Document-specific splitting

Markdown, code and PDFs have structure a generic splitter throws away. For text formats, this level
is Level 2 with separators chosen for the format:

- **Markdown**: headers, code fences, horizontal rules, then the usual fallbacks.
- **Python**: `class`, `def`, indented `def`. **JavaScript**: statement keywords like `function`,
  `const`, `if`, `for`.

The goal is to keep a section or a class in one chunk. Even then, Kamradt had to try a few sizes to
get a clean split of a small Python file. That's another reason to choose chunk size with an eval,
not by eye.

### Tables and images need a different representation

You can't split a table with character separators. The notebook uses a layout-detection model to
pull tables out of a PDF as HTML. LLMs read HTML and Markdown tables much better than tab- or
comma-separated text.

The bigger point is retrieval: **a raw table embeds badly**. A question in plain language isn't close
to a grid of numbers in vector space. The fix is to have an LLM summarize the table, embed the
summary, and hand the model the raw table when the summary matches.

Images get the same treatment. Text and image embeddings usually aren't comparable, so you can't
search one with the other. Kamradt tried CLIP, a shared text-image model, and found its quality
lacking at the time. Instead, a vision model writes a description, you embed that, and you return
the original image.

## Level 4: Semantic chunking

Levels 1–3 assume text that's physically close is about the same topic. That's usually true for
clean prose and often false for transcripts, scraped pages and chat logs. Kamradt also asks why
chunk size should be a global constant at all, when it has nothing to do with the content.

Semantic chunking drops that assumption by finding where the topic changes:

1. Split the text into sentences.
2. Embed each sentence together with its neighbors. Single sentences were too noisy to embed alone.
3. Measure the distance between each window and the next. Plotted, you see long low stretches with
   occasional spikes.
4. Treat the spikes as break points, using a percentile threshold such as the 95th as the one knob.
   Group the sentences between them.

Chunk size is now an output of the content, not a setting. Kamradt's analogy: the first three levels
shelve books by physical size, and this one shelves them by genre.

He presented it as an exploration. There was no maximum chunk size and no evals. It has since become
a library feature (LangChain's `SemanticChunker`). The cost is an embedding call per sentence window
before you index anything. It's worth it when the corpus is messy enough that its paragraph
structure doesn't track its topics.

## Level 5: Agentic chunking

Could an LLM chunk a document the way a person would? A person takes a scratch pad, starts a chunk
with the first piece, and for each following piece decides whether it belongs to an existing chunk
or starts a new one.

Raw sentences don't work for this. "They meant well, but this is rarely true" means nothing on its
own. So the text is first rewritten into **propositions**, short statements that stand alone, with
pronouns replaced by what they refer to
([Chen et al., 2023](https://arxiv.org/abs/2312.06648)). Five paragraphs of an essay became 26
propositions.

The chunker keeps a list of chunks, each with a title and a one-sentence summary. For each
proposition, an LLM looks at the outline and either names a matching chunk or asks for a new one.
After each addition, the chunk's summary and title are regenerated, so the chunk drifts like a
centroid. The prompts tell the model to _generalize_: a month goes under "Date & Times", an apple
under "food". Otherwise it would create a new chunk for every proposition.

Count the calls: one per proposition to route it, plus two more to update or create a chunk, plus
the extraction calls before any of that. Kamradt calls it slow and expensive, and frames the level
as a bet on token costs approaching zero.

Inference is much cheaper now than when he recorded this. Latency and non-determinism haven't gone
away, though. Several sequential LLM calls per sentence are still hard to justify against Level 2
or 3, and the splits change between runs unless you pin the model and cache. I wouldn't use it by
default.

## Bonus level: embed something other than the raw text

The last section changes the question. Does the thing you embed have to be the thing you return?
If not, chunking becomes part of indexing design:

| Representation         | You embed                       | You return                     | Good for                                             |
| ---------------------- | ------------------------------- | ------------------------------ | ---------------------------------------------------- |
| Summaries              | An LLM summary of a large chunk | The raw chunk                  | Long, dense sections                                 |
| Hypothetical questions | Questions the chunk answers     | The raw chunk                  | Q&A bots, sparse or informal data like Slack threads |
| Parent document        | Small child chunks              | Their larger parent            | Precise matching with enough context                 |
| Graph                  | Entities and relationships      | Nodes, edges, source sentences | Entity-heavy data                                    |

All four address a problem that boundary placement can't. A user's question and the passage that
answers it often share very few words. I'd try this level before Level 5.

## The levels are a menu, not a ranking

Kamradt deliberately didn't benchmark the levels against each other. The right strategy depends on
the domain, so any single eval would mislead. He points to [RAGAS](https://github.com/explodinggradients/ragas)
and similar tools and says to measure on your own data.

That's the lesson that gets lost when this taxonomy is repeated as a listicle. A higher level isn't
a better chunker. It's a more expensive guess about your data, and you still have to test it.

If you're starting today:

1. Use Level 2 as the baseline.
2. Move to Level 3 if your documents have real structure.
3. Build an eval set before anything else.
4. Try alternative representations before agentic chunking.

I don't have my own numbers yet. When I run this comparison on a corpus I care about, it'll be its
own post, with the eval harness included.
