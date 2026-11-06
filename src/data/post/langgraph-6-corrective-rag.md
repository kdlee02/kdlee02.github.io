---
title: 'Corrective RAG in LangGraph: Grade, Boil Down, or Go to the Web'
excerpt: 'A RAG graph that grades what it found, boils the good documents down to the sentences that matter, and searches the web when nothing useful is left. Plus a price that got thrown away for scoring exactly 0.5. Part 6, the last in a series on LangChain and LangGraph.'
publishDate: 2026-11-06T00:00:00Z
category: 'LLM Engineering'
tags:
  - langgraph
  - retrieval
  - evals
draft: false
---

_Based on Pandas Studio's course "랭그래프(LangGraph) 활용 에이전트 RAG 구현" (Building agentic RAG with LangGraph).
This is part 6, the last in a series. [Part 5](/engineering/langgraph-5-self-rag-and-subgraphs) built Self-RAG, a graph
that grades its own search and answer. The course is in Korean; I translated its prompts and outputs into English._

Part 5's graph could tell when its search had come up empty, but all it could do about it was reword the question and
search the same menu again. When the menu simply didn't have the answer, it went round in circles until a counter
stopped it. **Corrective RAG** adds a way out: if the search results aren't good enough, look somewhere else.

> **About the code and outputs.** The code is current LangChain (1.4) and LangGraph (1.2). The slides show the graph's
> wiring and describe each step, but not the steps' code, so the node functions below are mine. Every output is **My
> run** (with `gpt-5.4-mini`); the slides for these pages show no outputs.
>
> As in parts 4 and 5, `search_menu` uses a stand-in menu: the eight entries that appear in the course's outputs, in a
> small in-memory vector store. It's not the course's menu.

## The idea, from the paper

**CRAG** (Corrective Retrieval-Augmented Generation) comes from a 2024 paper. Its starting point: RAG trusts its search
results too much. If the search returns the wrong documents, the model writes a confident answer from them anyway.

So CRAG checks the results first and _corrects_ course when they're weak. Think of a student who finds a textbook
chapter, highlights only the sentences that matter for the assignment, and goes to the internet if the chapter turns
out to be about something else.

The course describes it in four steps:

1. **Grade the documents:** judge how relevant each search result is.
2. **Refine the knowledge:** from the documents that pass, pull out only the important pieces.
3. **Search for more:** if the documents aren't enough, look outside, on the web.
4. **Answer:** write the answer from the refined knowledge.

(The paper itself sorts results three ways: **correct** results get refined, **incorrect** ones are replaced by a web
search, and **ambiguous** ones get both. The course's version is simpler: keep or drop, then fall back to the web if
nothing useful is left.)

## The graph

This is the course's wiring, unchanged:

```python
# Nodes
builder.add_node("retrieve", retrieve)                  # search the documents
builder.add_node("grade_documents", grade_documents)    # grade them
builder.add_node("refine_knowledge", refine_knowledge)  # boil them down
builder.add_node("web_search", web_search)              # search the web
builder.add_node("generate", generate)                  # write the answer
builder.add_node("transform_query", transform_query)    # reword the question

# Edges
builder.add_edge(START, "retrieve")
builder.add_edge("retrieve", "grade_documents")
builder.add_edge("grade_documents", "refine_knowledge")

# Conditional edge: after refining, decide what's next
builder.add_conditional_edges(
    "refine_knowledge",
    decide_to_generate,
    {
        "transform_query": "transform_query",
        "generate": "generate",
    },
)

# The web path
builder.add_edge("transform_query", "web_search")
builder.add_edge("web_search", "generate")
builder.add_edge("generate", END)
```

Compare it with part 5's graph and one thing stands out: **there's no loop**. Every arrow points forward. Instead of
searching the same place again, the fallback goes somewhere new, then answers. So this graph needs no retry counter.

![The Corrective RAG graph. START, retrieve searches the menu, grade_documents keeps the relevant documents, and refine_knowledge splits them into strips, scores each from 0 to 1 and keeps those above 0.5. decide_to_generate then branches. If strips are left, generate answers from them. If none are left, transform_query rewrites the question for the web, web_search adds web results, and generate answers from those. Then END.](../../assets/images/langgraph-6/crag-flow.svg)

## The steps

**`grade_documents`** is the same check as part 5's: a model call that must answer `yes` or `no` for each document, and
only the `yes` documents are kept.

