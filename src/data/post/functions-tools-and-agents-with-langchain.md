---
title: 'A Type Is a Prompt: Function Calling From Schema to Agent Loop'
excerpt: 'What survives from the LangChain functions, tools and agents course once its API is gone: schemas as prompts, forced vs optional calls, extraction that is allowed to return nothing, and the agent as a while loop with a cap.'
publishDate: 2026-09-29T00:00:00Z
category: 'LLM Engineering'
tags:
  - function-calling
  - agents
  - structured-output
  - langchain
draft: false
---

Almost every API call in DeepLearning.AI's
[Functions, Tools and Agents with LangChain](https://www.deeplearning.ai/short-courses/functions-tools-agents-langchain/)
(Harrison Chase, late 2023) has since moved or been renamed. The notebooks now fail on import. What
hasn't aged is the mechanism underneath, and that's all this post covers. I've left out the
migration notes, since they'll be stale again by the next release.

The whole course is one idea applied five times: **a type is a prompt**. Classifying sentiment,
extracting entities, calling an API and running an agent all reduce to handing the model a JSON
schema and letting it fill in the blanks. Once you see that, the agent at the end looks like a
`while` loop, because that's what it is.

## The schema is the only thing the model reads

To let a model call a weather API, you don't write a schema by hand. You write a typed class with a
docstring, and the framework converts it:

- the docstring becomes the function's description
- each field's description becomes the parameter's description
- type annotations become JSON Schema types
- fields without a default become required

So **the docstring is not a comment, it is the prompt**. It's the only text the model sees when
deciding whether this function fits the request. A vague or missing docstring gives you a function
the model calls at the wrong times. Nothing warns you, and you'll debug it as if it were a model
problem.

Field descriptions matter the same way. An `airport_code: str` with no description leaves the model
guessing from the name whether you want `SFO` or `San Francisco`.

## Three ways to offer a function

| Mode            | What the model may do       | Use it for                 |
| --------------- | --------------------------- | -------------------------- |
| Optional        | Call it or answer in prose  | Assistants, tool use       |
| Forced          | Must call this one function | Extraction, classification |
| Several offered | Pick one, or none           | Routing                    |

Forcing is underused. For extraction you don't want the model's opinion on whether to reply in
prose. You want the schema, every time.

Forcing also has a cost that the course demonstrates on purpose. It forces the weather function on
the input `"hi!"`, and the model invents arguments. Forcing a schema onto input that doesn't fit
doesn't produce an error. It produces confabulated arguments, and that's the deal you made by
forcing.

## Tagging and extraction: the schema as an output contract

Tagging is classification where the labels live in the schema: `sentiment` and `language` fields,
forced call, done. There are no "respond only in JSON" instructions, because the structure is in
the type, not the prompt.

Two schema details decide whether this is reliable.

**Use an enum, not a string with a description.** The course writes `sentiment: str` with a
description listing `pos`, `neg`, `neutral`. That works because the model cooperates. An enum puts
the allowed values into the schema itself, so the constraint is enforced instead of requested, and
you don't get `"positive"` one call in fifty.

**An optional field needs a default.** Extraction uses a `Person` with an optional `age`. In
Pydantic v2, a nullable field without a default is still required, so the model is told it must
supply an age. With the default, omitting it becomes legal. On "Joe is 30, his mom is Martha" the
result is Joe with age 30 and Martha with no age. That omission is the design working, because an
extractor that invents a plausible age is worse than one that returns nothing.

### The schema can't say everything

The course runs extraction over Lilian Weng's
[LLM Powered Autonomous Agents](https://lilianweng.github.io/posts/2023-06-23-agent/) post, asking
for the papers it cites. The first attempt returns one paper: the article itself.

The fix is in the prompt, not the schema: don't extract the article itself, and if there are no
papers, return an empty list. Two lessons from that:

- A negative instruction ("not the article itself") can't be expressed in a type.
- Models default to producing output. You have to say explicitly that producing nothing is a valid
  answer, or you get a hallucinated list instead of an empty one.

### Documents longer than the context window

Split, run extraction on each split in parallel, flatten the results. The course leaves out two
things:

- With zero chunk overlap, an entity that straddles a boundary is silently lost.
- Nothing deduplicates the flattened list, so a paper cited in three sections shows up three
  times. That's the kind of error that quietly inflates a count you later report.

## Tools: a schema with a function body

A tool is a function schema that also runs code. The course's weather tool takes latitude and
longitude. Asked about San Francisco, the model fills in `37.7749, -122.4194` from memory instead of
calling a geocoder.

It's convenient, and it's a real failure mode. It will be confidently wrong for small towns,
ambiguous names, and anything renamed after the training cutoff. If the coordinates matter, take a
place name and geocode inside the function, where you can log and test it.

**Be wary of turning a whole API spec into tools.** The course converts an OpenAPI spec so every
endpoint becomes a callable function. People like this demo most, and I'd trust it least. A real
spec has hundreds of operations, and every one sits in the context on every call. That costs tokens
and hurts routing accuracy, since more candidates mean more near-misses. It also exposes the DELETE
endpoints nobody decided to expose. Write tools for the handful of operations you actually want, or,
if the API already has an MCP server, still choose which of its tools to bind.

## Routing is reading one of two reply shapes

| The model's reply has | Meaning                            |
| --------------------- | ---------------------------------- |
| A tool call           | Run this tool with these arguments |
| No tool call          | Done, here's the answer            |

That's the whole control-flow mechanism. Dispatch is a lookup from the tool name to the function.
The course does it as an unguarded dict lookup on a string the model supplied. That fails on the day
the model invents a tool name. The fix is to treat "no such tool" as an observation you feed back to
the model, not an exception.

## The agent is a while loop

Routing calls a tool once. An agent keeps calling tools until it's done. The only addition is
state: the model has to see what happened on the last step. With message-based tool calling, that
state is the message list. It holds the model's reply with its tool call, then a tool message with
the result, linked by the call's id.

A framework-free sketch:

```python
def run_agent(user_input, max_steps=10):
    messages = [system_prompt, user_message(user_input)]
    for _ in range(max_steps):
        reply = model(messages, tools=TOOLS)
        messages.append(reply)
        if not reply.tool_calls:
            return reply.content
        for call in reply.tool_calls:
            messages.append(run_tool(call))   # result tagged with call.id
    raise RuntimeError("step limit reached")
```

Planning, ReAct and the rest are variations on what goes into `messages` and what stops the loop.
The course's version has no `max_steps`, so a model that keeps calling a failing tool loops until
you kill it or the bill arrives. Every production loop needs a cap. Agent frameworks add one along
with persistence. Neither changes the mechanism.

### Memory: what you store vs what you send

Within a turn, the message list is the scratchpad. Across turns, memory means persisting that list
by conversation id. "My name is Bob" followed by "what is my name?" fails without it.

Keeping everything forever is fine for a demo and a slow leak in production. Keep two things
separate: the full thread you **store**, and the trimmed view you **send** on each call. Two cautions
on trimming:

- Naive truncation can separate a tool call from its result, which breaks the API's message-order
  rules. Trim on turn boundaries.
- Summarizing old turns is lossy, and it fails as confident paraphrase. A specific instruction
  becomes a vaguer category, and the model fills the gap with something plausible.

## Checking whether it works

The course stops at "it works on the demo inputs," which isn't evidence. You need a test set and a
grader.

- **Exact match is useless for free text.** A reference of `"Yes"` against `"Yes, the pullover set
has side pockets"` scores as a miss under exact match, BLEU or ROUGE, even though the answer is
  right. That's what an LLM judge is for.
- **Many checks don't need an LLM.** "Did retrieval return the source document?" is a set
  membership test.
- **Generated test sets need guardrails.** Having a model write question/answer pairs gets you from
  zero cases to fifty. It's not a basis for a ship decision unless the judge isn't the model under
  test, you score a no-retrieval baseline too, and you add questions that should fail: multi-document
  questions, unanswerable ones, and near-duplicates the system has to tell apart.

## Why read a course whose API is gone

Because the abstractions that replaced it hide exactly this. Structured-output helpers wrap
force-then-parse, and agent frameworks wrap the loop above. If you've never seen what's underneath,
the abstraction is a black box when it returns something wrong.

Having written the loop once, agent failures become ones you can name: a history that's too long,
a tool description that's too vague, no step cap, unguarded dispatch. Most routing bugs you'll debug
are description problems that look like model problems.

The [structured output post](/engineering/three-ways-to-get-structured-output) goes one level
deeper, into how a schema gets enforced at all.
