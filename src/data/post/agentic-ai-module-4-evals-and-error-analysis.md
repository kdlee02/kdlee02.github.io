---
title: 'Agentic AI, Module 4: Evals and Error Analysis'
excerpt: 'Part 4 of 5 on Andrew Ng’s Agentic AI course: build a quick prototype, read its outputs, count which step causes the errors, and use small end-to-end and component evals to decide what to work on next.'
publishDate: 2026-10-11T00:00:00Z
category: 'LLM Engineering'
tags:
  - agents
  - agentic-workflows
  - evals
  - error-analysis
  - llm-as-judge
draft: false
---

Teams that pick which part of an agent to improve by gut feel can spend months on a component that
barely moves the final output. Andrew Ng says the biggest predictor of how efficient a team is
whether it runs a disciplined error analysis process. He calls this module possibly the most
important in the course.

[Module 3](/engineering/agentic-ai-module-3-tool-use) gave the model tools. This module is about
knowing whether any of it works, and where to look when it doesn't. The loop is simple:

1. Build a quick and dirty system.
2. Read its outputs and find what's wrong.
3. Build a small eval for the problem that matters.
4. Read the intermediate steps to find which component causes it.
5. Improve that component, measured by its own eval, then confirm end to end.

## Build first, then look

It's hard to know in advance where an agentic system will work and where it won't. Ng's advice is to
avoid spending weeks theorizing. Build something quickly, in a responsible way that doesn't leak
data, and let the prototype tell you where to focus.

Then read the outputs. For the invoice workflow from module 1, take 10 or 20 invoices and note what
went wrong on each. Invoice 1 is fine. Invoice 2 confused the invoice date with the due date.
Invoices 3 and 4 are fine. If date mix-ups keep showing up, that's your most common error.

Reading the outputs tells you what to fix, and it also tells you **what to measure**. If the failures
had been on unusual biller names, you'd build an eval for biller extraction instead. Either way, the
eval follows the failure. If you already know how to fix something, just fix it. You need an eval
when improving it will take a series of attempts.

## Three end-to-end evals

**Invoice due dates (code, per-example answer).** Take 10–20 invoices and write down each correct
due date. Tell the model to always output dates as year-month-day, extract the date with a regex, and
compare. Now you have a percentage that should go up as you change prompts.

**Caption length (code, one shared target).** A marketing assistant should write Instagram captions
of at most 10 words, and the outputs keep running to 14 or 17. Run 10–20 products through it and
count the words. Unlike the invoices, there's no per-example answer. The target is 10 for every
example.

**Research agent key points (LLM judge, per-example answer).** The research agent sometimes misses
a point an expert would include, like a major black hole result that got wide news coverage. For each
test topic, write 3–5 gold-standard talking points. Then ask an LLM judge how many of them appear in
the essay, returning a score and an explanation as JSON. A regex can't do this, because there are
too many ways to mention an event horizon.

Those examples fill out a two-by-two grid:

|                         | Per-example ground truth     | Same target for every example                                                      |
| ----------------------- | ---------------------------- | ---------------------------------------------------------------------------------- |
| **Code checks it**      | Invoice due date             | Caption ≤ 10 words                                                                 |
| **LLM judge checks it** | Gold-standard talking points | Chart graded on a rubric ([module 2](/engineering/agentic-ai-module-2-reflection)) |

All four are **end-to-end** evals. They measure the final output for a given input, across the whole
system.

### Tips for end-to-end evals

- **Quick and dirty is fine to start.** Ng sees teams freeze because they think an eval is a
  multi-week project. Start with 10–20 examples and some code or a judge prompt. The metric
  complements reading outputs, not replaces it.
- **Iterate on the eval too.** If you change the system, believe it's clearly better, and the eval
  doesn't show it, the eval is wrong. Add examples, or change how you score until it matches your
  judgment. Over time you can trust the metric more and read fewer outputs.
