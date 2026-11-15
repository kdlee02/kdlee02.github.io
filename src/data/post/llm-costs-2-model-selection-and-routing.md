---
title: 'Optimizing LLM Costs, Part 2: Picking the Right Model for Each Request'
excerpt: 'Does every question need the expensive AI model? Comparing a cheap and a premium model on the same question, building a simple router that picks one per request (and honestly measuring that it saved only 2.5%), and planning for bad answers and outages. Part 2 of a series.'
publishDate: 2026-11-19T00:00:00Z
category: 'LLM Engineering'
image: ~/assets/images/covers/llm-costs-2-model-selection-and-routing.svg
series: 'Optimizing LLM Costs'
seriesPart: 2
tags:
  - llm-costs
  - production
takeaways:
  - 'Set the quality standard first, then compare models against it.'
  - 'Cost is price times length: how much a model writes matters as much as its rate.'
  - 'Measure what routing saves. A perfect router saved only 2.5% here, because the mix of questions decides.'
  - "Translate every company's reply into one format, and check how each counts thinking tokens."
  - 'Plan for bad answers and outages, and count every rejected answer as money spent.'
draft: false
---

_Based on CodeSignal's course "Model Selection and Routing in Python", the second of four courses in its "Optimizing
LLM Costs in Python" path. [Part 1](/engineering/llm-costs-1-measuring-what-a-request-costs) covers how the bill
works. Numbers come from the lessons' own runs and vary slightly each time._

AI companies sell models in tiers. In this course the premium model, `gpt-5.6-sol`, costs five times as much as the
cheap one, `gpt-5.6-luna`. Sending every question to the premium model is like taking a taxi for every trip, even to
the corner shop.

But a cheap answer that's wrong is the most expensive kind. So choosing a model means balancing three things: **cost**,
**quality** (is the answer good enough?), and **availability** (did the model answer at all?).

## Same question, two models

The course sends one question about database indexes to both models:

| Model          | Cost      | Answer                       |
| -------------- | --------- | ---------------------------- |
| `gpt-5.6-luna` | $0.000535 | Correct, names two tradeoffs |
| `gpt-5.6-sol`  | $0.001775 | Correct, names one tradeoff  |

The premium answer cost about 3.3× more and was no better. (It wasn't the full 5× because the cheap model wrote a
longer answer. Cost is price times length.) At 5,000 questions a day, that difference is about $2,250 a year.

The important habit: **decide what a good answer looks like before reading the replies.** Here the standard was
"explains how indexes work and names one tradeoff", and both passed. Quality is a requirement to meet, not something
you trade for savings.

One question is evidence, not proof. Harder tasks are where premium models earn their price.

![Same question, two models. The quality bar is set first: the answer must explain how indexes work and name one tradeoff. The question about database indexes goes to gpt-5.6-luna, the cheap tier, which answered correctly with two tradeoffs for $0.000535, and to gpt-5.6-sol, the premium tier at five times the price, which answered correctly with one tradeoff for $0.001775. Premium cost 3.3 times more for no better answer; not the full 5 times, because the cheap model wrote a longer answer.](../../assets/images/llm-costs-2/same-question.svg)

## A router made of simple rules

A real app needs something that picks a model before each request. That's a **router**. The course's router sends a
question to the premium model if it contains a "hard task" word or is very long:

```python
HARD_KEYWORDS = {"analyze", "debug", "design", "prove", "refactor", "strategize"}

def choose_model(prompt: str) -> str:
    words = set(prompt.lower().split())
    hard_task = bool(words & HARD_KEYWORDS)   # any hard word in the question?
    long_task = len(prompt) > 500
    return PREMIUM_MODEL if hard_task or long_task else CHEAP_MODEL
```

It's free to run, but it's a guess. The word list needs tuning against real questions.

One small habit matters a lot: the code passes the same model name to both the API call and the cost calculation.
That way a request can never be billed at the wrong model's price, the classic bug in apps that mix models.

### What it actually saved

Four questions, routed versus all-premium:

```text
gpt-5.6-luna    $0.000049  Classify this review as positive or negative: I loved it.
gpt-5.6-luna    $0.000075  Summarize this sentence in five words: Caching avoids repeated work.
gpt-5.6-sol     $0.008600  Debug a recursive function that overflows the stack.
gpt-5.6-sol     $0.049675  Design a migration strategy for a database with zero downtime.

All-premium baseline: $0.059885
Routed workload:      $0.058399
Savings:              $0.001486
```

![Why routing saved only 2.5%. On the left, the routing rule: a prompt with a hard-task keyword or more than 500 characters goes to gpt-5.6-sol, everything else to gpt-5.6-luna. On the right, the four routed costs as horizontal bars on one scale: classify $0.000049 and summarize $0.000075 on the cheap model are almost invisible, debug $0.008600 on the premium model is a short bar, and design $0.049675 on the premium model fills most of the width. The design answer alone is 85% of the routed total of $0.058399, so moving the two tiny requests to the cheap model barely changes the bill.](../../assets/images/llm-costs-2/router-savings.svg)

