---
title: '12-Factor Agents, Part 4: Putting the Agent Behind an API'
excerpt: 'Putting the stateless agent behind a small web server: start a run and check on it later, save progress after every step, pause and resume it, and let it stop to ask a person a question. Plus the gaps worth knowing about. Part 4 of a series.'
publishDate: 2026-11-17T00:00:00Z
category: 'LLM Engineering'
tags:
  - agents
  - agentic-workflows
  - tool-use
draft: false
---

_Based on CodeSignal's course "Exposing Agents with Simple APIs in Python", the last of four courses in its "Building a
12-Factor Agents App in Python" path. Earlier parts: [the principles](/engineering/12-factor-agents-1-the-twelve-principles),
[the loop](/engineering/12-factor-agents-2-tool-calls-and-the-agent-loop), and
[the stateless agent](/engineering/12-factor-agents-3-a-stateless-agent). Outputs are from the lessons' own runs._

After part 3, the agent can stop between any two steps without losing anything. But only a Python script can run it,
start to finish. This course puts a small web server in front of it, so any program can start it, check on it, pause
it, or answer its questions. The agent's own code barely changes.

It covers Factors 11 (trigger from anywhere), 6 (launch, pause, resume) and 7 (contact humans with tool calls).

An **API** here is a set of web addresses that programs send requests to. A browser, a phone app or a script can all
send the same request and get the same answer.

![The API around the agent. On the left, clients: the test script, a web UI, or any other program that can send web requests. In the middle, the FastAPI server with five endpoints: launch, state, pause, resume and provide_input. Launch, resume and provide_input start a background runner, which calls the unchanged Agent core from part 3. Below, a SQLite database holds one row per run; the runner saves the state there after every step, and the state, pause and provide_input endpoints read or change that row.](../../assets/images/12-factor-agents-4/api-architecture.svg)

## 1. Start now, check back later

Solving the quadratic takes several model calls. If the server waited until the agent finished, the client would sit
there and might time out.

So it works like a restaurant buzzer:

- `POST /agent/launch` creates a State, starts the agent in the background, and immediately returns the run's ID.
- `GET /agent/state/{id}` returns the current state.

The client checks once a second until the status is finished. Checking over and over like this is called **polling**.
The run came back complete after 8 steps with "x = 2 and x = 3". The response is just part 3's State object as JSON;
nothing new needed designing.

## 2. Save after every step

Keeping states in memory means a server restart wipes them. So lesson 2 saves each run as one row in a small database
(SQLite). Because part 3 put everything in one State object, a run is exactly one row.

The agent also gets a **progress callback**: a function it calls after every step, which the server uses to save the
state. The agent itself still knows nothing about databases.

Now the client can watch the run happen (simplified):

```text
Steps: 1 | Waiting to run: [power(base=-5, exponent=2)]
Steps: 2 | Waiting to run: [multiply_numbers(a=4, b=6)]
Steps: 3 | Waiting to run: [subtract_numbers(a=25, b=24)]
Steps: 4 | Waiting to run: [sum_numbers(a=5, b=1), subtract_numbers(a=5, b=1)]
Steps: 5 | Waiting to run: [divide_numbers(a=6, b=2), divide_numbers(a=4, b=2)]
complete | Steps: 7
```

Each line shows part 3's idea in action: a request the model has made but nobody has run yet. Notice this time the
model used tools for 5 + 1 and 5 − 1, which it did in its head in part 3. Same prompt, different run.

Also notice it ends at 7 steps for 6 model turns. The final answer is queued at step 6 and handled at step 7, exactly
what part 3 predicted.

One limit the lesson admits: the agent runs inside the server, so if the server stops, the run stops too. Only the
saved state survives.

## 3. Pause and resume

Stopping an agent mid-step could leave a request recorded without its result. So the pause is polite, like a coach
saying "stop after this lap":

1. `POST /agent/pause` marks the run's row as `"paused"`.
2. The agent finishes its current step.
3. Before saving, it checks the row, sees `"paused"`, and stops cleanly.

`POST /agent/resume` sets it back to running and starts again from the saved state. Any work that was waiting runs
first, so nothing is asked twice.

