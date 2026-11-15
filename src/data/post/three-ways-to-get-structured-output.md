---
title: 'Getting Structured Output From an AI (Part 1)'
excerpt: 'Why programs need neat, structured answers from an AI instead of paragraphs, and the first two ways to get them: let the AI company enforce a form, or check the answer and ask again. Part 1 of 2.'
publishDate: 2026-07-25T00:00:00Z
category: 'LLM Engineering'
image: ~/assets/images/covers/three-ways-to-get-structured-output.svg
series: 'Structured Output'
seriesPart: 1
tags:
  - structured-output
takeaways:
  - 'A program can act on a filled-in form, not on a chatty sentence, so ask the AI for structured output.'
  - 'Describe the form once as a Pydantic class; it becomes the JSON Schema every method uses.'
  - 'Way 1: the AI company enforces the form. Easy, but tied to one provider and only part of JSON.'
  - 'Way 2: check the answer with Pydantic and send the error back for a retry. Works anywhere, but every retry is a full request.'
  - 'The AI fills the form top to bottom, so put "thinking" boxes above the answer box.'
draft: false
---

_Based on DeepLearning.AI's
[Getting Structured LLM Output](https://www.deeplearning.ai/courses/getting-structured-llm-output) course, built with
[.txt](https://dottxt.ai/) and taught by Will Kurt and Cameron Pfiffer. This is part 1 of 2.
[Part 2](/engineering/structured-generation-with-outlines) covers the third way, structured generation._

Ask a friend to read an invoice and tell you who sent it, when it's due and how much it costs. They'll say something
like "Oh, it's from some web company, due at the end of January, about ninety bucks." That's a fine answer for a person.
It's a terrible answer for a computer program, which wants three boxes filled in: **vendor**, **due date**, **total**.

AI models talk like your friend. They write sentences. If your program needs to save the answer in a spreadsheet, sort
it by date, or decide whether to send an alert, a sentence is useless until somebody digs the facts back out of it.

Getting an AI to fill in boxes instead of writing sentences is called **structured output**. The most common format
for those boxes is **JSON**, a plain-text way of writing labels and values inside curly braces, like
`{"name": "Dolly Parton", "age": 79}`.

![Left: the AI answers in a chatty sentence. Right: the same facts in a filled-in form with three labeled boxes.](../../assets/images/structured-output-explained/sentence-vs-form.svg)

## Why not just read the sentence?

The course makes this concrete with a **social media agent**: a program that reads posts people tag your company in,
asks an AI to write a reply, and posts that reply for you.

The first version is simple. The AI writes a reply, and your program passes it along. But you still need to pull the
reply out of whatever the AI wrote, so you write a small **parser**, a few rules that cut the useful part out of the
text. Parsers like this take a long time to write and break easily, because the AI keeps phrasing things in ways you
didn't expect.

Then your boss asks for one small change: **if the post is a complaint, send it to customer support instead of replying
automatically.** Now your parser has to figure out two things from free text: is this a complaint, and what's the
reply? Every new feature makes the parser messier.

If the AI answers with a predictable form instead, the change is one line. The form has a `complaint` box and a
`response` box, and your program checks `if complaint:` the same way it checks any other true-or-false value.

![Top: the AI's free-text answer goes through a fragile hand-written parser that has to guess both "is it a complaint?" and "what's the reply?". Bottom: the AI fills a form with a complaint box and a response box, and a simple if-statement sends it to support or to the social media site.](../../assets/images/structured-output-explained/parser-vs-form.svg)

## Three ways to get a form back

The course sorts the ways to get structured output into three groups, on a journey from "prompt hacking" (rewording
your request until it seems to work) toward real engineering:

![Four steps from left to right: chatting with the AI and hoping, the AI company's JSON feature, re-prompting libraries like Instructor, and structured generation. An arrow underneath runs from "prompt hacking" to "AI engineering".](../../assets/images/structured-output-explained/journey.svg)

1. **Let the AI company enforce it.** Big providers like OpenAI accept a form along with your question and promise to
   fill it in.
2. **Check the answer and ask again.** A library like Instructor checks the AI's answer on your computer. If it's
   wrong, it sends the AI the error and asks for a fix.
3. **Make wrong answers impossible to type.** This is called **structured generation**, and Part 2 covers it.

## First, describe the form

Every method starts with writing down what the form looks like. In Python, people do this with **Pydantic**, a library
that checks data has the right shape. You write a short class, and Pydantic turns it into the official description of a
JSON form (a **JSON Schema**) for you:

```python
from typing import Optional
from pydantic import BaseModel

class User(BaseModel):
    name: str                    # any text
    age: int                     # a whole number
    email: Optional[str] = None  # text, or nothing at all
```

The words `str`, `int` and `Optional[str]` are **types**: they say what kind of value may go in each box. `= None`
means the box can be left out.

![Describe the form once. A short Pydantic class, User with name as text, age as a whole number and an optional email, is turned by Pydantic into a JSON Schema: name is a required string, age a required integer, and email a string or nothing. Way 1 hands that description to the AI company to enforce; Way 2 uses it in your own code to check the answer.](../../assets/images/structured-output-explained/pydantic-to-schema.svg)

## Way 1: Let the AI company enforce it

With OpenAI's Python library, you hand over the class and get back a filled-in `User`, not text:

```python
completion = client.beta.chat.completions.parse(
    model="gpt-4o-mini",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Make up a user."},
    ],
    response_format=User,
)
user = completion.choices[0].message.parsed
```

In the course notebook this came back as `User(name='Alice Johnson', age=34, email='alice.johnson@example.com')`. The
result is a real Python object, so `user.age` is a number you can do math with.

### The social media agent, rebuilt

Here's the form for the social media agent:

```python
from typing import List, Literal, Optional

class Mention(BaseModel):
    product: Literal['app', 'website', 'not_applicable']
    sentiment: Literal['positive', 'negative', 'neutral']
    needs_response: bool
    response: Optional[str]
    support_ticket_description: Optional[str]
```

`Literal[...]` means "pick exactly one of these words." `bool` means true or false. A single question to the AI now
does four jobs at once: it says which product the post is about, judges the mood, decides whether to reply and writes
the reply, and decides whether to open a support ticket.

The notebook ran three posts through it and turned the results straight into a table:

| Post                                                       | product          | sentiment | needs_response | support ticket                            |
| ---------------------------------------------------------- | ---------------- | --------- | -------------- | ----------------------------------------- |
| "@techcorp your app is amazing! The new design is perfect" | `app`            | positive  | `True`         | none                                      |
| "@techcorp website is down again, please fix!"             | `website`        | negative  | `True`         | "User reported that the website is down." |
| "hey @techcorp you're so evil"                             | `not_applicable` | negative  | `False`        | none                                      |

The "don't reply to bait" rule was one sentence in the instructions, and it came back as a plain `False` your program
can act on.

### The order of the boxes matters

The AI fills in the form from top to bottom, one word at a time, and it can see everything it has already written. The
course uses this on purpose with a form for _fake customer posts_ that puts `user_mood` and an `internal_monologue`
list **above** the `message` box:

```python
class UserPostWithExtras(BaseModel):
    user_mood: Literal["awful", "bad", "evil"]
    product: Literal['app', 'website', 'not_applicable']
    sentiment: Literal['positive', 'negative', 'neutral']
    internal_monologue: List[str]
    message: str
```

In the notebook the AI first wrote the mood `awful` and thoughts like "This app is really frustrating me." Only then did
it write the message: "I've been having constant issues with the app crashing on my phone…"

It's like making students show their work before the final answer. Put the "thinking" boxes first. If you put them
after the answer, the AI is just explaining a choice it already made.

![The AI fills in the form from top to bottom and can see what it already wrote. In the fake-customer-post form, user_mood comes first and the AI wrote "awful". Then product and sentiment, then an internal_monologue with thoughts like "This app is really frustrating me." Only then did it write the message: "I've been having constant issues with the app crashing on my phone…" Put the thinking boxes first; after the answer, they only explain a choice already made.](../../assets/images/structured-output-explained/box-order.svg)

### The good and the bad

The good part is that it's easy. If you already use OpenAI, it's a few extra lines.

The two big problems:

- **You're tied to one company.** Code written for OpenAI's version needs rewriting to use someone else's.
- **Only part of Pydantic is allowed.** At the time of the course, OpenAI rejected `date` types and pattern rules like
  "must look like an email address." You write a rich form, and the provider only accepts a simpler one.

## Way 2: Check the answer, and ask again

This is what the library **Instructor** does. The course calls it a **re-prompting** library. It sends your form to the
AI, then checks the answer on your own computer using Pydantic. If a box is wrong, it sends the answer back to the AI
along with the exact error message and asks for a fix. Think of a teacher handing back homework with red marks on it.

![The AI fills in the form. A Pydantic check on your computer looks at it. If it passes, your program gets the result. If it fails, the error goes back to the AI for another try, up to max_retries.](../../assets/images/structured-output-explained/retry-loop.svg)

Instructor works with almost any AI company, including ones that have no structured output feature of their own. The
course uses it with Meta's Llama model hosted on Together AI.

### All of Pydantic is allowed

Because the checking happens on your computer, every Pydantic feature works, including the ones OpenAI rejected. The
course's example turns an event description into a calendar entry:

```python
from datetime import date
from typing import List
from pydantic import BaseModel, Field

class Person(BaseModel):
    name: str

class CalendarEvent(BaseModel):
    name: str
    date: date                                   # a real date
    participants: List[Person]
    address_number: str
    street_name: str
    city_name: str
    state_code: str = Field(pattern=r'[A-Z]{2}') # exactly two capital letters, like OR
    zip_code: str = Field(pattern=r'\d{5}')      # exactly five digits
```

The `pattern=` parts are **regular expressions**, a mini-language for describing what text must look like. `[A-Z]{2}`
means "two capital letters." `\d{5}` means "five digits." If the AI writes `Oregon` or a four-digit zip code, the check
fails and Instructor asks again.

The course fed this the sentence "Alice and Bob are going to a science fair on Friday, January 2024… at Hazeldale
Elementary School at 20080 SW Farmington Road in Beaverton Oregon." The description never mentions a zip code, but the
form has a box for one, so the model has to come up with something. Asking for a box is a way of asking for
information. Just remember that a made-up zip code passes the five-digit check whether it's right or not.

### The bad part: retries cost money and time

- **Retries are expensive.** Every retry resends the whole conversation, so each failed try costs a full request's worth
  of tokens (the small chunks of text AI companies charge by). Your user waits through every one.
- **It can still fail.** There's no guarantee the AI ever gets it right.

The course demonstrates the failure on purpose. The form asks for three simple values:

```python
class Complicated(BaseModel):
    a: Literal["cat", "dog", "hat"]
    b: int
    c: bool
```

The user asks for "a short essay on Dolly Parton," and the system prompt says "Don't give me what I want." With
`max_retries=3`, Instructor tries three times in total, gets an essay each time, and gives up with an
`InstructorRetryException`. Three paid requests, no answer. The example is rigged, but if you call a model thousands of
times, some calls will fail by chance and cost you extra.

## Which one should you use?

|                                | Way 1: AI company      | Way 2: Check and retry          |
| ------------------------------ | ---------------------- | ------------------------------- |
| Works with paid AI services    | Yes, that company only | Yes, almost any of them         |
| Dates, patterns, custom rules  | Limited                | Everything Pydantic can check   |
| Can the answer break the form? | Rarely, with an error  | Yes, after it runs out of tries |
| Extra cost                     | None                   | A full request for every retry  |

- **Start with Way 1** if you use one provider and your form is simple.
- **Use Way 2** when you need dates, patterns or your own rules, or want to switch providers easily. Count your
  retries.

![Which way to use. If you need dates, patterns or custom rules, or want to switch providers easily, use Way 2, check and retry: it works with almost any provider and every Pydantic check, but count your retries, because each is a full request. Otherwise start with Way 1, where the AI company enforces the form: a few extra lines, but tied to one provider and only part of JSON.](../../assets/images/structured-output-explained/which-way-1.svg)

Both ways ask the model to behave, then check whether it did.
[Part 2](/engineering/structured-generation-with-outlines) shows the third way, which makes a broken form impossible to
write at all.