The router chose correctly every time and saved **2.5%**. One hard question was 85% of the bill, and it rightly
stayed on premium. Routing only pays when a lot of your traffic is simple. In part 4, the same idea on a real chatbot
saves nearly half. You only find out by measuring.

## One format for three AI companies

OpenAI, Anthropic and Google each return answers in a different format, like three shops with three receipt layouts.
The fix is a small translator (an **adapter**) per company that copies the same facts onto one standard form: the
answer, the model, tokens in, tokens out, cost. The rest of the app only reads the standard form.

![Three provider adapters feeding one shape. OpenAI: request with input=, text at response.output_text, usage as input_tokens and output_tokens. Anthropic: request with a messages list and a required max_tokens, text at response.content[0].text, usage as input_tokens and output_tokens. Google: request with contents=, text at response.text, usage as prompt_token_count plus candidates_token_count plus thoughts_token_count, with the thinking tokens added into output. Each adapter returns the same Completion record with text, provider, model, input_tokens, output_tokens and cost, priced by one shared call_cost function. Code above the adapters only ever reads Completion fields.](../../assets/images/llm-costs-2/provider-adapters.svg)

One detail matters for cost. Companies count the model's hidden thinking differently: OpenAI includes it in the
output count, while Google reports it separately, so you must add it yourself. Get this wrong and one company's costs
look too high or another's too low.

Another one: Anthropic's API requires you to set `max_tokens` on every call. That's also a ceiling on the output you
pay for, so it doubles as a cost limit.

The same question through all three:

```text
openai     gpt-5.6-luna             in=  10 out=  33 $0.000208
anthropic  claude-haiku-4-5         in=  13 out= 134 $0.000683
google     gemini-3.5-flash-lite    in=  20 out= 174 $0.000441
```

The differences come mostly from how much each model wrote.

## When the answer is bad or the model is down

The router assumes its pick answers well, and answers at all. Neither is guaranteed. So each tier gets an ordered
backup list, and each answer gets a simple quality check (does it contain the words it must?):

![The route() flow. choose_tier() reads the prompt and picks the cheap or premium list. route() takes the next model in that list and calls it. If the call raises an error, it records the error and moves to the next model in the same list. If the call succeeds but the answer fails the required-terms check, the call has still been paid for, and it moves to the next model. If the answer passes, route() returns it immediately and no later model is called. If the list runs out, it raises RuntimeError with the last error. A note marks that a request never moves from the premium list to the cheap one, and in this lesson the cheap list never moves up to premium either.](../../assets/images/llm-costs-2/fallback-chain.svg)

In code, the whole backup list is one loop:

```python
for provider, model in FALLBACKS[tier]:
    try:
        result = PROVIDERS[provider](prompt, model)
    except Exception as error:
        last_error = error
        continue                      # crashed: try the next model
    if passes_quality_check(result, required_terms):
        return result                 # good answer: stop here
                                      # bad answer: already paid, try the next model
raise RuntimeError(f"No acceptable response: {last_error}")
```

- **The first good answer wins.** Later, pricier models are never called.
- **A rejected answer still costs money.** A backup list that's used constantly doubles your bill.
- **An outage never lowers the tier.** If one premium model is down, the request goes to another premium model, not a
  cheap one.

Two more points from the lesson. Decide which models go on each list, and in what order, by testing them on your own
tasks, not by price or brand. And match the quality check to the job: for structured data, check every field is
there; for code, run its tests; for factual answers, check the sources.

In the lesson's run, both questions were answered on the first try, so the backups were never used. The lesson never
shows one actually happening.

## Where this breaks

From reading the code:

- **A failed cheap answer never moves up to premium.** It tries other cheap models, then gives up. Part 4 fixes this.
- **The quality check is word matching.** A wrong answer containing the right words passes.
- **The final error can hide the cause.** It only remembers crashes. If every model answered but every answer failed
  the check, nothing crashed, so the message reads `No acceptable response: None`. Remembering the last rejected
  answer too would make it say what actually happened.

![Three gaps in the router, found by reading the code. A failed cheap answer never moves up to premium: it tries other cheap models, then gives up; part 4 adds the escalation. The quality check is word matching, so a wrong answer containing the right words passes; the course has no fix for this. The final error only remembers crashes, so when every answer failed the check it reads "No acceptable response: None"; remembering the last rejected answer too would say what happened.](../../assets/images/llm-costs-2/routing-gaps.svg)

Next, [part 3](/engineering/llm-costs-3-reducing-llm-work) shrinks the requests themselves.