- **Use human performance as the guide.** Most agentic workflows automate something people already
  do. Look for where the system falls short of an expert. That's where to work next.

## Error analysis: which step is responsible?

An end-to-end eval tells you the research agent misses key points. It doesn't tell you why. Almost
any step could be the cause:

- the search terms were poor
- the search engine returned weak results
- the model picked the wrong pages to read
- the model ignored points in the pages it read

Ng's method is to **read the traces**. A trace is the full set of intermediate outputs from one run.
The output of a single step is sometimes called a span, a term borrowed from software observability.

For the black hole query, the search terms look like what a human expert would use. The search
results, though, include "Elementary school student claims to crack 30-year-old black hole mystery"
from a kids' news site. Too many results are blogs and popular press, and too few are scientific
sources.

### Count the errors in a spreadsheet

To make it systematic:

1. **Collect only the failures.** Set aside runs where the output was fine.
2. **For each failure, mark which steps did noticeably worse than an expert would have with the same
   input.**
3. **Count.**

Step 2 has a subtlety. If the search results were all weak, don't blame the next step for picking
weak sources. Given what it had, it did about as well as a person could. Judge each step against
its _own input_, not against the ideal.

| Step           | Share of failures |
| -------------- | ----------------- |
| Search terms   | 5%                |
| Search results | 45%               |
| ...            | ...               |

Columns don't add up to 100%, because one failure can have several causes.

In this example, search results are the problem. Double-check that bad search terms weren't feeding
them, then work on the search engine: try another provider or tune its parameters.

### Two more examples

- **Invoice due dates.** Collect 10–100 invoices where the date was wrong. For each, ask whether the
  PDF-to-text output was so garbled that even a person couldn't find the date, or whether the text
  was fine and the LLM picked the wrong date. In Ng's example, most errors came from the LLM step.
  Without that count, a team could spend weeks tuning PDF conversion for almost no gain.
- **Customer email replies.** Possible causes are a bad database query, bad data in the database, or
  a poorly written reply. Ng's example found 75% of errors in the generated query, about 30% in the
  reply, and a few in the data. Fix the query first, then the reply prompt.

### Deciding what to fix

Error frequency is half the decision. The other half is whether you have ideas for fixing that
component. A step that causes many errors and that you know how to improve goes to the top. A step
that causes errors and that you have no ideas for drops down.

## Component-level evals

Once error analysis points at a component, rerunning the whole workflow to test each change is slow
and expensive. It's also noisy, because randomness in the other steps can hide a small improvement.

So build an eval for just that component. For web search, have an expert list the authoritative
sources for a handful of queries. Then measure how much the search results overlap with that list,
using a standard retrieval metric such as F1. Now you can swap search engines, change the number of
results, or adjust the date range, and see the effect right away.

Benefits:

- **A clearer signal** for the one thing you're changing, without noise from the rest of the system.
- **Faster iteration**, since you run one step instead of the whole workflow.
- **Separate goals for separate teams.** A team that owns one component can optimize its own metric.

Run an end-to-end eval before calling it done, to confirm the component gains carried through to the
final output.

### The lab: checking where the sources come from

The lab pulls the research step out of the module 3 agent and evaluates it alone. The step is an LLM
with three tools (arXiv, Tavily web search, Wikipedia) and the task "find 2 recent papers about
recent developments in black hole science." It also tells the model today's date, which helps on
time-sensitive queries.

The eval is plain code:

1. Pull every URL out of the research step's output.
2. Check each domain against a list of preferred domains, such as `arxiv.org`, `nature.com` and
   `nasa.gov`.
3. Compute the share of preferred sources and pass if it's at least 40%.

This is cheaper than grading whole essays, and a proper eval set would be about 10 prompts across
topics like astronomy, robotics and finance, each with its own preferred domains.

I haven't run it, and three things in the code stand out:

- **It measures what the model cited, not what search returned.** The URLs come from the LLM's final
  text, so a search engine returning junk that the model then filters out would still pass. That's
  a fine metric, but for the selection step, not the search engine. Error analysis has to blame the
  right step.
