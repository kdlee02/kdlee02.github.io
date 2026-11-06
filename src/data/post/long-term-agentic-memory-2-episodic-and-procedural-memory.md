---
title: 'Teaching an AI Assistant From Its Mistakes'
excerpt: 'Episodic memory as labeled examples, and procedural memory as instructions that rewrite themselves from feedback. How one correction changed how an email assistant sorted and signed emails. Part 2 of 2 on the Long-Term Agentic Memory course.'
publishDate: 2026-11-06T00:00:00Z
category: 'LLM Engineering'
tags:
  - agents
  - memory
draft: false
---

_Based on DeepLearning.AI's
[Long-Term Agentic Memory with LangGraph](https://www.deeplearning.ai/courses/long-term-agentic-memory-with-langgraph)
course, taught by Harrison Chase. This is part 2 of 2.
[Part 1](/engineering/long-term-agentic-memory-1-semantic-memory) built the email assistant and gave it semantic
memory._

In Part 1, the email assistant forgot a promise. It had a tool for saving memories, but saving was its own choice, and
in my first run it chose not to. When Alice wrote back asking for an update, the assistant had nothing to go on. One
extra sentence in its instructions fixed that, but it still left the agent in charge of remembering to remember.

This part covers the other two kinds of memory: **episodic** (past examples) and **procedural** (instructions). Both
work differently from Part 1 in one important way. The agent no longer decides whether to look at its memory. The code
reads it every time. And new memories come from outside the agent: a person correcting a decision, or a separate
program turning feedback into new instructions.

## Episodic memory: learning from examples

Think about how you learn to sort laundry. Nobody hands you a rulebook. Someone shows you a few shirts and says
"this one goes with the whites, that one doesn't," and after a while you can sort new shirts on your own.

Episodic memory gives the assistant the same thing for its triage step, the step that labels each email **ignore**,
**notify** or **respond**. Every time John corrects a label, that email and the right label get saved as an
**example**. (In the notebook, examples are saved by hand with one line of code. A real app might add a button for
"this should have been ignored.") When a new email arrives, the assistant finds the most similar past examples and shows them to the AI
alongside its rules. Showing an AI a few worked examples like this is called **few-shot** prompting.

![When John labels an email, it is saved in the examples drawer, like Tom Jones's “Hi John - want to buy documentation?” labeled ignore. When a new email arrives, the triage step searches that drawer for the most similar past emails, puts them with their labels into the triage prompt, and the model picks a label: ignore.](../../assets/images/long-term-agentic-memory/few-shot-triage.svg)

### Where the examples live

The examples go in the same store as Part 1's facts, in a different drawer. Part 1's facts lived in
`email_assistant / lance / collection`. Examples go in `email_assistant / lance / examples`.

The store searches by meaning here too. To test that, the notebook saved two examples: Alice's API question labeled
respond, and an update from Sarah ("I've deployed the new authentication endpoints … to the staging environment")
labeled ignore. Then it searched with a lightly reworded copy of Sarah's email and asked for just one result. It got
Sarah's stored example back. The words didn't match exactly, but the meaning was closest.

Each example is turned into a short block of text (subject, sender, recipient, the first 400 characters of the email,
and "Triage Result: ignore") and pasted into a new section at the bottom of the triage prompt. That section begins:

> Here are some examples of previous emails, and how they should be handled. Follow these examples more than any
> instructions above

### One example changed the answer

The test email came from Tom Jones: "Hi John - want to buy documentation?" Here's what the assistant did with it:

| Run                                                  | Drawer used | Label   |
| ---------------------------------------------------- | ----------- | ------- |
| First try, no examples saved                         | harrison    | respond |
| After saving this email as an example labeled ignore | harrison    | ignore  |
| A new sender, Jim Jones, with "documentation?????"   | harrison    | ignore  |
| The same Jim Jones email, for a different user       | andrew      | respond |

One saved example was enough to flip the answer. It also carried over to an email that wasn't identical, which is the
point. You want the assistant to learn "emails like this," not just "this exact email."

The last row shows why the drawers matter. The example lived in Harrison's drawer, so for Andrew the assistant still
answered respond. Each person teaches their own assistant.

### A catch: examples beat rules

Remember that line in the prompt: "Follow these examples more than any instructions above." That's what makes one
example so powerful, and it can cut both ways.

Look at Sarah's example again. Her email was a status update: "No immediate action needed from your side - just
keeping you in the loop." John's written rules say project status updates should be **notify**. But the example says
**ignore**, and the prompt tells the AI to trust examples over rules. The notebook never ran a status update through
triage with that example in place, so I can't show what happened. But the prompt is built so the example wins, which
means John could stop hearing about updates like Sarah's even though his rules say he should.

If you build something like this, check your examples against your rules now and then. They can drift apart without
anyone noticing.

## Procedural memory: instructions that rewrite themselves

Episodic memory teaches by example. Procedural memory changes the instructions themselves.

The assistant has four short instruction texts. Three are the triage rules (what to ignore, what to notify, what to
respond to). The fourth tells the response agent how to behave: "Use these tools when appropriate to help manage
John's tasks efficiently."

Until now these were written into the code. In this lesson they move into the store, in a drawer named after the user,
`lance`. Each time the assistant runs, it reads the current text from that drawer. The first time, the drawer is empty,
so it saves the default text there. That small change means someone can now improve the instructions without touching
the code, and the next email automatically uses the new version.

You could edit those texts by hand. But the course's idea of memory is that an AI updates them from feedback.

### The prompt optimizer

When John gives feedback, it's about the assistant as a whole. He doesn't say which of the four texts is wrong. So the
course uses a **prompt optimizer**, a separate AI (here `claude-3-5-sonnet-latest`) whose only job is to figure out
which instructions to change, if any, and how.

It gets three things:

1. **The conversation**: everything the assistant did with one email.
2. **The feedback**: one plain sentence from John.
3. **The four instruction texts**, each with two notes attached. "When to update" says what kind of feedback it covers,
   like "whenever there is feedback on which emails should be ignored." "Update instructions" says how to edit it.
   Here that's "keep the instructions short and to the point" for all four.

It sends back all four texts, with only the ones it decided to change rewritten. A few lines of code then save any
changed text to the store.

![The prompt optimizer takes the conversation where the agent replied to Alice Jones and the feedback “Ignore any emails from Alice Jones”. It checks each prompt's “when to update” note. main_agent, triage-notify and triage-respond come back unchanged. triage-ignore gets a new sentence: “Ignore any emails from Alice Jones.” The new text is saved to the store, and on the next run Alice Jones's email is labeled ignore.](../../assets/images/long-term-agentic-memory/prompt-optimizer.svg)

### Feedback 1: how to sign emails

The test email came from Alice Jones (a different Alice from Part 1): "Urgent issue - your service is down. Is there a
reason why." The assistant labeled it respond and wrote a reply, signed "Best regards, John Doe's Assistant."

John's feedback: "Always sign your emails `John Doe`." The optimizer changed only the response agent's instructions,
which became:

> Use these tools when appropriate to help manage John's tasks efficiently. Always sign emails as `John Doe`.

The three triage rules came back word for word the same. On the next run, the reply to the same email ended with
"Best regards, John Doe."

### Feedback 2: what to ignore

Same email, new feedback: "Ignore any emails from Alice Jones." This time the optimizer left the response agent alone
and changed only the ignore rule:

> Marketing newsletters, spam emails, mass company announcements. Ignore any emails from Alice Jones.

Run again, and the assistant labeled the email **ignore** and never wrote a reply.

In both cases the optimizer found the right one of the four texts from one sentence of feedback, and changed nothing
else. In this run, the "when to update" notes did their job.

### One thing I'd change

Look at what that second email said: "Urgent issue - your service is down." John's feedback was about the sender, and
the optimizer did exactly what he asked. Now every email from Alice Jones is silently ignored, including outage
reports.

The feedback came from a person, so in a sense this is working as designed. But a one-line comment became a permanent
rule, and nobody saw the new rule before it took effect. Before using this for real, I'd show each rewritten
instruction to the person and ask "is this what you meant?" before saving it.

## All three memories, side by side

![One store, three drawers. Semantic memory lives in email_assistant / user / collection, holds facts like “Jim is John Doe's friend.”, is written by the response agent if it chooses to, and is read when the agent chooses to search. Episodic memory lives in email_assistant / user / examples, holds past emails with their label, is written by a person labeling an email, and is read automatically on every triage. Procedural memory lives in a drawer named after the user, holds the four instruction texts, is written by the optimizer from feedback, and is read automatically on every run.](../../assets/images/long-term-agentic-memory/memory-drawers.svg)

The assistant now has all three kinds of memory from Part 1's table, all in one store, each in its own drawer.

The biggest difference is in the last two rows. In Part 1, both saving and searching were up to the agent, and in my
run it skipped the save. Episodic and procedural memory don't wait for the agent to decide anything. The code reads
them on every run, and new memories come from a person's correction, either directly as a label or through the
optimizer.

That fixes the forgetting problem, but it moves the weak point somewhere else. Now the memory is only as good as the
corrections people give it. One example can outweigh the written rules, and one sentence of feedback can become a
rule that ignores outage reports. An assistant that learns from you will learn your mistakes too, so it's worth being
able to see what it has learned.
