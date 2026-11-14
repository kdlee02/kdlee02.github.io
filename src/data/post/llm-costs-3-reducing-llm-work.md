---
title: 'Optimizing LLM Costs, Part 3: Sending the Model Less Work'
excerpt: 'Four ways to make AI requests smaller or skip them: trimming old chat messages, asking for short answers, reusing answers to repeated questions, and getting a discount on long prompts that repeat, which is easy to set up wrong so it costs more instead. Part 3 of a series.'
publishDate: 2026-11-20T00:00:00Z
category: 'LLM Engineering'
tags:
  - llm-costs
  - caching
draft: false
---

_Based on CodeSignal's course "Reducing LLM Work and Cost in Python", the third of four courses in its "Optimizing LLM
Costs in Python" path. [Part 1](/engineering/llm-costs-1-measuring-what-a-request-costs) covers the bill and
[part 2](/engineering/llm-costs-2-model-selection-and-routing) covers choosing a model. Numbers come from the
lessons' own runs and vary slightly each time._

Part 2 picked the right model for each request. This part makes the request itself smaller, or skips it. Four
techniques, each attacking a different part of the bill:

| Technique             | What it does                                     |
| --------------------- | ------------------------------------------------ |
| Trim the conversation | Sends fewer tokens each turn                     |
| Ask for less          | Gets a shorter answer (the expensive part)       |
| Reuse whole answers   | Skips the request entirely                       |
| Prompt caching        | Same tokens, but most billed at a tenth of price |

## 1. Trim the conversation

A chatbot resends the whole conversation with every message, so each turn costs more than the last. The fix is a
**token budget** for history: starting from the newest message and working backwards, keep each message that still
fits.

![Trimming a seven-message conversation to a 50-token budget. The messages are scanned from newest to oldest. The newest message, the question about what to measure before adding an index, is kept first, then recent messages are added while they fit. A message that would push the total over 50 tokens is skipped, and the scan keeps going in case an older, shorter message still fits. The kept messages are then put back in time order and sent after the system instruction, which sits outside the budget. Result: 83 tokens of history trimmed to 48, with 4 of 7 messages kept and 35 tokens saved.](../../assets/images/llm-costs-3/history-budget.svg)

The lesson's result with a 50-token budget:

```text
Full history:    83 tokens
Trimmed history: 48 tokens
Messages kept:   4 of 7
Tokens saved:    35
```

The newest question survived and the answer was still good. The saving is small here, but it repeats every turn.

The lesson admits its simple version has flaws: it can drop the newest question if that message alone is over
budget, and it can keep an answer without its question. A real version always keeps the newest message. Part 4 builds
that.

## 2. Ask for less

Output is the expensive part, and an open-ended question lets the model write as much as it likes. The course handles
one support ticket two ways:

- **Open-ended** ("list possible causes and detailed next steps"): 1,310 output tokens, $0.007860.
- **Three named fields** (issue, urgency, next action) with a 120-token limit: 66 tokens, $0.000396.

That's about **95% less**. Most of the saving comes from asking only for what the app will use. The limit is a
safety net.

One catch: the limit counts the model's hidden thinking too, not just the visible answer. A model that reasons needs
extra room, or its answer gets cut off before it's finished.

But a limit can cut an answer off mid-sentence. So check two things before trusting the reply:

![Two output lengths and the path to a real saving. At the top, two bars on one scale: the open-ended answer at 1,310 output tokens and $0.007860, and the structured answer at 66 tokens and $0.000396. Below, the checks the structured answer goes through. If the status is incomplete because it hit max_output_tokens, the cap was too low, and retrying the same request would be cut off again. If it completed but a field is empty, the instructions or schema need fixing, and the retry is another paid call. Only when it is complete and every field is filled does the saving count.](../../assets/images/llm-costs-3/output-validation.svg)

1. **Was it cut off?** Then the limit was too low. Asking again the same way just gets cut off again.
2. **Is anything missing?** Then the instructions need fixing.

Either way you pay for a second request. **A saving only counts once the answer is usable.**

## 3. Reuse whole answers

If the exact same question comes in twice, hand back the saved answer instead of asking again. This is a
**response cache**, and it lives in your own app.

```text
MISS  $0.001224  What is a database index?
MISS  $0.000127  Explain horizontal scaling in one sentence.
HIT   $0.000000  What is a database index?
HIT   $0.000000  What is a database index?
HIT   $0.000000  Explain horizontal scaling in one sentence.

API calls made:       2
API calls avoided:    3
```

Five questions, two paid requests. Repeats cost nothing.

Two cautions the lesson's simple version doesn't handle: saved answers go stale when your information changes, so
they should expire; and an answer that mentions one customer's details must never be reused for another.

