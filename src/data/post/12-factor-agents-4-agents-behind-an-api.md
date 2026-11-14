---
title: '12-Factor Agents, Part 4: Putting the Agent Behind an API'
excerpt: 'Wrapping the stateless agent in a small FastAPI server: launch a run and check on it later, save its state to SQLite after every step, pause and resume it, and let it stop to ask a person a question through a tool call. Plus the gaps in the design worth knowing about. Part 4 of a series.'
publishDate: 2026-11-17T00:00:00Z
category: 'LLM Engineering'
tags:
  - agents
  - agentic-workflows
  - tool-use
draft: false
---

_Based on CodeSignal's course "Exposing Agents with Simple APIs in Python", the fourth and last course in its "Building
a 12-Factor Agents App in Python" path. This is part 4 of a series: [part 1](/engineering/12-factor-agents-1-the-twelve-principles)
covers the twelve principles, [part 2](/engineering/12-factor-agents-2-tool-calls-and-the-agent-loop) builds the
tool-calling loop, and [part 3](/engineering/12-factor-agents-3-a-stateless-agent) turns it into a stateless agent with
one `State` object. The outputs below are the ones shown in the lessons._

By the end of part 3, our math agent could be stopped between any two steps without losing anything. Its whole
situation lived in one `State` object: the conversation, the step count, the status, and the tool calls it had asked
for but not yet run.

That was only useful in theory, though, because the agent could still only be run from a Python script, start to
finish. Nothing outside the script could start it, check on it, stop it, or answer a question it had. This course adds
exactly those abilities by putting a small web server in front of the agent. The agent's own code barely changes,
which is the best evidence that parts 2 and 3 got the design right.

The course covers three factors:

- **Factor 11:** trigger from anywhere, meet users where they are.
- **Factor 6:** launch, pause and resume with simple APIs.
- **Factor 7:** contact humans with tool calls.

The server uses **FastAPI**, a popular Python library for building web APIs. An **API** here just means a set of web
addresses (endpoints) that programs can send requests to. A browser, a phone app, a script or a chat bot can all send
the same request and get the same answer back.

## Launch now, check back later (Factors 11 and 6)

### A thin layer over the same agent

The project gains one folder:

```text
.
├── src/
│   ├── server/
│   │   └── main.py  # FastAPI app: the endpoints
│   └── core/        # the agent, State, tools and prompts from part 3
└── test.py          # a client script that talks to the server
```

Everything in `core/` is the agent from part 3. The `server/` folder only translates web requests into calls to that
agent. This is what Factor 11 is about: the agent doesn't care who triggered it. A web request, a command-line tool, a
Slack bot or a scheduled job would each be one more thin adapter in front of the same core.

### Why the server can't just wait for the answer

Solving the quadratic from part 3 takes several model calls, and each one takes a while. If the server held the web
request open until the agent finished, the client would sit there waiting, and a slow run could hit a timeout.

So the course uses the pattern you know from a busy restaurant: you order, get a buzzer with a number, and come back
when it's ready. The launch endpoint creates a `State`, schedules the agent to run in the background, and returns
right away with the state's ID:

```python
@app.post("/agent/launch", response_model=State)
def agent_launch(payload: LaunchRequest, background_tasks: BackgroundTasks):
    initial_state = State(
        id=str(uuid.uuid4()),
        context=[{"role": "user", "content": payload.input_prompt}],
        status="running",
        steps=0,
    )
    states[initial_state.id] = initial_state
    background_tasks.add_task(_run_agent_in_background, initial_state.id)
    return initial_state
```

`LaunchRequest` is a one-field Pydantic model (`input_prompt: str`), so FastAPI rejects a request without a prompt
before our code even runs. `BackgroundTasks` is FastAPI's built-in way to run a function after the response has been
sent. The background function just loads the state, calls `agent.run(state)`, and stores the result.

A second endpoint, `GET /agent/state/{state_id}`, returns the current state, or a 404 error if the ID is unknown. The
test client launches a run and then asks for the state once a second until the status is `complete`,
`max_steps_reached` or `failed`. Asking over and over like this is called **polling**.

The lesson's run solved the quadratic and came back like this (most of the context trimmed):

```text
Launched agent with ID: 01c0acc0-b153-4c11-936c-68d5d6e84793
Final State:
{
  "id": "01c0acc0-b153-4c11-936c-68d5d6e84793",
  "steps": 8,
  "status": "complete",
  ...
  "pending_tool_calls": [],
  "error": null,
  "final_answer": "The equation x^2 - 5x + 6 = 0 has roots x = 2 and x = 3."
}
```

