---
title: 'When an AI Plans Its Own Steps and Works in a Team'
excerpt: 'Planning and multi-agent systems explained in plain words: letting the AI write its own plan, why a plan written as code works best, checking a plan before it runs, and how teams of AI agents divide up work. Part 5 of 5 on Andrew Ng’s Agentic AI course.'
publishDate: 2026-10-12T00:00:00Z
category: 'LLM Engineering'
tags:
  - agents
  - agentic-workflows
  - multi-agent
draft: false
---

_Based on DeepLearning.AI's [Agentic AI](https://www.deeplearning.ai/courses/agentic-ai/) course, taught by Andrew Ng.
This is part 5 of 5. [Part 4](/engineering/agentic-ai-module-4-evals-and-error-analysis) covered evals and error
analysis._

In every workflow so far, a programmer decided the steps. The last module covers the two patterns where the AI decides
them: **planning**, where one AI writes its own step-by-step plan, and **multi-agent systems**, where several AIs, each
with its own role, split up the work.

Both sit at the far end of the autonomy scale from
[module 1](/engineering/agentic-ai-module-1-what-makes-a-workflow-agentic). You give up control over exactly what will
happen, and in return the system can handle requests you never planned for. Ng is honest that, apart from coding
assistants, neither pattern is fully mature yet.

## Planning: the AI writes the steps

Imagine a sunglasses shop's customer service agent with six tools: look up item descriptions, check stock, get prices,
look up past purchases, process a return, and process a sale. A customer asks: "Do you have any round sunglasses in
stock that are under $100?"

No single tool answers that. So instead of the programmer wiring up the steps, the AI is told: "Here are your tools.
Return a step-by-step plan to carry out the user's request."

![A customer asks whether any round sunglasses under 100 dollars are in stock. The AI planner sees six tools and writes a three-step plan: find round sunglasses, check which are in stock, and check which are under 100 dollars. Your code then runs the steps in order, feeding each result into the next.](../../assets/images/agentic-ai-module-5/plan-steps.svg)

Your program then runs the plan one step at a time, handing each step's result to the next. A different request gets a
different plan from the same tools. "I'd like to return the gold frame glasses I bought, but not the metal frame ones"
becomes: look up what they bought, find which pair is the gold one, then process that return.

## Plans your program can follow

A plan written in everyday sentences is easy for people to read but hard for a program to follow. Did "check stock"
mean the round ones or all of them? So the course asks the AI to write the plan in **JSON**, with each step spelling out
its number, a description, which tool to use, and what to give it.

That works, but there's a catch. Take a coffee shop's sales spreadsheet and the question "Which month had the highest
hot chocolate sales?" With tools like "filter rows" and "add up a column," the plan becomes: filter January's hot
chocolate sales, add them up, do the same for February, and so on for all twelve months, then compare. And every new
kind of question ("how many different customers last week?") needs yet another tool. It's the calculator problem from
[module 3](/engineering/agentic-ai-module-3-tool-use) again.

The better idea: let the AI write the plan **as code**.

![The same plan for "which month had the highest hot chocolate sales?" written three ways. Plain text is easy to read but hard to run. JSON can be run but needs a tool for every move and repeats for all twelve months. Code is three lines of Python that carry out the plan directly.](../../assets/images/agentic-ai-module-5/plan-formats.svg)

A few lines of Python are a plan, and running them carries it out. Python's data libraries already have thousands of
functions, and AI models have seen huge amounts of code using them, so they know how to chain them together.

The course backs this up with results from a research paper, CodeAct (Wang et al., 2024). It compared eight models,
letting each take actions as code, as JSON, or as plain text. For every one of the eight models, code gave the highest
success rate.

Two caveats. AI-written code should run in a sandbox, as in module 3. And when the actions are your own special tools,
like processing a refund or sending an email, a JSON plan over those tools is still the right fit.

## Lab: plan, check, then act

The first lab builds the sunglasses shop for real, with three roles: a **planner** that writes the plan, a **reviewer**
that checks it against the rules (the reflection pattern from module 2), and an **executor** that runs the tools. Every
step comes with safety checks, such as "stock can never go below zero."

