---
title: '12-Factor Agents, Part 3: A Stateless Agent You Can Pause and Resume'
excerpt: 'Turning a one-script tool loop into an agent built like a function: tool schemas and prompts in their own files, a serializer that decides exactly what the model reads, and one Pydantic State object that holds both progress and data so a run can be saved and picked up later. Part 3 of a series.'
publishDate: 2026-11-16T00:00:00Z
category: 'LLM Engineering'
tags:
  - agents
  - agentic-workflows
  - pydantic
draft: false
---

_Based on CodeSignal's course "Developing a Stateless Agent in Python", the third course in its "Building a 12-Factor
Agents App in Python" path. This is part 3 of a series; [part 1](/engineering/12-factor-agents-1-the-twelve-principles)
covers the twelve principles and [part 2](/engineering/12-factor-agents-2-tool-calls-and-the-agent-loop) builds the
tool-calling loop. The outputs below are the ones shown in the lessons._

At the end of part 2 we had a calculator agent that worked. It asked for tools, our code ran them, and a loop with a
step limit kept it from running forever. But all of it lived inside one script, and three things about that script
would hurt in a real app:

- The system prompt was a Python string, tangled up with the code around it.
- The model read our raw bookkeeping: dictionaries full of `"type"`, `"call_id"` and `"arguments"`.
- The result came back as a loose tuple, `(context, status, final_answer)`, with no single thing you could save and
  reload.

This course fixes all three over three lessons. The agent stays the same size, but it gets reorganized around one idea
from part 1: **the agent should work like a function.** You hand it the current situation, it does one step of work,
and it hands back the new situation. It keeps nothing in its own head between calls.

The course covers five factors, three of them in depth:

- **Factor 12:** make your agent a stateless reducer.
- **Factor 2:** own your prompts.
- **Factor 5:** unify execution state and business state.
- **Factor 3** (own your context window) gets a new twist, and **Factor 10** (small, focused agents) gets a mention.

The code still uses OpenAI's Responses API and a model the course calls `gpt-6-luna`. The task changes from "15 + 27"
to something that needs more steps: _solve x² − 5x + 6 = 0_.

## Lesson 1: The agent as a function (Factor 12)

### What "stateless reducer" means

"Reducer" is a word from programming for a function with a very boring job: take the current state and one new event,
and return the next state. A bank statement works this way. Start from last month's balance, apply one transaction,
and you get the new balance. Apply them all in order and you get today's balance. The function itself remembers
nothing; everything it needs comes in through the front door.

For an agent, the course writes the shape like this:

```text
(context, event) → (updated_context, status, result)
```

The context is the conversation so far. The "event" is usually whatever the model decides to do next. The agent asks
the model, runs the tool it picked, adds both to the context, and returns the new context plus a status like
`"running"` or `"complete"`.

**Stateless** means the agent object holds no memory of the run. It does hold settings (which model, how many steps
are allowed), but not progress. That has practical payoffs the course spells out:

- **Pause and resume.** Save the context to a file or database, and any later process can pick up from there.
- **Replay.** Feed in the same context and you get the same handling of the model's decisions. The model itself can
  still answer differently from run to run, but your code's part is repeatable.
- **Testing.** You can test one step on a hand-made context without running a whole conversation.
- **Scaling.** Several copies of the agent can run side by side on different contexts, because none of them hides
  anything the others need.

Part 1 compared this to a game save file. The agent doesn't remember where you were; the save file does.

### Tools move into files

Before writing the agent, the lesson spreads the pieces across a few files:

```text
src/
├── core/
│   ├── agent.py              # the Agent class
│   └── tools/
│       ├── schemas/
│       │   ├── math.json           # math tool schemas
│       │   └── final_answer.json   # the "I'm done" tool
│       └── functions/
│           └── math.py             # the Python that does the math
└── main.py
```

The schemas are the same strict JSON forms from part 2, just saved as `.json` files. `math.json` defines six tools:
`sum_numbers`, `multiply_numbers`, `subtract_numbers`, `divide_numbers`, `power` and `square_root`. The functions in
`math.py` check their inputs, so `divide_numbers` raises `ValueError("Division by zero")` and `square_root` refuses a
negative number. As in part 2, a raised error gets turned into a result the model can read, which is Factor 9 at work.

Keeping schemas in their own files means you can change a tool's description, which is really a piece of prompt, without
touching the Python. The agent loads them when it starts:

