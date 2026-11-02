---
title: 'Normalizing Documents Into One Element Schema'
excerpt: 'Part 1 of 3 on preprocessing unstructured data for LLMs: turning HTML, PowerPoint and PDF into the same list of typed elements, and saving the result so you only pay for extraction once.'
publishDate: 2026-09-30T00:00:00Z
category: 'RAG'
tags:
  - retrieval
  - preprocessing
  - pdf
draft: false
---

Your RAG pipeline shouldn't care whether a document was a PDF, a slide deck or a web page. Getting
there is the step before chunking, and it fails more often than chunking does.

This is part 1 of three posts on DeepLearning.AI's
[Preprocessing Unstructured Data for LLM Applications](https://www.deeplearning.ai/short-courses/preprocessing-unstructured-data-for-llm-applications/),
built around the [`unstructured`](https://github.com/Unstructured-IO/unstructured) library. This
part covers normalization. Part 2 is metadata and chunking, and part 3 is PDFs and tables.

## One schema for every format

Break every document into the same small set of typed elements, whatever the source: `Title`,
`NarrativeText`, `ListItem`, `Table`, `Header`, `Footer`. Each element carries its text and
metadata.

What that buys you:

- **One filter for all formats.** Dropping headers, footers and navigation chrome is one line over
  the element list, not one per file type.
- **One chunking strategy.** Chunking runs on elements, so you don't build a splitter per format.
- **Cheap experiments.** Extraction is the expensive stage, especially for PDFs and images, which
  need model inference. Chunking is cheap. Normalize once, save the result, and you can try a dozen
  chunking strategies without re-extracting anything.

## Each format gives a different signal

The output is the same, but how the parser decides what each block _is_ differs:

| Format      | What the parser reads                                                      |
| ----------- | -------------------------------------------------------------------------- |
| HTML        | Tags. `<h1>` is likely a title, `<p>` likely narrative text.               |
| PPTX / DOCX | XML inside the zip, read with rules. Old `.ppt` converts to `.pptx` first. |
| PDF / image | Visual cues: bold, size, position, block shape. There are no tags.         |

For HTML, a tag is a hint, not the answer. A long multi-sentence `<p>` is almost certainly narrative
text, while a short all-caps `<p>` is probably a title. The library combines the tag with a light
read of the text itself.

PDFs are the odd one out. Nothing in the file says "this is a heading," so you infer it from how the
text looks. That's a job for a model, which is why the course sends PDFs to a hosted API instead of
parsing them locally. Part 3 covers how that works.

## Different sources, same types

In the course's examples, the first paragraph of a Medium post comes back as `NarrativeText`. In a
PowerPoint deck about OpenAI, bolded bullets come back as `ListItem` and the slide heading
"ChatGPT" as `Title`. In the chain-of-thought paper PDF, "All experimental results" is detected as
a `Title` from its bold text and position.

A blog `<h1>`, a slide title and a bold line in a PDF are different things in different files.
After partitioning they share a type, and everything downstream treats them alike. That's the whole
point.

## Save the elements so nobody re-extracts them

The course serializes the elements to JSON, and the reasons hold up:

- It's the format the hosted API already returns for PDFs and images.
- It's language-neutral. Preprocess in Python, load in a JavaScript app.
- It streams as JSONL, one element per line, for large corpora.

## Try it on your own file

Before going further, run the partitioner on one of your own documents. Seeing where the classifier
gets your files wrong tells you more than the demo files do.

Normalization gives you a flat list of typed elements. What makes retrieval better is what's
attached to them: source, page, and hierarchy. [Part 2](/engineering/metadata-extraction-and-chunking)
covers that.
