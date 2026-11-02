---
title: 'Structured Output: Ask, Retry, or Make It Impossible to Fail'
excerpt: 'Vendor APIs, retry-with-validation, and constrained decoding are three different mechanisms with different failure modes. One of them cannot produce invalid output at all, and it still cannot make the output correct.'
publishDate: 2026-09-29T12:00:00Z
category: 'LLM Engineering'
tags:
  - structured-output
  - pydantic
  - constrained-decoding
draft: false
---

You write a Pydantic class, you get JSON back, it works. When it stops working, the fix depends on
_why_ it worked in the first place. Depending on the mechanism, a broken output calls for a retry,
a prompt fix, or nothing at all, because it can't happen.

These are notes from DeepLearning.AI's
[Getting Structured LLM Output](https://www.deeplearning.ai/courses/getting-structured-llm-output),
built with [.txt](https://dottxt.ai/) and taught by Will Kurt and Cameron Pfiffer. Its organizing
claim is that there are three mechanisms, not three libraries:

| Mechanism                          | Where the constraint lives    | Can it produce invalid output? |
| ---------------------------------- | ----------------------------- | ------------------------------ |
| Vendor API (`response_format`)     | Provider's server             | Yes, as a catchable error      |
| Retry with validation (Instructor) | Your client, after generation | Yes, after N retries           |
| Constrained decoding (Outlines)    | The decoder, at every token   | **No**                         |

I'd add a fourth row the course merges into the first: **asking in the prompt.** "Respond only with
JSON matching this schema" fails _silently_. You get a dict that parses fine with the wrong keys. A
vendor `response_format` is enforced by the provider and fails loudly. Those are different
mechanisms.

## Vendor APIs: the schema as a program interface

Pass a class as the response format and you get back an instance, not a string. The interesting
part is the course's running example, a social media agent, where the schema becomes the boundary
between the model and your code:

```python
class Mention(BaseModel):
    product: Literal['app', 'website', 'not_applicable']
    sentiment: Literal['positive', 'negative', 'neutral']
    needs_response: bool
    response: Optional[str]
    support_ticket_description: Optional[str]
```

Read it as an interface. `Literal` fields are routing keys. `needs_response` is a control-flow
decision the model makes and your `if` statement consumes. `support_ticket_description` is a side
effect the model is allowed to request. One call does classification, routing, drafting and
escalation, and returns a typed row.

In the recorded run, "website is down again" gets a reply _and_ a ticket, and "you're so evil" gets
`needs_response=False`. The "don't respond to bait" rule is one sentence in the system prompt, and
its effect arrives as a boolean, not a paragraph you have to interpret.

### Field order is chain-of-thought

The course includes a class that looks like a joke: `user_mood`, `internal_monologue`, then
`message`. It's not a joke. JSON fields are generated in order, so every field above `message` is in
context when `message` is written. Put reasoning fields _before_ the output fields and they
condition it. Put them after and they rationalize text that's already committed. The type system
won't warn you either way.

### Two traps

- **The supported schema is smaller than Pydantic.** The course's notes say OpenAI's structured
  output doesn't support `date` fields or regex patterns. You write Python types and silently get
  a smaller language.
- **`Optional[str]` without a default is required.** In Pydantic v2 it means "required, may be
  null." Add `= None` if you mean omittable.

## Retry: validate, then ask again

Instructor moves the guarantee to your client. It parses the response into your model, and if
validation fails, re-prompts with the error attached.

The payoff is the full Pydantic feature set, because Pydantic does the validating, not the
provider. That means dates, regex patterns, nested models and, most importantly, your own validators.
Anything you can write as a Python assertion becomes a retry condition, including cross-field rules
like "end date after start date" that no JSON Schema can express.

**The cost is tokens.** Every retry resends the whole conversation, so three retries cost about four
times the input tokens, not 1.3 times. The course instruments the retry count, and I'd keep that in
production. A retry loop without a counter is a cost you'll find on the invoice.

**It can still fail.** The course's adversarial demo asks for an essay on Dolly Parton, with the
system prompt "Don't give me what I want," against a schema of an enum, an int and a bool. Three
retries, four paid calls, then an exception. Retry gives you a probabilistic guarantee with a token
cost and unbounded tail latency. You're negotiating with the model, and sometimes it declines.

## Constrained decoding: make invalid tokens unreachable

Outlines doesn't check output after generation. It compiles the schema into a finite state machine,
and at each step sets the probability of every token that can't legally come next to zero. Invalid
output isn't rejected. It's unreachable.

The course demonstrates this with **SmolLM2-135M**, a model far too small to follow a "respond only
in JSON" instruction reliably. It produces valid JSON on the first try anyway, because the
constraint moved out of the model's competence and into the decoder.

The best part of the course plots the token distribution at each position, with and without the
constraint. There are three regimes:

1. **Where structure is forced, the constraint does everything.** At position 0 the unconstrained
   model wants to write prose: `Here` at 35.6%. Under the constraint only `{` (90.8%) and `{"`
   (9.2%) survive.
2. **At a field name, it nearly collapses.** `name` goes from 67.3% to 99.7%. The leftover 0.3% is
   spread over `n`, `na`, `nam`, alternate tokenizations that also spell `name`. The machine
   constrains the string, and several token paths produce it.
3. **Inside a free string, it does nothing.** For the person's first name, the constrained and
   unconstrained bars are identical: `John` 7.1% in both.

The third plot answers the first objection people raise. Constrained decoding doesn't make the model
dumber. It clamps the parts that were never the model's decision (braces, quotes, field names) and
leaves the content alone.

Two limits:

- **Valid isn't correct.** `Person(name='John', age=30)` parses perfectly and means nothing. Every
  evaluation problem you had before is still there, now with a type.
- **You need the logits.** This requires local weights or an inference server that exposes the
  output distribution. Behind a closed API it's unavailable, which is why providers run their own
  version of it.

## Beyond JSON: any grammar works

JSON was never special. It's one grammar you can compile to a state machine, and so is a regex, a
fixed list of choices, or a CSV layout.

- A two-item **choice** makes classification exact. `Positive.` with a period is unreachable, so
  there's nothing to clean up.
- A **regex** for phone numbers yields pre-formatted output.
- A tic-tac-toe board regex gets a 135M model to emit a correct grid every time. That isn't a
  language skill. The grammar does the layout, and the model only picks X, O or blank.

**Constraining the reasoning, not just the answer.** The course's GSM8K example builds a grammar of
`Reasoning: <1–2 sentences>` followed by `So the answer is: <1–4 digits>`. The model can't state the
answer first, because the grammar doesn't allow it. Chain-of-thought becomes a shape the output must
have, and extracting the answer is a `split`.

Be careful with the bounds. Capping reasoning at two sentences is fine for grade-school arithmetic.
On a six-step problem you've constrained the model into being wrong, in the correct format.
Constraining the answer's shape is free. Constraining the reasoning's length has an accuracy cost
you should measure.

### A wrong constraint succeeds at the wrong thing

The course's CSV pattern has a typo:

```python
r'Code,Amount,Cost\n([A-Z]{3},[1]*[0-9],1]*[0-9]\.[0-9]{2}\n){1,3}'
#                                        ^ should be [1]*
```

I checked it with `re.match`. `ABC,5,12.50` matches and `ABC,5,7.50` doesn't. The stray bracket makes
the leading `1` mandatory, so every price is silently forced into the 10–19 range. Nothing errors,
`pd.read_csv` is happy, and the model will dutifully produce a thousand rows that obey the typo.
Test a pattern against known-good and known-bad strings before you point a model at it.

## Choosing

|             | Closed APIs       | Custom validators | Failure mode            | Extra cost      |
| ----------- | ----------------- | ----------------- | ----------------------- | --------------- |
| Vendor API  | Yes               | No                | API error / refusal     | None            |
| Retry       | Yes               | Yes               | Exception after N tries | Extra calls     |
| Constrained | No (needs logits) | No                | Can't be invalid        | Grammar compile |

- **Default to the vendor API** when your provider has one and your schema fits its subset.
- **Use retry when validation is the hard part:** business rules and cross-field constraints. Track
  the retry count from day one.
- **Use constrained decoding when you self-host anyway, or the format isn't JSON.** If you own the
  weights it's close to free. For a CSV, a log line or a DSL, it's the only option of the three.

They also compose: vendor structure for the outer envelope, validators over the result, constrained
decoding for the one field nobody's API supports.

The image I'd keep is the position-0 histogram: `Here` at 35.6% unconstrained, zero under
constraint. Every structured-output bug I've written started from assuming the model was _trying_
to produce my schema and got confused. It wasn't. It was trying to write a sentence, and the only
question is where in the stack you stop it.
