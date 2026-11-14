---
title: '12-Factor Agents, Part 1: The Twelve Principles'
excerpt: 'Why AI agents that shine in a demo often stall at around 80% in real use, and the twelve engineering rules of the 12-Factor Agents method for getting past that: structured outputs, owned prompts and context, one source of truth, pause and resume, humans as a tool, and small, stateless agents. Part 1 of a series.'
publishDate: 2026-11-14T00:00:00Z
category: 'LLM Engineering'
tags:
  - agents
  - agentic-workflows
  - tool-use
draft: false
---

_Based on CodeSignal's course "Understanding the 12-Factor Agents Methodology", the first of four courses in its
"Building a 12-Factor Agents App in Python" path. This is part 1 of a series. This course is all ideas and no code;
parts 2 to 4 build the agent in Python._

You build a customer support bot for an online shop. In testing it handles the easy questions well. "Where's my
order?" gets a tracking lookup. "How do I return this?" gets the return policy. About three out of four test questions
come back right, so you ship it.

Then real customers arrive, and the bot starts tripping in ways your tests never showed:

- A customer writes "my package says delivered but I don't have it." The bot checks the tracking, sees "Delivered", and
  replies "Your package was delivered on Tuesday." The customer was reporting a problem, not asking for the status.
- A customer asks to exchange "the blue shirt." The order history calls it "Men's Cotton T-Shirt - Blue", the search
  doesn't match, and the bot answers "I don't see that item in your orders."
- A customer starts a return, then five messages later asks "actually, can I exchange it instead?" The bot has lost
  track of the earlier messages and starts the whole return over.

So you tweak the prompt: "be more empathetic", "customers might be reporting problems", "remember earlier messages."
The score creeps from 75% to 78%, then 80%, and then it stops moving. Each extra point costs more prompt fiddling than
the last.

The course calls this the **70–80% reliability wall**, and it says most agent projects get stuck there. Its argument is
that the wall isn't a weakness of the AI model. It's an engineering problem, and engineering problems have engineering
fixes. The fix it teaches is a set of twelve rules called **12-Factor Agents**.

## Where 12-Factor Agents comes from

An **agent** here means a program that uses a large language model (LLM, the kind of AI behind ChatGPT) to decide what
to do next: which tool to use, what to look up, when it's finished.

In 2025, Dex Horthy of the company HumanLayer talked to more than 100 people building these products, mostly technical
founders. He kept hearing the same story. A team picks an agent framework, gets to 80% quickly, and then the last 20%
turns into a debugging nightmare. Many of those teams ended up throwing out the framework and rewriting the agent by
hand to get control back.

