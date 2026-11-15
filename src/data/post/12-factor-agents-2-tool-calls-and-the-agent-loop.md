---
title: '12-Factor Agents, Part 2: Tool Calls and a Loop You Control'
excerpt: 'Building a tiny calculator agent in Python: asking for JSON versus requiring a strict tool call, letting your code run the tools, keeping the conversation in a list you own, and wrapping it all in a loop with a step limit and errors fed back to the model. Part 2 of a series.'
publishDate: 2026-11-15T00:00:00Z
category: 'LLM Engineering'
image: ~/assets/images/covers/12-factor-agents-2-tool-calls-and-the-agent-loop.svg
series: '12-Factor Agents'
seriesPart: 2
tags:
  - agents
  - tool-use
  - structured-output
draft: false
---

_Based on CodeSignal's course "Foundations of Agentic Tool Use in Python", the second of four courses in its
"Building a 12-Factor Agents App in Python" path. [Part 1](/engineering/12-factor-agents-1-the-twelve-principles)
covers the twelve principles. Outputs are from the lessons' own runs._

This course builds one small agent: a calculator that can answer "What is 15 + 27? Then multiply the result by 3."
The math is boring on purpose, so you can see every moving part: how the model asks for a tool, who runs it, what the
model reads, and what stops it running forever. The same parts appear in any agent.

It covers Factors 1, 3, 4, 8 and 9, using OpenAI's Responses API and a model the course calls `gpt-6-luna`.

## Step 1: Ask for JSON, and plan for it to fail

The simplest way to get a form back is to ask for one in the instructions:

```python
system_prompt = """
You are a helpful assistant that only answers with the following JSON schema:
{ "answer": "the answer to the question" }
"""
```

Then turn the reply's text into a Python dictionary:

```python
try:
    result = json.loads(text)
    print(f"Answer: {result['answer']}")   # Answer: 42
except json.JSONDecodeError:
    print("Failed to parse JSON from response")
```

Asking is a request, not a rule. Usually the model complies. Sometimes it adds "Sure! Here's your answer:" first, and
`json.loads` fails. That's why the `try`/`except` matters: your code has to cope.

## Step 2: Make the form a rule

Instead of describing the JSON in the prompt, describe a **tool**: a named function the model "calls" by filling in a
form, called a **schema**.

```python
tool_schemas = [{
    "type": "function",
    "name": "final_answer",
    "description": "Provide the final answer and stop.",
    "strict": True,
    "parameters": {
        "type": "object",
        "properties": {"answer": {"type": "string"}},
        "required": ["answer"],
        "additionalProperties": False,
    },
}]
```

Two settings turn the request into a rule:

- `"strict": True` makes the API enforce the schema: `answer` is always there, always text, nothing extra.
- `tool_choice="required"`, sent with the request, means the model _must_ answer with a tool call, not chat.

It's the difference between asking someone to write neatly on a blank sheet and a web form that won't submit until
every box is filled correctly.

![Two ways to get structured output. Left, asking in the prompt: the system prompt describes the JSON, the model replies with text, and json.loads either succeeds or raises JSONDecodeError, so the code needs a fallback. Right, a strict tool: the schema goes in the tools parameter with strict set to true and tool_choice set to required, the API makes the model return a function_call whose arguments match the schema, and the code can read args["answer"] directly.](../../assets/images/12-factor-agents-2/prompt-vs-tool.svg)

The reply now comes back as a `function_call` with `{"answer": "42"}`, guaranteed to fit. This is Factor 4: a tool
call is just structured output with a stricter form. (More on this in an
[earlier post](/engineering/three-ways-to-get-structured-output).)

## Step 3: The model asks, your code acts

Real agents need real tools, so the course adds two Python functions, `add` and `multiply`, each with a schema. The
model never runs them. It only writes down a request like `add` with `{"a": 15, "b": 27}`, and your code decides
what to do:

```python
args = json.loads(item.arguments)
match item.name:
    case "add":
        result = add(**args)        # add(a=15, b=27)
    case "multiply":
        result = multiply(**args)
    case _:
        result = f"Error: Tool {item.name} not implemented"
```

The last case catches any tool name you didn't plan for, so a made-up tool can't crash the program.

## Step 4: The conversation is a list you own

The model has no memory between calls. It reads only what you send. So after your code runs `add`, the model doesn't
know the answer is 42 until you tell it.

The course keeps the conversation in a plain Python list called `context` (Factor 3). After each tool call, two items
go in: the model's request and the result. Both carry the same `call_id`, like a coat-check ticket that matches each
result to its request.

![How the context list grows. Before the first call it holds one item, the user's message "Compute 15 + 27". The model replies with a function_call for add with a equal to 15 and b equal to 27. Your code runs add, gets 42, and appends two items: the function_call and a function_call_output with result 42, both carrying the same call_id. The second call sends all three items, and the model replies with final_answer "42".](../../assets/images/12-factor-agents-2/context-growth.svg)

On the second call, the model sees its request and the result, and answers `final_answer` with 42. Because the list
is yours, you can print it any time and see exactly what the model will read.

## Step 5: Put it in a loop

Calling the model twice by hand won't work for tasks with an unknown number of steps. So the last lesson wraps it in a
loop that your code controls (Factor 8):

```python
max_steps = 5
step = 0
done = False

while not done and step < max_steps:
    step += 1
    response = openai.responses.create(model="gpt-6-luna", input=context,
                                       tools=tool_schemas, tool_choice="required")
    # for each tool call: record it, run it, record the result
    # if it was final_answer: done = True
```

There are two ways out: the model calls `final_answer`, or the loop hits 5 steps. The step limit is a safety switch,
so a confused model can't loop forever and run up a bill.

The run for "15 + 27, then times 3":

```text
--- Step 1 ---  add({'a': 15, 'b': 27})        Result: 42
--- Step 2 ---  multiply({'a': 42, 'b': 3})    Result: 126
--- Step 3 ---  final_answer({'answer': '126'})

Completed in 3 steps
Final answer: 126
```

In step 2, the model used 42. That number wasn't in the question. It read it from the result your code added in
step 1.

![The agent loop. Start with the context holding the user's message and set step to 0 and done to false. While not done and step is below max_steps: add one to step, call the model with the context, and for each function call record it, run the tool inside try/except, and record the result or the error. If the tool was final_answer, set done to true. When the loop ends, report the answer, or report that the step limit was reached. Beside it, the run for "15 + 27, then times 3": step 1 add gives 42, step 2 multiply gives 126, step 3 final_answer "126".](../../assets/images/12-factor-agents-2/agent-loop.svg)

## Step 6: Turn errors into messages

If a tool fails, Python would normally crash mid-task. Factor 9 says to turn the failure into a message the model can
read:

```python
try:
    ...  # run the tool
    output = json.dumps({"result": result})
except Exception as e:
    output = json.dumps({"error": str(e)})
```

The model then reads something like `{"error": "Tool divide not found"}` and can try another approach. The step limit
still applies, so it can't retry forever.

To be clear: the lessons build this error path, but none of their runs actually hit an error.

## One small bug in the loop

After the loop, the lesson checks `if step >= max_steps` to warn that the limit was hit. But if the model finishes on
exactly step 5, that warning fires even though everything went fine. Checking `if not done` fixes it. A one-line fix,
and only possible because the loop is your own readable code.

## What to remember

- **Asking for JSON is best-effort.** Plan for the reply not being valid.
- **A strict tool schema makes the format a rule** (Factor 4).
- **The model asks, your code acts.** It never runs tools itself.
- **The conversation is a list you own**, with each request and result linked by `call_id` (Factor 3).
- **Your code runs the loop**, with a step limit (Factor 8), and turns errors into messages (Factor 9).

This agent works, but it lives inside one script: its prompt is a string in the code, and its memory vanishes when
the program ends. [Part 3](/engineering/12-factor-agents-3-a-stateless-agent) fixes that.
