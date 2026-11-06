---
title: 'Adaptive RAG and Human-in-the-Loop in LangGraph: Route the Question, Pause the Graph'
excerpt: 'A router that reads each question and picks where to search, then a graph that stops at breakpoints so a person can check its state, change it and let it carry on. Part 4 of a series on LangChain and LangGraph.'
publishDate: 2026-11-06T00:00:00Z
category: 'LLM Engineering'
tags:
  - langgraph
  - retrieval
  - agents
draft: false
---

_Based on Pandas Studio's course "랭그래프(LangGraph) 활용 에이전트 RAG 구현" (Building agentic RAG with LangGraph).
This is part 4 of a series. [Part 1](/engineering/langgraph-1-langchain-tool-calling) covered tool calling,
[part 2](/engineering/langgraph-2-stategraph) covered graphs and state, and
[part 3](/engineering/langgraph-3-react-agent-and-memory) built a ReAct agent with memory. The course is in Korean; I
translated its prompts and outputs into English._

So far the restaurant assistant has done one thing with every question: let the model decide which tool to call. This
post adds two ideas that make a graph more careful. The first decides _where_ to search before any searching happens.
The second lets the graph stop partway through so a person can look at what it's about to do.

> **About the code and outputs.** The code is updated to current LangChain (1.4) and LangGraph (1.2). The course used
> Google's `gemini-1.5-flash`, which has since been shut down, so I used `gpt-5.4-mini`. Outputs are labeled: **My
> run** means I ran the code shown; **Course output** is the course's own result.
>
> The course's `search_menu` searches the restaurant's full menu, which isn't published. For my runs I built a stand-in
> from the eight menu entries that appear in the course's outputs (four dishes, a soup, a dessert and two wines, with
> their prices), stored in a small in-memory vector store. It's not the course's menu.

## Adaptive RAG: not every question needs the same effort

Some questions are easy. "What's the capital of France?" needs no search at all. Some need one lookup: "How much is the
Signature Steak?" Some need several rounds of searching and thinking: "Which of your wines would suit someone who
ordered the lobster bisque and dislikes oak?"

A plain RAG system treats all three the same way: search once, then answer. That wastes effort on the easy ones and
falls short on the hard ones. **Adaptive RAG**, from a 2024 paper of the same name, adds a step at the front. Think of a
good librarian: they answer the easy questions straight away, walk you to the right shelf for the medium ones, and sit
down with you for an hour on the hard ones.

It works in three steps:

1. **Judge the question.** Look at how complex the user's question is.
2. **Pick a strategy.** Simple question: answer with the model alone, or one quick search. Medium: search once, then
   answer. Complex: search and reason over several rounds.
3. **Run it.** Answer the question with the chosen strategy.

In the paper, the judge is a small model trained just to label questions as simple, medium or complex.

## The course's version: route each question to a tool

The course keeps the same idea, choose before you search, but routes on a simpler question: _which source_ should
answer this?

- Questions about the restaurant's menu go to **`search_menu`**.
- Anything else goes to **`search_web`**.

The router is a model call with **structured output**: instead of free text, the model has to fill in a small form
whose only field can hold one of two values.

```python
from typing import Literal
from pydantic import BaseModel, Field
from langchain.chat_models import init_chat_model
from langchain_core.prompts import ChatPromptTemplate

# The form the model must fill in
class ToolSelector(BaseModel):
    """Route the user's question to the most suitable tool."""
    tool: Literal["search_menu", "search_web"] = Field(
        description="Pick search_menu or search_web depending on the question",
    )

llm = init_chat_model("openai:gpt-5.4-mini", temperature=0)
structured_llm_router = llm.with_structured_output(ToolSelector)

system = """You are an expert at routing user questions to the right tool.
Use search_menu for questions about the restaurant's menu.
Use search_web for information not on the restaurant's menu, or general questions."""

route_prompt = ChatPromptTemplate.from_messages(
    [
        ("system", system),
        ("human", "{question}"),
    ]
)

question_router = route_prompt | structured_llm_router
```

Three things make this work:

- **`Literal["search_menu", "search_web"]`** says the field can hold exactly one of those two strings and nothing else.
  It's a multiple-choice question, not an essay question.
- **`with_structured_output(ToolSelector)`** turns the class, its docstring and the field's `description` into
  instructions for the model, and turns the reply back into a `ToolSelector` object. You read the answer as
  `result.tool`.
- **`route_prompt | structured_llm_router`** chains the two: fill the question into the prompt, then send it to the
  model. The `|` passes one step's output into the next.

The only change from the course's code is the model line. `init_chat_model("openai:gpt-5.4-mini")` replaces
`ChatGoogleGenerativeAI(model="gemini-1.5-flash")`.

_My run:_ five questions, each asked three times. All three runs agreed every time.

| Question                                                | Routed to     |
| ------------------------------------------------------- | ------------- |
| How much is the Signature Steak?                        | `search_menu` |
| What wines do you have?                                 | `search_menu` |
| What is the origin of tiramisu?                         | `search_web`  |
| What's the weather in Seoul tomorrow?                   | `search_web`  |
| What wine goes well with steak?                         | `search_web`  |
| Which of your wines goes well with the Signature Steak? | `search_menu` |