```python
schemas_dir = Path(__file__).resolve().parent / "tools" / "schemas"
with open(schemas_dir / "math.json", "r", encoding="utf-8") as f:
    math_schemas = json.load(f)
with open(schemas_dir / "final_answer.json", "r", encoding="utf-8") as f:
    final_answer_schema = json.load(f)

self.tool_schemas = [*math_schemas, final_answer_schema]
```

### Three methods, three jobs

The `Agent` class splits part 2's single loop into three methods:

- **`_call_llm(context)`** sends the context to the model with `tool_choice="required"` and returns the reply. Nothing
  else.
- **`_next_step(context)`** does one step: call the model, record each function call, run the tool, record the result.
  It returns `(context, status, final_answer)`.
- **`run(context)`** calls `_next_step` over and over until the status isn't `"running"` or the step limit is hit.

The point of the split is that each piece can change alone. Switching model providers touches `_call_llm`. Adding
logging or saving after each step touches `run`. The step logic in the middle doesn't move.

`run` is now short, and its endings are explicit:

```python
def run(self, context):
    step = 0
    status = "running"
    final_answer = None

    while status == "running" and step < self.max_steps:
        step += 1
        context, status, final_answer = self._next_step(context)

    if status == "running":
        status = "max_steps_reached"

    return context, status, final_answer
```

This also quietly fixes the small warning bug from the end of part 2. The ending is decided by `status`, not by
comparing the step count to the limit, so finishing on the very last allowed step reports `"complete"`.

With a step limit of 10, the quadratic comes back like this:

```text
Status: complete
Final answer: x = 2 and x = 3
```

One honest footnote. The lesson's code still uses Python's `.append()` to add items to the list it was given, so it
changes the caller's list rather than returning a fresh copy. The lesson says so and calls it a simplification for now.
The rule that matters still holds: what the agent does depends only on the context passed in, not on anything stored
inside the agent. Lesson 3 tightens this up.

## Lesson 2: Prompts live in files (Factor 2)

The system prompt was still a Python string inside the constructor. Lesson 2 moves it into
`src/core/prompts/base_system.md`:

```markdown
# ROLE

You are an autonomous agent that can take multiple tool-calling steps.

# REQUIREMENTS

- If your work is done, call the final_answer tool
- ALWAYS prefer calling tools to compute, fetch, or transform information rather than fabricating results.

# EXTRA INSTRUCTIONS
```

The agent reads the file at startup and adds any `extra_instructions` passed to the constructor at the end, under the
empty last heading:

```python
prompt_path = Path(__file__).resolve().parent / "prompts" / "base_system.md"
self.system_prompt = prompt_path.read_text(encoding="utf-8") + extra_instructions
```

This looks like a small move, but it changes who can work on the prompt and how. A prompt in its own file shows up in
code review as its own diff, so "we reworded rule 2" is visible instead of buried in a Python change. You can keep
older versions, compare them, and roll one back. Factor 2 is really about treating the words you send the model as
part of your program, not as a string you typed once and forgot.

## Lesson 2, continued: You decide what the model reads (Factor 3)

### The problem with sending raw context

In part 2 we sent the context list to the model exactly as we stored it. That list is good bookkeeping, but it's noisy
reading. Every item carries a `"type"`, every call and result carries a long `call_id`, and the arguments are JSON
inside a string. The model has to dig through all of that to answer one question: _what has been done so far, and what
should happen next?_

The lesson's fix is a **context serializer**: a function that turns our raw list into a short page written for the
model to read. The layout of that page is itself a prompt file, `context_format.md`:

```markdown
# User Request

{user_message}

# Actions Already Completed (DO NOT REPEAT)

{execution_history}

# Next Step

Decide what tool to call next to make progress on the request.
```

The serializer fills in the two blanks. It finds the first user message, then walks the list twice. On the first pass
it builds a lookup from each `call_id` to a readable call like `power(base=-5, exponent=2)`. On the second pass it
pairs each result with its call and writes one line per finished action:

```python
lines.append(f"✓ COMPLETED: {call_formatted} → Result: {output}")
```

Then `_call_llm` sends that page instead of the raw list. It's a one-line change:

```python
serialized_content = serialize_context_to_text(context)

response = openai.responses.create(
    model=self.model,
    instructions=self.system_prompt,
    input=serialized_content,  # a page of text, not the raw list
    tools=self.tool_schemas,
    tool_choice="required",
    reasoning={"effort": self.reasoning_effort},
)
```

### Two views of the same run

This is the part I find most useful about the lesson. The agent keeps two versions of the same history, each for a
different reader.

The raw list stays inside your program, complete, for you. Here is the full context the lesson printed after solving
the quadratic (call IDs shortened):

```text
{'role': 'user', 'content': 'Solve the root of this equation: x^2 - 5x + 6 = 0'}
{'type': 'function_call', 'name': 'power', 'arguments': '{"base":-5,"exponent":2}', 'call_id': 'call_nFhq…'}
{'type': 'function_call_output', 'call_id': 'call_nFhq…', 'output': '{"result": 25}'}
{'type': 'function_call', 'name': 'multiply_numbers', 'arguments': '{"a":4,"b":6}', 'call_id': 'call_RHPG…'}
{'type': 'function_call_output', 'call_id': 'call_RHPG…', 'output': '{"result": 24}'}
{'type': 'function_call', 'name': 'subtract_numbers', 'arguments': '{"a":25,"b":24}', 'call_id': 'call_mYUh…'}
{'type': 'function_call_output', 'call_id': 'call_mYUh…', 'output': '{"result": 1}'}
{'type': 'function_call', 'name': 'divide_numbers', 'arguments': '{"a":6,"b":2}', 'call_id': 'call_8kW8…'}
{'type': 'function_call_output', 'call_id': 'call_8kW8…', 'output': '{"result": 3.0}'}
{'type': 'function_call', 'name': 'divide_numbers', 'arguments': '{"a":4,"b":2}', 'call_id': 'call_HP1t…'}
{'type': 'function_call_output', 'call_id': 'call_HP1t…', 'output': '{"result": 2.0}'}
{'type': 'function_call', 'name': 'final_answer', 'arguments': '{"answer":"The equation factors as (x - 2)(x - 3) = 0, so the roots are x = 2 and x = 3."}', 'call_id': 'call_FsKS…'}
```

The model never saw that. On its last step, it saw this:

```markdown
# User Request

Solve the root of this equation: x^2 - 5x + 6 = 0

# Actions Already Completed (DO NOT REPEAT)

✓ COMPLETED: power(base=-5, exponent=2) → Result: {"result": 25}
✓ COMPLETED: multiply_numbers(a=4, b=6) → Result: {"result": 24}
✓ COMPLETED: subtract_numbers(a=25, b=24) → Result: {"result": 1}
✓ COMPLETED: divide_numbers(a=6, b=2) → Result: {"result": 3.0}
✓ COMPLETED: divide_numbers(a=4, b=2) → Result: {"result": 2.0}

# Next Step

Decide what tool to call next to make progress on the request.
```

![Two views of the same agent run. Left, the raw context list kept inside the program: a user message followed by pairs of function_call and function_call_output dictionaries, each with type, name, arguments and a long call_id. An arrow labelled serialize_context_to_text points right to the page the model reads: a User Request heading with the equation, an Actions Already Completed heading with five checkmarked lines such as power(base=-5, exponent=2) giving 25, and a Next Step heading. The raw list is for auditing; the page is for the model.](../../assets/images/12-factor-agents-3/raw-vs-serialized.svg)

Like a doctor's chart versus the handoff note at a shift change, both describe the same patient. The chart keeps every
detail for the record. The handoff note says what's been done and what's next, in a form the next person can act on
in seconds.

A few details are worth noticing:

- **`final_answer` doesn't show up in the history.** The serializer only writes lines for calls that have a result, and
  `final_answer` ends the loop before any result exists.
- **The `call_id` pairing still matters, but only to our code.** The serializer uses it to match each result with its
  call. The model just reads finished sentences.
- **"DO NOT REPEAT" is a deliberate nudge.** Labeling the history as finished work is meant to stop the model from
  calling the same tool again. This is what "context engineering" means in practice: choosing the wording and layout
  of what the model sees, not just the facts.

### What the run shows about prompts

The run is also a nice, small lesson in what a prompt can and can't do. The quadratic formula is x = (5 ± √1) / 2,
and the trace follows it: 5² = 25, 4 × 6 = 24, 25 − 24 = 1. Then it jumps straight to `divide_numbers(a=6, b=2)` and
`divide_numbers(a=4, b=2)`.

