---
title: 'Agentic AI, Module 2: Reflection'
excerpt: 'Part 2 of 5 on Andrew Ng’s Agentic AI course: having an LLM critique and rewrite its own output, how to tell whether that helped, and why reflection only really works when you hand the model a fact it did not have.'
publishDate: 2026-10-08T00:00:00Z
category: 'LLM Engineering'
tags:
  - agents
  - agentic-workflows
  - reflection
  - evals
  - llm-as-judge
draft: false
---

I asked `gpt-4.1` to review its own SQL query, and it approved a query that returned the wrong
answer. Then I gave it the same review prompt plus one row of the query's output, and it found the
bug immediately. That gap is module 2 of Andrew Ng's
[Agentic AI](https://www.deeplearning.ai/courses/agentic-ai/) course in a single example.

[Module 1](/engineering/agentic-ai-module-1-what-makes-a-workflow-agentic) previewed four design
patterns. Reflection is the first. Ng says it's easy to implement, and it is. The judgment lies in
knowing when it's worth the extra step and what to give the reviewing model. The outputs quoted below
are from my own runs of the two labs.

## How reflection works

You don't send the first draft of an important email. You reread it, notice "next month" is vague,
fix a typo, and send v2. Reflection is that loop with an LLM on both sides:

1. Prompt an LLM for a first draft.
2. Give the draft to an LLM again with a different prompt: review it and write an improved version.
3. Use v2.

In its simplest form that's two hard-coded calls, low on the autonomy dial, which is part of why it's
reliable. The reviewer doesn't have to be the same model. Ng often uses a fast model for the draft
and a reasoning model for the review, since reasoning models are good at finding bugs.

Ng is careful about expectations. Reflection isn't magic and usually gives a modest improvement. The
evidence is Madaan et al.'s [Self-Refine](https://arxiv.org/abs/2303.17651), where adding reflection
beat plain prompting (**zero-shot**, meaning no examples in the prompt) on most tasks across
several models.

Where it tends to help:

| Task                           | What the review checks                                     |
| ------------------------------ | ---------------------------------------------------------- |
| Structured output (HTML, JSON) | Formatting errors, especially in deeply nested JSON        |
| Step-by-step instructions      | Missing or out-of-order steps                              |
| Name brainstorming             | Hard to pronounce, or a bad meaning in some language       |
| Emails                         | Tone, and whether every fact, date and promise is accurate |

### Writing the review prompt

- **Say it's a review of a draft.** "Review this first draft of an email" works better than a bare
  "improve this."
- **Give explicit criteria.** "Check each name is easy to pronounce. Check it doesn't mean something
  negative in any language. Return only the names that pass." The criteria steer the critique.

One dependency to notice: "verify all facts are accurate" only works if the facts are in the
context. The reviewer can't check a date it was never given.

## Lab 1: reviewing a chart by looking at it

The task: plot Q1 coffee sales for 2024 against 2025 from a vending-machine dataset. The workflow
generates plotting code, runs it to produce an image, then gives a multimodal reasoning model
(`o4-mini`) the image plus the code and asks for feedback and new code.

The detail worth noting is that the reviewer sees the _rendered chart_, not just the code. That's
information the generator never had.

My v1 from `gpt-4o-mini` was already a reasonable grouped bar chart:

![Chart v1: pandas default grouped bar chart of Q1 coffee sales by drink, 2024 vs 2025. The legend overlaps the Latte bar.](../../assets/images/agentic-ai-module-2/chart-v1.png)

The reviewer's feedback:

> The original chart relies on pandas' default styling, resulting in generic colors, no grid lines
> or value annotations, and a cluttered legend.

It's right about the legend, which covers the 2025 Latte bar. v2 added value labels, a light grid
and moved the legend:

![Chart v2: the same grouped bars with value labels on every bar, a light grid, and the legend moved clear of the data.](../../assets/images/agentic-ai-module-2/chart-v2.png)

v2 is better. The labels alone show that Cocoa went from 23 to 357 while Cortado barely moved. But it's
a styling pass on a chart that was already the right type, not the dramatic fix in the lecture,
where v1 was a stacked bar chart. Reflection can only fix what v1 got wrong, and how much v1 gets
wrong varies between runs.

## Did reflection actually help?

Reflection adds a call, so it adds latency and cost. Before keeping it, measure it. How depends on
whether there's a right answer.

**Objective tasks.** For an LLM that writes SQL to answer store questions, collect 10–15 questions
with known answers, run with and without reflection, and compare the percentage correct. In Ng's
example it's 87% without and 95% with. Those are his slide's numbers, not mine. Once the eval
exists, it also lets you compare different generation or review prompts directly.

**Subjective tasks.** "Which chart is better?" invites an **LLM judge** that compares the two
images. Ng says that works poorly:

- The verdict is sensitive to the wording of the judge prompt.
- It often disagrees with human experts.
- **Position bias:** many models just pick whichever option comes first.

What works better is grading **one** output at a time against a rubric of **yes/no** criteria. Does
it have a clear title? Are the axes labeled? Is the chart type appropriate? Sum the answers. Models
are poorly calibrated on "rate this 1 to 5" but much more consistent on a checklist.

If you ever do compare two outputs with a judge, run it twice with the order swapped. If the verdict
flips, the judge was choosing by position.

## External feedback is what makes it work

This is the lecture I think matters most. Reflection is much more powerful when the reviewer gets
**new information from outside the model**, not just the context the generator already had.

Ng draws three curves of quality over project time. Prompt-tuning direct generation plateaus. Adding
reflection gives a bump. Reflection with external feedback keeps climbing well past both. His
advice: when prompt tuning stops paying, add a review step, and better still, find a source of
external feedback.

The feedback usually comes from ordinary code:

| Problem                                      | Feedback source                              |
| -------------------------------------------- | -------------------------------------------- |
| Generated code doesn't work                  | Run it, capture output and errors            |
| Emails mention competitors                   | Regex for competitor names                   |
| Essay says the Taj Mahal was "built in 1648" | Web search: commissioned 1631, finished 1648 |
| Copy runs over the word limit                | Count the words                              |

The word count is my favorite because it's so small. LLMs are still bad at hitting an exact length.
A one-line word count that says "you're at 340, the limit is 250" gives the model a fact it can't
produce for itself.

## Lab 2: the SQL bug that text-only review missed

The database is an event log of store transactions. Each row is an insert, a restock, a sale or a
price change. The key detail is that the quantity column is **negative for sales**.

The question: _which color of product has the highest total sales?_ The generated query:

```sql
SELECT color, SUM(qty_delta * unit_price) AS total_sales
FROM transactions WHERE action = 'sale'
GROUP BY color ORDER BY total_sales DESC LIMIT 1;
```

It reads as correct, and it returns `blue, -190571.46`. Since sales quantities are negative, every
total is negative, and sorting descending picks the _least_ negative color, the one with the
smallest sales.

**Review with the SQL text only.** Given the question, the query and the schema, `gpt-4.1` replied
that the query "fully answers the user's question" and returned it unchanged. The schema says the
quantity column is an integer and nothing about its sign. The reviewer had exactly the same
information as the generator and made the same assumption. (The prompt even asked it to judge the
"SQL OUTPUT," which it never saw.)

**Review with the query result.** Same prompt, plus the one-row result. This time:

> The total_sales value is negative, which suggests that qty_delta is negative for sale actions, as
> is common in inventory systems... the absolute value of qty_delta should be used.

The fixed query wraps the quantity in `ABS(...)` and returns `white, 358315.09`. The answer changed
from blue to white. The model didn't get smarter between the two calls. It got a fact it didn't have
before.

`ABS` is only safe here because the query still filters to sales. Without that filter, restocks would
count as sales. The model kept the filter, but that's the kind of thing an eval set catches and a
single example doesn't. A second run gave the same fix, and two runs still aren't an eval.

## What I took from module 2

Reflection is two LLM calls, and writing the second one is easy. The design work is in what you give
it.

When the reviewer has only the generator's context, it tends to share the generator's blind spots.
So before writing a review prompt, I'd ask what new fact I can hand the model: an execution result,
an error message, a rendered image, a regex match, a word count, a search snippet. If I can't think
of one, I'd expect a modest gain at best and want an eval to confirm even that.

[Module 3](/engineering/agentic-ai-module-3-tool-use) is tool use, which lets the model reach for
those feedback sources on its own.
