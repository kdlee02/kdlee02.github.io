---
title: 'Agentic AI, Module 5: Planning and Multi-Agent Systems'
excerpt: 'Part 5 of 5 on Andrew Ng’s Agentic AI course: letting the model write the plan, why a plan written as code beats one written as JSON, and how teams of agents communicate, from a simple pipeline to all-to-all.'
publishDate: 2026-10-12T00:00:00Z
category: 'LLM Engineering'
tags:
  - agents
  - agentic-workflows
  - planning
  - multi-agent
  - code-execution
draft: false
---

Every workflow so far in this series had steps a developer chose. The last module covers the two
patterns where the model decides the steps: **planning**, where one model writes its own plan, and
**multi-agent systems**, where several role-prompted models divide up the work.

Both sit at the high-autonomy end of the dial from
[module 1](/engineering/agentic-ai-module-1-what-makes-a-workflow-agentic). You give up control over
what happens at runtime and get a much wider range of things the system can try. Andrew Ng is frank
that outside of coding agents, neither pattern is fully mature yet.

## Planning: the model writes the steps

With planning, you give the model a request and a set of tools, and ask it for a step-by-step plan.
Your code then executes the plan one step at a time.

### Write the plan in a format code can parse

A plan in plain English is hard to execute reliably. Ng's recommendation is to ask for the plan in
JSON, describing the format in the system prompt: "You have access to the following tools. Create a
step-by-step plan in JSON." Each step then comes back with explicit fields:

- a step number
- a description of what the step does
- which tool to call
- the arguments to pass it

Downstream code can read exactly which tool to run with which arguments, with no guessing. All the
leading models are good at producing JSON now.

Ng ranks the formats roughly like this:

| Plan format                  | How reliably code can parse it |
| ---------------------------- | ------------------------------ |
| JSON                         | Good                           |
| XML, with tags for each step | Good                           |
| Markdown                     | Somewhat ambiguous             |
| Plain text                   | Least reliable                 |

### Better still: write the plan as code

The neater idea is to skip the plan format entirely and have the model write code. A sequence of
function calls _is_ a plan, and running it carries the plan out.

Ng's example is a question-answering system over a spreadsheet of coffee machine sales. The obvious
design gives the model tools such as `get_column_max`, `get_column_mean`, `filter_rows` and
`sum_rows`. Then the questions start:

- **"Which month had the highest sales of hot chocolate?"** The tools can answer it, but only by
  filtering January's hot chocolate rows and summing them, then repeating that for every month and
  taking the maximum. It works, but it's a long, fragile chain.
- **"How many unique transactions were there last week?"** None of the tools can answer it, so you
  add `get_unique_entries`.
- **"What were the amounts of the last five transactions?"** Another new tool.

Ng has watched teams do exactly this, adding one tool after another and still chasing edge cases.
It's the same trap as the calculator in
[module 3](/engineering/agentic-ai-module-3-tool-use), where you'd need a separate tool for every
button.

Instead, prompt the model to write Python inside `<execute_python>` tags and run it. For "last five
transactions," the code it writes is itself a plan: load the CSV with pandas, parse the date column,
sort by date, take the last five rows, select the price column. For "unique transactions last week":
read the file, parse the dates, define the time window, filter to it, drop duplicates, count. The
comments in the generated code read like step lists.

Why this works so well:

- **The function library is enormous.** Python plus pandas offers hundreds or thousands of
  functions, against the handful of tools you'd write by hand.
- **The model already knows how to use them.** It has seen a great deal of code showing when to call
  each function, so it can chain them into a plan without you describing each one.