He also noticed something surprising about the products that worked. In his words, from the
[12-Factor Agents repository](https://github.com/humanlayer/12-factor-agents):

> Most of the products out there billing themselves as "AI Agents" are not all that agentic. A lot of them are mostly
> deterministic code, with LLM steps sprinkled in at just the right points.

_Deterministic_ code is ordinary code: give it the same input and it does the same thing every time. So the agents that
hold up in real use are mostly normal software, with the LLM used only at the few points where reading messy human
language really helps.

![Two ways to build an agent. Left, framework-style: a single loop where the LLM picks a tool, the framework runs it and feeds the result back, repeating until the LLM says it is done, with little visibility inside. Right, the 12-factor style: a pipeline of ordinary code steps (load the order, check the 30-day rule, issue the refund, save state) with LLM steps used only at two points, reading the customer's message and writing the reply, plus a pause to ask a human.](../../assets/images/12-factor-agents-1/mostly-code.svg)

The name borrows from the **12-Factor App**, a list of rules that engineers at Heroku published in 2011 for building
web apps that run well in the cloud. Those rules didn't care which programming language you used. They described habits,
like keeping settings outside the code, that made apps easier to move, watch and change. 12-Factor Agents does the same
for LLM software. It isn't a library you install, and you can follow it with any framework or with none.

## Why the wall shows up

Before the rules, it helps to see what goes wrong. The course points to three habits that work in a demo and fail
later.

**Prompts change without a record.** The prompt lives in a few places: some in code, some in a config file, some typed
into a framework's settings page. Someone adds "Always ask for the order number first" to fix order lookups. It works,
but now a customer who asks "What's your return policy?" gets asked for an order number they don't need. Nobody can
see what changed, when, or why, and nobody can roll it back.

**The loop is a black box.** Most frameworks run the agent as a loop: ask the LLM, run whatever tool it picks, feed the
result back, repeat. When a customer says "the bot got stuck going in circles", you can't pause it, look at what it
was working with at each step, or replay the conversation to see where it went wrong.

**The context keeps growing.** The **context window** is everything the model reads before it answers: the
instructions, the chat so far, any documents you fetched, the list of tools. It's measured in **tokens**, chunks of
text roughly three-quarters of a word long. The course gives an example of a support chat after 10 exchanges:

| What the model reads   | Tokens    |
| ---------------------- | --------- |
| Instructions           | 500       |
| The last 10 messages   | 2,000     |
| Fetched help documents | 1,500     |
| The new message        | 50        |
| Descriptions of tools  | 800       |
| **Total**              | **4,850** |

Every one of those tokens is paid for on every call, and every call gets slower as the pile grows. When the window
finally fills up, the framework quietly drops old messages, and the bot "forgets" what the customer said earlier.

Frameworks are great for a quick prototype. What they usually don't give you is a history of prompt changes, a clear
record of the agent's progress, a way to pause and resume, a proper way to ask a person for help, or the ability to
replay a run. The twelve factors fill those gaps. They come in three groups of four.

![The twelve factors in three groups. Inputs and outputs: 1 natural language to tool calls, 2 own your prompts, 3 own your context window, 4 tools are just structured outputs. State and control: 5 unify execution and business state, 6 launch, pause and resume with simple APIs, 7 contact humans with tool calls, 8 own your control flow. Growing without breaking: 9 compact errors into the context window, 10 small focused agents, 11 trigger from anywhere, 12 make your agent a stateless reducer.](../../assets/images/12-factor-agents-1/twelve-factors.svg)

## Factors 1–4: control what goes in and what comes out

The first group is about the edges of the LLM: what it reads and what it writes back.

### Factor 1: Natural language to tool calls

A user types "Create a $10 payment link for Max." A chatty model might answer:

```text
I'll create a payment link for $10 for Max right away. Please wait a moment.
```

That sentence sounds helpful, but it doesn't _do_ anything. Your code would have to read it and guess what was meant.
Factor 1 says to have the model fill in a form instead:

```json
{ "action": "create_payment_link", "amount": 10, "recipient": "Max" }
```

Think of a waiter. The customer can say anything ("I'll have the, um, the pasta thing, no onions"), but what goes to the
kitchen is a ticket in a fixed format. The kitchen cooks from the ticket, never from the chat. The LLM is the waiter
that turns messy speech into a ticket, and your code is the kitchen. The model decides _what_ should happen, and your
code knows _how_ to do it.

The ticket doesn't have to be a tool call. It can be a final answer with a confidence label, or a three-step plan. What
matters is that it always has a shape your code can check.

### Factor 2: Own your prompts

Many frameworks come with ready-made prompts written by experts, and on day one they may beat anything you'd write.
The trouble starts when you need to change the agent's behavior, because the real prompt is buried inside the
framework. You can't simply open it and read it.

Factor 2 says the prompt is part of your program, so treat it like code. Keep each prompt in its own file (say,
`prompts/customer_support.txt`), store it in version control, review changes before they go live, and test them. Then,
when someone adds "always ask for the order number" and it breaks the return-policy question, you can see the change
and undo it.

### Factor 3: Own your context window

If the context window is the model's desk, Factor 3 says you decide what goes on the desk. Don't let old messages pile
up on their own. The course calls this **context engineering**, a bigger job than prompt engineering, because it covers
everything the model sees: the instructions, plus which data, history and documents to include, how to format them,
and what to shorten.

Here's a customer on the fifth turn of a return conversation. Without curation, the model reads all five turns word for
word. With curation, it reads something like this:

```text
Summary: Customer asked about the return policy. We confirmed the 30-day window
and that items must be in original condition.

Order #1234: Blue T-shirt ($25), delivered, eligible for return (within 30 days)

Customer: Yes, I want to return it.
```

Four questions and answers have shrunk to one sentence, and the only order details on the desk are the ones that
matter. The model has everything it needs with far fewer tokens to read and pay for. Notice it doesn't follow the
usual "user said, assistant said" pattern. You're free to lay it out however helps the model most.

### Factor 4: Tools are just structured outputs

"Tool calling" can sound like the model reaches out and runs code. It doesn't. You describe each tool with a small form,
called a **schema**: its name, what it does, and what inputs it takes. When a user asks "What's the weather in Paris
tomorrow?", the model fills in that form:

```json
{ "action": "get_weather", "location": "Paris", "date": "2025-11-12" }
```

Your code checks the form against the schema, calls the real weather service, and hands the result back. So a tool call
is just Factor 1 with a stricter form. This matters for safety, because the model can only _ask_ for actions you've
listed, and your code checks each request before anything happens. It also helps with debugging. If something breaks,
you can tell whether the model filled in the wrong form or your code failed to carry it out.

## Factors 5–8: keep track of state and stay in charge

The first four factors make each single exchange with the model predictable. Real tasks take many steps, though, and
sometimes they wait hours for a person. The second group is about that longer stretch.

### Factor 5: Unify execution state and business state

An agent has two kinds of information. **Execution state** is where it is in the task: running or waiting, how many
steps it has taken, which tool calls it has made. **Business state** is the real-world data: the order, the customer,
the refund amount.

A common mistake is to keep these in two places. The framework holds the agent's progress in memory, and your database
holds the orders. Sooner or later the two disagree. The agent thinks the refund is done, and the database says it
isn't. Factor 5 says keep one record, saved somewhere durable like a database, that holds both. That record can be a
**snapshot** of the current state, an **event log** listing everything that happened in order (like a bank statement,
where the balance comes from adding up the lines), or both.

With one record, a crashed agent can be reloaded and carry on exactly where it stopped, and "why did it do that?" has
an answer you can look up.

### Factor 6: Launch, pause and resume with simple APIs

Many tasks have to wait: for a manager to approve an expense, for a payment to clear, for business hours to start.
If the agent is one long run that can't stop, waiting means keeping a process running, which wastes resources and loses
everything if it crashes.

Factor 6 says to build the agent so your app can **start**, **pause** and **resume** it with simple commands. It's
like a bookmark in a book. At a natural waiting point, the agent saves its state (Factor 5) and stops. When the
approval comes in, your app loads the state and continues. The user can also see that the agent is _waiting for
approval_, not just stuck.

### Factor 7: Contact humans with tool calls

Demos like agents that never need help. In real use, a good agent knows when to ask. Factor 7 says asking a person
shouldn't be a bolt-on email or a hidden override button. It should be a tool, `ask_human`, that the model can pick
like any other:

```json
{
  "action": "ask_human",
  "question": "Should I approve this $5,000 refund? The order is 45 days old, past our 30-day window, but the customer says it arrived broken.",
  "context": { "order_id": "ORD-12345", "days_since_purchase": 45, "customer_history": "10 orders, no returns" },
  "urgency": "medium"
}
```

Your system sends the question to the right person, the agent pauses (Factor 6), and the answer is saved in the record
(Factor 5) when it arrives. A good question is specific ("Should I approve this $500 expense?" rather than "What
should I do?") and includes everything the person needs to decide.

### Factor 8: Own your control flow

With a framework, the loop often looks like a single line:

```python
result = framework.run_agent(prompt="...", tools=[search, summarize], max_iterations=10)
```

What happens inside that line is up to the framework. What if the agent runs the same search five times in a row? What
if your rule is "never more than 3 API calls per request"? The framework has no idea that rule exists.

Factor 8 says write the loop yourself, so _your_ code decides when to continue, retry, ask a person, or stop. Business
rules belong in code, not in the prompt, because a model can forget an instruction and an `if` statement can't. "No
refunds over $1,000 without a manager" should be a line of code that always runs. Step limits and timeouts work like a
circuit breaker, so a runaway agent stops instead of looping forever.

## Factors 9–12: grow without breaking

The last group is about what happens as the system gets bigger: more failures, more features, more places people use
it from, more traffic.

### Factor 9: Compact errors into the context window

Suppose the model asks for a payment link with `"amount": -50` and the payment service rejects it. Instead of
crashing or hiding the failure, Factor 9 says to pass a short note about it back to the model:

```json
{ "tool": "create_payment_link", "status": "error", "error": "Invalid amount: must be positive. Received: -50" }
```

LLMs are often good at reading an error and fixing their own mistake. On the next step, the model sees the note and
tries again with `"amount": 50`. "Compact" means short: a line or two the model can act on, not a 200-line error dump
that fills the desk. Your loop (Factor 8) still sets the limits. After, say, three failed tries, it stops retrying and
uses `ask_human` instead. Once the step succeeds, you can clear the old error out of the context.

### Factor 10: Small, focused agents

It's tempting to build one big "customer service agent" that does orders, refunds, accounts, product questions,
complaints and subscriptions. The course's example of that agent has a prompt of about 3,000 tokens and more than 15
tools. Every new feature makes it a little less predictable, and a change to the refund rules risks breaking order
lookups.

Factor 10 says split it, the way a hospital has specialists instead of one doctor who does everything. A Refund agent
needs about 400 tokens of instructions and 3 tools. An Order Lookup agent needs about 300 tokens and 2 tools. A small
**router** at the front reads each request and sends it to the right specialist.

Doesn't the router just become the new giant? No. It only needs to know _who_ handles what ("refunds go to the Refund
agent"). It never needs the refund policy itself. Knowing who to ask is much shorter than knowing how to do the job.
Small agents also let you pick the right model for each job: a cheap, fast model for sorting requests, and a stronger
one only where hard reasoning is needed.

### Factor 11: Trigger from anywhere, meet users where they are

If your agent was built for a web chat box, its logic tends to get tangled up with that chat box. Then someone wants it
in Slack, and someone else wants it to answer email, and now you have three slightly different copies of the same
agent.

Factor 11 says the core agent should take structured input and give structured output, and know nothing about where a
request came from. Thin **adapters** do the translating, like a power adapter that lets the same laptop plug into
outlets in different countries. The web adapter turns the reply into HTML, the Slack adapter turns it into Slack
messages with buttons, and the email adapter turns it into an email. A simple web API in front of the agent (start a
session, send it a message, pause, resume) lets any of these, or a scheduled job, trigger the same agent.

### Factor 12: Make your agent a stateless reducer

This one sounds the most technical, but the idea is simple. A **stateless** agent keeps no memory of its own between
steps. Each time it's called, you hand it everything it needs, the current state plus the new event, and it hands back
two things: the next action to take and the updated state. A **reducer** is the name programmers use for a function
shaped like that, "old state + event → new state."

It works like a game save file. The game console doesn't need to remember your progress, because the save file holds
it. Any console can load the file and carry on.

This sounds a lot like Factor 5, and the two do work together, but they answer different questions. Factor 5 is about
_what_ you save: one record holding the messages, the events and the business data. Factor 12 is about the agent
itself: it keeps nothing in its own memory. An agent that saves everything to a database but also keeps a running list
of messages inside itself breaks Factor 12. If it crashes, or a different server takes the next turn, its private copy
and the database no longer match. Under Factor 12, the saved state is the agent's only memory. The agent reads it in,
hands an updated copy back out, and your code does the saving.

![The stateless reducer cycle. Load the state from the database, combine it with the new event, and pass both to the agent. The agent returns the next action and the updated state. Save the updated state, then run the action, whose result becomes the next event. The agent holds no memory of its own between turns, so any copy of it can handle the next turn.](../../assets/images/12-factor-agents-1/stateless-reducer.svg)

Here's a customer asking "What's my order status?":

1. Load the state from the database: no messages yet, step count 0. Add the new question.
2. The agent returns the action "check order status", plus a new state holding the question and step count 1.
3. Save that state, then run the order lookup.
4. Load the state again and add the lookup result. The agent returns "reply to the customer" and step count 2.
5. Save, and send the reply.

Because nothing lives inside the agent, a crash loses nothing. You can run many copies behind a load balancer, and
any copy can take the next turn. You can test a step by giving it a made-up state and checking what comes out. You can
also replay any past step, because you saved exactly what went in. One honest caveat from the course: the LLM inside is
still a bit random, so a replay may not produce the same words unless you fix the model's settings or reuse a recorded
answer. What statelessness guarantees is that no hidden memory inside the agent caused the difference.

## One return request, start to finish

Here's how the factors fit together in one case. A customer wants to return a laptop with a bad battery, bought 35 days
ago.

1. A Slack adapter turns the message into structured input (**11**). The router sends it to the returns specialist
   (**10**).
2. Your prompt, kept in its own versioned file (**2**), plus a desk holding only this order's details (**3**), go to
   the model. It replies with a form: look up the order (**1**, **4**).
3. Your loop runs the lookup and checks the 30-day rule in code (**8**). Thirty-five days is past the limit, so instead
   of refusing outright, the agent calls `ask_human` to get a manager's approval (**7**).
4. The run pauses (**6**). Everything so far is saved in one record (**5**), and no process sits waiting for hours.
5. The manager approves. Any copy of the agent loads the saved state and continues (**12**). If the refund service
   fails along the way, a one-line error goes back to the model so it can try again, with your loop capping the retries
   (**9**).

The model made two or three small decisions in that whole flow. Everything else was ordinary code that you can read,
test and replay. That's the "agents are just software" idea in practice.

## What to take away

- The **70–80% wall** is mostly an engineering problem. Better prompts help a little; better structure helps more.
- **Agents are just software.** The ones that work are mostly ordinary code, with the LLM used at a few chosen points.
- **Factors 1–4** control the edges of the model: it fills in forms instead of writing prose, and you own the prompt
  and everything else it reads.
- **Factors 5–8** keep the long run under control: one saved record, pause and resume, asking a person as a normal tool,
  and a loop your code runs.
- **Factors 9–12** let the system grow: short error notes the model can learn from, small specialist agents, one agent
  reachable from any channel, and a stateless design where all memory lives in saved state.

You don't have to adopt all twelve at once. The course suggests starting with the one or two that fix your worst
problem, trying them on one workflow, and adding more from there. The original write-up, with diagrams and examples, is
free on [GitHub](https://github.com/humanlayer/12-factor-agents). It also has a bonus Factor 13: fetch the context you
know the agent will need before asking the model, instead of waiting for it to ask.

Next, in part 2: building these ideas in Python, starting with structured outputs, tool schemas, a loop you control,
and errors fed back into context (Factors 1, 3, 4, 8 and 9).