That means the model worked out √1 = 1, 5 + 1 = 6 and 5 − 1 = 4 on its own, without calling `square_root`,
`sum_numbers` or `subtract_numbers`. The prompt says "ALWAYS prefer calling tools to compute", and the model mostly
did, but "prefer" is exactly what it did: it skipped the steps it found trivial. The answer was right, but if you need
every calculation to go through a tool, a sentence in the prompt asks for that politely and nothing more. Rules that
must hold have to live in code, the way `tool_choice="required"` and the step limit do.

## Lesson 3: One State object (Factor 5)

### Two kinds of state

`run` still returned three separate things: the context, a status, and maybe an answer. That's awkward to save, and it
leaves no obvious place for anything new, like an error message or the number of steps used. Lesson 3 replaces the
tuple with one object, and in doing so it separates two kinds of information the agent tracks:

- **Execution state** is about the run itself: how many steps have happened, whether it's running, finished or failed,
  what work is queued up, and what went wrong if it crashed.
- **Business state** is about the task: the conversation so far and, eventually, the answer.

Factor 5 says to keep both in the same place. Think of a package-tracking page. "Out for delivery, 3 stops away" is
execution state; the address and what's in the box are business state. You'd never want them in two separate systems
that could disagree.

The lesson builds the object with **Pydantic**, a Python library for data classes that check their own field types:

```python
from typing import List, Any, Optional
from pydantic import BaseModel, Field

class State(BaseModel):
    id: str                                        # unique ID for saving and tracking
    steps: int = 0                                 # execution
    status: str = "running"                        # execution: running / complete / max_steps_reached / failed
    context: List[Any] = Field(default_factory=list)            # business
    pending_tool_calls: List[Any] = Field(default_factory=list) # execution: work queued for the next step
    error: Optional[str] = None                    # execution: set when status is "failed"
    final_answer: Optional[str] = None             # business
```

`Field(default_factory=list)` makes a fresh empty list for every `State`. In plain Python, a default of `= []` is a
classic trap where every object quietly shares one list. Pydantic happens to copy list defaults for you, so here
`default_factory` mostly states the intent out loud, which is no bad thing.

