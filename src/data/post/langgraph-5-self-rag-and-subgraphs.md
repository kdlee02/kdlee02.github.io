---
title: 'Self-RAG and Subgraphs in LangGraph: A Graph That Checks Its Own Work'
excerpt: 'A RAG graph that grades its search results, checks its own answer for made-up facts, and rewords the question when it comes up short. Then a search step that queries several sources at once, packed into a subgraph. Part 5 of a series on LangChain and LangGraph.'
publishDate: 2026-11-06T00:00:00Z
category: 'LLM Engineering'
tags:
  - langgraph
  - retrieval
  - evals
draft: false
---

_Based on Pandas Studio's course "랭그래프(LangGraph) 활용 에이전트 RAG 구현" (Building agentic RAG with LangGraph).
This is part 5 of a series. [Part 2](/engineering/langgraph-2-stategraph) covered graphs, reducers and loops, and
[part 4](/engineering/langgraph-4-routing-and-human-in-the-loop) covered routing and breakpoints. The course is in
Korean; I translated its prompts and outputs into English._

A plain RAG system searches once and answers with whatever came back. If the search found the wrong thing, or the model
added a "fact" that wasn't in the results, nobody notices. This post builds a graph that checks itself: it grades what
it found, grades what it wrote, and tries again when either falls short. Then it splits the search step into a small
graph of its own that searches several places at once.

> **About the code and outputs.** The code is updated to current LangChain (1.4) and LangGraph (1.2). The slides show
> the key functions but not the whole program, so I wrote the missing pieces (the graders' prompts, the wiring and a
> loop limit); each one is marked as mine below. Every output in this post is **My run** (with `gpt-5.4-mini`); the
> slides for these pages show no outputs.
>
> The course's menu isn't published, so `search_menu` uses the same stand-in as part 4: the eight menu entries that
> appear in the course's outputs, in a small in-memory vector store. It's not the course's menu.

## Self-RAG: an answer that reviews itself

**Self-RAG** comes from a 2023 paper. It adds **self-reflection** to RAG: the system searches, writes an answer, then
looks back at its own work and decides whether it's good enough.

Think of a student writing an essay from library books. A careless student copies the first book they find. A careful
one checks whether each book is actually on topic, writes a draft, then rereads it and asks: is everything here backed
by my sources? Does it answer the question that was set? If not, they look again or rewrite.

The course lists five steps:

1. **First search:** take the question and search for related information.
2. **First answer:** write an answer from what was found.
3. **Self-check:** judge the answer's quality, relevance and accuracy.
4. **Decide:** search for more, or rewrite the answer.
5. **Repeat** until the result is good enough.

## Three checks and a rewrite

