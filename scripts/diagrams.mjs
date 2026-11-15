// Draws the post diagrams into src/assets/images/<folder>/<name>.svg from one set of shapes and colours.
// Run: node scripts/diagrams.mjs   (then render and look at each one before publishing)
//
// Colours carry meaning in every diagram:
//   model  (blue)   the LLM: a model call or what it writes
//   code   (green)  your code or a tool that runs
//   data   (grey)   messages, state, documents, inputs and outputs
//   choice (amber)  a decision or a branch
//   note   (plain)  a label with no box
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const OUT = 'src/assets/images';
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const INK = '#0f172a';
const MUTED = '#64748b';
const KIND = {
  model: { fill: '#eef0fe', stroke: '#1f2de6', ink: '#1a24b8' },
  code: { fill: '#e9f7ef', stroke: '#15803d', ink: '#14532d' },
  data: { fill: '#f8fafc', stroke: '#94a3b8', ink: INK },
  choice: { fill: '#fff7e6', stroke: '#b45309', ink: '#7c2d12' },
  bad: { fill: '#fdecec', stroke: '#b91c1c', ink: '#7f1d1d' },
  ghost: { fill: '#ffffff', stroke: '#cbd5e1', ink: MUTED },
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * A line of text. A leading "*" makes it bold and a leading "`" makes it all monospace;
 * inside the line, `like this` marks a monospace part.
 */
export const text = (x, y, s, o = {}) => {
  let str = String(s);
  let mono = o.mono;
  let bold = o.bold;
  if (str.startsWith('*')) {
    bold = true;
    str = str.slice(1);
  }
  if (str.startsWith('`') && str.indexOf('`', 1) === -1) {
    mono = true;
    str = str.slice(1);
  }
  const size = o.size ?? (mono ? 12.5 : 14);
  const body = str.includes('`')
    ? str
        .split('`')
        .map((part, i) =>
          i % 2 ? `<tspan font-family="${MONO}" font-size="${size - 1}">${esc(part)}</tspan>` : esc(part)
        )
        .join('')
    : esc(str);
  return `<text x="${x}" y="${y}" font-family="${mono ? MONO : FONT}" font-size="${size}" font-weight="${bold ? 650 : 400}" fill="${o.fill ?? INK}" text-anchor="${o.anchor ?? 'middle'}"${o.italic ? ' font-style="italic"' : ''}>${body}</text>`;
};

/** A box with centred lines of text. The first line is bold unless `plain`. */
export const box = (x, y, w, h, kind, lines = [], o = {}) => {
  const k = KIND[kind];
  const lh = o.lh ?? 19;
  const top = y + h / 2 - ((lines.length - 1) * lh) / 2 + 5;
  const ax = o.align === 'left' ? x + 14 : x + w / 2;
  return (
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.rx ?? 10}" fill="${k.fill}" stroke="${k.stroke}" stroke-width="1.5"${o.dashed ? ' stroke-dasharray="6 5"' : ''}/>` +
    lines
      .map((l, i) =>
        text(ax, top + i * lh, i === 0 && !o.plain && !String(l).startsWith('`') ? `*${l}` : l, {
          fill: i === 0 ? k.ink : INK,
          anchor: o.align === 'left' ? 'start' : 'middle',
          size: o.size,
        })
      )
      .join('')
  );
};

/** A diamond for a decision, with one or two short lines inside. */
export const diamond = (cx, cy, rx, ry, lines = []) =>
  `<path d="M${cx - rx} ${cy}L${cx} ${cy - ry}L${cx + rx} ${cy}L${cx} ${cy + ry}Z" fill="${KIND.choice.fill}" stroke="${KIND.choice.stroke}" stroke-width="1.5"/>` +
  lines
    .map((l, i) => text(cx, cy + 5 + (i - (lines.length - 1) / 2) * 17, l, { fill: KIND.choice.ink, size: 13 }))
    .join('');

/** An arrow along points [[x,y],...]; `label` is drawn at `at` (default: the middle of the first segment). */
export const arrow = (pts, o = {}) => {
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join('');
  const [x1, y1] = pts[0];
  const [x2, y2] = pts[1];
  const [lx, ly] = o.at ?? [(x1 + x2) / 2, (y1 + y2) / 2 - 8];
  return (
    `<path d="${d}" fill="none" stroke="${o.stroke ?? '#64748b'}" stroke-width="1.6"${o.dashed ? ' stroke-dasharray="5 5"' : ''} marker-end="url(#arrow)" stroke-linejoin="round"/>` +
    (o.label ? text(lx, ly, o.label, { fill: o.labelFill ?? MUTED, size: 12.5, anchor: o.anchor }) : '')
  );
};

/** A curved arrow from (x1,y1) to (x2,y2) through control point (cx,cy). */
export const curve = (x1, y1, cx, cy, x2, y2, o = {}) =>
  `<path d="M${x1} ${y1}Q${cx} ${cy} ${x2} ${y2}" fill="none" stroke="${o.stroke ?? '#64748b'}" stroke-width="1.6"${o.dashed ? ' stroke-dasharray="5 5"' : ''} marker-end="url(#arrow)"/>` +
  (o.label ? text(o.at?.[0] ?? cx, o.at?.[1] ?? cy, o.label, { fill: MUTED, size: 12.5 }) : '');

export const note = (x, y, s, o = {}) => text(x, y, s, { fill: MUTED, size: 12.5, ...o });