Notice that the client got back exactly the `State` object from part 3, turned into JSON. There was nothing new to
design for the response, because the state already held everything a client could want to know.

![The API around the agent. On the left, clients: the test script, a web UI, or any other program that can send web requests. In the middle, the FastAPI server with five endpoints: launch, state, pause, resume and provide_input. Launch, resume and provide_input start a background runner, which calls the unchanged Agent core from part 3. Below, a SQLite database holds one row per run; the runner saves the state there after every step, and the state, pause and provide_input endpoints read or change that row.](../../assets/images/12-factor-agents-4/api-architecture.svg)

## States that survive a restart

The first version kept states in a Python dictionary, which vanishes the moment the server restarts. Factor 6 only
means something if an agent paused yesterday can be resumed today, so lesson 2 moves the states into **SQLite**, a
database that lives in a single file, using **SQLAlchemy**, a library that maps Python classes to database tables.

The table has one column per `State` field. The conversation and the queued tool calls are stored as JSON columns:

```python
class StateModel(Base):
    __tablename__ = "states"
    id = Column(String, primary_key=True)
    steps = Column(Integer, default=0)
    status = Column(String, default="running")
    context = Column(JSON, default=list)
    pending_tool_calls = Column(JSON, default=list)
    error = Column(Text, nullable=True)
    final_answer = Column(Text, nullable=True)
```

This is Factor 5 from part 3 paying off. Because progress and data were already one object, saving a run is one
database row, and two small helpers (`pydantic_to_db` and `db_to_pydantic`) copy the fields across. Every database
change goes through a `with get_db_session()` block that commits if the code inside succeeds and rolls back if it
raises, so a crash can't leave a half-written row behind.

### Saving after every step

Saving only at the end isn't enough. A client polling halfway through should see real progress, and a run that dies
halfway should leave its last good state behind. So `run()` gains an optional `progress_callback`: a function the
agent calls after each step, handing it the new state.

```python
while state.status == "running" and state.steps < max_steps_allowed:
    state = self._next_step(state)
    if progress_callback:
        progress_callback(state)  # the server's callback saves it to the database
```

The agent still knows nothing about databases. It only promises to call "someone" after each step. The server
supplies a callback that writes the state's fields into the run's row.

With that in place, the polling client can print what's in the state on every check. This log is my favorite output in
the whole path, because you can watch part 3's queue at work (call IDs trimmed):

```text
Status: running | Steps: 0 | Pending tool calls: []
Status: running | Steps: 1 | Pending tool calls: [power(base=-5, exponent=2)]
Status: running | Steps: 2 | Pending tool calls: [multiply_numbers(a=4, b=6)]
Status: running | Steps: 3 | Pending tool calls: [subtract_numbers(a=25, b=24)]
Status: running | Steps: 4 | Pending tool calls: [sum_numbers(a=5, b=1), subtract_numbers(a=5, b=1)]
Status: running | Steps: 5 | Pending tool calls: [divide_numbers(a=6, b=2), divide_numbers(a=4, b=2)]
Status: complete | Steps: 7 | Pending tool calls: []
```