There's evidence for this too. Ng shows results adapted from Wang et al.'s
[CodeAct paper](https://arxiv.org/abs/2402.01030). Across many models and the tasks it tested,
expressing actions as code beat expressing them as JSON, and JSON beat plain text.

The caveats from module 3 still apply. Running model-written code belongs in a sandbox, even though
Ng admits plenty of developers skip that. And code isn't right for everything. When the actions are
your own custom tools, such as sending an email or booking a meeting, a JSON plan over those tools is
still the way to go.

### Where planning works today

The clearest success is **agentic coding assistants**. Asked to build something complex, they plan
the components, build them one at a time, often plan to test each as they go, and work through the
plan like a checklist. That works well even for large pieces of software.

For other applications, Ng says planning is still developing. The cost is control. The developer no
longer says exactly what to do, so you don't know in advance what the system will do at runtime. In
return, the model may try approaches you'd never have hard-coded.

## Multi-agent systems: decompose by role

The usual first reaction to multi-agent systems is skepticism. It's the same LLM prompted over and
over on one computer, so why call them separate agents?

Ng's analogy is processes and threads. A program on a single CPU is still easier to write when you
split its work into several processes. In the same way, instead of asking "what one person would I
hire to do this?", ask "what three or four roles would I hire?" Thinking in roles is another way to
decompose a complex task, and it lets you build and test each piece separately.

Human teams already show how a lot of work splits up:

- **Marketing materials:** a researcher, a graphic designer, a writer.
- **A research report:** a web researcher, a statistician, a lead writer, an editor.
- **A legal case:** associates, paralegals, an investigator.

### Building one agent

An agent is an LLM prompted to play a role, plus the tools that role needs. For a sunglasses
marketing brochure:

| Agent            | Job                                   | Tools                                                   |
| ---------------- | ------------------------------------- | ------------------------------------------------------- |
| Researcher       | Analyze market trends and competitors | Web search                                              |
| Graphic designer | Create charts and artwork             | Image generation and editing, code execution for charts |
| Writer           | Turn research and graphics into copy  | None, writing is what the LLM already does              |

The prompt is a job description: "You are a research agent, expert at analyzing market trends and
competitors. Research trends for this sunglasses product and summarize what competitors are doing."
Picking each agent's tools is the same question as for a person in that role: what would a human
researcher need to do this job?

Splitting by role has practical benefits. You can focus on making one agent excellent while
collaborators build the others. Good agents also get reused. A graphic designer built for brochures
could be generalized to work on social media posts and web pages too.

### A manager agent is planning with agents as tools

The simplest way to connect the three is a fixed pipeline: the researcher's report goes to the
designer, and both outputs go to the writer.

The alternative uses planning. Prompt an LLM with "You're a marketing manager. You have the following
team of agents to work with," describe each agent, and ask for a step-by-step plan. It's exactly
planning with tools, except the tools are agents. The manager might delegate research, then the
graphics, then the writing, and finish with its own review and revision pass.

Looked at this way, the manager is a fourth agent that sets direction and delegates to the other
three.

## How agents communicate

With more than one agent, the key design decision becomes the communication pattern, the
equivalent of an org chart. Ng calls this an area of active research, with patterns still emerging.
The common ones, from most to least used:

| Pattern            | How it works                                                | How often Ng sees it          |
| ------------------ | ----------------------------------------------------------- | ----------------------------- |
| **Linear**         | Each agent passes its output to the next, like a pipeline   | One of the two most common    |
| **Hierarchical**   | A manager assigns work and collects results from each agent | One of the two most common    |
| **Deep hierarchy** | Some agents manage their own sub-agents                     | Less often, much more complex |
| **All-to-all**     | Any agent can message any other at any time                 | Rare, mostly experimental     |

**Hierarchical**: Ng suggests that each agent report back to the manager rather than handing results
directly to its peers. It's simpler to implement.

**Deep hierarchy**: the researcher could call a web researcher and a fact checker, while the writer
calls a style writer and a citation checker, and the designer works alone.

**All-to-all**: every agent is told about the others and can message any of them. A message is added
to the recipient's context, and the recipient decides when to reply. The run ends when every agent
says it's done, or when, say, the writer decides the result is good enough.

Ng finds all-to-all results hard to predict. It suits tasks where some chaos is acceptable: if the
brochure comes out badly, run it again and see what you get. Where you need control, stick to linear
or a one-level hierarchy.

Many frameworks now support multi-agent systems and make these patterns fairly easy to set up, so
trying a different pattern doesn't mean rewriting everything.

## What I took from module 5

Both patterns are module 3's tool use pushed further. Planning lets the model choose and order its
tool calls instead of making them one at a time. A manager agent is planning where the tools happen
to be other agents. The difference is how much control you hand over, and the course has been
consistent since module 1: hand over as little as the task allows.

The code-as-plan idea is the one I'll use most. Whenever a toolset keeps growing because users keep
asking new questions, that's the sign the model should be writing code against a real library
instead. The tools you'd keep are the ones with side effects in your own systems, and those should
stay narrow.

## Looking back at the series

Across five modules, the course comes down to a few habits:

1. **Decompose the task** into steps an LLM, a function or a tool can do
   ([module 1](/engineering/agentic-ai-module-1-what-makes-a-workflow-agentic)).
2. **Give the model new facts, not just a second look.** Reflection works best with external
   feedback ([module 2](/engineering/agentic-ai-module-2-reflection)).
3. **Let the model reach for tools,** and prefer code over a growing pile of narrow tools
   ([module 3](/engineering/agentic-ai-module-3-tool-use)).
4. **Measure, then count where errors come from** before deciding what to fix
   ([module 4](/engineering/agentic-ai-module-4-evals-and-error-analysis)).
5. **Give up control only where the task needs it.** Planning and multi-agent systems are powerful
   and hard to predict (this module).

Module 4 is the one I'd reread first. Every other pattern assumes you can tell whether a change
helped.
