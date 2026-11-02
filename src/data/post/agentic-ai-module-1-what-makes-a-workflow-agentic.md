---
title: 'Agentic AI, Module 1: What Makes a Workflow Agentic'
excerpt: 'Part 1 of 5 on Andrew Ng’s Agentic AI course: autonomy as a spectrum, why a workflow can beat a better model, how to decompose a task into steps an LLM or a tool can do, and the four design patterns the rest of the course builds on.'
publishDate: 2026-10-07T00:00:00Z
category: 'LLM Engineering'
tags:
  - agents
  - agentic-workflows
  - task-decomposition
  - design-patterns
draft: false
---

Wrapping GPT-3.5 in a simple write, critique and revise loop beat moving to GPT-4 on a coding
benchmark. That result, from Andrew Ng's team, is the case for this whole course. How you structure
the work is a separate lever from which model you use, and on some tasks it's the bigger one.

This series covers DeepLearning.AI's [Agentic AI](https://www.deeplearning.ai/courses/agentic-ai/),
taught by Ng, one module per post. Module 1 is conceptual: what an agentic workflow is, how
autonomous it should be, and how to break a task into steps.

## Writing without backspace

The usual way to use an LLM is one prompt: "write an essay on X." Ng compares that to asking a
person to type an essay start to finish without ever pressing backspace. People don't write well
that way. Models do surprisingly well anyway, but not as well as they could.

An agentic workflow works more like a person:

1. Write an outline.
2. Decide whether research is needed, and do it.
3. Write a draft.
4. Read the draft and decide what needs revising or more research.
5. Revise.

The definition the course settles on is plain: **an agentic workflow is a process where an LLM-based
app executes multiple steps to complete a task.** Some steps are LLM calls (outline, pick search
terms, critique). Some are ordinary software (call a search API, download pages). Some can be a
person, for example checking key facts before the revision.

## Autonomy is a dial, not a label

The field used to argue about what counts as a "real" agent. Ng's fix was to use _agentic_ as an
adjective. Systems can be agentic to different degrees, so stop arguing about the label and build
them. The useful part of the reframe is that autonomy becomes a design choice you make, not a
status you earn.

The same essay task at different settings:

|                       | Less autonomous         | Semi-autonomous          | Highly autonomous        |
| --------------------- | ----------------------- | ------------------------ | ------------------------ |
| Steps                 | Fixed by the programmer | Partly chosen by the LLM | Chosen by the LLM        |
| Tools                 | Hard-coded calls        | LLM picks from a set     | LLM may write new tools  |
| Where the autonomy is | The text it writes      | Text plus tool choice    | Text, tools and the plan |

At the low end, the LLM writes search queries and the code does the rest in a fixed order. At the
high end, the LLM decides which kind of search to run, how many pages to fetch, whether a PDF needs
converting, and whether to go back for more after drafting. The programmer no longer knows the order
of steps in advance.

Ng's key point: **most of the real business value today sits at the less autonomous end.** The high
end is harder to control, less predictable, and still a research area. Start on the left.

## Why it's worth the trouble

**Performance.** On HumanEval, GPT-3.5 prompted directly scored under 50% and GPT-4 scored 67%.
GPT-3.5 inside a workflow that writes code, reflects on it and improves it gained more than the
upgrade to GPT-4 did, and GPT-4 in a workflow did better still. If you're waiting for the next model
to fix quality, look first at how many passes you give the current one.

**Parallelism.** Workflows are slower than one prompt but can be much faster than a person. A person
reads nine search results one at a time. A workflow fetches all nine at once.

**Modularity.** Components can be swapped: a different search engine, an added news search, a
different model or provider for each step. Ng says he does this constantly.

## What's easy and what's hard

Ng's examples run from easiest to hardest:

1. **Invoice processing.** Convert the PDF to text, check whether it's an invoice, extract the fields,
   write them to a database. The process is clear and fixed, which makes it reliable.
2. **Order inquiries.** Extract the order, look it up, draft a reply, and put it in a human review
   queue instead of sending it. Where the autonomy stops is a deliberate choice.
3. **General customer service.** "Can I return this towel?" needs a purchase check, a policy lookup,
   then a packing slip. The steps aren't known in advance, so the LLM has to plan them, and
   reliability drops.
4. **Computer use.** An agent checking flight seats gets stuck on the airline site, switches to
   Google Flights, then goes back to confirm. It works, but browser agents still struggle with slow
   or unparseable pages. Ng calls them exciting and not yet reliable enough for critical work.

The pattern:

| Easier                                            | Harder                                           |
| ------------------------------------------------- | ------------------------------------------------ |
| A clear process, or an existing written procedure | Steps unknown in advance, so the agent must plan |
| Text-only inputs                                  | Images, audio, live web pages                    |

If a business already has a written procedure for the task, most of the design work is done. You're
encoding a process, not inventing one.

## Task decomposition is the core skill

Ng calls this the most important skill in the course. Break the task into steps, and test each step
with one question:

> Can this step be done by an LLM, by a short piece of code, by a function call, or by a tool?

If yes, build it. If not, ask how a person would do it, and break it down further.

The essay example shows decomposition happening over several rounds:

1. **One prompt.** Shallow output that sticks to the obvious points.
2. **Outline, then search, then write.** Better, but in Ng's own build the essays felt disjointed.
3. **Split "write" into draft, critique, revise.** The disjointedness is handled by a step that
   specifically looks for it.

Decomposition isn't a one-time design exercise. You build, read the output, find the weak step, and
decompose _that_ step. The workflow grows where the failures are.

The kit you assemble steps from:

| Building block             | Examples                                                |
| -------------------------- | ------------------------------------------------------- |
| LLMs and multimodal models | Generate text, decide what to call, extract information |
| Other AI models            | PDF-to-text, speech, image analysis                     |
| API tools                  | Web search, weather, email, calendar                    |
| Retrieval                  | Database queries, RAG over documents                    |
| Code execution             | The LLM writes code and runs it                         |

## Evals tell you which step to fix

That build, inspect and fix loop only works if you can tell whether a change helped. The first
version of a workflow is almost never the last, and what drives the iteration is **evaluation**:
measuring the end-to-end output and each component, so you know which step to work on next. Module 1
only introduces evals. They get their own module later.

## The four design patterns

The rest of the course is built on these:

1. **Reflection.** The model critiques its own output and revises it. Running the code and feeding
   back the errors grounds the critique in fact rather than the model's opinion of itself. It's a
   reliable improvement, not magic.
2. **Tool use.** Give the model functions to call, like web search, code execution, databases or
   email. The key ability is the model _deciding_ which one to call.
3. **Planning.** The model decides the sequence of steps. HuggingGPT, asked to pose a generated
   image like an input photo and then describe it aloud, plans pose detection, then pose-guided
   image generation, then captioning, then text-to-speech. It's powerful and harder to control.
4. **Multi-agent collaboration.** Several agents with different roles, like ChatDev's simulated
   software company with a CEO, programmer and tester. Results are harder to predict, but research
   shows gains on complex tasks.

These map onto the autonomy dial. Reflection and tool use fit inside a workflow the programmer still
controls. Planning and multi-agent setups hand more control to the model.

## What I took from module 1

An agentic workflow is a process with steps, not a model with special powers. Seen that way, most of
the work is ordinary engineering: decompose the task, check each step is feasible, choose how much
autonomy you need (usually less than you'd think), and measure so you know which step to fix next.

[Module 2](/engineering/agentic-ai-module-2-reflection) goes deep on the first pattern, reflection.
