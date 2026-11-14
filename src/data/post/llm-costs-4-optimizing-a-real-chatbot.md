---
title: "Optimizing LLM Costs, Part 4: Cutting a Real Chatbot's Bill by 88%"
excerpt: 'Every technique from the series applied to one support chatbot: measure it first, send easy questions to the cheap model, shrink each request, fix a cache that never worked, and prove the 88% saving while the bot still tells customers everything they need. Part 4 of a series.'
publishDate: 2026-11-21T00:00:00Z
category: 'LLM Engineering'
tags:
  - llm-costs
  - evals
draft: false
---

_Based on CodeSignal's course "Optimizing an Existing Python LLM Application", the last of four courses in its
"Optimizing LLM Costs in Python" path. Earlier parts: [the bill](/engineering/llm-costs-1-measuring-what-a-request-costs),
[choosing a model](/engineering/llm-costs-2-model-selection-and-routing), and
[sending less work](/engineering/llm-costs-3-reducing-llm-work). Numbers come from the lessons' own runs and vary
each time._

Parts 1 to 3 tested each idea in its own small script. This part applies them all to one app: a customer support
chatbot for a made-up file-sync product called Helios Cloud. It answers every message using a support policy of about
1,200 tokens.

The order matters: **measure, fix the biggest problem, measure again, then lock in the result.** And one rule
throughout: a saving only counts if the bot still tells customers what they need to know.

## Step 1: Measure first

The course uses a fixed test: 4 scripted conversations, 14 messages in total. Each message comes with a fact the
answer must mention. Replaying the same test before and after each change shows what the change did, to both cost and
quality. The test grades answers with its own check, separate from any check inside the app, so the app never grades
its own work.

To measure anything, every model call first goes through one function, which records the model, tokens and cost of
each call. That single entry point is also where all the later fixes get added.

Here's what the original bot sends with every message, and what one 5-message conversation cost:

![The original chatbot's request, drawn as stacked blocks. At the top, a header with the current time, customer name, conversation id and a new request id, which changes on every request. Then the support policy, about 1,200 tokens. Then rules asking for the longest possible answer. Then the full conversation history, which grows every turn. Then the newest message. Four cost drivers are marked: every request goes to the premium model; the history grows input by one to two hundred tokens a turn, from 1,384 to 2,059; the verbose rules produce long output, 934 of 1,588 tokens of it reasoning; and the changing header means 8,731 tokens were written to the prompt cache and none were ever read back.](../../assets/images/llm-costs-4/original-request.svg)

```text
Cost:           $0.102284 for 5 messages
Models:         gpt-5.6-sol x5
Input tokens:   8746  (cached 0, written 8731)
Output tokens:  1588  (reasoning 934)
Policy facts:   5/5
```

The numbers point to four problems, in order of size:

1. **Every message goes to the premium model**, even "where is the log file?"
2. **The conversation grows every turn**, from 1,384 to 2,059 input tokens.
3. **Answers are long, and mostly hidden thinking.** The bot's instructions say to restate, explain everything, and
   summarize. 934 of 1,588 output tokens were reasoning.
4. **The prompt cache never works.** The current time and a new request ID sit at the very top of every prompt, so no
   two requests start the same. 8,731 tokens were saved to the cache and none reused. This is part 3's trap exactly.

## Step 2: Send easy messages to the cheap model

The course adds a router with rules for a support desk: messages about money, lost data, or troubleshooting go to the
premium model, and everything else goes to the cheap one. It uses simple rules rather than asking a model to sort
each message, because that would add a paid call to every turn.

It also adds the safety net part 2 was missing. Each answer is checked for the fact it must mention. **If a cheap
answer fails the check, it's retried once on the premium model.**

Both versions of the bot live in the same code, behind an on/off switch, so they can be compared and the change can be
undone.

![Elena's five turns, cost per turn before and after routing. Before, all five turns use gpt-5.6-sol: about $0.022, $0.021, $0.028, $0.021 and $0.018. After, turns 1 and 2, which describe stuck files and contain troubleshooting terms, stay on gpt-5.6-sol at $0.030 and $0.016. Turns 3 to 5, about version history, a paused tray icon and where to find the log, move to gpt-5.6-luna at about $0.004, $0.004 and $0.003. Total $0.110540 before, $0.057714 after, a 47.8% saving, with all five policy facts stated in both.](../../assets/images/llm-costs-4/elena-routing.svg)

```text
Routing + fallback: $0.110540 -> $0.057714  (saved 47.8%)
Policy facts:       5/5 -> 5/5
```

Nearly half the cost gone, same quality. Part 2's router saved 2.5% with the same idea. The difference is the
traffic: a support desk gets lots of simple questions.

## Step 3: Shrink each request

Now part 3's four techniques, each with its own switch:

![The optimized request path through the gateway. A new message arrives. On the first turn of a conversation only, the response cache is checked; a hit returns a stored, already-checked answer with the customer's name filled in and costs nothing. Otherwise the history is trimmed to a 500-token budget, always keeping the newest message. The request is built with the stable policy and concise rules first, behind an explicit prompt-cache breakpoint, with no changing header. The router picks a model, the call is made with max_output_tokens set to 400, and the answer is checked for cut-off and required policy facts. A cheap answer that fails is retried once on the premium model. Only completed answers that pass the check are stored in the response cache.](../../assets/images/llm-costs-4/hot-path.svg)

- **Trim the history** to 500 tokens, always keeping the newest message.
- **Ask for short answers:** at most four sentences, with a 400-token limit. The longest answer used about 300; the
  extra room is for hidden thinking, which counts toward the limit.
- **Reuse answers to opening questions.** Three of the four conversations start with the same question. Only first
  messages are reused, because later answers depend on the conversation. The stored answer has the customer's name
  swapped out, so Marcus isn't greeted as Priya. Only answers that passed the fact check are stored.
- **Fix the prompt cache.** The time and request ID are deleted from the top (the model never needed them), and the
  breakpoint goes right after the policy.

Result on two conversations:

```text
Hot path:      $0.103161 -> $0.016595  (saved 83.9%)
Policy facts:  6/6
```

One customer's opening question cost nothing (reused answer). Every other request got the policy at a tenth of the
price. Output dropped from 1,598 to 657 tokens.

One catch the lesson points out: this run never paid to save the policy, because an earlier run had already saved it
and the company still had the copy. A fresh run pays that one-time fee on its first request, so it would save a
little less than 83.9%.

## Step 4: Prove it and guard it

The full test, original versus optimized:

```text
Cost:          $0.298967 -> $0.035259  (saved 88.2%)
Live calls:    14 -> 12
Output tokens: 5214 -> 1304
Policy facts:  14/14 -> 14/14
```

![Before and after on the full workload. Cost falls from $0.298967 to $0.035259, an 88.2% saving. Output tokens fall from 5,214 to 1,304. Input tokens fall from 22,816 to 17,717, and the share read from the prompt cache goes from none to 15,564. Live calls fall from 14 to 12. Policy facts stay at 14 of 14. On the right, where the remaining $0.035259 goes: 5 premium calls account for $0.029657, or 84%, and 7 cheap calls for the rest.](../../assets/images/llm-costs-4/before-after.svg)

**Same 14 answers, same 14 facts, 12% of the cost.** Read the facts line first: if it had dropped, part of the
"saving" would just be worse answers.

Savings can slip away quietly when someone later edits a prompt or a rule. So the test saves its result as a
reference and raises an alert if a later run costs over 20% more per message. Three habits keep it useful:

- **Run it after every change** to prompts, routing rules or limits.
- **Update the reference only on purpose.** A reference replaced on every run never raises an alert.
- **Keep the test conversations matching real traffic.** When customers start asking new kinds of questions, add a
  conversation for them.

Why 20%? Rerunning the unchanged bot moved the cost by under 10%, just from the model writing slightly different
answers. When the company had forgotten the saved policy, cost rose by about a third. 20% ignores the first and
catches the second, like a smoke alarm that ignores toast but not fire. It can still false-alarm after a long break,
so a real threshold should come from running the test several times and seeing how much results naturally vary.

The test also shows where to look next: 5 premium requests make up 84% of what's left.

## Honest notes

- **Costs vary between runs.** The same unchanged conversation cost $0.102 once and $0.111 another time. An 88% saving
  is far beyond that noise; a 5% one wouldn't be.
- **The quality check is word matching.** It confirms a fact is mentioned, not that it's stated correctly.
- **14 scripted messages aren't real traffic.** They make a fair comparison, not a prediction for your app.

## The whole series in four lines

1. **Measure.** Record what every request costs. ([Part 1](/engineering/llm-costs-1-measuring-what-a-request-costs))
2. **Pick the right model** for each request, with a quality check and a retry. ([Part 2](/engineering/llm-costs-2-model-selection-and-routing))
3. **Send less work:** shorter history, shorter answers, reused answers, and a cache that actually hits. ([Part 3](/engineering/llm-costs-3-reducing-llm-work))
4. **Prove it and guard it** with a repeatable test that checks quality before cost.

If you check one thing in your own app, check the top of your prompt. Anything that changes on every request, sitting
above content that never changes, silently breaks the cache. Here it was free to fix.