![The stateless reducer with one State object. A State card on the left has an id, then execution state (steps, status, pending_tool_calls, error) and business state (context, final_answer). An arrow carries it into the agent's run method, which deep-copies it and calls _next_step until the status is no longer running, recording crashes as failed. A new State card comes out on the right with steps counted, status complete, a longer context and final_answer filled in. The original State is left unchanged.](../../assets/images/12-factor-agents-3/reducer.svg)

### A step now runs queued work first

The most interesting change is easy to miss: the order inside a step flips.

In part 2 and lesson 1, a step was _ask the model, then run what it asked for_. Lesson 3's `_next_step` does it the
other way around:

1. Add one to `state.steps`.
2. Run every tool call already waiting in `state.pending_tool_calls`, write each call and its result into
   `state.context`, and take it off the queue. If one of them is `final_answer`, set `status` to `"complete"`, save the
   answer, and stop.
3. Ask the model what to do next, using the updated context.
4. Put the model's new tool calls into `state.pending_tool_calls`, and return the state.

```python
def _next_step(self, state: State):
    state.steps += 1

    for function_call in list(state.pending_tool_calls):
        # record the call, then run it
        match function_call["name"]:
            case "final_answer":
                state.pending_tool_calls = []
                state.status = "complete"
                state.final_answer = function_call["arguments"].get("answer")
                return state
            case "sum_numbers":
                ...  # run it in try/except, as before
        state.pending_tool_calls.remove(function_call)
        # append the function_call_output to state.context

    response = self._call_llm(state.context)
    state.pending_tool_calls.extend(
        {"name": fc.name, "arguments": json.loads(fc.arguments), "call_id": fc.call_id, "type": fc.type}
        for fc in response.output if fc.type == "function_call"
    )
    return state
```

(The lesson writes the last part as two list comprehensions; it's folded into one here to save space.)

![How the order of a step changed. Top, a step in part 2: call the model, then run the tools it asked for and record the results, so every step ends with nothing left to do. Bottom, a step in lesson 3: run the tool calls already queued in pending_tool_calls and record the results, then call the model, then queue its new tool calls. Every step ends with the model's next request saved in the state but not yet run, which is the moment where you could save the state, pause, or ask a person.](../../assets/images/12-factor-agents-3/step-order.svg)

Why bother? Look at what the state holds _between_ steps. After a lesson 3 step, the model's latest request sits in
`pending_tool_calls`, decided but not yet carried out. If you save the state right then, you've saved "the model wants
to run `divide_numbers(a=6, b=2)`" as plain data. Something outside the agent could look at that request before the
next step runs it: a log, a test, or a person who has to approve it.

That's the hook the next course builds on. A tool call that waits in the state can wait for a human just as easily as
for the next loop iteration.

One side effect of this order: the call that ends a run gets handled one step after the model makes it. The model asks
for `final_answer` at the end of one step, and the next step sees it in the queue and marks the run complete. So a run
with five tool calls and a final answer uses seven steps, which is fine with the default limit of 10 but worth knowing
when you set the limit.

### `run` hands back a new state

`run` now takes a `State` and returns a `State`, and it starts by copying what it was given:

```python
def run(self, state: State):
    state = state.model_copy(deep=True)
    state.status = "running"
    state.error = None

    try:
        while state.status == "running" and state.steps < self.max_steps:
            state = self._next_step(state)
    except Exception as e:
        state.status = "failed"
        state.error = str(e)
        return state

    if state.status == "running":
        state.status = "max_steps_reached"

    return state
```

`model_copy(deep=True)` is what closes the gap from lesson 1. The caller's `State` is never changed; `run` works on its
own copy and returns that. Your original is still sitting there, so you can compare before and after, or run again
from the same starting point.

The `try`/`except` adds a fourth ending. Part 2 fed _tool_ errors back to the model so it could try again. This catches
the other kind: the API is down, or something in our own code breaks. Those can't be fixed by the model, so the run
stops with `status="failed"` and the message saved in `state.error`. Every way a run can end (complete, out of steps,
or failed) now comes back in the same object.

The script that uses it reads cleanly:

```python
import uuid
from core.agent import Agent
from core.models.state import State

agent = Agent()
initial_state = State(
    id=str(uuid.uuid4()),
    context=[{"role": "user", "content": "Solve the root of this equation: x^2 - 5x + 6 = 0"}],
)

final_state = agent.run(initial_state)

print(f"Status: {final_state.status}")
if final_state.status == "failed":
    print(f"Error: {final_state.error}")
elif final_state.final_answer:
    print(f"Final answer: {final_state.final_answer}")
```

And the output:

```text
Status: complete
Final answer: The equation x^2 - 5x + 6 = 0 has roots x = 2 and x = 3.
```

Because `State` is a Pydantic model, saving it is one line (`final_state.model_dump_json()`), and so is loading it back
(`State.model_validate_json(...)`). The lessons don't show a save-and-resume run yet; they set up everything it needs.

## Where Factor 10 fits

The course names Factor 10, small and focused agents, but doesn't build anything new for it. The connection is the
shape of the agent: it does one kind of job (math, with six tools), and its interface is just "state in, state out".
An agent with that interface is easy to drop into a bigger system as one piece. Building a team of them is not part of
this course.

## What to take away

- **Build the agent like a function (Factor 12).** It keeps settings, not progress. Everything about the run comes in
  as an argument and goes out as a return value, so you can save it, replay it, or test one step alone.
- **Keep prompts in files (Factor 2).** The system prompt, the context layout and the tool schemas all live outside
  the Python, where changes are easy to review and roll back.
- **Write a page for the model, keep the records for yourself (Factor 3).** A serializer turns the raw context into a
  short summary of the request and the finished actions. The full list stays in your program for auditing.
- **A prompt asks; code enforces.** The model skipped tool calls for the easy arithmetic despite an "ALWAYS" in the
  prompt. Anything that must happen belongs in code.
- **Put everything in one State object (Factor 5).** Progress, queued work, errors, the conversation and the answer
  travel together. `run` copies it, works on the copy, and reports every ending (complete, out of steps, failed) the
  same way.

The agent can now be stopped between any two steps with nothing lost. What it can't do yet is _choose_ to stop, or be
reached from anywhere except a Python script. Part 4 covers the last course, which exposes the agent through a simple
API: trigger it from anywhere (Factor 11), launch, pause and resume it with simple calls (Factor 6), and let it reach a
person through a tool call (Factor 7), with the `State` object from this course as the thing that gets saved in
between.
