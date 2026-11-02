---
title: 'Agentic AI, Module 3: Tool Use'
excerpt: 'Part 3 of 5 on Andrew Ng’s Agentic AI course: letting the LLM decide which functions to call, why writing code beats writing one tool per operation, how to run that code safely, and what MCP changes about building tools.'
publishDate: 2026-10-10T00:00:00Z
category: 'LLM Engineering'
tags:
  - agents
  - agentic-workflows
  - tool-use
  - code-execution
  - mcp
draft: false
---

[Module 2](/engineering/agentic-ai-module-2-reflection) ended on the point that reflection gets
much better when the model receives a fact from outside itself: an execution result, a word count,
a search snippet. Module 3 is about how the model gets those facts on its own. You hand it
functions, and it decides when to ask for them.

Ng's framing is that humans can do a lot more with tools than with bare hands, and LLMs are the
same. The module has three parts: the basic mechanism, code execution as a general-purpose tool,
and MCP, a standard for sharing tools between applications. Unlike module 2, there's no lab
material in what I have for this one, so everything below comes from the lectures.

## What tool use is

Ask a model trained months ago "what time is it?" and the best case is "sorry, I don't have access
to the current time." Give it a `getCurrentTime` function and it can answer.

A precise definition matters here. The LLM doesn't call anything. It **requests** that a function
be called, your code runs it, and the result goes back into the conversation. The sequence:

1. The prompt comes in: "what time is it?"
2. The LLM looks at the tools it has been given and decides to request `getCurrentTime`.
3. Your code runs the function and gets a value.
4. The value is appended to the conversation history.
5. The LLM writes the final answer: "It's 3:20 pm."

That's the same loop as in the [LangChain agents post](/engineering/functions-tools-and-agents-with-langchain),
described from the workflow side.

### The model decides

The important property is that the use of a tool is optional, and the LLM makes the call. Ask the
same setup "how much caffeine is in green tea?" and it answers directly, without touching
`getCurrentTime`.

Ng contrasts this with the research agent from module 1, where the developer hard-coded "always
run a web search at this step." In his slides a dashed box above the LLM means "here is a set of
tools, use them if you think you should." Without the box, the steps are fixed. This is the
autonomy spectrum from module 1 again: a dashed box moves a step from "programmer decides" to
"model decides."

### Examples

| Request                                  | Tool the LLM might request  |
| ---------------------------------------- | --------------------------- |
| Italian restaurants near Mountain View   | Web search                  |
| Customers who bought white sunglasses    | Query against a sales table |
| $500 at 5% for 10 years, what do I have? | Interest calculation        |

The last one can also be done by having the model write a math expression and evaluating it, which
is the next section.

Which tools exist is up to you. A restaurant recommender, a retail Q&A bot and a finance assistant
need different functions, so part of the job is deciding what the application should be able to
do and then writing those functions.

### More than one tool

Most of the early examples have a single tool. The more interesting case is several, with the
model choosing among them and chaining them.

Ng's example is a calendar assistant with three tools (check the calendar, make an appointment,
delete an appointment). The request is "find a free slot on Thursday and make an appointment with
Alice." The model:

1. Requests **check calendar**, which returns Thursday's free times.
2. Picks a slot, say 3 pm, and requests **make appointment**, which sends the invite and adds it
   to the calendar.
3. Gets the confirmation back and replies: "Your appointment with Alice is set for 3 pm Thursday."

Delete-appointment is available the whole time and just isn't needed for this request. Nobody
wrote the order of calls. The model derived it from the task and from what each result said, and
the second call depends on the first call's output. That's the part a fixed pipeline can't do
without you anticipating every case.

## Code execution as a tool

Ng says that in several agentic applications he gave the model the option to write code, and was
surprised and pleased by how clever the solutions were.

The motivating example is a math word problem solver. You could write `add`, `subtract`,
`multiply` and `divide` tools. Then someone asks for the square root of two. You write a `sqrt`
tool, then need exponentiation, and a scientific calculator has a lot of buttons. One tool per
operation doesn't end.

The alternative is to let the model write the code and run it.

### The mechanism

The prompt asks for code in delimiters:

```text
Write code to solve the user's query. Return your answer as Python code delimited with
<execute_python> and </execute_python> tags.
```