- **The domain check is a substring match.** A domain counts as preferred if any listed domain
  appears anywhere inside it, so `smit.edu` would match `mit.edu`. Matching on the domain's
  ending is the safer check.
- **The preferred list is one global list.** It includes `codecademy.com` and `datacamp.com` next to
  `nasa.gov`, so it isn't really per-example ground truth yet. That gap is exactly what the
  10-prompt eval set would close.

## Improving a component

**Non-LLM components** (search engines, retrieval, code execution, trained models for speech or
image detection) usually have parameters to tune:

- web search: number of results, date range
- retrieval: similarity threshold, chunk size
- a detector: confidence threshold, which trades false positives against false negatives

You can also swap the component for another provider. Ng does this often.

**LLM components**, roughly from cheapest to most expensive:

1. **Improve the prompt.** Add explicit instructions, or add few-shot examples of input and desired
   output.
2. **Try a different model** and let the evals pick.
3. **Split the step.** If one call has too many instructions to follow, break it into two or three
   simpler calls, or into a generate step and a reflect step.
4. **Fine-tune.** It costs much more developer time. Ng saves it for mature applications that are
   stuck at, say, 90–95% and need the last few points.

### Building intuition about models

Choosing models gets faster when you know what different ones are good at. Ng's example is a prompt
to redact personal information from a call summary. A small open model (Llama 3.1, 8B) returned the
list in the wrong place, repeated it, missed the customer's name and left part of the address. A
larger frontier model listed and redacted everything correctly. Larger models tend to be much
better at following complex instructions. Smaller ones handle simple factual questions fine.

How Ng builds that intuition:

- **Try new models when they come out,** both proprietary and open-weight. A small personal set of
  test prompts helps compare them.
- **Read other people's prompts.** He reads published prompts, swaps prompts with friends at model
  companies, and digs through open-source packages by authors he respects.
- **Swap models inside your own workflows** and compare traces or evals. You learn price and speed
  trade-offs as well as quality.

## Cost and latency come after quality

Ng tells teams to get output quality high first, because that's usually the hardest part. He has
shipped workflows whose costs became a problem only because so many people used them, which he calls
a good problem to have.

When you do optimize, the method is the same as error analysis: measure each step, then work on the
biggest contributor.

**Latency.** Time every step. In Ng's research-agent example, generating search terms takes 7
seconds, web search 5, the next two steps 3 and 11, and writing the essay 18. With that timeline:

- Run independent steps, like page fetches, in parallel if they aren't already.
- Try a smaller, slightly less capable model on a slow LLM step and check it's still good enough.
- Try a faster provider for the same model. Some companies run specialized hardware that returns
  tokens much faster.

**Cost.** Add up the cost of each step the same way. LLM providers charge per input and output token,
many APIs charge per call, and your own compute costs whatever the servers cost. In Ng's example, one
LLM step averages 0.04 cents in tokens while each web search call costs 1.6 cents. The per-step
totals show whether a cheaper model, a cheaper API or a cheaper PDF-to-text service would make a
difference.

Ng finds this exercise clarifying in both directions. It shows where to optimize, and it also shows
which components aren't worth worrying about because they barely contribute to cost or latency. In
that example, the web search costs 40 times as much as the LLM step before it, so a cheaper model
there would save almost nothing.

## What I took from module 4

Error analysis turns "it's not good enough" into "45% of failures start at search results." It's
mostly reading traces and counting, with no special tooling. The skill is judging each step against
its own input, so you blame the step where things first went wrong and not the ones downstream.

The evals don't need to be big. Twenty examples and a regex are enough to tell whether a prompt
change helped. The important habit is treating the eval as something you fix when it disagrees with
your judgment, not as a fixed scoreboard.

[Module 5](/engineering/agentic-ai-module-5-planning-and-multi-agent-systems) covers the remaining patterns, planning and multi-agent systems.
