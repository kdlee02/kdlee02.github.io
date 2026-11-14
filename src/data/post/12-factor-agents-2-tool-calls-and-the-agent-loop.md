---
title: '12-Factor Agents, Part 2: Tool Calls and a Loop You Control'
excerpt: 'Building a tiny calculator agent in Python with the OpenAI Responses API: asking for JSON versus requiring a strict tool call, running the tools yourself, keeping the conversation in a list you own, and wrapping it all in a loop with a step limit and errors fed back to the model. Part 2 of a series.'
publishDate: 2026-11-15T00:00:00Z
category: 'LLM Engineering'
tags:
  - agents
  - tool-use
  - structured-output
draft: false
---

_Based on CodeSignal's course "Foundations of Agentic Tool Use in Python", the second course in its "Building a
12-Factor Agents App in Python" path. This is part 2 of a series; [part 1](/engineering/12-factor-agents-1-the-twelve-principles)
covers the twelve principles. The outputs below are the ones shown in the lessons._

In part 1, the big idea was that a model should fill in a form instead of writing a chatty reply, and that your own
code, not a framework, should run the show. This course turns that into Python. Over four short lessons it builds one
small agent, a calculator, that can answer "What is 15 + 27? Then multiply the result by 3."

A calculator sounds too simple to need an agent, and that's the point. With nothing interesting going on in the math,
you can see every moving part: how the model asks for a tool, who actually runs it, what the model gets to read, and
what stops the whole thing from running forever. Those parts are the same in a support bot or a travel planner.

The course covers five of the twelve factors:

- **Factor 1:** turn natural language into structured output.
- **Factor 4:** tools are just structured outputs.
- **Factor 3:** own your context window.
- **Factor 8:** own your control flow.
- **Factor 9:** feed errors back into the context.

All the code uses OpenAI's **Responses API** (`openai.responses.create`) and a model the course calls `gpt-6-luna`.

## Step 1: Ask for JSON, and plan for it to fail

The simplest way to get a form back is to ask for one. The system prompt (the standing instructions the model reads
before every conversation) shows the exact shape you want:

```python
system_prompt = """
You are a helpful assistant that only answers with the following JSON schema:
{
    "answer": "the answer to the question"
}
"""
```

The word "only" is there on purpose, to discourage the model from adding a friendly sentence around the JSON. You
send the question, find the message in the response, and turn its text into a Python dictionary:

```python
response = openai.responses.create(
    model="gpt-6-luna",
    instructions=system_prompt,
    input=[{"role": "user", "content": "What is 15 + 27?"}],
    reasoning={"effort": "low"},
)

for item in response.output:
    if item.type == "message":
        try:
            result = json.loads(item.content[0].text)
            print(f"Answer: {result['answer']}")
        except json.JSONDecodeError:
            print("Failed to parse JSON from response")
```

In the lesson, this prints `Answer: 42`.

The `try`/`except` is the important part. Asking for JSON is a request, not a rule. Most of the time the model
follows it. Sometimes it adds "Sure! Here's your answer:" in front, or gets a bracket wrong, and `json.loads` raises
an error. The course calls this approach **best-effort**: it usually works, and your code has to cope when it doesn't.
In a real system you'd log the failure, try again, or hand it to a person.

## Step 2: Make the form a rule with a tool schema

The second lesson swaps the request for a rule. Instead of describing the JSON in the prompt, you describe a
**tool**: a named function the model can "call" by filling in its arguments. The description is a **schema**, a
precise list of the fields, their types, and which ones are required.

```python
tool_schemas = [
    {
        "type": "function",
        "name": "final_answer",
        "description": "Provide the final answer and stop.",
        "strict": True,
        "parameters": {
            "type": "object",
            "properties": {
                "answer": {"type": "string", "description": "The final answer for the user."}
            },
            "required": ["answer"],
            "additionalProperties": False,
        },
    }
]
```

Two settings do the heavy lifting:

- `"strict": True` tells the API to make the model's arguments match the schema exactly. Together with
  `"required"` and `"additionalProperties": False`, that means `answer` is always there, it's always a string, and
  nothing extra sneaks in.
- `tool_choice="required"`, passed with the request, means the model _must_ answer by calling a tool. Without it the
  model may decide to just chat, and your code would get a sentence instead of a form.

It's the difference between asking someone to write their details neatly on a blank sheet and handing them a web
form that won't submit until every box is filled in correctly.

![Two ways to get structured output. Left, asking in the prompt: the system prompt describes the JSON, the model replies with text, and json.loads either succeeds or raises JSONDecodeError, so the code needs a fallback. Right, a strict tool: the schema goes in the tools parameter with strict set to true and tool_choice set to required, the API makes the model return a function_call whose arguments match the schema, and the code can read args["answer"] directly.](../../assets/images/12-factor-agents-2/prompt-vs-tool.svg)

