---
title: '12-Factor Agents, Part 1: The Twelve Principles'
excerpt: 'Why AI agents that look great in a demo often get stuck at around 80% in real use, and the twelve engineering rules of the 12-Factor Agents method for getting past that. Part 1 of a series.'
publishDate: 2026-11-14T00:00:00Z
category: 'LLM Engineering'
image: ~/assets/images/covers/12-factor-agents-1-the-twelve-principles.svg
series: '12-Factor Agents'
seriesPart: 1
tags:
  - agents
  - tool-use
  - production
draft: false
---

_Based on CodeSignal's course "Understanding the 12-Factor Agents Methodology", the first of four courses in its
"Building a 12-Factor Agents App in Python" path. This course is all ideas; parts 2 to 4 build an agent in Python._

You build a support bot for an online shop. In testing, it gets about three out of four questions right, so you ship
it. Then real customers arrive:

- "My package says delivered but I don't have it." The bot replies "Your package was delivered on Tuesday." The
  customer was reporting a problem.
- "Can I exchange the blue shirt?" The order says "Men's Cotton T-Shirt - Blue", the search doesn't match, and the bot
  says it can't find the item.
- A customer starts a return, then asks to exchange instead. The bot has lost track and starts the return over.

You tweak the prompt. The score creeps from 75% to 80%, then stops. The course calls this the **70–80% reliability
wall**, and argues it's an engineering problem, not a weakness of the AI. Its fix is twelve rules called
**12-Factor Agents**.

## Where the rules come from

An **agent** is a program that uses a large language model (LLM, the kind of AI behind ChatGPT) to decide what to do
next: which tool to use, what to look up, when it's done.

