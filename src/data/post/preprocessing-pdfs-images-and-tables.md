---
title: 'Preprocessing PDFs, Images, and Tables'
excerpt: 'Part 3 of 3 on preprocessing unstructured data for LLMs: layout detection vs vision transformers, when to pay for model-based PDF parsing, and why extracted tables look right and are quietly wrong.'
publishDate: 2026-09-30T00:00:00Z
category: 'RAG'
tags:
  - retrieval
  - preprocessing
  - pdf
  - tables
draft: false
---

An HTML file tells you `<h1>`. A PDF only tells you where the ink goes. For PDFs and images, you
have to recover structure from how the page looks, and tables are where that goes wrong most often.

[Part 1](/engineering/normalizing-unstructured-documents) normalized formats that carry their own
structure, and [part 2](/engineering/metadata-extraction-and-chunking) used that structure for
filtering and chunking. This part follows lessons 4 and 5 of DeepLearning.AI's
[Preprocessing Unstructured Data for LLM Applications](https://www.deeplearning.ai/short-courses/preprocessing-unstructured-data-for-llm-applications/).

## Two ways to read a page image

**Document layout detection** takes two steps:

1. An object-detection model (the course uses YOLOX) draws boxes around regions and labels each one:
   title, narrative text, list, table.
2. The text inside each box is extracted. If the PDF has a text layer, map the box onto it and read
   the text directly. If not, as with a scan, run OCR on the box.

**Vision transformers** do it in one step: page image in, text out. The course's example is Donut,
trained to emit JSON with each element's text and category. Like an LLM, it can take a prompt.

Both produce the same element schema as part 1.

|                       | Layout detection                      | Vision transformer                    |
| --------------------- | ------------------------------------- | ------------------------------------- |
| Element types         | Fixed set, recognized reliably        | Flexible, extendable by prompting     |
| Traceable to the page | Yes, via bounding boxes               | No                                    |
| Model calls           | Up to two (detection + OCR)           | One                                   |
| Failure mode          | Misses anything outside its label set | Generative, can hallucinate or repeat |
| Cost                  | Cheaper                               | More compute                          |

My read: layout detection is the default for ordinary documents. A vision transformer earns its cost
on unusual layouts like forms, where you want key-value pairs that a fixed label set doesn't cover.

## When to pay for model-based parsing

The cheap path reads the PDF's embedded text layer. There's no model, it's fast, and it works for
digitally generated documents. On a scan it returns nothing, because there's no text layer.

The expensive path runs layout detection and OCR on every page. It handles scans, multi-column
layouts and tables, and you pay for inference on every page.

The course parses one CNN article on El Niño both ways, as HTML with rules and as a PDF with layout
detection, and counts element types. These are the lecture's numbers:

| Source                 | Elements | NarrativeText | Title-like |
| ---------------------- | -------- | ------------- | ---------- |
| HTML (rules)           | 35       | 23            | 10         |
| PDF (layout detection) | 39       | 28            | 10         |

The results are close. One article in two formats gives nearly the same elements, so downstream code
treats them alike.

The HTML side isn't clean, though. Its "titles" include `CNN`, the byline and `Source: CNN`. A count
of 10 titles doesn't mean 10 real section headings, and chunk-by-title would break on that chrome
if you left it in.

My rule:

- **Text-layer parsing** when you control the documents and know they're digitally generated.
- **Model-based parsing** when the corpus is mixed or comes from users.
- **Unsure?** Run both on a sample and compare the category counts. A cheap pass that returns
  nothing but `NarrativeText` for a visually structured document found the text and lost the
  structure.

## Tables

Flatten a table into a string and the model has to guess which number belongs to which column, but
position in the grid _is_ the meaning.

HTML and Word documents keep table structure in the file. PDFs and images have to find the table
visually and then work out its grid. The course covers three ways:

- **Table transformer.** Layout detection finds the table, a second model boxes each cell, and the
  result becomes HTML. Every cell traces back to the page. It's expensive, with multiple detection
  and OCR calls.
- **Vision transformer.** One call, with HTML as the output. It's flexible and promptable, but it's
  generative, so it can hallucinate cells, and you lose the boxes.
- **OCR plus rules.** OCR the table region and post-process into HTML. It's fast and good on
  well-behaved tables, and less so on irregular ones.

### What a real extraction looks like

The example is Table 1 from a paper on corrosion inhibitors. The flattened text comes out like this:

```text
Inhibitor be (V/dec) ba (V/dec) Ecorr (V) icorr (A/cm?) Polarization Corrosion
concentration (g) resistance (Q) rate (mm/year) 0.0335 0.0409 —0.9393 0.0003 ...
```

Try answering "what's the corrosion rate at the second concentration?" from that. The header words
are interleaved, and nothing marks where a row ends.

The HTML version restores seven columns and puts each value in a row. Give an LLM the HTML, not the
flat text. On anything numeric, that's a real accuracy difference.

But the HTML is better, not correct. From the notebook's own output:

- **The column that labels each row is almost empty.** Five of six rows have a blank inhibitor
  concentration, and the sixth says `ORNO`, which is OCR noise.
- **Symbols are wrong.** `A/cm?` should be A/cm², and `(Q)` should be Ω.
- **Signs are unreliable.** Most negative values come through with an em-dash, which won't parse as
  a number. One lost its sign and leading digit entirely: `.8276` for −0.8276.

None of this raises an error, so a pipeline won't notice. If a table feeds numbers into answers,
spot-check extractions against the page, and convert dashes to minus signs before anything parses
them.

### Summarize for retrieval, keep the HTML for generation

An HTML grid is a poor thing to embed, since a plain-language question isn't close to a wall of
`<td>` tags. The course's fix: have an LLM summarize each table at ingestion, embed the summary, and
give the model the original HTML when the summary matches. Prose matches questions, and the model
still reasons over the real numbers.

The summary inherits every extraction error. If the concentration column is blank, the summary can't
say which concentration worked best, and it may confidently guess.

## What I'd take from the series

Preprocessing isn't cleanup, it's **information recovery**. A PDF had structure when it was written,
the format threw it away, and each part of this series recovers some of it:

1. Element categories, so every format shares one schema (part 1).
2. `parent_id` and metadata, for hierarchy and filtered search (part 2).
3. Layout detection and table HTML, for formats that give you nothing (this part).

That changes my priorities from the [chunking post](/engineering/five-levels-of-text-splitting).
Before reaching for semantic or agentic chunking, check whether the documents are extracted properly
at all. Chunk-by-title over well-parsed elements will usually beat clever chunking over badly parsed
text, and it's cheaper. The corrosion table shows why you check: the extraction looked fine and was
quietly wrong.

I haven't benchmarked cheap against model-based parsing on a corpus I care about. When I do, that
comparison and its eval harness get their own post.