The course builds this out of small model calls, each answering one yes-or-no question. Each is a **grader**: a model
call with structured output (like part 4's router) whose only field, `binary_score`, must be `"yes"` or `"no"`.

| Grader                 | Question it answers                             |
| ---------------------- | ----------------------------------------------- |
| `retrieval_grader`     | Is this document relevant to the question?      |
| `hallucination_grader` | Is the answer fully supported by the documents? |
| `answer_grader`        | Does the answer actually address the question?  |

The slides don't show the graders' prompts; the questions above are my wording.

A **hallucination** is a claim the model makes up, something that sounds right but isn't in the sources. The
hallucination grader is the "is everything backed by my sources?" reread.

### Keep only relevant documents

The first check runs right after the search. It grades each document and keeps the ones that pass:

```python
def grade_documents(state: GraphState) -> GraphState:
    question = state["question"]
    documents = state["documents"]

    filtered_docs = []
    for d in documents:
        score = retrieval_grader.invoke({"question": question, "document": d})
        grade = score.binary_score
        if grade == "yes":
            filtered_docs.append(d)

    return {"documents": filtered_docs}
```

Returning `{"documents": filtered_docs}` replaces the search results with the survivors. `documents` has no reducer
here, so the new list overwrites the old one (part 2's default).

### Check the answer in two stages

After the answer is written, `grade_generation` decides what happens next. It returns one of three labels, and a
conditional edge uses the label to pick the next node:

```python
def grade_generation(state: GraphState) -> str:
    question, documents, generation = state["question"], state["documents"], state["generation"]

    hallucination_grade = hallucination_grader.invoke(
        {"documents": documents, "generation": generation})

    if hallucination_grade.binary_score == "yes":
        # Stage 1 passed (no made-up facts) -> stage 2: does it answer the question?
        relevance_grade = answer_grader.invoke({"question": question, "generation": generation})
        if relevance_grade.binary_score == "yes":
            return "useful"
        else:
            return "not useful"
    else:
        return "not supported"
```

- **`"not supported"`**: the answer says things the documents don't. Write it again from the same documents.
- **`"not useful"`**: it's accurate but misses the point. The documents probably weren't the right ones, so reword the
  question and search again.
- **`"useful"`**: done.

The order matters. There's no point asking whether an answer is helpful if it's made up.

### Reword the question

When the search comes up short, `transform_query` asks the model to reword the question so the next search has a better
chance:

```python
def transform_query(state: GraphState) -> GraphState:
    question = state["question"]

    # Rewrite the question
    rewritten_question = rewrite_question(question)

    # Count this attempt
    num_generations = state.get("num_generations", 0)
    num_generations += 1

    return {"question": rewritten_question, "num_generations": num_generations}
```

`rewrite_question` is one model call: "Rewrite this question about a restaurant so a menu search can find the answer
more easily."

## Wiring it into a loop

The slides describe the shape (grade the documents, branch, grade the answer, branch) but don't show the edges, so this
wiring is mine:

```python
builder = StateGraph(GraphState)
builder.add_node("retrieve", retrieve)
builder.add_node("grade_documents", grade_documents)
builder.add_node("generate", generate)
builder.add_node("transform_query", transform_query)

builder.add_edge(START, "retrieve")
builder.add_edge("retrieve", "grade_documents")
builder.add_conditional_edges("grade_documents", decide_to_generate,
                              {"transform_query": "transform_query", "generate": "generate"})
builder.add_edge("transform_query", "retrieve")
builder.add_conditional_edges("generate", grade_generation,
                              {"useful": END, "not useful": "transform_query", "not supported": "generate"})
graph = builder.compile()
```

`decide_to_generate` sends the graph to `generate` if any documents survived grading, and to `transform_query` if none
did.

This graph has two loops, and either could run forever: a question the menu can't answer gets reworded again and again,
and an answer the hallucination grader never accepts gets rewritten again and again. Part 2 showed the fix, a counter.
In my version, `generate` also adds one to `num_generations`; `decide_to_generate` stops rewording once it reaches 2,
and `grade_generation` accepts whatever it has once the count passes 2. Those limits are mine; the slides don't show
one.

![The Self-RAG graph. START, retrieve, then grade_documents keeps only relevant documents. If none are left, transform_query rewrites the question and the graph retrieves again; otherwise generate writes an answer. grade_generation then checks it. Not supported by the documents: generate again. Supported but not answering the question: transform_query and search again. Useful: END. A counter, num_generations, stops the loops after a few tries.](../../assets/images/langgraph-5/self-rag-loop.svg)

### Run 1: an easy question

_My run:_ "How much is the Signature Steak?"

```
[retrieve]          -> Signature Steak, Tenderloin Steak Salad
[grade_documents]   kept 1 of 2
[generate #1]       The Signature Steak costs ₩35,000.
[grade_generation]  useful
```

The search returned two steak dishes. The grader dropped the salad, which wasn't what was asked, and the answer passed
both checks the first time.

### Run 2: a question the menu can't answer

_My run:_ "Do you have any vegetarian dishes?"

```
[retrieve]          -> Chicken Confit, Seafood Pasta
[grade_documents]   kept 0 of 2
[transform_query]   'What vegetarian dishes do you have on the menu?'
[retrieve]          -> Chicken Confit, Seafood Pasta
[grade_documents]   kept 0 of 2
[transform_query]   'Which menu items are vegetarian?'
[retrieve]          -> Seafood Pasta, Chicken Confit
[grade_documents]   kept 0 of 2
[generate #3]       The documents do not contain enough information to determine which menu items are vegetarian.
[grade_generation]  out of tries (my loop limit), stop
```

Here the loop actually loops. Every search returned chicken and seafood, the grader rejected both every time, and the
question was reworded twice. After that the counter stopped the rewording, and the answer admitted it didn't know,
which is better than a made-up list.

It's not a perfect result, though. The tiramisu is vegetarian, but the search never returned it: a similarity search
finds text that _sounds like_ the question, and "vegetarian" sounds more like other main dishes than like a dessert.
Rewording the question couldn't fix that, because the problem was the search, not the wording.

## Searching several places at once

So far the only source is the menu. The course next adds two more, the web and Wikipedia, and runs the searches **in
parallel**, at the same time, instead of one after another. Three searches that take a second each finish in about one
second instead of three.

In LangGraph, parallel nodes come from **fan-out** and **fan-in**. Fan-out: several edges leave the same node, so all
their targets run in the same step. Fan-in: their edges meet at one node, which waits for all of them.

```python
builder.add_edge(START, "search_menu")
builder.add_edge(START, "search_web")
builder.add_edge(START, "search_wiki")

builder.add_edge("search_menu", "filter_documents")
builder.add_edge("search_web", "filter_documents")
builder.add_edge("search_wiki", "filter_documents")

builder.add_edge("filter_documents", END)
```

### The state needs a reducer

Three nodes writing to the same field in the same step is exactly the case part 2's reducers exist for. I checked what
happens without one, using stand-in searches that each return one document.

_My run_, no reducer:

```
InvalidUpdateError: At key 'documents': Can receive only one value per step. Use an Annotated key to handle multiple values.
```

LangGraph refuses rather than guess which result to keep. With `Annotated[list, add]`, the three lists are joined.

But there's a second catch. If `filter_documents` then writes its survivors back into that same `add` field, they're
_added_ to the list instead of replacing it. _My run_, with a filter that keeps only the web result:

```
['search_menu-doc', 'search_web-doc', 'search_wiki-doc', 'search_web-doc']
```

All three results are still there, plus a second copy of the one the filter kept. So I gave the raw results their own
field:

```python
class SearchState(TypedDict, total=False):
    question: str
    datasources: list
    search_results: Annotated[list, add]   # the searches add to this
    documents: list                        # filter_documents writes the keepers here
```

The searches return `{"search_results": [...]}`, and `filter_documents` grades them with the same `retrieval_grader` and
returns `{"documents": kept}`.

### Only search where it helps

Searching all three sources every time is wasteful. The course's next version adds `analyze_question` at the front,
which decides which sources the question needs, and a conditional edge that runs just those:

```python
search_builder.add_edge(START, "analyze_question")
search_builder.add_conditional_edges(
    "analyze_question",
    route_datasources,
    ["search_menu", "search_web", "search_wiki"],
)
search_builder.add_edge("search_menu", "filter_documents")
search_builder.add_edge("search_web", "filter_documents")
search_builder.add_edge("search_wiki", "filter_documents")
search_builder.add_edge("filter_documents", END)
```

The new trick is that **`route_datasources` returns a list**. Return `["search_menu", "search_wiki"]` and both run in
parallel; `search_web` is skipped. The third argument lists every node the edge might go to.

`analyze_question` is mine: part 4's router again, except the field is a _list_ of choices,
`list[Literal["search_menu", "search_web", "search_wiki"]]`, so it can pick more than one.

### The three searches

- **`search_menu`**: the stand-in menu's vector store, top 2 matches.
- **`search_web`**: `TavilySearch` from part 1, top 2 results, each turned into a `Document`.
- **`search_wiki`**: Wikipedia.

For Wikipedia, LangChain's `WikipediaLoader` lives in `langchain-community`, and that package is now being shut down.
Importing it prints a warning that it's "being sunset and is no longer actively maintained." There's no standalone
replacement, and the notice suggests writing simple tools directly in your own code. So `search_wiki` calls Wikipedia's
search API with Python's standard library:

```python
import json, urllib.parse, urllib.request
from langchain_core.documents import Document

def search_wiki(state):
    params = urllib.parse.urlencode({
        "action": "query", "generator": "search", "gsrsearch": state["question"], "gsrlimit": 2,
        "prop": "extracts", "exintro": 1, "explaintext": 1, "format": "json",
    })
    req = urllib.request.Request(f"https://en.wikipedia.org/w/api.php?{params}",
                                 headers={"User-Agent": "langgraph-blog-demo/1.0"})
    pages = json.load(urllib.request.urlopen(req, timeout=15)).get("query", {}).get("pages", {}).values()
    docs = [Document(page_content=p["extract"][:1500], metadata={"title": p["title"]}) for p in pages]
    return {"search_results": docs}
```

It searches Wikipedia, takes the top two articles, and keeps the opening section of each.

## A graph inside a graph: subgraphs

The search part is now a small graph of its own, with its own state. A **subgraph** is a compiled graph used as a
single node in a bigger one, like a function you call from another function. You build and test the search on its own,
then plug it in. The course lists three things subgraphs give you:

- each one manages its own state;
- the parent graph and the subgraph can still pass information back and forth;
- big workflows split into pieces you can understand one at a time.

Plugging it in is one line, because a compiled graph can be a node:

```python
search_graph = search_builder.compile()

builder.add_node("retrieve", search_graph)
```

Information passes through **fields with the same name**. The parent's state and `SearchState` both have `question` and
`documents`, so the subgraph reads the parent's `question` and hands back its filtered `documents`. Its other fields,
`datasources` and `search_results`, stay inside.

Since the subgraph already filters, it replaces both `retrieve` and `grade_documents` in the Self-RAG graph:
`decide_to_generate` now follows `retrieve` directly. The rest of the loop is unchanged.

![The search subgraph, run on "Where does tiramisu come from, and how much is it here?". analyze_question picks search_menu and search_wiki; search_web is skipped. The two searches run at the same time and add their results to search_results: the Tiramisu and Sassicaia menu entries, and two unrelated Wikipedia pages, Maltese language and Sleepless in Seattle. filter_documents keeps only Tiramisu and writes it to documents, the one field the parent Self-RAG graph reads.](../../assets/images/langgraph-5/search-subgraph.svg)

### Run 3: two sources, and a made-up fact caught

_My run:_ "Where does tiramisu come from, and how much is it here?"

```
[analyze_question]  -> search_wiki, search_menu
[search_menu]       Tiramisu, Sassicaia 2018
[search_wiki]       Maltese language, Sleepless in Seattle
[filter_documents]  kept 1 of 4: Tiramisu
[generate #1]       Tiramisu is described here as a classic Italian dessert, so it comes from Italy. Its price here is ₩9,000.
[grade_generation]  not supported
[generate #2]       Tiramisu is a classic Italian dessert. Here, it costs ₩9,000.
[grade_generation]  useful
```

Three things happened:

1. **The router picked two sources** and skipped the web, and the two searches ran together.
2. **The Wikipedia search was useless**, and the filter caught it. Searching for the whole question returned articles
   on the Maltese language and the film _Sleepless in Seattle_. Searching for just `tiramisu` or `tiramisu origin`
   finds the right article, so the fix would be to search with key words, not the full sentence. The filter rejected
   both pages, and the Sassicaia wine, and kept only the tiramisu entry.
3. **The hallucination check fired.** The first answer said tiramisu "comes from Italy." The menu calls it a "classic
   Italian dessert," which isn't quite the same claim, and the only document left was the menu entry. The grader said
   `not supported`, the graph wrote it again, and the second answer stuck to what the menu says.

### Run 4: when the grader is too strict

_My run:_ "Which of your wines goes well with the Signature Steak?"

```
[analyze_question]  -> search_menu
[search_menu]       Signature Steak, Sassicaia 2018
[filter_documents]  kept 0 of 2
[transform_query]   'Which wine pairs well with the Signature Steak?'
[search_menu]       Signature Steak, Sassicaia 2018
[filter_documents]  kept 1 of 2: Signature Steak
[generate #2]       The documents do not say which wine pairs well with the Signature Steak. They only mention that it comes with a red wine sauce.
[grade_generation]  not useful
[transform_query]   'What wine is recommended to pair with the Signature Steak on the menu?'
[search_menu]       Signature Steak, Sassicaia 2018
[filter_documents]  kept 0 of 2
[generate #4]       The documents provided do not contain the answer.
[grade_generation]  out of tries (my loop limit), stop
```

This one failed, and it's instructive. The search found the Sassicaia, a full-bodied red, every time. But its menu
entry doesn't mention steak, so the relevance grader rejected it each time. Without it, the answer couldn't recommend a
wine, the answer grader said `not useful`, the question was reworded, and the same thing happened again until the
counter ran out.

The graders are models too, and they can be wrong. Here the problem was too strict a filter, not a bad search. Picking
a wine for a steak takes a small step of reasoning ("full-bodied red goes with red meat"), and the grader wanted the
document to say so outright. Every check you add is one more thing to test.

## What to take away

- **Self-RAG** adds self-checks to RAG: grade the documents, grade the answer, and try again when either fails.
- Each check is a small **grader**: a model call that must answer `yes` or `no`.
- `grade_generation` checks in order: first **is it supported** by the documents (no hallucination), then **does it
  answer** the question. `not supported` rewrites the answer; `not useful` rewords the question and searches again.
- Loops need a **counter**, or a question the sources can't answer loops forever.
- **Fan-out/fan-in** runs nodes in parallel. The shared field needs a reducer (`Annotated[list, add]`), and a filter
  that follows should write to a different field, or its results get added on top.
- A conditional edge that **returns a list** runs just those nodes in parallel.
- A **subgraph** is a compiled graph used as a node. It shares fields with the parent by name and keeps the rest to
  itself.
- `langchain-community` is being shut down; for simple tools like a Wikipedia search, a few lines of your own code
  work.

Next, in part 6: Corrective RAG, which grades what it found, boils it down to the useful pieces, and goes to the web
when the menu isn't enough.