For "what is the square root of two?" the model returns a couple of lines of Python between the
tags. A regular expression pulls out what's between them, you execute it, and the printed
`1.4142...` goes back to the LLM, which writes a properly worded reply. The chart lab in module 2
used the same pattern.

Ng mentions two ways to do the execution step:

- Python's built-in `exec`, which runs whatever you give it. Powerful, and with security
  implications covered below.
- A tool that runs the code in a safer sandbox.

This scales past square roots. The model can write the interest calculation or a much harder
calculation, which is why it's a better answer than a growing list of arithmetic tools.

### Errors feed back in

This connects to reflection. If the generated code fails, pass the error message back to the model
and let it revise the code, once or twice. The error message is external feedback of exactly the
kind module 2 argued for, and it sometimes gets a correct answer where the first attempt didn't.

### Sandboxing

Running code a model wrote carries some risk. Ng's real example: a teammate was using a highly
agentic coding tool, and it chose to remove `*.py` in a project directory. It apologized
afterwards, calling it an incredibly stupid mistake. The project was on GitHub, so nothing was
lost. Without that backup it would have been.

His honest take is that the risk per line of code is low, and many developers run model-written
code with little checking. The best practice is still a sandbox, such as Docker or the lightweight
E2B, so that bad code has a lower chance of destroying data or leaking something sensitive.

I'd weigh it the same way as `exec` in the module 2 labs. In a notebook with a CSV, the downside
is small. If the code can see a filesystem, credentials or a production database, the sandbox is
the cheapest safety measure there is.

He also notes that LLM trainers put extra work into making code execution reliable, so models are
likely to keep improving at this.

## MCP: sharing the tools

Everything so far has you writing tool functions and registering them one at a time. Many teams
are writing the same ones.

### The M×N problem

Say one developer is building an app that needs Slack, Google Drive, GitHub and a Postgres
database. They write wrappers around each API. A different team building a different app writes
their own Slack wrapper, their own GitHub wrapper, and so on.

With M applications and N tools, the community does **M × N** pieces of integration work. The
**Model Context Protocol** (MCP), proposed by Anthropic and now adopted by many companies and
developers, defines a standard interface so each app implements the client side once and each
tool implements the server side once. The total becomes **M + N**.

### Clients and servers

- **MCP servers** wrap a data source or service (Slack, GitHub, Google Drive) and expose it.
- **MCP clients** are the applications that consume what servers expose.

The first version of MCP focused on giving an LLM more context, so many early servers just fetched
data. The documentation calls those **resources**. MCP now covers both data and general functions
an application might call (the tools from earlier in this post).

Ng's suggestion is that your application might be an MCP client one day, and if you want to give
other developers access to something, you might build an MCP server.

### The demo

The demo uses the Claude desktop app, which is an MCP client, connected to a GitHub MCP server.

1. Query: summarize the README from a GitHub repo. The client asks the GitHub server for the file,
   a long response comes back into the LLM's context, and the LLM summarizes it.
2. Query: what are the latest pull requests? The LLM chooses a different tool on the same server,
   list pull requests, with parameters such as sort order and a count of 20. The response goes
   back to the LLM, which writes a text summary.

Neither tool was written by the person typing the query. They came with the server, and the model
picked between them based on the request. That's the same optional, model-decided tool choice as
the calendar example, with the tool definitions supplied by someone else.

Ng points to a short DeepLearning.AI course that goes deeper on the protocol, for anyone who wants
more than this overview.

## What I took from module 3

Tool use is the mechanism that lets a reflection or planning step reach outside the model. A few
points I'd keep:

- **The model requests, your code executes.** Everything about safety and correctness lives on
  your side of that line.
- **Optional is the point.** A dashed box means the model may skip the tool. That's what separates
  tool use from a fixed pipeline with a function call in it.
- **Code execution beats a pile of narrow tools** when the space of operations is open-ended, and
  an error message makes a good retry signal. It also raises the cost of getting execution wrong,
  so sandbox anything that touches real data.
- **Before writing a tool, check whether a server already exists.** MCP exists because the same
  Slack and GitHub wrappers were being written over and over.

[Module 4](/engineering/agentic-ai-module-4-evals-and-error-analysis) is evaluations and error analysis. Ng says the thing he's seen separate teams that build
agentic workflows well from teams that struggle is a disciplined evaluation process, and calls it
possibly the most important module in the course.