![The shop lab. A request to return two Aviator sunglasses goes to a planner, which writes four steps. A reviewer checks the plan and approves it. An executor runs the tools. If every check passes, Aviator stock goes from 23 to 25 and the register from 500 to 294 dollars. If a check fails, it stops and explains the problem in plain words.](../../assets/images/agentic-ai-module-5/lab-shop.svg)

I asked it to "return two Aviator sunglasses for a walk-in customer." The planner (`gpt-5-mini`) wrote four steps: look
up the Aviator, work out the refund, add the two pairs back to stock, and record the refund. The reviewer replied, "The
draft plan is correct," and everything ran. Aviator stock went from 23 to 25, the refund was $206 (2 × $103), and the
register went from $500 to $294.

The reviewer earns its place on bad plans. The lab hands it a deliberately broken plan for a purchase, and it found six
problems, including a wrong setting name, a missing stock update, and a missing check that stock stays at zero or above.
Then it wrote a fixed plan.

There's also an explanation step for when a check fails. The lab tests it with a made-up failure, not a real run:
a report saying an order for 999 Aviators would have pushed stock to −995. The AI worked out that only 4 were left,
explained in plain words why the order was stopped, and suggested selling those 4 and backordering the rest.

## Teams of agents

The usual reaction to multi-agent systems is "isn't it just the same AI called several times?" Yes. Ng's point is that
splitting work into **roles** is still a helpful way to break down a big task, the same way a company hires a
researcher, a designer and a writer instead of one person who does everything. Each role gets its own instructions and
its own tools, and you can build and test each one separately.

The second lab builds a marketing team for a summer sunglasses campaign, with four agents in a fixed order:

![The campaign lab as a linear pipeline of four agents. The market researcher found that wraparound shield frames are trending and picked the Sport model, 11 in stock at 144 dollars. The graphic designer made a close-up image of a model in wraparound shades by the sea. The copywriter wrote "Shield the Sun. Own the Summer." The packager put it all into one report.](../../assets/images/agentic-ai-module-5/campaign.svg)

The researcher searched the web for 2026 sunglasses trends and compared them with the shop's catalog. It picked the
**Sport** wraparound as the hero product, because "shield" style wraparounds were the big trend. It also flagged a risk
on its own: only 11 are in stock, so a successful campaign could sell out. The designer made an image to match, the
copywriter looked at the image and wrote "Shield the Sun. Own the Summer.", and the packager assembled an executive
report.

Instead of a fixed order, you can also put a **manager** agent in charge: "You're a marketing manager with this team.
Return a step-by-step plan." That's just planning again, except the tools are now other agents.

## How agents talk to each other

With more than one agent, the big design choice is who talks to whom, like an organization chart:

![Four ways agents can talk to each other. Linear: each agent passes its work to the next, very common. Manager: one manager hands out work and collects results, very common. Deeper hierarchy: some agents manage their own small teams, less common and more complex. All-to-all: any agent can message any other, rare and hard to predict.](../../assets/images/agentic-ai-module-5/patterns.svg)

- **Linear** and **manager** are the two Ng sees most. The campaign lab is linear.
- **Deeper hierarchy** gives some agents their own helpers, like a researcher with a fact checker. It's used less and is
  more complex.
- **All-to-all** lets any agent message any other, and the run ends when they all agree they're done. Ng finds the
  results hard to predict. It's fine when a bad run can just be retried, but not when you need control.

## Looking back at the series

Five modules, five habits:

1. **Break the job into steps** an AI, a bit of code, or a tool can do
   ([module 1](/engineering/agentic-ai-module-1-what-makes-a-workflow-agentic)).
2. **Give the reviewer a new fact,** not just a second look
   ([module 2](/engineering/agentic-ai-module-2-reflection)).
3. **Let the AI ask for tools,** and let it write code when a pile of small tools keeps growing
   ([module 3](/engineering/agentic-ai-module-3-tool-use)).
4. **Measure, and count which step causes the errors** before fixing anything
   ([module 4](/engineering/agentic-ai-module-4-evals-and-error-analysis)).
5. **Hand over only as much control as the job needs.** Planning and teams of agents are powerful but harder to predict
   (this module).

If I had to reread one, it would be module 4. Every other pattern depends on being able to tell whether a change
actually helped.