![The question router. A question goes to the router, a model call that must fill in ToolSelector with one of two values. Menu questions, such as the Signature Steak's price or "Which of your wines goes well with the Signature Steak?", go to search_menu. General questions, such as tiramisu's origin, tomorrow's weather in Seoul and "What wine goes well with steak?", go to search_web.](../../assets/images/langgraph-4/router-graph.svg)

The interesting row is "What wine goes well with steak?" The menu has two wines, but the router sent it to the web all
three times. It reads like a general food-and-wine question, and the router only sees the question's wording, never the
menu itself. I tried adding a list of what the menu contains to the system prompt ("steaks, pasta, soup, chicken,
dessert and wines"): still `search_web`, three times out of three. Rewording the question to "Which of _your_ wines goes
well with the Signature Steak?" sent it to `search_menu` every time.

So a router is only as good as the clues in the question. That's worth testing with real users' phrasing before you
trust it. In a graph, the router's answer would go into a conditional edge, just like the menu router in part 2.

## Human-in-the-loop: let a person check the work

Fully automatic is fast, but sometimes you want a person to approve a step first: before an agent sends an email,
spends money or searches with a query that looks wrong. **Human-in-the-loop** (HITL) means building places into the
system where a person can review what the AI is doing and step in.

LangGraph's simplest tool for this is a **breakpoint**: a point where the graph stops running and waits. It's like a
pause button on a video. The graph doesn't forget where it was, because breakpoints use the same **checkpointer** that
gave part 3's agent its memory. The state is saved at the pause, and the graph picks up from the save.

### The graph

The course adds breakpoints to a small RAG agent. The slides show only the `compile` call, so here is the graph I built
to match the course's output:

- **`agent`**: the model, with `search_menu` bound as a tool. It decides to search.
- **`retrieve`**: a `ToolNode` that runs the search.
- After `retrieve`, a check called **`grade_documents`** asks the model whether the results are relevant to the
  question. If yes, go to **`generate`**, which writes the answer. If not, go to **`rewrite`**, which rewords the
  question and sends it back to `agent` to search again.
- **`num_generations`** counts rewrites. Once it reaches 2, the graph answers with whatever it found, so the loop can't
  run forever (the same idea as part 2's retry counter).

```python
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.prebuilt import ToolNode, tools_condition

class GraphState(MessagesState):
    num_generations: int

builder = StateGraph(GraphState)
builder.add_node("agent", agent)
builder.add_node("retrieve", ToolNode([search_menu]))
builder.add_node("rewrite", rewrite)
builder.add_node("generate", generate)

builder.add_edge(START, "agent")
builder.add_conditional_edges("agent", tools_condition, {"tools": "retrieve", END: END})
builder.add_conditional_edges("retrieve", grade_documents)  # returns "generate" or "rewrite"
builder.add_edge("rewrite", "agent")
builder.add_edge("generate", END)
```

`tools_condition` returns `"tools"` when the model asks for a tool. The node here is called `retrieve`, so the
dictionary maps `"tools"` to `"retrieve"`. That's the naming catch from part 3, handled with a path map.

### Adding the breakpoints

Breakpoints are set when you compile:

```python
from langgraph.checkpoint.memory import InMemorySaver

memory = InMemorySaver()

# Stop before the 'retrieve' and 'generate' nodes run
graph = builder.compile(
    checkpointer=memory,
    interrupt_before=["retrieve", "generate"],
)
```

**`interrupt_before`** lists nodes to stop in front of. The graph runs until it's about to enter one of them, saves its
state and returns. There's also `interrupt_after`, which stops right after a node finishes.

Two changes from the course: `InMemorySaver` is the current name for `MemorySaver` (they're the same class, as in part
3), and messages are now imported from `langchain.messages` instead of `langchain_core.messages`.

### Run 1: stop before the search

You run a paused graph step by step with `stream`, inside a thread, like the memory examples in part 3.
`stream_mode="values"` hands back the whole state after each step; the loop prints the newest message.

```python
from langchain.messages import HumanMessage

thread = {"configurable": {"thread_id": "breakpoint_test"}}
inputs = [HumanMessage(content="What is your signature dish?")]

for event in graph.stream({"messages": inputs}, thread, stream_mode="values"):
    event["messages"][-1].pretty_print()
```

_Course output:_

```
================================ Human Message =================================
What is your signature dish?
================================== Ai Message ==================================
Tool Calls:
  search_menu (call_ixDipQ0n8Vl0kXOX7pnvvWJS)
 Call ID: call_ixDipQ0n8Vl0kXOX7pnvvWJS
  Args:
    query: signature dish
```

_My run:_ the same: the question, then the model's request to call `search_menu` with `query: signature dish`. Then the
loop ended. The model has asked for a search, but `retrieve` hasn't run, because the graph stopped in front of it.

### Looking at the paused state

`graph.get_state(thread)` returns a snapshot of the saved state. Two parts of it matter most:

- **`.values`**: the state itself, here the messages so far.
- **`.next`**: which node will run when the graph continues.

```python
current_state = graph.get_state(thread)
print(current_state.next)
```

_Course output:_ `('retrieve',)`. _My run:_ the same.

The course also prints the whole snapshot. It holds the two messages, a `checkpoint_id` that names this save, and a
task waiting to run, named `retrieve`. This is the moment a person would read the model's planned search and decide
whether it's sensible.

### Run 2: carry on with `None`

To continue, call `stream` again with **`None`** as the input. `None` means "no new input, just keep going from the
save."

```python
for event in graph.stream(None, thread, stream_mode="values"):
    event["messages"][-1].pretty_print()
```

_Course output (shortened; the search result is a list of two menu documents):_

```
================================== Ai Message ==================================
Tool Calls:
  search_menu (call_ixDipQ0n8Vl0kXOX7pnvvWJS)
  ...
---DECISION: DOCS RELEVANT---
================================= Tool Message =================================
Name: search_menu
[Document(... page_content='1. Signature Steak\n • Price: ₩35,000 ...'),
 Document(... page_content='8. Tenderloin Steak Salad\n • Price: ₩26,000 ...')]
```

_My run:_ the same shape: it repeated the last message from the save, ran the search, printed
`---DECISION: DOCS RELEVANT---` and showed the search result. The search found the same two entries as the course's, the
Signature Steak (₩35,000) and the Tenderloin Steak Salad (₩26,000). Then it stopped again. `.next` was now
`('generate',)`: the second breakpoint.

The decision line prints before the result because `grade_documents` runs as the edge leaving `retrieve`, before the
loop gets to print the new state.

### Changing the state while it's paused

A person can do more than look. **`graph.update_state(thread, {...})`** writes new values into the paused state, as if
a node had returned them.

```python
current_state.values.get("num_generations", None)

graph.update_state(thread, {"num_generations": 2})

new_state = graph.get_state(thread)
print(new_state.values.get("num_generations"))
```

The course doesn't show this output. _My run_ (doing the update at the first pause, before the search): `None` before,
`2` after, and `.next` was still `('retrieve',)`. Updating the state doesn't move the graph forward; it only changes
what the next node will see.

In my graph, setting `num_generations` to 2 means "no more rewrites": if the search had come back irrelevant, the graph
would have gone straight to `generate` with what it had. The search was relevant, so it didn't matter here. The same call
could fix a bad search query or add a note for the model before it continues.

### Run 3: the answer

One more `stream(None, ...)` ran `generate`.

_My run:_

```
================================== Ai Message ==================================
The signature dish is **Signature Steak**. It features **hanwoo sirloin dry-aged for 21 days**,
cooked medium rare, with **red wine sauce**.
```

After that, `.next` was empty (`()`): the graph had reached `END`. The thread held four messages: the question, the
search request, the search result and the answer.

![The breakpoint run, step by step. stream with the question runs agent, which asks for search_menu, then pauses before retrieve; get_state shows next is retrieve, and update_state sets num_generations to 2. stream(None) runs retrieve and the relevance check, which says relevant, then pauses before generate. A second stream(None) runs generate, which answers that the signature dish is the Signature Steak, and the graph reaches END.](../../assets/images/langgraph-4/pause-and-edit.svg)

### A note on the newer way: `interrupt()`

`interrupt_before` still works in LangGraph 1.2 with no warning. The current docs suggest it mainly for debugging,
though, and recommend a different tool for real approval steps: calling **`interrupt()`** inside a node.

```python
from langgraph.types import interrupt, Command

def human_review(state):
    decision = interrupt({"about_to_search": state["query"]})  # pauses here
    return {"query": decision.get("query", state["query"])}

# First call: runs until interrupt() and returns its payload
graph.invoke({"query": "signature dish"}, thread)

# Resume with the person's answer
graph.invoke(Command(resume={"query": "chef's signature steak"}), thread)
```

The difference: a breakpoint is set from outside, at compile time, and always stops at the same nodes. `interrupt()`
sits inside the node's code, so the node decides when to pause and what to show the person, and the person's reply comes
back as the return value of `interrupt()`. _My run:_ the first call stopped and returned
`{'about_to_search': 'signature dish'}`; resuming changed the query to `chef's signature steak`, and the next node
searched for that.

## What to take away

- **Adaptive RAG** picks a strategy for each question before searching: no search, one search or several rounds,
  depending on how hard the question is.
- The course's version is a **router**: a model call with **structured output** whose one field is a `Literal` with two
  choices, `search_menu` or `search_web`.
- A router judges by wording. "What wine goes well with steak?" went to the web; "Which of _your_ wines…" went to the
  menu.
- A **breakpoint** (`interrupt_before` at compile time) stops the graph in front of a node. It needs a checkpointer and
  a `thread_id`.
- While it's paused: **`get_state`** shows the state and `.next`, **`update_state`** changes it, and
  **`stream(None, thread)`** carries on from the save.
- For real approval steps, current LangGraph recommends **`interrupt()`** inside a node, resumed with
  `Command(resume=...)`.

Next, in part 5: Self-RAG, a graph that grades its own search results and its own answer, and subgraphs that search
several sources at once.