The lesson paused a run 3 seconds in. The reply said `paused | Steps: 0`, because the first model call was still in
progress. That reply means "pause request received", not "stopped". After resuming, it finished: "The roots are
x = 2 and x = 3."

![The lifecycle of a run as a set of statuses. Launch creates a run in the running status. From running, a run can end as complete when the model calls final_answer, as max_steps_reached when it runs out of steps, or as failed when something crashes. The pause endpoint moves running to paused at the end of the current step, and the resume endpoint moves paused back to running. When the model calls ask_human, running moves to waiting_human_input, and the provide_input endpoint moves it back to running with the person's answer added to the context.](../../assets/images/12-factor-agents-4/lifecycle.svg)

## 4. Asking a person (Factor 7)

Some questions can't be answered with tools. "What's the area of a circle?" with no size given needs a person.

So the agent gets one more tool, `ask_human`, with a `question` field. The model uses it like any other tool. When it
does, the agent sets its status to `"waiting_human_input"` and stops. The run waits in the database, for a second or
a week.

The answer comes back through `POST /agent/provide_input`. The server finds the `ask_human` request in the history
and adds the person's answer as its result, with the same `call_id`. It's part 2's coat-check ticket again, except a
person returns the coat. To the model, `ask_human` was just a slow tool.

![The ask_human flow for the circle example. The client launches the prompt "Can you figure out the area of a circle for me? Use pi = 3.14." The agent runs two steps and the model calls ask_human with a question asking for the radius or diameter. The agent records the call with its call_id and sets the status to waiting_human_input. The client sees the status, reads the question from the context and shows it to a person, who answers "The radius is 10 inches." The client sends that to provide_input, which adds a function_call_output with the same call_id and restarts the run. The agent continues and finishes with an area of 314.0 square inches after 6 steps.](../../assets/images/12-factor-agents-4/ask-human-flow.svg)

The lesson's run:

```text
Question: What is the circle's size? Please provide either the radius or the diameter
(and specify which one), and I'll compute the area using pi = 3.14.

Answer sent: "The radius is 10 inches."

Final answer: The area of the circle is 314.0 square inches.
```

The question and answer stay in the history as a matched pair, so anyone can see later what was asked and answered.

## 5. Any client works (Factor 11)

The last lesson is a demo: a web page uses the same five addresses to run a garden-planning problem, answer the
agent's question, and pause and resume halfway. No server code changed. A Slack bot would just be another client.

## Where this breaks

From reading the code (the lessons' runs don't hit these):

- **A run cut off by a restart can't be resumed.** Its row still says `"running"`, and resume refuses running runs.
  Fix: when the server starts, mark leftover running rows as interrupted, and allow resuming those.
- **"Paused" means "pause requested", not "stopped".** Resume during that gap and two copies of the run can end up
  working on the same state. Fix: separate "pause requested" from "paused".
- **Resume checks the wrong way.** It only blocks running runs, so it would restart a finished one, or one waiting for
  a person. Fix: list the statuses resume _accepts_ instead.
- **Clients have to keep asking.** For a run waiting days, the server should notify the client instead (a
  **webhook**). The course doesn't build this.

## The whole series in four lines

1. **[Part 1](/engineering/12-factor-agents-1-the-twelve-principles):** agents are mostly ordinary code, and twelve
   rules keep it that way.
2. **[Part 2](/engineering/12-factor-agents-2-tool-calls-and-the-agent-loop):** the model fills in forms, your code runs
   the tools and the loop.
3. **[Part 3](/engineering/12-factor-agents-3-a-stateless-agent):** prompts in files, a clean page for the model, and
   one saved State with no memory inside the agent.
4. **Part 4:** that agent behind an API, with saving, pause, resume, and a way to ask a person.

The course says the path covers all twelve factors. That's fair for eleven; Factor 10 (small agents) only shows up in
the agent's shape, and the bonus Factor 13 isn't covered.

The biggest lesson: after part 3, the agent itself barely changed. Pausing, resuming and asking a person were all
added around it, because its progress lived in saved data instead of its head. The original write-up is on
[GitHub](https://github.com/humanlayer/12-factor-agents).
