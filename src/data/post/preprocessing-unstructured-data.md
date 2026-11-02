---
title: 'Preprocessing Unstructured Data: The Step Before Chunking'
excerpt: 'Notes from working through the Unstructured preprocessing course — normalizing mixed file types into a common element schema, keeping the metadata that makes filtered retrieval possible, and why PDFs need layout detection.'
publishDate: 2026-09-28T00:00:00Z
category: 'RAG'
tags:
  - retrieval
  - preprocessing
  - pdf
draft: true
---

I wrote [previously](/engineering/five-levels-of-text-splitting) that chunking is the first
consequential decision in a RAG pipeline. That was wrong, or at least incomplete. There's a step
before it, and it fails more often: turning a pile of PDFs, PowerPoints, HTML pages, and EPUBs
into text worth chunking at all.

Chunking assumes you already have clean text with some structure. For a `.txt` file that's true.
For a scanned PDF with a two-column layout and three tables, it isn't remotely true — and every
splitter above is operating on garbage.

These are my notes from DeepLearning.AI's
[Preprocessing Unstructured Data for LLM Applications](https://www.deeplearning.ai/short-courses/preprocessing-unstructured-data-for-llm-applications/),
which is built around the [`unstructured`](https://github.com/Unstructured-IO/unstructured)
library. Code below is my own, against the library's public API.

## Why this is hard

Two documents with identical content can be arbitrarily different to parse:

- **HTML** hands you semantic structure for free. `<h1>`, `<p>`, `<table>` — the tags tell you
  what each block _is_.
- **PDF** is a layout format. It describes where ink goes on a page, not what anything means. A
  heading is text that happens to be larger and higher up. A table is text with suspicious
  whitespace. There is no `<h1>`.
- **PPTX / DOCX** are zipped XML with their own idiosyncratic schemas.
- **Scanned pages and images** have no text layer at all.

So you get a matrix: every file type needs different extraction logic, but everything downstream
— chunking, embedding, retrieval — wants one uniform interface. Resolving that is the whole job.

## Normalizing into a common element schema

The core idea: parse each format with a format-specific strategy, then emit the same
document-element representation regardless of input.

```python
from unstructured.partition.auto import partition

elements = partition(filename="report.pdf")

for el in elements[:10]:
    print(f"{el.category}: {el.text[:80]}")
```

Every element carries a semantic category — `Title`, `NarrativeText`, `ListItem`, `Table`,
`Image`, `Header`, `Footer` — plus text and metadata. The value is that downstream code stops
caring about file types. You write one ingestion path, and adding a new format is a parser
concern, not a pipeline concern.

The categories also let you filter before you spend money. Page headers, footers, navigation
chrome, and "Share this article" buttons all get classified, which means you can drop them
instead of embedding them:

```python
KEEP = {"Title", "NarrativeText", "ListItem", "Table"}
useful = [el for el in elements if el.category in KEEP]
```

That filter alone removes a surprising amount of noise from scraped HTML.

## Metadata is the part people throw away

Each element arrives with metadata — source filename and filetype, page number, detected
language, link URLs, and crucially `parent_id`, which points at the element's parent in the
document hierarchy.

`parent_id` is what lets you reconstruct structure. Titles become parents of the narrative text
beneath them, so you can walk from a section heading to its body, or label every element with the
chapter it came from:

```python
titles = {el.id: el.text for el in elements if el.category == "Title"}

for el in elements:
    section = titles.get(el.metadata.parent_id, "")
```

Carry that into your vector store and retrieval stops being purely semantic. You can constrain
the search space before the similarity comparison happens:

```python
collection.add(
    documents=[el.text for el in useful],
    ids=[el.id for el in useful],
    metadatas=[{"section": section_of(el), "page": el.metadata.page_number}
               for el in useful],
)

collection.query(
    query_texts=["how many players are on a team?"],
    n_results=2,
    where={"section": "ICE-HOCKEY"},
)
```

This is the cheapest retrieval win available and it requires no embedding tricks. If the user
asks about Q3 revenue and you have a `quarter` field, filtering to Q3 beats any amount of
reranking over the whole corpus. Metadata you discard at ingestion is metadata you cannot filter
on later — and re-ingesting a large corpus to recover it is expensive enough that people just
live with worse retrieval instead.

## Structure-aware chunking

Once elements carry categories and hierarchy, chunking gets to use them. Instead of cutting at
character counts, cut at section boundaries — start a new chunk at each `Title`, accumulate the
elements under it, and only fall back to splitting when a section exceeds your size ceiling:

```python
from unstructured.chunking.title import chunk_by_title

chunks = chunk_by_title(
    elements,
    combine_text_under_n_chars=100,
    max_characters=3000,
)
```

Two parameters worth understanding:

- `max_characters` — the hard ceiling. Sections longer than this get split.
- `combine_text_under_n_chars` — merges runs of tiny elements together, so a stack of
  one-line headings doesn't become a stack of near-empty chunks.

This lands somewhere between Level 2 and Level 3 on Kamradt's ladder, but it gets there
differently: not by guessing separators from raw text, but by using structure that was already
recovered during parsing. If you've done the extraction work properly, this is usually the
chunking strategy you want, and it's why I'd reach for it before semantic chunking.

## PDFs need layout detection

PDFs are the reason this whole problem exists, and they get their own approach.

The cheap path extracts the embedded text layer directly. Fast, no model inference, and it works
when the PDF was generated from a word processor:

```python
from unstructured.partition.pdf import partition_pdf

elements = partition_pdf(filename="report.pdf", strategy="fast")
```

The expensive path treats each page as an image and runs a **document layout detection** model
over it — an object detector that draws bounding boxes and classifies each region as title, body
text, table, or figure, then OCRs the contents:

```python
elements = partition_pdf(
    filename="report.pdf",
    strategy="hi_res",
    infer_table_structure=True,
)
```

The tradeoff is stark. `fast` is cheap and returns nothing useful for a scan, because there is no
text layer to extract. `hi_res` handles scans, multi-column layouts, and tables, but you're
paying for model inference over every page.

The decision rule I'd apply: `fast` when you control the documents and know they're
digitally generated, `hi_res` when the corpus is heterogeneous or arrives from users. If you're
unsure, run both on a sample and compare the category distributions — a `fast` pass that returns
almost nothing but `NarrativeText` for a visually structured document is telling you it found the
text and lost the structure.

## Tables

Tables are where naive extraction hurts most, because linearizing a table destroys exactly the
information it encodes. Row and column position _is_ the meaning. Flatten `Q1 100 Q2 150` into a
string and the model has to guess whether 150 belongs to Q2 or to the row below.

With table structure inference enabled, table elements carry an HTML representation alongside the
flattened text:

```python
tables = [el for el in elements if el.category == "Table"]
html = tables[0].metadata.text_as_html
```

HTML preserves the grid. `<tr>` and `<td>` boundaries survive, so a model reading it can still
tell which value sits in which cell. Feeding `text_as_html` to an LLM instead of the flattened
text is a real accuracy difference on anything numeric.

A pattern the course demonstrates and I'd keep: summarize each table with an LLM at ingestion
time, embed the _summary_ for retrieval, and pass the original HTML to the model at generation
time. That's the alternative-representation idea from the chunking post applied to tables
specifically — a prose summary matches a natural-language question far better than a grid of
numbers does, while the model still gets the real data to reason over.

One note if you work through the course: its notebooks pin `gpt-3.5-turbo-1106`, which is well
past its useful life. Substitute a current model — the technique is unchanged.

## What I'd take from it

The framing that stuck: preprocessing is not cleanup, it's **information recovery**. A PDF had
structure when it was authored, the format threw it away, and your job is to reconstruct enough
of it that retrieval has something to work with. Every stage — categories, `parent_id`,
layout detection, table HTML — is recovering signal that the file format discarded.

Which reorders my priorities from the chunking post. Before climbing to semantic or agentic
chunking, check whether you're extracting your documents properly at all. Structure-aware
chunking over well-parsed elements will usually beat clever chunking over badly-parsed text,
and it's cheaper.

I haven't benchmarked `fast` against `hi_res` on a corpus I care about yet. When I do, that
comparison and its eval harness get their own post.