Since the schema now carries the format, the system prompt shrinks to `You are a helpful assistant.` The answer comes
back as a different kind of item. The lesson prints the raw response, and the useful part looks like this:

```json
{
  "arguments": "{\"answer\":\"42\"}",
  "call_id": "call_e1oAzZ106uh7FOivnXpJUBjR",
  "name": "final_answer",
  "type": "function_call"
}
```

Notice that `arguments` is a _string_ of JSON, not a dictionary, so you still call `json.loads` on it. The difference
is that this time the API has already made sure it fits the schema:

```python
for item in response.output:
    if item.type == "function_call" and item.name == "final_answer":
        args = json.loads(item.arguments)
        print(f"Answer: {args['answer']}")
```

Again: `Answer: 42`. Same answer, but now it's guaranteed to arrive in the right shape. This is Factor 4 in practice.
A tool call isn't magic. It's a structured output with a stricter form. (If you want more on the different ways to
get structured output, I compared three of them in an
[earlier post](/engineering/three-ways-to-get-structured-output).)

## Step 3: The model asks, your code does the work

So far the model has done the arithmetic in its head. Real agents need real tools, so the third lesson adds two
Python functions:

```python
def add(a: float, b: float) -> float:
    return a + b

def multiply(a: float, b: float) -> float:
    return a * b
```

Each one gets a schema, written the same way as `final_answer`, with two `number` parameters named `a` and `b`. Using
the same names in the schema and the function is deliberate. When the model asks for `add` with `{"a": 15, "b": 27}`,
your code can pass that dictionary straight in as `add(**args)`, which Python reads as `add(a=15, b=27)`.

The model never runs `add` itself. It only writes down the request. Your code reads the name and decides what to do
with a `match` statement, which works like a switchboard:

```python
args = json.loads(item.arguments)
match item.name:
    case "add":
        result = add(**args)
    case "multiply":
        result = multiply(**args)
    case _:
        result = f"Error: Tool {item.name} not implemented"
```

The last case catches any tool name you didn't plan for, so a made-up tool can't crash the program. In the lesson this
step prints `Executed add({'a': 15, 'b': 27}) = 42`.

## Step 4: The conversation is a list you own

Here's a detail that surprises people: the model has no memory between calls. Each call, it reads exactly what you
send in `input` and nothing else. So after your code runs `add`, the model doesn't know the answer is 42 until you
tell it.

The course keeps the whole conversation in a plain Python list called `context`. That's Factor 3, owning your context
window: you decide, item by item, what the model will read. After the first call, two things get added:

1. A record of the model's request, with `"type": "function_call"`.
2. The result, with `"type": "function_call_output"`.

Both carry the same `call_id`, the ID the API stamped on the request. It works like the ticket at a coat check. When
several tool calls are in flight at once, the matching number tells the model which result belongs to which request.

```python
context.append({
    "type": "function_call",
    "name": item.name,
    "arguments": item.arguments,
    "call_id": item.call_id,
})
context.append({
    "type": "function_call_output",
    "call_id": item.call_id,
    "output": json.dumps({"result": result}),
})
```

Because the list is yours, you can print it and see exactly what the model will read next. Before the second call,
the lesson's `context` holds three items:

```json
[
  { "role": "user", "content": "Compute 15 + 27" },
  {
    "type": "function_call",
    "name": "add",
    "arguments": "{\"a\":15, \"b\":27}",
    "call_id": "call_lUnRop9ARHhrzWEkWvSLhcrq"
  },
  {
    "type": "function_call_output",
    "call_id": "call_lUnRop9ARHhrzWEkWvSLhcrq",
    "output": "{\"result\": 42}"
  }
]
```