**`refine_knowledge`** is new. The course describes it as: split the documents into **knowledge strips**, grade each
strip's relevance, and keep only the strips scoring **above 0.5**. A strip is a small piece of a document, here one line
of a menu entry. The idea: a whole menu entry has a name, price, ingredients and a description, and a question usually
needs only one or two of those. Handing the model just the relevant lines keeps the answer focused.

```python
class StripScore(BaseModel):
    """How relevant is this piece of text to the question?"""
    score: float = Field(description="0 = irrelevant, 1 = directly answers the question")

strip_grader = llm.with_structured_output(StripScore)

def refine_knowledge(state):
    q = state["question"]
    strips = [line.strip("• ").strip()
              for d in state["documents"] for line in d.page_content.split("\n") if line.strip()]
    scores = strip_grader.batch(
        [f"Question: {q}\n\nText: {s}\n\nScore how relevant this text is to the question, from 0 to 1."
         for s in strips])
    return {"knowledge_strips": [s for s, sc in zip(strips, scores) if sc.score > 0.5]}
```

`.batch()` sends all the scoring calls at once instead of one by one, so ten strips don't take ten times as long.

**`decide_to_generate`** checks whether anything survived:

```python
def decide_to_generate(state):
    return "generate" if state["knowledge_strips"] else "transform_query"
```

**`transform_query`** rewords the question as a short web search query, and **`web_search`** runs it with
`TavilySearch` (from part 1) and adds the results to the documents, as the course describes: "add the web results to
the existing documents."

**`generate`** answers from the strips plus any web results, and says it couldn't find anything when both are empty.

## Run 1: the price that scored exactly 0.5

_My run:_ "How much is the Signature Steak, and what's in it?"

```
[retrieve]          Signature Steak, Tenderloin Steak Salad
[grade_documents]   kept 1 of 2: Signature Steak
   1.00 KEEP  1. Signature Steak
   0.50 drop  Price: ₩35,000
   0.70 KEEP  Main ingredients: premium Korean beef (hanwoo) sirloin, rosemary potatoes, grilled asparagus
   0.40 drop  Description: The chef's signature dish: hanwoo sirloin dry-aged for 21 days, ...
[refine_knowledge]  kept 2 of 4 strips
[decide_to_generate] -> generate
[generate]          The Signature Steak costs **not specified** in the provided information. It includes
                    premium Korean beef (hanwoo) sirloin, rosemary potatoes, and grilled asparagus.
```

The search was right, the document grader was right (it dropped the salad), and the menu entry had the price. Then
refining threw the price away, and the answer said the price wasn't given.

The price line scored **0.50**, and the rule keeps strips scoring _more than_ 0.5. I ran it twice more: the price
scored 0.40 both times, and both answers said "I only have the ingredients, not the price."

I tried two things to see why.

**First, give each strip its context.** Cut out of its entry, the line "Price: ₩35,000" doesn't say _what_ costs
₩35,000. So I labeled every strip with its dish name ("Signature Steak: Price: ₩35,000"). Over three runs that lifted
the ingredients and description lines to 1.00, but the price stayed at exactly **0.50** every time, and all three
answers still said there was no price.

**Then, ask about the price alone.** "How much is the Signature Steak?" With labeled strips, the price line scored
**1.00** in both runs, and both answers were "The Signature Steak costs ₩35,000."

So the grader was scoring each strip against the _whole_ question. The question asked two things, and the price line
answers one of them, so it got half marks, 0.5, which lands exactly on a cutoff that needs _more_ than 0.5. A cutoff of
"0.5 or more" would have kept it in the four runs where it scored 0.50 (not in the two where it scored 0.40). Splitting two-part questions, or scoring strips against each part, would be sturdier
fixes.

The lesson goes beyond this one number. Refining is a filter, and every filter can remove the one thing you needed.
Here it removed the most important fact in the document.

## Run 2: falling back to the web

_My run:_ "What does Super Tuscan mean?"

