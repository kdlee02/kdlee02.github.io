---
title: 'Metadata Extraction and Element-Based Chunking'
excerpt: 'Part 2 of 3 on preprocessing unstructured data for LLMs: using parent_id to tag every element with its section, filtering vector search on it, and chunking by title instead of by character count.'
publishDate: 2026-09-30T00:00:00Z
category: 'RAG'
tags:
  - retrieval
  - preprocessing
  - chunking
  - metadata
draft: false
---

Similarity search returns whatever is closest to the query, and often that isn't enough. The fix is
metadata you kept at ingestion, and the same structure also gives you better chunks.

[Part 1](/engineering/normalizing-unstructured-documents) ended with a flat list of typed elements.
This part follows the second lesson of DeepLearning.AI's
[Preprocessing Unstructured Data for LLM Applications](https://www.deeplearning.ai/short-courses/preprocessing-unstructured-data-for-llm-applications/).

## Two kinds of metadata

- **Extracted** from the file: filename, file type, last-modified date, page number.
- **Inferred** during parsing: element category, language, and hierarchy, meaning which element sits
  under which.

The hierarchy comes from one field, `parent_id`. A section title's ID appears as the `parent_id` of
every element beneath it. That one pointer turns a flat list back into a tree.

## Where similarity search alone goes wrong

- **Too many matches.** A corpus mostly about one topic returns a wall of near-equal hits.
- **No sense of time.** The course's example is two Super Bowl articles, one from before the game
  and one from after. "Latest Super Bowl news" can return both.
- **Structure is invisible.** Which section a passage came from is often the deciding signal, and
  the embedding doesn't encode it.

**Hybrid search** here means a structured filter plus similarity: only this chapter, only articles
after February 12th. The filter narrows the candidates and similarity ranks what's left.

## Worked example: search one chapter of a book

The course uses an EPUB of _Winter Sports in Switzerland_ and asks "How many players are on a
team?", restricted to the ice-hockey chapter.

1. **Find the chapter titles.** Filter elements to `Title` and match against the chapter names in
   the table of contents.
2. **Map each title's ID to its chapter name.**
3. **Tag every element.** Look up its `parent_id` in that map to get a chapter.
4. **Index with the chapter as metadata,** then query with a filter on `chapter = "ICE-HOCKEY"`.

Every result now comes from the hockey chapter, so a passage about some other team sport can't
appear.

### Where the example is rough

The notebook output shows the limits, and they're worth knowing before you copy the pattern:

- **Headings get indexed too.** The second hit is the bare heading "Rules of Match Play." Filter by
  category or minimum length before indexing.
- **Noise gets in.** The loaded data includes a license line, "Plate XX", and a scoring table. Part
  1's category filter would remove some of it.
- **Only direct children get tagged.** An element under a subheading has the subheading as its
  parent and gets no chapter. That's fine for a flat book and a real gap for deeper documents. Walk
  up the parent chain instead.
- **Substring matching on titles is loose.** The notebook itself notes this condition was revised
  because it caught unintended titles.

Also, a vector database's _collection_ metadata (such as which distance metric to use) is
configuration, not document metadata. The lecture flags this because the two get confused.

## Chunking by element instead of by character

The simple way to chunk is even sizes, cut whenever you hit the limit. The alternative builds chunks
from elements:

1. Partition into atomic elements: titles, paragraphs, list items.
2. Combine them into chunks, applying **break conditions**. The main one is "start a new chunk at
   every title," since a title usually marks a new section.

The lecture's example is a paper where a section on open-domain question answering sits next to one
on abstractive question answering. A character splitter cuts across the boundary, so one chunk holds
the end of one topic and the start of the next, and a search for the first topic returns text about
the second. Chunking by title keeps each section whole.

Two knobs:

- **Maximum size.** A section longer than this gets split. The course uses 3,000 characters.
- **Combine-under threshold.** Very short elements are merged with their neighbors, so a run of
  one-line headings doesn't become a run of near-empty chunks. The course uses 100 characters.

In the notebook, 718 elements became 198 chunks. Because chunking runs over the saved element list,
you can try several strategies without re-partitioning, which is the payoff for the extraction work.

## Takeaways

- `parent_id` turns a flat element list back into a hierarchy. Use it to tag every element with its
  section before indexing.
- A metadata filter narrows candidates before similarity ranks them. It's the cheapest retrieval
  improvement there is, and only possible if you kept the metadata at ingestion.
- Chunk by title so a chunk doesn't straddle two topics, then tune maximum size and the
  combine-under threshold.

[Part 3](/engineering/preprocessing-pdfs-images-and-tables) covers PDFs and images, where extraction
itself needs models, and tables, which need their own treatment.