![How the context list grows. Before the first call it holds one item, the user's message "Compute 15 + 27". The model replies with a function_call for add with a equal to 15 and b equal to 27. Your code runs add, gets 42, and appends two items: the function_call and a function_call_output with result 42, both carrying the same call_id. The second call sends all three items, and the model replies with final_answer "42".](../../assets/images/12-factor-agents-2/context-growth.svg)

The second call sends this list. The model sees its own request and the result, decides it's done, and calls
`final_answer`. The lesson prints `Final response: 42`.

There's no hidden memory and no framework deciding what to keep. If the model ever does something strange, the first
thing to check is this list, and you can always print it.

## Step 5: Replace the two manual calls with a loop

Calling the model twice by hand works for 15 + 27. It won't work for a task with an unknown number of steps. The last
lesson wraps everything in a loop, and this is where Factor 8, owning your control flow, shows up. Four variables
decide when the loop runs and when it stops:

```python
max_steps = 5        # safety limit: never more than 5 model calls
step = 0             # how many calls so far
done = False         # set to True when the model calls final_answer
final_answer = None  # the answer, once there is one

while not done and step < max_steps:
    step += 1
    response = openai.responses.create(
        model="gpt-6-luna",
        instructions=system_prompt,
        input=context,
        tools=tool_schemas,
        tool_choice="required",
        reasoning={"effort": "low"},
    )
    # for each function_call in response.output:
    #   record the call, run the tool, record the result (as in step 4)
    #   if it was final_answer: save the answer, set done = True
```

The loop has two ways to end. The good way is the model calling `final_answer`, which sets `done`. The safety way is
hitting `max_steps`. The step limit works like a circuit breaker. If the model gets confused and keeps calling tools,
the loop still stops after five calls, so a bug can't turn into a pile of API charges. Both exits are plain Python that
you can read. Neither one depends on the model behaving.

`final_answer` is now a tool that means "I'm finished." The system prompt says so directly:

```text
You are a helpful assistant that can perform calculations.
When asked to do math, you must use the provided tools.
When your work is done, call the final_answer tool.
```

With the task "What is 15 + 27? Then multiply the result by 3", the lesson's run looks like this:

```text
--- Step 1 ---
Calling function: add({'a': 15, 'b': 27})
Result: 42

--- Step 2 ---
Calling function: multiply({'a': 42, 'b': 3})
Result: 126

--- Step 3 ---
Calling function: final_answer({'answer': '126'})
Result: 126

Completed in 3 steps
Final answer: 126
```

Look at step 2. The model asks for `multiply(42, 3)`. The number 42 isn't in the user's message. The model read it
from the `function_call_output` your code added in step 1. That's the context list doing its job.

![The agent loop. Start with the context holding the user's message and set step to 0 and done to false. While not done and step is below max_steps: add one to step, call the model with the context, and for each function call record it, run the tool inside try/except, and record the result or the error. If the tool was final_answer, set done to true. When the loop ends, report the answer, or report that the step limit was reached. Beside it, the run for "15 + 27, then times 3": step 1 add gives 42, step 2 multiply gives 126, step 3 final_answer "126".](../../assets/images/12-factor-agents-2/agent-loop.svg)

## Step 6: Turn errors into messages

What if a tool fails? Maybe the model sends a string where a number should be, or asks for a tool that doesn't exist.
Without protection, Python raises an exception and the whole agent crashes in the middle of a task.

Factor 9 says to turn the failure into information instead. The loop runs each tool inside `try`/`except`, and an
error becomes an ordinary result with an `"error"` field:

```python
try:
    match function_name:
        case "add":
            result = add(**args)
            output = json.dumps({"result": result})
        # ... the other tools ...
        case _:
            output = json.dumps({"error": f"Tool {function_name} not found"})
except Exception as e:
    output = json.dumps({"error": str(e)})

context.append({"type": "function_call_output", "call_id": item.call_id, "output": output})
```

Either way, a `function_call_output` goes into the context. On its next step, the model reads something like
`{"error": "Tool divide not found"}` and has a chance to try something else. It can use the tools it does have,
fix its arguments, or explain the problem in `final_answer`. The `max_steps` limit still applies, so a model that
keeps failing can't retry forever.

To be clear about what the course shows: the lessons build this error path, but none of their runs actually hit an
error. All the outputs above are from runs where every tool succeeded. Whether a given model recovers well from a
particular error is something you'd test with your own tools.

## One small fix to the loop

After the loop, the lesson checks how it ended:

```python
if step >= max_steps:
    print(f"\nReached maximum steps ({max_steps})")
```

There's a small trap here. If the model calls `final_answer` on exactly the fifth step, `done` is `True` _and_
`step` equals `max_steps`, so this prints a warning even though the agent finished normally. Checking the flag that
actually means "finished" avoids that:

```python
if not done:
    print(f"\nStopped after {max_steps} steps without a final answer")
```

It's a tiny thing, but it shows why owning the loop matters. When the stopping rules are plain code, you can read
them, notice a corner case, and fix it in one line.

## What to take away

- **Asking for JSON in the prompt is best-effort.** Wrap `json.loads` in `try`/`except` and plan for the failure.
- **A strict tool schema makes the form a rule.** With `"strict": True` and `tool_choice="required"`, the API makes
  sure the arguments match your schema (Factor 4).
- **The model asks, your code acts.** Matching parameter names let you run `add(**args)`, and a `match` statement
  picks the function, with a fallback for unknown tools.
- **The context is a list you own.** Each tool call and its result go in as a pair linked by `call_id`, and you can
  print the list at any time to see what the model will read (Factor 3).
- **The loop belongs to your code.** It stops when the model calls `final_answer` or when `max_steps` is reached
  (Factor 8). Errors become `{"error": ...}` results the model can read and react to (Factor 9).

This little agent works, but it lives entirely inside one running script. Its prompt is a string in the code, its
memory is a list that disappears when the program ends, and it can't pause to wait for anything. Part 3 fixes that:
prompts move into their own files (Factor 2), the agent's progress and data go into one saved state (Factor 5), and
the agent becomes a stateless reducer that takes state in and hands state back (Factors 10 and 12).