const svg = (
  w,
  h,
  title,
  body
) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="t">
<title id="t">${esc(title)}</title>
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#64748b"/></marker></defs>
<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="12" fill="#ffffff" stroke="#e2e8f0"/>
${body}
</svg>
`;

// --- diagrams, keyed by output path under src/assets/images ---
const DIAGRAMS = {
  'langgraph-1/tool-call-idea.svg': {
    w: 760,
    h: 250,
    title:
      'You ask "What is 2 times 3?". The model does not calculate: it writes a request naming the multiply tool with a = 2 and b = 3. Your program runs multiply(2, 3) and gets 6. Choosing the tool and filling in the request is the model\'s job; running it is yours.',
    body: () =>
      box(20, 80, 140, 64, 'data', ['Your question', '"What is 2 × 3?"']) +
      arrow([
        [160, 112],
        [196, 112],
      ]) +
      box(198, 80, 110, 64, 'model', ['Model']) +
      arrow([
        [308, 112],
        [344, 112],
      ]) +
      box(346, 70, 180, 84, 'data', ['Tool request', '`name: multiply', '`args: {a: 2, b: 3}']) +
      arrow([
        [526, 112],
        [562, 112],
      ]) +
      box(564, 80, 176, 64, 'code', ['Your program', '`multiply(2, 3) → 6']) +
      `<path d="M198 186H526" stroke="${KIND.model.stroke}" stroke-width="3"/>` +
      note(362, 210, "The model's job: choose the tool and fill in the form", { fill: KIND.model.ink }) +
      `<path d="M564 186H740" stroke="${KIND.code.stroke}" stroke-width="3"/>` +
      note(652, 210, 'Your job: run it', { fill: KIND.code.ink }) +
      note(380, 40, 'The model never runs anything. It writes a request.', { size: 14, fill: INK }),
  },

  'langgraph-1/tool-parts.svg': {
    w: 760,
    h: 270,
    title:
      'A tool has four parts. The name, the description and the input schema form the order slip the model reads. The function, the code that runs, stays in your program and the model never sees it.',
    body: () =>
      `<rect x="20" y="40" width="430" height="210" rx="12" fill="#ffffff" stroke="${KIND.model.stroke}" stroke-dasharray="6 5"/>` +
      text(235, 66, '*What the model sees: the order slip', { fill: KIND.model.ink }) +
      box(40, 84, 390, 44, 'data', ['name   `tavily_search`'], { align: 'left', plain: true }) +
      box(40, 136, 390, 44, 'data', ['description   "A search engine optimized for…"'], {
        align: 'left',
        plain: true,
      }) +
      box(40, 188, 390, 44, 'data', ['schema   `query, include_domains, topic, …`'], { align: 'left', plain: true }) +
      `<rect x="480" y="40" width="260" height="210" rx="12" fill="#ffffff" stroke="${KIND.code.stroke}" stroke-dasharray="6 5"/>` +
      text(610, 66, '*Only your program sees', { fill: KIND.code.ink }) +
      box(500, 84, 220, 148, 'code', [
        'function',
        'the code that runs:',
        'calls the search API',
        'and returns results',
      ]),
  },

  'langgraph-1/offer-vs-forced.svg': {
    w: 760,
    h: 300,
    title:
      'A tool is an offer. The question goes to a model with the search tool attached, and the code checks one thing: is tool_calls empty? In my run with gpt-5.4-mini it was empty, and the model answered directly: Cabernet Sauvignon. In the course run with gpt-4o-mini it held two searches, which your code runs first. Setting tool_choice to "any" removes the empty branch: the model must call a tool.',
    body: () =>
      box(20, 120, 150, 60, 'data', ['"Recommend a wine', 'that goes with steak."'], { plain: true }) +
      arrow([
        [170, 150],
        [198, 150],
      ]) +
      box(200, 114, 180, 72, 'model', ['Model + tools', '`bind_tools([search])']) +
      arrow([
        [380, 150],
        [400, 150],
      ]) +
      diamond(468, 150, 66, 50, ['tool_calls', 'empty?']) +
      arrow(
        [
          [534, 150],
          [560, 150],
          [560, 76],
          [580, 76],
        ],
        { label: 'yes', at: [548, 108] }
      ) +
      arrow(
        [
          [534, 150],
          [560, 150],
          [560, 224],
          [580, 224],
        ],
        { label: 'no', at: [548, 200] }
      ) +
      box(582, 44, 158, 64, 'model', ['Answer directly', '"Cabernet Sauvignon"']) +
      note(661, 126, 'my run, gpt-5.4-mini') +
      box(582, 192, 158, 64, 'code', ['Run the tools first', '2 searches']) +
      note(661, 274, 'course run, gpt-4o-mini') +
      note(290, 228, '`tool_choice="any"', { fill: KIND.choice.ink }) +
      note(290, 246, 'removes the "yes" path'),
  },

  'langgraph-1/three-ways.svg': {
    w: 760,
    h: 320,
    title:
      'Three ways to run the same tool call, which has a name, args and an id. One: invoke with only the args, and you get the raw search results with no id. Two: invoke with the whole tool call, and LangChain returns a ToolMessage with the id copied over; this is the one to remember. Three: build the ToolMessage yourself from the raw results and the id.',
    body: () =>
      box(20, 120, 170, 84, 'model', ['Tool call', '`name: tavily_search', '`args: {query: …}', '`id: call_5lPOU0…']) +
      [
        ['1', '`web_search.invoke(args)', 'data', ['Raw search results', 'no id attached'], 36],
        ['2', '`web_search.invoke(tool_call)', 'code', ['ToolMessage', 'id copied over for you'], 128],
        ['3', '`ToolMessage(str(raw), tool_call_id=id)', 'data', ['ToolMessage', 'you copy the id yourself'], 220],
      ]
        .map(
          ([n, call, kind, lines, y]) =>
            arrow([
              [190, 162],
              [230, y + 32],
            ]) +
            box(232, y, 300, 64, 'ghost', [`${n}.  ${call}\``], { plain: true, size: 13 }) +
            arrow([
              [532, y + 32],
              [556, y + 32],
            ]) +
            box(558, y, 182, 64, kind, lines)
        )
        .join('') +
      note(646, 306, 'Option 2 is the one to remember', { fill: KIND.code.ink }),
  },

  'langgraph-1/tool-decorator.svg': {
    w: 760,
    h: 300,
    title:
      'How the @tool decorator fills in the order slip from a plain function, one part at a time. The function name, blog_search, becomes the tool name. The type hint query: str becomes the schema. The docstring becomes the description. The function body stays code that the model never sees.',
    body: () =>
      text(20, 30, '*`@tool` reads a plain function and fills in the order slip', { anchor: 'start' }) +
      [
        ['`def blog_search(query: str):', 'the function name', ['name', '`blog_search']],
        ['`query: str', 'the type hint', ['schema', '`query: string']],
        ['`"""Search Naver blog posts. Use this for…"""', 'the docstring', ['description', 'the docstring text']],
      ]
        .map(
          ([code, part, slip], i) =>
            box(20, 50 + i * 70, 420, 56, 'data', [code, part], { align: 'left', plain: true, size: 12.5 }) +
            arrow([
              [440, 78 + i * 70],
              [494, 78 + i * 70],
            ]) +
            box(496, 50 + i * 70, 244, 56, 'model', slip)
        )
        .join('') +
      note(380, 282, 'The body, `requests.get(…)` and `return […]`, stays code the model never sees', {
        fill: KIND.code.ink,
      }),
  },

  'langgraph-1/few-shot-stack.svg': {
    w: 760,
    h: 300,
    title:
      'What the model receives for a few-shot tool prompt, top to bottom: the system message saying which tool is for what; the examples, a whole fake conversation where the assistant calls search_menu, then tavily_search, then blog_search for the truffle risotto; and last the real question. The model answers with the tool calls it wants, for example search_menu("pasta dish") for "Do you have a pasta dish?".',
    body: () =>
      box(
        20,
        30,
        420,
        50,
        'data',
        ['System message', 'menu → `search_menu` · facts → `tavily_search` · reviews → `blog_search`'],
        {
          lh: 18,
          size: 11.5,
        }
      ) +
      `<rect x="20" y="92" width="420" height="138" rx="10" fill="#ffffff" stroke="#94a3b8" stroke-dasharray="6 5"/>` +
      text(36, 114, '*Examples: a fake conversation', { anchor: 'start' }) +
      box(36, 126, 388, 26, 'data', ['user: truffle risotto price, features, reviews?'], {
        plain: true,
        size: 12.5,
        rx: 6,
      }) +
      box(36, 158, 124, 26, 'model', ['`search_menu'], { rx: 6 }) +
      box(168, 158, 124, 26, 'model', ['`tavily_search'], { rx: 6 }) +
      box(300, 158, 124, 26, 'model', ['`blog_search'], { rx: 6 }) +
      box(36, 192, 388, 26, 'data', ['assistant: final answer built from all three'], {
        plain: true,
        size: 12.5,
        rx: 6,
      }) +
      box(20, 242, 420, 40, 'data', ['Real question: "Do you have a pasta dish?"'], { plain: true }) +
      arrow([
        [440, 156],
        [500, 156],
      ]) +
      box(500, 124, 96, 64, 'model', ['Model']) +
      arrow([
        [596, 156],
        [618, 156],
      ]) +
      box(620, 112, 120, 88, 'code', ['Tool call', '`search_menu', '`"pasta dish"'], { size: 12 }),
  },
  'langgraph-2/three-pieces.svg': {
    w: 760,
    h: 300,
    title:
      'The three pieces of a StateGraph, drawn as a kitchen. Nodes are stations: Python functions that each do one job. Edges are the route the ticket takes from START through each node to END. The state is the order ticket: one shared record every node reads, and each node returns an update that is written back onto it.',
    body: () =>
      `<circle cx="70" cy="90" r="34" fill="${KIND.data.fill}" stroke="${KIND.data.stroke}" stroke-width="1.5"/>` +
      text(70, 95, 'START', { size: 12, bold: true }) +
      arrow(
        [
          [104, 90],
          [168, 90],
        ],
        { label: 'edge' }
      ) +
      box(170, 58, 170, 64, 'code', ['Node', 'a station: one job']) +
      arrow(
        [
          [340, 90],
          [418, 90],
        ],
        { label: 'edge' }
      ) +
      box(420, 58, 170, 64, 'code', ['Node', 'another station']) +
      arrow(
        [
          [590, 90],
          [654, 90],
        ],
        { label: 'edge' }
      ) +
      `<circle cx="690" cy="90" r="34" fill="${KIND.data.fill}" stroke="${KIND.data.stroke}" stroke-width="1.5"/>` +
      text(690, 95, 'END', { size: 12, bold: true }) +
      arrow(
        [
          [230, 196],
          [230, 126],
        ],
        { dashed: true }
      ) +
      arrow(
        [
          [280, 126],
          [280, 196],
        ],
        { dashed: true }
      ) +
      note(222, 166, 'reads', { anchor: 'end' }) +
      note(288, 166, 'returns an update', { anchor: 'start' }) +
      arrow(
        [
          [480, 196],
          [480, 126],
        ],
        { dashed: true }
      ) +
      arrow(
        [
          [530, 126],
          [530, 196],
        ],
        { dashed: true }
      ) +
      note(472, 166, 'reads', { anchor: 'end' }) +
      note(538, 166, 'returns an update', { anchor: 'start' }) +
      box(140, 200, 480, 74, 'data', [
        'State: the order ticket',
        'one shared record, e.g. `{query, documents, grade}`',
        'every node sees all of it',
      ]),
  },
  'langgraph-2/smallest-graph.svg': {
    w: 760,
    h: 250,
    title:
      'The smallest graph. The state goes in as text "Hello", START leads to the one node, the node returns only the field it changed, text "Nice to meet you", LangGraph merges that into the state, and at END the state comes out as text "Nice to meet you".',
    body: () =>
      box(20, 60, 150, 60, 'data', ['State in', '`{"text": "Hello"}']) +
      arrow([
        [170, 90],
        [204, 90],
      ]) +
      `<circle cx="238" cy="90" r="32" fill="${KIND.data.fill}" stroke="${KIND.data.stroke}" stroke-width="1.5"/>` +
      text(238, 95, 'START', { size: 12, bold: true }) +
      arrow([
        [270, 90],
        [304, 90],
      ]) +
      box(306, 60, 140, 60, 'code', ['node', '`def node(state)`']) +
      arrow([
        [446, 90],
        [480, 90],
      ]) +
      `<circle cx="514" cy="90" r="32" fill="${KIND.data.fill}" stroke="${KIND.data.stroke}" stroke-width="1.5"/>` +
      text(514, 95, 'END', { size: 12, bold: true }) +
      arrow([
        [546, 90],
        [572, 90],
      ]) +
      box(574, 50, 166, 80, 'data', ['State out', '`{"text":', '`"Nice to meet you"}']) +
      arrow(
        [
          [376, 120],
          [376, 160],
        ],
        { dashed: true }
      ) +
      box(236, 162, 280, 60, 'code', ['returns only what changed', '`{"text": "Nice to meet you"}'], { size: 13 }) +
      note(528, 186, 'LangGraph merges it', { anchor: 'start' }) +
      note(528, 204, 'into the state', { anchor: 'start' }),
  },
  'langgraph-2/add-messages.svg': {
    w: 760,
    h: 290,
    title:
      'Two reducers for a messages list that holds a human message with id 1 and an AI message with id 2. A node returns an edited AI message that reuses id 2. With operator.add it is appended, so the list ends with both the old and the edited copy. With add_messages the message with id 2 is replaced, so the list keeps one copy, the edited one. A message with a new id is appended by both.',
    body: () =>
      note(
        380,
        36,
        'The list holds Human (id 1) and AI (id 2). A node returns an edited AI message that reuses id 2.',
        { fill: INK, size: 13.5 }
      ) +
      `<rect x="20" y="60" width="350" height="210" rx="10" fill="#ffffff" stroke="#cbd5e1"/>` +
      text(195, 88, '*`operator.add`: always append') +
      box(40, 104, 310, 36, 'data', ['Human  ·  id 1'], { plain: true, rx: 6 }) +
      box(40, 148, 310, 36, 'model', ['AI  ·  id 2  (old)'], { plain: true, rx: 6 }) +
      box(40, 192, 310, 36, 'model', ['AI  ·  id 2  (edited)'], { plain: true, rx: 6 }) +
      note(195, 254, 'two copies of message 2', { fill: KIND.bad.ink }) +
      `<rect x="390" y="60" width="350" height="210" rx="10" fill="#ffffff" stroke="#cbd5e1"/>` +
      text(565, 88, '*`add_messages`: append, or update by id') +
      box(410, 104, 310, 36, 'data', ['Human  ·  id 1'], { plain: true, rx: 6 }) +
      box(410, 148, 310, 36, 'model', ['AI  ·  id 2  (edited)'], { plain: true, rx: 6 }) +
      note(565, 254, 'one copy, updated in place', { fill: KIND.code.ink }),
  },
  'langgraph-3/react-cycle.svg': {
    w: 652,
    h: 300,
    title:
      'The ReAct cycle. Reason: the model reads everything so far and decides. If it asks for a tool, that is Act, a tool call. The tool result, a ToolMessage, is the Observation, which goes back to Reason. When the model replies with no tool calls, the loop ends with the answer.',
    body: () =>
      box(40, 116, 190, 76, 'model', ['Reason', 'the model reads it all', 'and decides']) +
      curve(230, 136, 320, 50, 410, 92, { at: [320, 56] }) +
      note(318, 74, 'asks for a tool') +
      box(412, 56, 200, 70, 'code', ['Act', 'a tool call runs']) +
      arrow([
        [512, 126],
        [512, 182],
      ]) +
      box(412, 184, 200, 70, 'data', ['Observe', 'the result: a `ToolMessage`']) +
      curve(412, 230, 320, 262, 232, 178, {}) +
      note(318, 284, 'goes back to the model') +
      arrow([
        [135, 192],
        [135, 236],
      ]) +
      note(135, 256, 'no tool calls: the answer', { fill: KIND.model.ink }),
  },
  'langgraph-3/steak-trace.svg': {
    w: 760,
    h: 270,
    title:
      'My run of the ready-made agent, one lap of the cycle. The human asks how much the steak dishes are. The AI makes one tool call, search_menu with "steak dishes and prices". The tool returns two entries: Signature Steak at 35,000 won and Tenderloin Steak Salad at 26,000 won. The AI answers with both prices.',
    body: () =>
      [
        ['data', 'Human', '"How much are the steak dishes on the menu?"'],
        ['model', 'AI', 'tool call `search_menu("steak dishes and prices")`'],
        ['code', 'Tool', 'Signature Steak ₩35,000 · Tenderloin Steak Salad ₩26,000'],
        ['model', 'AI', '"Signature Steak — ₩35,000, Tenderloin Steak Salad — ₩26,000"'],
      ]
        .map(
          ([kind, who, what], i) =>
            box(30, 24 + i * 58, 100, 44, kind, [who]) +
            text(150, 51 + i * 58, what, { anchor: 'start' }) +
            (i < 3
              ? arrow([
                  [80, 68 + i * 58],
                  [80, 80 + i * 58],
                ])
              : '')
        )
        .join('') + note(380, 256, 'act, observe, answer: one lap was enough, because one search held everything'),
  },
  'langgraph-3/toolnode.svg': {
    w: 760,
    h: 290,
    title:
      'What ToolNode does. 1: it finds the tool requests in the tool_calls of the latest AIMessage, here a menu search and a web search. 2: it runs them, at the same time when there are several. 3: it wraps each result in a ToolMessage carrying its call id. 4: it adds those to the conversation, so the model sees them on its next turn.',
    body: () =>
      box(20, 96, 170, 96, 'model', ['Latest AIMessage', '`tool_calls:', '`search_menu  id a', '`tavily_search id b'], {
        size: 12,
        lh: 18,
      }) +
      note(105, 222, '1. find the requests') +
      arrow([
        [190, 124],
        [250, 96],
      ]) +
      arrow([
        [190, 164],
        [250, 196],
      ]) +
      box(252, 66, 150, 56, 'code', ['run `search_menu']) +
      box(252, 168, 150, 56, 'code', ['run `tavily_search']) +
      note(327, 252, '2. run them at the same time') +
      arrow([
        [402, 94],
        [454, 94],
      ]) +
      arrow([
        [402, 196],
        [454, 196],
      ]) +
      box(456, 66, 150, 56, 'data', ['ToolMessage', '`tool_call_id: a'], { lh: 18 }) +
      box(456, 168, 150, 56, 'data', ['ToolMessage', '`tool_call_id: b'], { lh: 18 }) +
      note(531, 252, '3. wrap each result') +
      arrow([
        [606, 94],
        [652, 130],
      ]) +
      arrow([
        [606, 196],
        [652, 160],
      ]) +
      box(654, 104, 86, 82, 'data', ['messages', '+2'], { size: 13 }) +
      note(697, 222, '4. append'),
  },
  'langgraph-4/adaptive-rag.svg': {
    w: 760,
    h: 300,
    title:
      'Adaptive RAG. A question first goes to a judge that rates how complex it is. A simple question, like the capital of France, is answered by the model alone. A medium one, like the price of the Signature Steak, gets one search, then an answer. A complex one, like which wine suits the lobster bisque for someone who dislikes oak, gets several rounds of searching and reasoning.',
    body: () =>
      box(20, 120, 120, 60, 'data', ['Question']) +
      arrow([
        [140, 150],
        [176, 150],
      ]) +
      box(178, 112, 130, 76, 'choice', ['Judge', 'how complex', 'is it?']) +
      [
        ['simple', 'model', 'Answer with the model alone', '"Capital of France?"', 34],
        ['medium', 'code', 'Search once, then answer', '"Price of the Signature Steak?"', 118],
        ['complex', 'code', 'Search and reason, several rounds', '"Wine for the bisque, no oak?"', 202],
      ]
        .map(
          ([label, kind, what, eg, y]) =>
            arrow([
              [308, 150],
              [340, 150],
              [340, y + 32],
              [428, y + 32],
            ]) +
            note(356, y + 24, label, { anchor: 'start' }) +
            box(430, y, 310, 64, kind, [what, eg], { size: 13 })
        )
        .join(''),
  },
  'langgraph-4/hitl-graph.svg': {
    w: 760,
    h: 320,
    title:
      'The graph used for the breakpoint runs. START, then agent, the model with search_menu. If it asks for a tool, retrieve runs the search; if not, END. After retrieve, grade_documents asks whether the results are relevant. Relevant: generate writes the answer, then END. Not relevant: rewrite rewords the question and goes back to agent, until num_generations reaches 2. The breakpoints stop the graph just before retrieve and just before generate.',
    body: () => {
      const pause = (x, y) =>
        `<rect x="${x - 15}" y="${y - 15}" width="30" height="30" rx="15" fill="${KIND.bad.fill}" stroke="${KIND.bad.stroke}"/>` +
        `<rect x="${x - 6}" y="${y - 7}" width="4" height="14" fill="${KIND.bad.stroke}"/><rect x="${x + 2}" y="${y - 7}" width="4" height="14" fill="${KIND.bad.stroke}"/>`;
      return (
        `<circle cx="52" cy="120" r="30" fill="${KIND.data.fill}" stroke="${KIND.data.stroke}" stroke-width="1.5"/>` +
        text(52, 125, 'START', { size: 12, bold: true }) +
        arrow([
          [82, 120],
          [110, 120],
        ]) +
        box(112, 88, 160, 64, 'model', ['agent', 'model + `search_menu`'], { size: 12.5 }) +
        arrow(
          [
            [272, 120],
            [334, 120],
          ],
          { label: 'tool call', at: [298, 110] }
        ) +
        pause(304, 152) +
        box(336, 88, 126, 64, 'code', ['retrieve', 'runs the search']) +
        arrow([
          [462, 120],
          [494, 120],
        ]) +
        diamond(560, 120, 64, 46, ['relevant?']) +
        arrow(
          [
            [624, 120],
            [656, 120],
          ],
          { label: 'yes' }
        ) +
        box(658, 88, 82, 64, 'model', ['generate']) +
        pause(642, 152) +
        arrow([
          [699, 152],
          [699, 232],
        ]) +
        `<circle cx="699" cy="262" r="28" fill="${KIND.data.fill}" stroke="${KIND.data.stroke}" stroke-width="1.5"/>` +
        text(699, 267, 'END', { size: 12, bold: true }) +
        arrow(
          [
            [560, 166],
            [560, 230],
          ],
          { label: 'no', at: [574, 204] }
        ) +
        box(470, 232, 170, 64, 'model', ['rewrite', 'reword the question'], { size: 12.5 }) +
        arrow([
          [470, 264],
          [192, 264],
          [192, 154],
        ]) +
        note(330, 254, 'back to agent, until `num_generations` = 2') +
        arrow(
          [
            [192, 88],
            [192, 46],
            [270, 46],
          ],
          { label: 'no tool call', at: [232, 36] }
        ) +
        `<circle cx="296" cy="46" r="24" fill="${KIND.data.fill}" stroke="${KIND.data.stroke}" stroke-width="1.5"/>` +
        text(296, 51, 'END', { size: 12, bold: true }) +
        note(52, 196, 'red pauses:', { fill: KIND.bad.ink }) +
        note(52, 214, 'the breakpoints', { fill: KIND.bad.ink })
      );
    },
  },
  'langgraph-4/interrupt-vs-breakpoint.svg': {
    w: 760,
    h: 300,
    title:
      "Two ways to pause. A breakpoint is set from outside at compile time with interrupt_before, always stops in front of the same nodes, and continues with stream(None, thread). interrupt() is called inside a node: the node pauses and hands the person a payload, here about_to_search: signature dish; the person resumes with Command(resume=...), here the query chef's signature steak, and that value becomes the return value of interrupt(), so the node carries on with it.",
    body: () =>
      text(30, 40, '*Breakpoint: set from outside', { anchor: 'start' }) +
      box(30, 56, 252, 60, 'data', ['compile(', '`interrupt_before=["retrieve"])'], { plain: true, size: 12 }) +
      arrow([
        [282, 86],
        [306, 86],
      ]) +
      box(308, 56, 110, 60, 'model', ['agent runs']) +
      arrow([
        [418, 86],
        [446, 86],
      ]) +
      box(448, 56, 120, 60, 'bad', ['pause', 'before retrieve']) +
      arrow([
        [568, 86],
        [602, 86],
      ]) +
      box(604, 56, 136, 60, 'code', ['`stream(None)', 'carries on'], { size: 12 }) +
      `<path d="M30 146H740" stroke="#e2e8f0"/>` +
      text(30, 182, '*`interrupt()`: called inside a node', { anchor: 'start' }) +
      box(30, 198, 170, 76, 'code', ['`human_review`', 'node runs'], { size: 12.5 }) +
      arrow([
        [200, 236],
        [234, 236],
      ]) +
      box(236, 198, 170, 76, 'bad', ['`interrupt(payload)`', '`about_to_search:`', '`"signature dish"`'], {
        size: 12,
      }) +
      arrow([
        [406, 236],
        [440, 236],
      ]) +
      box(442, 198, 150, 76, 'data', ['A person replies', '`Command(resume=…)`'], { size: 12 }) +
      arrow([
        [592, 236],
        [616, 236],
      ]) +
      box(618, 198, 122, 76, 'code', ['node continues', 'query: "chef\'s', 'signature steak"'], { size: 12 }),
  },
  'langgraph-5/self-rag-steps.svg': {
    w: 760,
    h: 230,
    title:
      'Self-RAG in five steps. Search for the question, write a first answer, check the answer for quality, relevance and accuracy, then decide: if it is good enough, stop; if not, search for more or rewrite, and go around again.',
    body: () =>
      box(20, 50, 120, 64, 'code', ['1. Search']) +
      arrow([
        [140, 82],
        [174, 82],
      ]) +
      box(176, 50, 130, 64, 'model', ['2. Answer']) +
      arrow([
        [306, 82],
        [340, 82],
      ]) +
      box(342, 42, 150, 80, 'model', ['3. Self-check', 'quality, relevance,', 'accuracy'], { size: 12.5, lh: 17 }) +
      arrow([
        [492, 82],
        [526, 82],
      ]) +
      diamond(600, 82, 72, 52, ['4. good', 'enough?']) +
      arrow(
        [
          [672, 82],
          [700, 82],
        ],
        { label: 'yes' }
      ) +
      text(722, 87, '*done', { fill: KIND.code.ink, size: 13 }) +
      arrow(
        [
          [600, 134],
          [600, 182],
          [80, 182],
          [80, 116],
        ],
        { label: '5. no: search for more or rewrite, and repeat', at: [340, 172] }
      ),
  },
  'langgraph-5/two-stage-check.svg': {
    w: 760,
    h: 300,
    title:
      'How grade_generation checks an answer in two stages. Stage 1, the hallucination grader: is everything in the answer supported by the documents? No: "not supported", write the answer again. In my run the first tiramisu answer said it "comes from Italy" and was sent back. Yes: stage 2, the answer grader: does it answer the question? No: "not useful", reword the question and search again. Yes: "useful", done.',
    body: () =>
      box(20, 110, 130, 64, 'model', ['Answer', 'from `generate`']) +
      arrow([
        [150, 142],
        [184, 142],
      ]) +
      diamond(272, 142, 86, 56, ['1. supported by', 'the documents?']) +
      arrow(
        [
          [358, 142],
          [404, 142],
        ],
        { label: 'yes' }
      ) +
      diamond(492, 142, 86, 56, ['2. answers the', 'question?']) +
      arrow(
        [
          [578, 142],
          [616, 142],
        ],
        { label: 'yes' }
      ) +
      box(618, 110, 122, 64, 'code', ['"useful"', 'done']) +
      arrow(
        [
          [272, 198],
          [272, 222],
        ],
        { label: 'no', at: [286, 214] }
      ) +
      box(172, 224, 200, 60, 'bad', ['"not supported"', 'write the answer again'], { size: 12.5 }) +
      arrow(
        [
          [492, 198],
          [492, 222],
        ],
        { label: 'no', at: [506, 214] }
      ) +
      box(392, 224, 200, 60, 'choice', ['"not useful"', 'reword, search again'], { size: 12.5 }) +
      note(272, 50, 'my run: "tiramisu comes from Italy" was not in the', { fill: KIND.bad.ink }) +
      note(272, 68, 'menu entry, so it was sent back and rewritten', { fill: KIND.bad.ink }),
  },
  'langgraph-5/fan-out.svg': {
    w: 760,
    h: 380,
    title:
      'Fan-out and fan-in. START has edges to search_menu, search_web and search_wiki, so all three run in the same step; their edges meet at filter_documents, which waits for all three. The three searches write to one field, search_results, which needs the add reducer: without it, my run raised InvalidUpdateError. filter_documents writes its keepers to a separate field, documents, because writing back into the add field would append them on top of the raw results.',
    body: () =>
      `<circle cx="56" cy="130" r="30" fill="${KIND.data.fill}" stroke="${KIND.data.stroke}" stroke-width="1.5"/>` +
      text(56, 135, 'START', { size: 12, bold: true }) +
      ['search_menu', 'search_web', 'search_wiki']
        .map(
          (n, i) =>
            arrow([
              [86, 130],
              [176, 56 + i * 74],
            ]) +
            box(178, 30 + i * 74, 150, 52, 'code', [`\`${n}`]) +
            arrow([
              [328, 56 + i * 74],
              [430, 130],
            ])
        )
        .join('') +
      note(130, 248, 'fan-out: all three', { anchor: 'middle' }) +
      note(130, 266, 'run in the same step') +
      box(432, 98, 150, 64, 'model', ['`filter_documents', 'waits for all three'], { size: 12.5 }) +
      note(507, 186, 'fan-in') +
      arrow([
        [582, 130],
        [624, 130],
      ]) +
      `<circle cx="656" cy="130" r="30" fill="${KIND.data.fill}" stroke="${KIND.data.stroke}" stroke-width="1.5"/>` +
      text(656, 135, 'END', { size: 12, bold: true }) +
      box(232, 296, 250, 64, 'data', ['`search_results: Annotated[list, add]`', 'the three searches add here'], {
        size: 12,
      }) +
      box(498, 296, 242, 64, 'data', ['`documents: list`', 'the filter writes keepers here'], { size: 12 }) +
      note(357, 284, 'no reducer: InvalidUpdateError', { fill: KIND.bad.ink }) +
      note(619, 284, 'own field: no duplicates', { fill: KIND.code.ink }),
  },
  'langgraph-6/crag-idea.svg': {
    w: 760,
    h: 290,
    title:
      'How CRAG treats search results. The paper sorts them three ways: correct results are refined to the useful pieces, incorrect ones are replaced by a web search, and ambiguous ones get both. The course keeps it simpler: keep or drop each result, refine what is kept, and search the web only if nothing useful is left.',
    body: () =>
      text(30, 40, '*The paper: three verdicts', { anchor: 'start' }) +
      box(30, 56, 130, 56, 'data', ['Search results']) +
      arrow([
        [160, 84],
        [194, 84],
      ]) +
      diamond(256, 84, 60, 38, ['grade']) +
      [
        ['correct', 'code', 'refine to the useful pieces', 30],
        ['ambiguous', 'choice', 'refine and search the web', 84],
        ['incorrect', 'bad', 'replace with a web search', 138],
      ]
        .map(
          ([v, kind, what, y]) =>
            arrow([
              [316, 84],
              [340, 84],
              [340, y + 22],
              [446, y + 22],
            ]) +
            note(352, y + 16, v, { anchor: 'start' }) +
            box(448, y + 2, 292, 40, kind, [what], { plain: true, size: 13 })
        )
        .join('') +
      `<path d="M30 196H740" stroke="#e2e8f0"/>` +
      text(30, 226, '*The course: keep or drop', { anchor: 'start' }) +
      box(30, 238, 130, 40, 'data', ['Search results'], { size: 13 }) +
      arrow([
        [160, 258],
        [194, 258],
      ]) +
      box(196, 238, 150, 40, 'choice', ['keep or drop each'], { plain: true, size: 13 }) +
      arrow([
        [346, 258],
        [380, 258],
      ]) +
      box(382, 238, 150, 40, 'code', ["refine what's kept"], { plain: true, size: 13 }) +
      arrow([
        [532, 258],
        [566, 258],
      ]) +
      box(568, 238, 172, 40, 'bad', ['nothing left? the web'], { plain: true, size: 13 }),
  },
  'langgraph-6/refine-steps.svg': {
    w: 760,
    h: 260,
    title:
      'What refine_knowledge does. It takes the documents that passed grading, splits each into knowledge strips, one line each, scores every strip from 0 to 1 against the question in one batch of model calls, and keeps only the strips that score above 0.5. Those become knowledge_strips, which decide_to_generate checks: some left means generate, none left means transform_query and the web.',
    body: () =>
      box(20, 60, 140, 92, 'data', ['Kept document', 'name, price,', 'ingredients,', 'description'], {
        size: 12.5,
        lh: 17,
      }) +
      arrow(
        [
          [160, 106],
          [194, 106],
        ],
        { label: 'split' }
      ) +
      [0, 1, 2, 3]
        .map((i) => box(196, 44 + i * 32, 120, 26, 'data', [`strip ${i + 1}`], { plain: true, size: 12, rx: 6 }))
        .join('') +
      arrow([
        [316, 106],
        [350, 106],
      ]) +
      box(352, 66, 150, 80, 'model', ['Score each', '0 to 1, all at once', 'with `.batch()`'], { size: 12.5, lh: 18 }) +
      arrow([
        [502, 106],
        [536, 106],
      ]) +
      diamond(600, 106, 64, 44, ['score', '> 0.5?']) +
      arrow(
        [
          [664, 106],
          [690, 106],
        ],
        { label: 'keep' }
      ) +
      text(694, 111, '*strips', { anchor: 'start', fill: KIND.code.ink, size: 13 }) +
      arrow(
        [
          [600, 150],
          [600, 182],
        ],
        { label: 'drop', at: [616, 172] }
      ) +
      note(600, 200, 'the line is gone') +
      note(380, 238, 'none kept at all → `transform_query` and the web', { fill: KIND.bad.ink }),
  },
  'langgraph-6/run1-scores.svg': {
    w: 760,
    h: 290,
    title:
      'Run 1, "How much is the Signature Steak, and what\'s in it?". The four strips of the Signature Steak entry scored 1.00 for the name, 0.50 for the price, 0.70 for the ingredients and 0.40 for the description. The cutoff keeps strips above 0.5, so the price, at exactly 0.50, was dropped, and the answer said the price was not specified. Asked about the price alone, the price strip scored 1.00.',
    body: () => {
      const x0 = 250,
        wMax = 400;
      const rows = [
        ['1. Signature Steak', 1.0],
        ['Price: ₩35,000', 0.5],
        ['Main ingredients: hanwoo sirloin, …', 0.7],
        ['Description: dry-aged 21 days, …', 0.4],
      ];
      return (
        note(380, 34, '"How much is the Signature Steak, and what\'s in it?"', { fill: INK, size: 13.5 }) +
        rows
          .map(([label, sc], i) => {
            const y = 56 + i * 44;
            const keep = sc > 0.5;
            const k = keep ? KIND.code : sc === 0.5 ? KIND.bad : KIND.ghost;
            return (
              text(236, y + 21, label, { anchor: 'end', size: 12.5 }) +
              `<rect x="${x0}" y="${y + 4}" width="${wMax}" height="24" rx="5" fill="#f1f5f9"/>` +
              `<rect x="${x0}" y="${y + 4}" width="${wMax * sc}" height="24" rx="5" fill="${k.fill}" stroke="${k.stroke}" stroke-width="1.5"/>` +
              text(x0 + wMax + 12, y + 21, `${sc.toFixed(2)} ${keep ? 'keep' : 'drop'}`, {
                anchor: 'start',
                size: 12.5,
                fill: keep ? KIND.code.ink : sc === 0.5 ? KIND.bad.ink : MUTED,
                bold: sc === 0.5,
              })
            );
          })
          .join('') +
        `<path d="M${x0 + wMax / 2} 50V232" stroke="${KIND.bad.stroke}" stroke-width="1.5" stroke-dasharray="5 4"/>` +
        note(x0 + wMax / 2, 250, 'cutoff: keep only scores above 0.5', { fill: KIND.bad.ink }) +
        note(
          380,
          274,
          'The answer said the price was "not specified". Asked about the price alone, the price line scored 1.00.'
        )
      );
    },
  },
  'langgraph-6/run2-fallback.svg': {
    w: 760,
    h: 280,
    title:
      'Run 2, "What does Super Tuscan mean?". The menu search found the Sassicaia 2018 entry, which mentions Super Tuscan but never explains it. Its four strips scored 0.00, 0.00, 0.30 and 0.20, all under the cutoff, so nothing was kept. The graph rewrote the question for the web, found wine-searcher.com and wsetglobal.com, and answered from them: a Tuscan red made outside the traditional grape rules.',
    body: () => {
      const scores = [
        ['name', 0.0],
        ['price', 0.0],
        ['grapes', 0.3],
        ['desc.', 0.2],
      ];
      return (
        box(20, 40, 170, 64, 'data', ['Sassicaia 2018', 'mentions "Super Tuscan"'], { size: 12.5 }) +
        note(105, 128, 'strip scores', { fill: INK }) +
        scores
          .map(([l, sc], i) => {
            const x = 30 + i * 40;
            const h = 90;
            return (
              `<rect x="${x}" y="${140}" width="26" height="${h}" rx="4" fill="#f1f5f9"/>` +
              `<rect x="${x}" y="${140 + h - h * Math.max(sc, 0.02)}" width="26" height="${h * Math.max(sc, 0.02)}" rx="4" fill="${KIND.ghost.fill}" stroke="${KIND.ghost.stroke}"/>` +
              text(x + 13, 248, sc.toFixed(1), { size: 11, fill: MUTED }) +
              text(x + 13, 263, l, { size: 9.5, fill: MUTED })
            );
          })
          .join('') +
        `<path d="M24 ${140 + 45}H190" stroke="${KIND.bad.stroke}" stroke-dasharray="5 4"/>` +
        note(196, 189, '0.5', { anchor: 'start', fill: KIND.bad.ink }) +
        arrow([
          [226, 186],
          [262, 186],
        ]) +
        box(264, 150, 140, 72, 'bad', ['0 strips kept', 'go to the web'], { size: 12.5 }) +
        arrow([
          [404, 186],
          [438, 186],
        ]) +
        box(440, 150, 140, 72, 'code', ['web search', 'wine-searcher.com', 'wsetglobal.com'], { size: 12, lh: 17 }) +
        arrow([
          [580, 186],
          [606, 186],
        ]) +
        box(608, 132, 132, 108, 'model', ['Answer', 'a Tuscan red', 'made outside the', 'traditional rules'], {
          size: 12.5,
          lh: 18,
        }) +
        note(470, 70, 'The menu names it but never explains it.', { fill: INK }) +
        note(470, 90, 'This is the case CRAG is built for.')
      );
    },
  },
  'langgraph-6/web-fallback-limits.svg': {
    w: 760,
    h: 290,
    title:
      'Where the web fallback helps and where it hurts. When the menu has nothing, the graph searches the web. For general knowledge, like what Super Tuscan means, the web knows the answer. For facts only this restaurant has, like which of your wines suits the Signature Steak or who the head chef is, the web answers a different question: a general steak and wine guide, or what a head chef does. A sturdier graph would first decide whether the question is about this restaurant.',
    body: () =>
      box(20, 110, 150, 64, 'bad', ['Menu has', 'nothing useful']) +
      arrow([
        [170, 142],
        [204, 142],
      ]) +
      box(206, 110, 120, 64, 'code', ['web search']) +
      arrow([
        [326, 130],
        [370, 74],
      ]) +
      arrow([
        [326, 154],
        [370, 210],
      ]) +
      box(
        372,
        40,
        368,
        66,
        'code',
        ['General knowledge: the web knows', '"What does Super Tuscan mean?" → a good answer'],
        { size: 12.5 }
      ) +
      box(
        372,
        178,
        368,
        82,
        'bad',
        [
          'Only this restaurant knows: wrong answer',
          '"Which of your wines…?" → a general steak guide',
          '"Who is the head chef?" → what head chefs do',
        ],
        { size: 12.5, lh: 19 }
      ) +
      note(190, 260, 'fix: ask "is this about us?" first', { fill: KIND.choice.ink }) +
      note(190, 278, "(part 4's router)", { fill: KIND.choice.ink }),
  },
  'langgraph-6/series-map.svg': {
    w: 760,
    h: 352,
    title:
      'What the series built, as six layers, each on top of the last. Part 1, tool calling: the model fills in a request, your code runs it. Part 2, StateGraph: nodes, edges, a shared state and reducers. Part 3, ReAct and memory: a model and tools loop, and a checkpointer. Part 4, Adaptive RAG and human-in-the-loop: route first, pause and edit. Part 5, Self-RAG and subgraphs: grade the documents and the answer, search in parallel. Part 6, Corrective RAG: refine to strips and fall back to the web.',
    body: () =>
      [
        ['1', 'Tool calling', 'the model fills in a request; your code runs it', 'code'],
        ['2', 'StateGraph', 'nodes, edges, a shared state, reducers', 'data'],
        ['3', 'ReAct + memory', 'a model ↔ tools loop; a checkpointer per thread', 'model'],
        ['4', 'Adaptive RAG + HITL', 'route before searching; pause, edit, resume', 'choice'],
        ['5', 'Self-RAG + subgraphs', 'grade documents and answer; search in parallel', 'model'],
        ['6', 'Corrective RAG', 'refine to strips; fall back to the web', 'code'],
      ]
        .reverse()
        .map(([n, name, what, kind], i) => {
          const y = 22 + i * 50;
          const inset = (5 - i) * 0;
          return (
            box(30 + inset, y, 700, 42, kind, [`${n}.  ${name}`], { align: 'left', size: 14 }) +
            text(300, y + 26, what, { anchor: 'start', size: 13 })
          );
        })
        .join('') + note(380, 338, 'each part builds on the one below it'),
  },
};

for (const [path, d] of Object.entries(DIAGRAMS)) {
  const file = `${OUT}/${path}`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, svg(d.w, d.h, d.title, d.body()));
}
console.log(`${Object.keys(DIAGRAMS).length} diagrams written`);