(The lesson prints each queued call as a full dictionary; I've written them as calls to fit the page.)

Three things are worth noticing:

- **Each line is a request the model has made but nobody has run yet.** That's the "step ends with a request waiting"
  shape from part 3, now visible from outside the server.
- **The model can ask for two tools at once.** At step 4 it queued `5 + 1` and `5 − 1` together, and at step 5 both
  divisions. In part 3's run the model did those small sums in its head. Same prompt, different run, different
  choice.
- **Seven steps for six model turns.** The `final_answer` call is queued at step 6 and handled at step 7, exactly as
  part 3 predicted.

The lesson is upfront about one limit. The agent runs inside the web server's own process, so if the server stops,
the run stops with it. What survives is the saved state in the database, up to the last finished step. A production
system would hand runs to separate worker processes, but for this course the saved state is the point.

## Pause and resume (Factor 6)

### A pause that waits for the end of the step

There are two ways to stop a running program. You can kill it on the spot, or you can ask it to stop at the next safe
moment. Killing it mid-step could leave a tool call recorded without its result, which is exactly the kind of broken
context the earlier parts worked hard to avoid.

The course takes the polite route, called a **cooperative pause**. Think of a coach telling a runner "stop after this
lap" rather than tackling them on the track:

1. `POST /agent/pause` checks that the run exists and is `running` (400 otherwise), then sets the database row's status
   to `"paused"`.
2. The agent doesn't notice right away. It finishes its current step.
3. The progress callback, before saving, reads the row. If the status there is `"paused"`, it sets the agent's own
   `state.status = "paused"` and saves everything except the status.
4. Back in `run()`, the loop condition `state.status == "running"` is now false, so the loop ends cleanly.

The database row works as a message board between the web request and the running agent. Neither one calls the other
directly; they just read and write the same row.

`POST /agent/resume` does the reverse. It refuses with a **409 Conflict** if the run is already `running`, sets the row
back to `"running"`, and starts a new background run from the saved state. Because the saved state includes
`pending_tool_calls`, the first thing the resumed agent does is run whatever the model had asked for before the pause.
Nothing is asked twice.

There's one more detail in `run()` for resumed runs. If the state already has steps, the step limit becomes
`max_steps + state.steps`, so a resumed run gets a fresh allowance of steps instead of hitting the limit immediately.

The lesson's test launches the quadratic, waits three seconds, and pauses:

```text
Launched agent with ID: e377469b-4b33-4327-9e9d-c1288d133201
Status: paused | Steps: 0 | Pending tool calls: []
```

`Steps: 0` tells you the pause arrived while the first model call was still running. The reply from `/agent/pause` is
the row at that moment. It means "your pause request is recorded", not "the agent has stopped", because the agent
only checks at the end of the step. After resuming, the client polled until:

```text
Status: complete | Steps: 6

Final answer: The roots are x = 2 and x = 3.
```

![The lifecycle of a run as a set of statuses. Launch creates a run in the running status. From running, a run can end as complete when the model calls final_answer, as max_steps_reached when it runs out of steps, or as failed when something crashes. The pause endpoint moves running to paused at the end of the current step, and the resume endpoint moves paused back to running. When the model calls ask_human, running moves to waiting_human_input, and the provide_input endpoint moves it back to running with the person's answer added to the context.](../../assets/images/12-factor-agents-4/lifecycle.svg)

## Asking a person (Factor 7)

Some questions can't be answered with tools. If someone asks for the area of a circle and doesn't say how big it is,
no amount of `multiply_numbers` will help. A guess would be worse than useless. The agent needs to ask.

Factor 7's idea is that asking a person should look exactly like using any other tool. So the course adds one more
strict schema, `ask_human`, with a single required `question` string. The model calls it the same way it calls
`sum_numbers`; it doesn't need to know a human is on the other end.

What's different is what our code does with it. Inside `_next_step`, a new case in the `match`:

```python
case "ask_human":
    state.pending_tool_calls.remove(function_call)
    state.status = "waiting_human_input"
    return state
```

The call has already been written into `state.context` a few lines earlier, like every call. The agent takes it off
the queue, sets a new status, and returns. Because the status is no longer `"running"`, `run()` stops, the callback
saves the state, and the run sits in the database waiting, for a second or for a week.

The answer comes back through a new endpoint, `POST /agent/provide_input`, with the run's `id` and the person's
`answer`:

1. Check that the run exists (404) and is `waiting_human_input` (400 otherwise).
2. Search the context backwards for the latest `ask_human` call and take its `call_id`.
3. Add the answer to the context as an ordinary tool result with that same `call_id`:

```python
human_response = {
    "type": "function_call_output",
    "call_id": call_id,  # the ID of the ask_human call
    "output": json.dumps({"answer": payload.answer}),
}
working_state.context.append(human_response)
```

4. Set the status back to `"running"` and start a background run.

Remember the coat-check ticket from part 2: each result is matched to its request by the `call_id`. This is the same
ticket, except a person hands the coat back instead of a Python function. From the model's point of view, `ask_human`
was a tool call that took a long time to return.

![The ask_human flow for the circle example. The client launches the prompt "Can you figure out the area of a circle for me? Use pi = 3.14." The agent runs two steps and the model calls ask_human with a question asking for the radius or diameter. The agent records the call with its call_id and sets the status to waiting_human_input. The client sees the status, reads the question from the context and shows it to a person, who answers "The radius is 10 inches." The client sends that to provide_input, which adds a function_call_output with the same call_id and restarts the run. The agent continues and finishes with an area of 314.0 square inches after 6 steps.](../../assets/images/12-factor-agents-4/ask-human-flow.svg)

The lesson tests this with a deliberately incomplete prompt: _"Can you figure out the area of a circle for me? Use
pi = 3.14."_ The client polls until the status changes, then reads the question out of the context:

```text
Status: running, Steps: 0
Status: running, Steps: 1
Status: running, Steps: 2
Status: waiting_human_input, Steps: 2
Question: What is the circle's size? Please provide either the radius or the diameter (and specify which one), and I'll compute the area using pi = 3.14.
```

The script answers "The radius is 10 inches." and polls again:

```text
Provided input, agent resuming...
Status: running, Steps: 2
...
Status: complete, Steps: 6
Final answer: The area of the circle is 314.0 square inches (using π = 3.14 and radius = 10 inches).
```

3.14 × 10² = 314, so the answer is right. Just as important, the question and the answer now sit in the context as a
matched pair, so anyone reading the run later can see exactly what the agent asked and what it was told.

## Any client works (Factor 11)

The last lesson is a demo rather than new code. A small web page drives the same five endpoints: it launches a
garden-planning problem, shows the agent's `ask_human` question to the user, sends back the answer, and uses pause
and resume halfway through. None of the server code changed to support it. The browser is just one more client, like
`test.py`, and a Slack bot or an email handler would be another.

That's the whole argument of Factor 11 in practice. Once launching, checking, pausing, resuming and answering are
plain web requests, where the request comes from stops mattering.

## Where this design breaks

The lessons call this a teaching setup, and it's a good one. Reading the code closely, though, I found a few gaps
that would bite in a real app. None of them are shown in the lessons' runs; they come from reading the code.

**A run cut off by a restart can never be resumed.** Lesson 2 says that if the server stops mid-run, the last saved
state is still in the database. True, but its status is still `"running"`, because nothing was alive to change it.
And `/agent/resume` refuses any run whose status is `"running"` with a 409. So the run that the database was supposed
to rescue is stuck for good. A simple fix is to mark every leftover `"running"` row as `"interrupted"` when the server
starts (with a single server process, a fresh server can't have any runs in progress yet), and allow resuming from
that status.

**"Paused" in the database means "pause requested", not "stopped".** The pause endpoint writes `"paused"` right away,
but the agent only stops at the end of its current step. If a client resumes during that gap, the resume check sees
`"paused"`, sets the row back to `"running"`, and starts a second background run. Meanwhile the first run finishes
its step, reads `"running"` from the row, and carries on. Now two runs are working on the same state and overwriting
each other's saves. A clean fix is to use two statuses: the endpoint sets `"pause_requested"`, the agent sets
`"paused"` when it has actually stopped, and resume only accepts `"paused"`.

**Resume checks for the wrong thing.** It blocks one status (`running`) instead of allowing a few. That means it would
happily restart a `complete` run, and, as lesson 4 itself warns, a run that's `waiting_human_input`, which should only
continue through `/agent/provide_input`. Listing the statuses resume _accepts_ (`paused`, and maybe `failed` or
`max_steps_reached` if you want retries) closes all of these at once.

**Clients have to keep asking.** Polling once a second is fine for a demo. For a run that waits days for a person,
you'd rather have the server tell the client when something changes, for example by calling a URL the client provides
(a **webhook**) or posting to Slack. The course doesn't build this, but the progress callback is the natural place to
add it.

None of these are reasons to distrust the design. They're the same lesson as part 2's small loop fix: when the
lifecycle is plain code and plain database rows, you can read it, spot the gaps, and fix them in a few lines.

## Looking back at the whole series

Over four courses, one small math agent grew a piece at a time:

- **[Part 1](/engineering/12-factor-agents-1-the-twelve-principles):** the twelve factors and why agents built on
  frameworks tend to stall at "mostly works".
- **[Part 2](/engineering/12-factor-agents-2-tool-calls-and-the-agent-loop):** tools as strict structured output
  (Factors 1 and 4), a context list we own (Factor 3), a loop we control (Factor 8), and errors fed back to the model
  (Factor 9).
- **[Part 3](/engineering/12-factor-agents-3-a-stateless-agent):** prompts in files (Factor 2), a serializer that
  writes the page the model reads (Factor 3), one `State` object (Factor 5), and an agent that works like a function
  (Factor 12).
- **Part 4:** that function behind an API, saved after every step, with pause, resume and a way to ask a person
  (Factors 6, 7 and 11).

The course's last lesson says the path implemented all twelve factors. That's fair for eleven of them. Factor 10
(small, focused agents) shows up only in the agent's shape, a single job and a "state in, state out" interface, rather
than in anything built for it. And the bonus Factor 13 in Dex Horthy's repo, pre-fetching context the agent will
obviously need, isn't covered at all.

The thing I'd take away from the whole path is how little the agent itself changed after part 3. Pausing, resuming,
saving and asking a person were all added around it, by a server reading and writing one `State` row. That only
worked because the earlier parts kept the agent's progress out of its head and in plain data. If you want to go
further, the original write-up is at
[github.com/humanlayer/12-factor-agents](https://github.com/humanlayer/12-factor-agents), and each factor there has
its own short page and examples.
