---
title: 'Optimizing LLM Costs, Part 1: Where the Money Actually Goes'
excerpt: 'Every question you send to an AI model comes with a small bill. How that bill is calculated, why answers cost more than questions, why "thinking" makes short answers expensive, and how to keep a record so you can prove later that you saved anything. Part 1 of a series.'
publishDate: 2026-11-18T00:00:00Z
category: 'LLM Engineering'
image: ~/assets/images/covers/llm-costs-1-measuring-what-a-request-costs.svg
series: 'Optimizing LLM Costs'
seriesPart: 1
tags:
  - llm-costs
  - production
draft: false
---

_Based on CodeSignal's course "Measuring and Understanding LLM Costs in Python", the first of four courses in its
"Optimizing LLM Costs in Python" path. Numbers come from the lessons' own runs and vary slightly each time._

Every time an app sends a question to an AI model, the AI company charges a tiny amount. One question costs a
fraction of a cent, but thousands a day add up. Before you can cut that bill, you need to know how to read it.

## The bill is a receipt, not a single price

AI models read and write **tokens**: small chunks of text, usually a word or part of a word. _"Give three practical
ways to reduce the cost of an LLM request."_ is 14 tokens. Companies charge per token, listed per million because one
token costs so little.

Prices for the model used in this course, `gpt-5.6-luna` (August 2026):

| Part of the bill | What it is                       | Per million tokens |
| ---------------- | -------------------------------- | ------------------ |
| Input            | The question you send            | $1.00              |
| Cache write      | Text the company saves for reuse | $1.25              |
| Cached input     | Saved text being reused          | $0.10              |
| Output           | The answer the model writes      | $6.00              |

The cache lines are covered in part 3. The key line is the last one: **writing costs six times as much as reading.**

Which number should you trust? The company's token counts are accurate. The cost you calculate from them is your own
estimate using your price list. The invoice is the final word, since discounts, rounding and non-token charges (like
images or search tools) can change it. In this series, "cost" means the calculated estimate.

A real example from the course:

```text
Input tokens:     19
Output tokens:    32
Calculated cost:  $0.000211
```

The question cost $0.000019 and the answer cost $0.000192. The answer was under twice as long but cost ten times as
much.

![One request's bill, drawn as a receipt. The input total splits into three line items: fresh input at $1.00 per million tokens, cache writes at $1.25 and cached input at $0.10. The output total is one line item at $6.00 per million, and reasoning tokens are drawn inside the output box, not next to it, because they are already part of the output count. The total at the bottom is the sum of the four line items; reasoning is not added again.](../../assets/images/llm-costs-1/token-receipt.svg)

## "Thinking" costs money too

Newer models do hidden scratch work before answering, called **reasoning tokens**. You never see them, but you pay for
them at the output price. That's why a three-sentence reply can cost like an essay.

The company already counts reasoning inside the output total. A common bug is adding it again, which charges it twice.

## Predicting the cost before you ask

You can count a question's tokens on your own computer, for free, with a library like `tiktoken`:

```python
import tiktoken

encoding = tiktoken.get_encoding("o200k_base")
len(encoding.encode("Give three practical ways to reduce the cost of an LLM request."))  # 14
```

The answer's length is unknown until it's written, so you have to guess. The course guessed 80 tokens:

```text
Predicted:  14 input, 80 output, $0.000494
Actual:     20 input, 148 output (39 of them thinking), $0.000908
```

![Estimated versus actual usage for one request, as three pairs of bars. Input: 14 tokens estimated against 20 reported, a small gap. Output: 80 tokens estimated against 148 reported, of which 39 were reasoning tokens, a large gap. Cost: $0.000494 estimated against $0.000908 calculated from the reported usage, so the estimate was a little over half the real figure, almost entirely because of the output guess.](../../assets/images/llm-costs-1/estimate-vs-actual.svg)

The question count was close (the company adds a little formatting). The answer guess was badly short, and because
output costs 6×, that one miss made the prediction about half the real cost.

**Takeaway:** you can predict the question, not the answer. If you need a firm budget, set a limit on answer length.

## Keep the cost math in one place

If every part of an app calculates costs its own way, the copies drift apart: one forgets a price update, another
counts reasoning twice. The course puts it all in one place:

- **One price list** for every model.
- **One calculator** that turns token counts into dollars, testable without spending anything.
- **One function that talks to the AI company** and returns the answer with its cost attached.

The rest of the app never touches prices.

![The cost layer as a flow. A call site sends a prompt and model to generate(). generate() first looks up the model's rates with price_for(), which reads the PRICING table and fails clearly for an unknown model. It then calls the provider, extracts the usage fields, and passes plain token counts to calculate_cost(), a pure function with no API access. The result is a Completion record with the text, model, token counts and cost. Each Completion is appended to a spend.jsonl log, and a report reads the log back to compute the total spend, spend per model and the most expensive call.](../../assets/images/llm-costs-1/cost-layer.svg)

## Keep every receipt

To prove a change saved money, you need a record of what things cost before. So every request gets saved to a file,
one line each, with its model, tokens and cost. A short script then reports total spend, spend per model, and the
most expensive request.

The course ran three questions, two on the cheap model and one on an expensive one (`gpt-5.6-sol`, 5× the price):

```text
$0.000120  gpt-5.6-luna    Define latency in one sentence.
$0.000561  gpt-5.6-luna    Summarize why prompt caching reduces cost.
$0.035320  gpt-5.6-sol     Analyze the tradeoffs of model routing.

Total spend: $0.036001
```

One request was **98% of the bill**. Three requests prove nothing about a real app, but the method is the point: with
a record of every request, "what's eating our budget?" becomes easy to answer.

## What to remember

- The bill is split into parts, and **answers cost much more than questions** (6× here).
- **Hidden thinking is billed as output.** It's already in the total; don't add it twice.
- **You can predict the question's cost, not the answer's.** Limit answer length for a firm budget.
- **Keep all cost math in one place.**
- **Record every request**, so you can prove later what a change saved.

Next, [part 2](/engineering/llm-costs-2-model-selection-and-routing) asks whether each question needed the expensive
model in the first place.