In 2025, Dex Horthy of HumanLayer talked to over 100 teams building agents. The same story kept coming up: a framework
gets you to 80% fast, then the last 20% becomes a debugging nightmare, and many teams rewrite the agent by hand. He
also noticed that the agents that worked were mostly ordinary code. In his words, from the
[12-Factor Agents repository](https://github.com/humanlayer/12-factor-agents):

> A lot of them are mostly deterministic code, with LLM steps sprinkled in at just the right points.

_Deterministic_ means the same input always gives the same result. So reliable agents are mostly normal software,
with the LLM used only where reading messy human language helps.

The name borrows from the **12-Factor App**, rules Heroku published in 2011 for building web apps that run well in
the cloud. Like those, 12-Factor Agents is a set of habits, not a library: you can follow it with any framework, or
none.

![Two ways to build an agent. Left, framework-style: a single loop where the LLM picks a tool, the framework runs it and feeds the result back, repeating until the LLM says it is done, with little visibility inside. Right, the 12-factor style: a pipeline of ordinary code steps (load the order, check the 30-day rule, issue the refund, save state) with LLM steps used only at two points, reading the customer's message and writing the reply, plus a pause to ask a human.](../../assets/images/12-factor-agents-1/mostly-code.svg)

## Why the wall shows up

Three habits that work in a demo and fail later:

- **Prompts change without a record.** Someone adds "always ask for the order number" to fix one thing, and it breaks
  another. Nobody can see what changed or undo it.
- **The loop is a black box.** The framework asks the model, runs a tool, repeats. When the bot goes in circles, you
  can't pause it or see what it was looking at.
- **The context keeps growing.** The **context window** is everything the model reads before answering. After 10
  exchanges, the course's example support chat sends 4,850 **tokens** (chunks of text, roughly ¾ of a word) on every
  call. Every token costs money and time, and when the window fills up, old messages get dropped and the bot forgets.

Frameworks are fine for a quick prototype. The problem is what they usually lack once you go further: a history of
prompt changes, a clear record of progress, pause and resume, and a way to replay a run. The twelve factors fill those
gaps. They come in three groups of four.

![The twelve factors in three groups. Inputs and outputs: 1 natural language to tool calls, 2 own your prompts, 3 own your context window, 4 tools are just structured outputs. State and control: 5 unify execution and business state, 6 launch, pause and resume with simple APIs, 7 contact humans with tool calls, 8 own your control flow. Growing without breaking: 9 compact errors into the context window, 10 small focused agents, 11 trigger from anywhere, 12 make your agent a stateless reducer.](../../assets/images/12-factor-agents-1/twelve-factors.svg)

## Factors 1–4: control what goes in and comes out

**1. Natural language to tool calls.** Instead of the model replying "I'll create a $10 payment link for Max right
away!", it fills in a form your code can act on:

```json
{ "action": "create_payment_link", "amount": 10, "recipient": "Max" }
```

Like a waiter turning "the pasta thing, no onions" into a kitchen ticket. The model decides _what_ should happen; your
code knows _how_.

**2. Own your prompts.** Keep prompts in their own files, under version control, reviewed and tested like code. Not
buried inside a framework where you can't read or undo them.

**3. Own your context window.** You decide what the model reads. Instead of five turns of chat word for word, send a
short summary plus only the order details that matter. Fewer tokens, same information. The course calls this
**context engineering**.

**4. Tools are just structured outputs.** The model never runs code. It fills in a form (a **schema**) describing a
tool, and your code checks it and runs the real thing. So the model can only _ask_ for actions you've listed.

## Factors 5–8: keep track and stay in charge

**5. Unify execution state and business state.** An agent tracks where it is in the task (running, waiting, steps
taken) and real-world data (the order, the refund). Keep both in one saved record. If they live in two places, they
eventually disagree: the agent thinks the refund is done, the database says it isn't. The record can be a
**snapshot** of the current state, an **event log** of everything that happened in order (like a bank statement, where
the balance is the sum of the lines), or both.

**6. Launch, pause and resume.** Some tasks wait hours for an approval. Instead of a program sitting idle, the agent
saves its state and stops, like a bookmark. When the approval arrives, it loads the state and continues.

**7. Contact humans with tool calls.** Asking a person is just another tool, `ask_human`, with a specific question and
everything the person needs to decide. The agent pauses until the answer comes back.

**8. Own your control flow.** Write the loop yourself, so your code decides when to continue, retry or stop. Business
rules belong in code: "no refunds over $1,000 without a manager" should be an `if` statement, because a model can
forget an instruction and an `if` can't. Step limits stop a runaway agent.

## Factors 9–12: grow without breaking

**9. Compact errors into the context.** When a tool fails, send the model a short note, like
`"Invalid amount: must be positive. Received: -50"`. Models are often good at fixing their own mistakes from a clear
error. Your loop still caps the retries, then asks a person. Once the step succeeds, clear the old error out of the
context so it doesn't clutter what the model reads.

**10. Small, focused agents.** One giant agent with a 3,000-token prompt and 15+ tools gets less predictable with
every feature. Split it into specialists, like a Refund agent with 3 tools, plus a small router that sends each
request to the right one. Doesn't the router just become the new giant? No: it only needs to know _who_ handles
what ("refunds go to the Refund agent"), never the refund policy itself. Small agents also let you use a cheap, fast
model for sorting requests and a stronger one only where the reasoning is hard.

**11. Trigger from anywhere.** The core agent takes structured input and gives structured output, and doesn't care
where a request came from. Thin **adapters** handle web chat, Slack or email, like a power adapter for different
countries' outlets.

**12. Make your agent a stateless reducer.** The agent keeps no memory of its own. Each call, you hand it the current
state plus the new event, and it hands back the next action and an updated state. Like a game save file: any console
can load it and carry on.

This sounds like Factor 5, but it answers a different question. Factor 5 is about _what_ you save: one record with
everything. Factor 12 is about the agent: it holds nothing itself. An agent that saves to a database but also keeps
its own running list of messages breaks Factor 12, because after a crash the two copies no longer match.

![The stateless reducer cycle. Load the state from the database, combine it with the new event, and pass both to the agent. The agent returns the next action and the updated state. Save the updated state, then run the action, whose result becomes the next event. The agent holds no memory of its own between turns, so any copy of it can handle the next turn.](../../assets/images/12-factor-agents-1/stateless-reducer.svg)

Because nothing lives inside the agent, a crash loses nothing, many copies can run at once, and you can test any step
by handing it a made-up state. One caveat: the LLM is still a bit random, so replaying a step may not give the exact
same words.

## One request, start to finish

A customer wants to return a laptop with a bad battery, bought 35 days ago:

1. A Slack adapter turns the message into structured input (**11**), and a router sends it to the returns agent
   (**10**).
2. The prompt from its own file (**2**) and only this order's details (**3**) go to the model, which fills in a form:
   look up the order (**1**, **4**).
3. Your loop runs the lookup and checks the 30-day rule in code (**8**). It's past the limit, so the agent asks a
   manager (**7**).
4. The run pauses (**6**), with everything saved in one record (**5**).
5. The manager approves, and any copy of the agent picks up from the saved state (**12**). If the refund service
   fails, a one-line error goes back to the model (**9**).

The model made two or three small decisions. Everything else was ordinary code you can read, test and replay.

## What to remember

- The **70–80% wall** is an engineering problem. Better structure helps more than better prompts.
- **Agents are mostly ordinary code**, with the LLM used at a few chosen points.
- **Factors 1–4:** the model fills in forms, and you own the prompt and everything it reads.
- **Factors 5–8:** one saved record, pause and resume, people as a tool, and a loop your code runs.
- **Factors 9–12:** short error notes, small specialist agents, any channel, and no memory inside the agent.

You don't need all twelve at once. Start with the one that fixes your worst problem. The original write-up is free on
[GitHub](https://github.com/humanlayer/12-factor-agents), with a bonus Factor 13: fetch the context the agent will
obviously need before asking the model.

Next, [part 2](/engineering/12-factor-agents-2-tool-calls-and-the-agent-loop) builds these ideas in Python.