## 4. Prompt caching (and how it backfires)

This is a different cache, run by the AI company. Many prompts start with a long fixed block (like a policy document)
followed by a short question that changes. The company can remember the fixed block and bill it at **a tenth of the
price** when it repeats. Saving it the first time costs 1.25× the normal price.

![Two different caches. On the left, the application response cache: before any call, the app looks up the model and prompt; on a hit it returns the stored answer and no request reaches the provider, so the whole call costs nothing. On the right, provider prompt caching: the request always goes to the provider, and the model always writes a fresh answer, but if the start of the prompt matches a saved prefix, those input tokens are billed at a tenth of the normal rate. The first skips the request; the second discounts part of it.](../../assets/images/llm-costs-3/two-caches.svg)

Note what it doesn't do: you still send every token, and the model still reads all of them. Only the price changes.

Think of a copy shop that keeps your 10 pages of club rules on file and charges a tenth for them each week, as long as
your newsletter starts with those exact pages. Print the date at the top of page 1, and nothing matches anymore.

Three rules decide whether it works, and breaking them causes no error, just a higher bill:

- **The fixed block must be long enough** (at least 1,024 tokens on OpenAI's newer models).
- **It must be identical every time**, down to the last character.
- **You mark where the fixed part ends**, with a "breakpoint".

One more thing: the cache is shared across your whole organization, not just your program. That's great in
production, but a teammate sending the same prompt can make your "first" request look already cached. The course
avoids this by putting a random ID at the very start of the fixed block for each run, so nobody else's traffic can
match it.

### The default setting gets it wrong

The course sends a 5,765-token policy plus three different questions. By default, the breakpoint lands **after** the
question:

```text
request 1  write= 5779  read=    0
request 2  write= 5779  read=    0
request 3  write= 5780  read=    0
```

Every request saves a new copy and nothing is ever reused, because each saved copy includes a different question.
Moving the breakpoint to the end of the policy fixes it:

```text
request 1  write= 5765  read=    0  ordinary=  14
request 2  write=    0  read= 5765  ordinary=  14
request 3  write=    0  read= 5765  ordinary=  15
```

One save, then two cheap reuses. Only the 14-token question is billed at full price.

![Where the breakpoint sits changes the bill. Top row, implicit mode: the request is one block, policy then question, and the breakpoint falls after the question, so each request writes all 5,779 tokens and none are read. Bottom row, explicit mode: the policy and question are separate blocks with the breakpoint after the policy, so request 1 writes 5,765 tokens and requests 2 and 3 read them, with only the 14-token question billed at the normal rate. On the right, the cost of the three requests in units of the normal input price: implicit 21,672.5, no caching 17,338, explicit 8,402.25.](../../assets/images/llm-costs-3/breakpoint-placement.svg)

| Setup            | Cost of 3 requests (in normal-price tokens) |
| ---------------- | ------------------------------------------- |
| Default          | 21,672                                      |
| No caching       | 17,338                                      |
| Breakpoint fixed | 8,402                                       |

The default costs **25% more than no caching at all**. The fixed version costs about half.

Caching pays off after **one** reuse. Say the fixed part normally costs $1. Sent twice without caching: $2. With
caching: $1.25 to save it plus $0.10 to reuse it, $1.35. Every further reuse adds only $0.10. But a prompt sent just
once pays the 25% fee for nothing, which is exactly what the default setting did.

### When caching silently does nothing

Every reply reports how many tokens were saved and reused. Broken caching never shows an error, so these numbers are
how you spot it:

| What you see                                    | Likely cause                                                    |
| ----------------------------------------------- | --------------------------------------------------------------- |
| Nothing saved or reused, ever                   | The fixed part is under the minimum length                      |
| Nothing reused, though the start looks the same | Something in it changes: a timestamp, an ID, reordered settings |
| Saved every time, never reused                  | The breakpoint is after the changing question                   |
| A reuse expected but missed                     | The saved copy expired; run again before blaming the code       |

These settings are OpenAI's as of 2026. Other companies have their own versions, but the rule is the same everywhere:
**put what never changes first, and what changes last.**

## What to remember

- **Give chat history a budget**, and always keep the newest message.
- **Ask only for what the app uses.** It cut output by 95% here.
- **A saving counts only if the answer is usable.** A redo is another paid request.
- **Reuse answers to repeated questions**, but let them expire and never share personal ones.
- **Prompt caching needs an identical start and a breakpoint right after it.** Wrong costs more than no caching;
  right costs a tenth.

Next, [part 4](/engineering/llm-costs-4-optimizing-a-real-chatbot) applies all of this to a real chatbot and cuts its
bill by 88%.