```
[retrieve]          Sassicaia 2018, Puligny-Montrachet 1er Cru 2018
[grade_documents]   kept 1 of 2: Sassicaia 2018
   0.00 drop  3. Sassicaia 2018
   0.00 drop  Price: ₩420,000
   0.30 drop  Main ingredients: grapes: Cabernet Sauvignon, Cabernet Franc, Merlot
   0.20 drop  Description: A Super Tuscan red from Tuscany. Blackberry and cassis with herbs, ...
[refine_knowledge]  kept 0 of 4 strips
[decide_to_generate] -> transform_query
[transform_query]   'What does Super Tuscan mean'
[web_search]        wine-searcher.com, wsetglobal.com
[generate]          A Super Tuscan generally means a red wine from Tuscany made in a way that doesn't follow
                    the traditional Italian grape rules, often using international varieties like Cabernet
                    Sauvignon and Merlot. ... the term is not legally fixed or defined.
```

This is the case CRAG is built for. The menu mentions "Super Tuscan" (the Sassicaia is one) but never explains it. The
document passed the first grade because it's on topic, but no single line actually answers the question, so refining
left nothing. The graph went to the web, found two wine sites, and answered from them.

Part 5's graph had only the menu, so all it could do was reword the question and search the menu again.

## Run 3: when the web answers a different question

The web fallback has a weakness: the web doesn't know this restaurant.

_My run_ (log shortened): "Which of your wines goes well with the Signature Steak?"

```
[retrieve]          Signature Steak, Sassicaia 2018
[grade_documents]   kept 0 of 2
[decide_to_generate] -> transform_query
[transform_query]   'Signature Steak wine pairing'
[web_search]        goldensteer.com (a steak and wine pairing guide), blossomsteakhouse.com
[generate]          For a signature steak wine pairing, the guide recommends ... Filet Mignon: Pinot Noir,
                    Merlot ... Strip Steak: Cabernet Sauvignon or Sangiovese ... If you mean the signature
                    steak box mentioned in the text, ...
```

This is the same question that defeated part 5's graph. The grader rejected the Sassicaia again (its entry doesn't
mention steak). This time the graph didn't loop; it went to the web. But the rewrite dropped the "your," so the search
looked for wine pairing in general. The answer listed wines by steak cut from the first site's guide, and even
mentioned that site's "signature steak box." None of it is on this restaurant's menu.

_My run_ (log shortened): "Who is the head chef at this restaurant?"

```
[grade_documents]   kept 0 of 2
[transform_query]   'head chef restaurant'
[web_search]        a cooking school's article on what a head chef does, an article on executive vs. head chef
[generate]          A head chef is the person responsible for the overall management of the kitchen in a
                    restaurant. ...
```

Only the restaurant knows who its head chef is. The web can't, so the rewritten search found articles about what head
chefs do in general, and the answer explained the job instead of saying "I don't know."

Both failures have the same cause. The fallback assumes that if the menu doesn't have it, the web will. That's true for
"What does Super Tuscan mean?" and false for anything only the restaurant knows. A sturdier version would decide
whether the question is about _this restaurant_ before going to the web, which is part 4's router again, or check the
web results with the same document grader before answering.

## What the series built

Six posts, one restaurant assistant, and each part added one idea on top of the last:

1. **Tool calling:** the model fills in a request, your code runs it, and the result goes back as a `ToolMessage`.
2. **StateGraph:** steps as nodes, arrows as edges, a shared state, and reducers for fields that several nodes write.
3. **ReAct and memory:** a loop between the model and its tools, and a checkpointer so a conversation carries over.
4. **Adaptive RAG and human-in-the-loop:** route each question before searching; pause the graph, inspect and edit its
   state, and resume.
5. **Self-RAG and subgraphs:** grade the documents and the answer, loop with a counter, search in parallel, and nest
   graphs.
6. **Corrective RAG:** refine documents down to the useful strips, and fall back to the web when nothing is left.

The pattern across the last three posts: each check fixes one kind of mistake and can cause a new one. The router
judged by wording, the strict grader threw away a good wine, the refiner threw away a price, and the web fallback
answered questions about a different restaurant. None of these were the model failing to do its job. They were checks
doing exactly what they were told. That's why every check needs testing with real questions, the way you'd test any
other code.

## What to take away

- **Corrective RAG** grades search results before trusting them, boils the good ones down to the relevant pieces, and
  searches the web when nothing useful is left.
- The course's graph has **no loop**: the fallback goes to a new source instead of searching the same one again.
- **`refine_knowledge`** splits documents into **knowledge strips** and keeps those scoring above 0.5. A strip loses
  its context when it's cut out, and a cutoff right at a common score can throw away exactly what you needed.
- A **web fallback** helps with general knowledge and hurts with facts only your own data has. Decide which kind of
  question it is before going to the web.
