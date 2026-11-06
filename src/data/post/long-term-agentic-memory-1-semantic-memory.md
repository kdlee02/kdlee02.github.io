---
title: 'Giving an AI Assistant a Memory'
excerpt: 'The three kinds of memory an AI agent can have, when it should save them, and what happened when I gave an email assistant tools to remember facts, plus how one sentence fixed a missed save. Part 1 of 2 on the Long-Term Agentic Memory course.'
publishDate: 2026-11-05T00:00:00Z
category: 'LLM Engineering'
tags:
  - agents
  - memory
  - tool-use
draft: false
---

_Based on DeepLearning.AI's
[Long-Term Agentic Memory with LangGraph](https://www.deeplearning.ai/courses/long-term-agentic-memory-with-langgraph)
course, taught by Harrison Chase. This is part 1 of 2: the basic email assistant, and semantic memory._

Imagine hiring a personal assistant who forgets everything at the end of each conversation. You tell them on Monday
that Jim is your friend. On Tuesday, Jim emails, and they have no idea who he is. You'd stop trusting them pretty fast.

Most AI agents work like that by default. Each conversation starts from a blank page. That's a real problem for the
kind of job people most want agents for: when the course team surveyed developers about what agents are best at today,
personal assistant and productivity tasks came second. Those jobs depend on remembering things over weeks and months.
That's what **long-term memory** means here: memory that lasts across separate conversations.

The course builds one example the whole way through: an assistant that reads your email and decides what to do with
each message.

## Three kinds of memory

Psychologists split human memory into a few kinds, and the course borrows three of them.

![A table of three kinds of memory. Semantic memory is facts: in people, things learned at school; in an agent, facts about people, places and things; in the email assistant, “Jim is John’s friend”. Episodic memory is experiences: in people, a trip to Disneyland; in an agent, past examples of what it did; in the email assistant, an earlier email and how it was sorted. Procedural memory is knowing how: in people, riding a bike; in an agent, its system prompt; in the email assistant, a rule like “ignore marketing newsletters”.](../../assets/images/long-term-agentic-memory/memory-types.svg)

- **Semantic memory** is facts. In people, it's what you learned from a textbook. In an agent, it's facts about the
  people, places and things it deals with, like "Jim is John's friend."
- **Episodic memory** is experiences, the memory of a specific thing that happened. In an agent, that's a record of
  what it did before, saved as examples it can copy. Showing an AI a few worked examples like this is called
  **few-shot** prompting.
- **Procedural memory** is knowing how to do something, like riding a bike. In an agent, it's the instructions it
  follows, which live in its **system prompt** (the standing instructions given to the AI before every conversation).

Which ones an agent needs depends on the job. If it keeps getting facts wrong, that's semantic. If a few good examples
would steer it, that's episodic. If it needs better instructions, that's procedural.

## When does the agent save a memory?

There's a second choice, separate from the kind of memory: _when_ memories get written.

![Two setups. In the hot path, one agent reads the email, writes the reply and saves memories in one go: one agent and memories saved right away, but the agent juggles two jobs and the reply takes longer. In the background, the agent only replies, and later a separate memory manager saves memories: the agent stays simple and replies faster, but there are two agents to run and memories update only when the second one runs.](../../assets/images/long-term-agentic-memory/update-timing.svg)

The **hot path** is the work the agent does while you wait for its answer. Saving memories there means the agent
replies and remembers in the same run. It's simple, with only one agent, and the memory is there right away. But the
agent now has two jobs, which makes it more complicated and slower to respond.

Saving memories **in the background** flips that. The agent only replies, and a separate process looks at the
conversation afterwards and decides what's worth keeping. Each piece is simpler and replies come faster, but you now
run two agents, and a memory doesn't exist until that second one runs.

This post uses the hot path. [Part 2](/engineering/long-term-agentic-memory-2-episodic-and-procedural-memory) moves
memory updates outside the agent.

## The email assistant, with no memory yet

Before adding memory, the course builds a plain version. It works for a made-up user, John Doe, a senior software
engineer who leads a team of five. Each email passes through two steps.

![A new email goes to a triage step that picks one label. Ignore and notify both end the run. Respond hands the email to a response agent, which loops: it thinks, calls a tool, reads the result, and repeats until done. Its tools are write_email, schedule_meeting and check_calendar_availability. Two memory tools, manage_memory and search_memory, are shown dashed as the ones added later in this post.](../../assets/images/long-term-agentic-memory/email-agent.svg)

**Step 1: triage.** Like a nurse in an emergency room deciding who's seen first, this step sorts each email into one
of three piles, using rules written in plain English:

| Label   | John's rule for it                                                         |
| ------- | -------------------------------------------------------------------------- |
| ignore  | Marketing newsletters, spam emails, mass company announcements             |
| notify  | Team member out sick, build system notifications, project status updates   |
| respond | Direct questions from team members, meeting requests, critical bug reports |

A small model, `gpt-4o-mini`, reads the email and must answer in a fixed shape: a short piece of reasoning, then one
of the three labels. (Forcing an AI into a fixed shape like this is
[structured output](/engineering/three-ways-to-get-structured-output).) A loud "🔥 EXCLUSIVE OFFER: 80% OFF" email was
labeled **ignore**. An email from a teammate, Alice, asking whether two API endpoints were missing from the docs on
purpose, was labeled **respond**, because it was "a direct question from a team member."

**Step 2: the response agent.** Only "respond" emails get this far. The response agent is a model that can use
tools: write an email, schedule a meeting, or check John's calendar. The tools are pretend. The calendar always says
John is free at 9 AM, 2 PM and 4 PM, and "sending" an email just prints a confirmation. Asked "what is my availability
for Tuesday?", the agent checked the calendar tool and listed exactly those three times.

Given Alice's email, it wrote back thanking her and promising to "get back to you with the confirmation … by
tomorrow." A promise like that is exactly the kind of thing a good assistant should remember. This version can't.

## Adding semantic memory

The fix in the course is small: give the response agent two more tools, one to **save** a memory and one to
**search** its memories. The agent decides when to use them, just like the email and calendar tools.

### Where memories live

Memories go in a **store**, which works like a filing cabinet. Each drawer is labeled with a three-part path: the
app's name, the user's name, and the kind of memory. That path is called a **namespace**. The middle part is filled in with whoever the agent is working for each time it
runs. In the notebook that's `lance`, so memories land in the `email_assistant / lance / collection` drawer. If the
assistant worked for a hundred people, each would get their own drawer, and nobody's facts would leak into anyone
else's emails.

The store is also set up to search by meaning. When a memory is saved, an **embedding model** (here, OpenAI's
`text-embedding-3-small`) turns its text into a long list of numbers. Texts that mean similar things get similar
numbers, so a search for "Jim" can find "Jim is John Doe's friend" without an exact word match. Each result comes with
a **score** for how close the meanings are. Higher means closer.

### The two tools

Both tools come ready-made from a library called LangMem.

- **`manage_memory`** creates, updates or deletes a memory. Its built-in description tells the AI to call it
  "proactively" when it spots a new preference, is asked to remember something, wants to record important context, or
  finds an old memory that's wrong.
- **`search_memory`** takes a search phrase and returns up to 10 of the closest memories by default.

For this lesson, the response agent was also switched to Claude (`claude-3-5-sonnet-latest`).

### It remembered Jim

The first test talks to the response agent directly. I told it "Jim is my friend." It called `manage_memory` and saved
"Jim is John Doe's friend." Then, in a brand-new conversation, I asked "who is jim?" It searched its memory for "Jim",
found that note with a score of 0.39, and answered "Jim is John's friend."

You can also open the drawer yourself. Listing everything in it showed one memory and no score, since there was no
search phrase to compare against. Searching the store for "jim" returned the same memory with a score of 0.50.

So far, so good.

## Where it broke: Alice's follow-up

Next, the full assistant (triage plus response agent) gets real emails, and this is where my first run went differently
from the course video. In the video, after replying to Alice, the agent saved a note that a follow-up was needed. In my
first run it didn't.

**Email 1.** Alice asks about the missing endpoints. Before replying, the agent searched memory for "API documentation
authentication service Alice Smith." The only thing in the store was the Jim memory, which came back with a score of
0.26. The agent correctly decided that wasn't useful, wrote Alice a good reply ("I'll send you an update once the docs
have been revised"), and finished.

It never called `manage_memory`. The funny part is how it signed off to John: "You may want to follow up and actually
review the API documentation … Would you like me to schedule a reminder?" It told John to remember, instead of
remembering.

**Email 2.** Alice writes back: "Any update on my previous ask?" The agent searched for "Alice Smith previous request"
and again got only the Jim memory, at 0.22. With nothing to go on, it didn't reply. Instead it asked John: "What was
Alice's original ask?"

## Fixing it with one sentence

The agent's instructions in the course were: "Use these tools when appropriate to help manage John's tasks
efficiently." That says the agent _may_ save. It doesn't say it _must_. So I added one sentence to the end:

> After replying, always save any promises or open requests with manage_memory.

Then I re-ran everything with a fresh store, using the same two emails and the same model.

**Email 1** went the same way at first. The agent searched, found only the Jim memory (0.25), and sent a reply. Then it
did what it skipped before and called `manage_memory`, saving this note:

> ACTION ITEM: John Doe needs to investigate whether the /auth/refresh and /auth/validate endpoints were intentionally
> omitted from the new authentication service API documentation, or if the docs need to be updated. Alice Smith
> (alice.smith@company.com) raised this question and is awaiting a follow-up response. Email replied to on the same
> day, promising a clear answer.

**Email 2** ("Any update on my previous ask?") now had something to find. The search for "Alice Smith previous ask or
request" returned two memories: the new action item at **0.35**, and the Jim memory at 0.21. The agent picked the
right one and explained the situation: John "promised a clear answer but the action item is still open."

It didn't send a reply right away. It wrote a draft ("I'm still looking into your question … I'll get back to you with
a clear update very shortly") and asked John whether to send it or adjust it first. That's a reasonable thing for an
assistant to do when the open question is still unanswered.

![Alice's two emails, before and after one added sentence. Before, with the course's instructions: on email 1 the agent searched memory and found only the Jim fact at 0.26, sent a reply, and never called manage_memory, so nothing about Alice was saved. On email 2 it found only the Jim fact at 0.22, sent no reply, and asked John what Alice's original ask was. After, with the extra sentence: on email 1 it searched, found only the Jim fact at 0.25, sent a reply, then called manage_memory and saved an action item saying Alice is awaiting a follow-up. On email 2 it found the action item at 0.35 ahead of the Jim fact at 0.21, drafted a reply, and asked John before sending.](../../assets/images/long-term-agentic-memory/alice-follow-up.svg)

### What these two runs teach

**In the hot path, saving is optional unless you say otherwise.** The memory tool is one more tool the agent may or
may not pick, just like `schedule_meeting`. With the course's wording, the model judged that a reply was enough. With
one clear sentence telling it to save promises, it saved. That's one run each, so it doesn't prove the sentence works
every time, since AI output varies from run to run. But it points to the cause: the instructions, not the memory
system.

**A search always returns something.** Searching by meaning finds the closest match, even when nothing is close.
Alice's first email got the Jim memory back at 0.25 even though it had nothing to do with her question. The agent has
to judge whether a result is relevant, and in both runs it judged well. In the first run it asked John instead of
inventing an answer about what Alice wanted. Making something up would have been worse than asking.

There's a limit to this fix, too. It still depends on the agent following the instruction. Moving memory updates out
of the agent is another answer. If new memories come from somewhere else, like a person correcting the assistant or a
separate program reviewing its work, saving no longer depends on the replying agent doing it in the moment. That's
[Part 2](/engineering/long-term-agentic-memory-2-episodic-and-procedural-memory): episodic memory saved from a
person's corrections, and procedural memory, where the assistant's own instructions get rewritten from feedback.
