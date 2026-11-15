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

  '12-factor-agents-1/in-and-out.svg': {
    w: 820,
    h: 300,
    title:
      'Factors 1 to 4. Two inputs you own go to the model: the prompt file (factor 2) and the context you chose, a summary plus this order only (factor 3). The model writes a form instead of a sentence: action create_payment_link, amount 10, recipient Max (factor 1). Your code checks the form and runs the real tool, so the model can only ask for actions you listed (factor 4).',
    body: () =>
      text(20, 30, '*You choose what goes in, the model fills in a form, your code acts', { anchor: 'start' }) +
      box(20, 60, 170, 64, 'data', ['Prompt file', '`prompts/support.md']) +
      note(105, 144, '2 · own your prompts') +
      box(20, 170, 170, 64, 'data', ['Chosen context', 'summary + this order']) +
      note(105, 254, '3 · own your context') +
      arrow([
        [190, 92],
        [210, 92],
        [210, 135],
        [228, 135],
      ]) +
      arrow([
        [190, 202],
        [210, 202],
        [210, 160],
        [228, 160],
      ]) +
      box(230, 115, 110, 64, 'model', ['Model']) +
      arrow([
        [340, 147],
        [373, 147],
      ]) +
      box(375, 95, 240, 104, 'data', [
        'Form (a tool call)',
        '`action: create_payment_link',
        '`amount: 10',
        '`recipient: "Max"',
      ]) +
      note(495, 222, '1 · a form, not a sentence') +
      arrow([
        [615, 147],
        [645, 147],
      ]) +
      box(647, 107, 153, 80, 'code', ['Your code', 'checks the form,', 'runs the tool']) +
      note(723, 210, '4 · the model only asks') +
      note(410, 282, 'The model decides what should happen; your code knows how', { italic: true }),
  },

  '12-factor-agents-1/stay-in-charge.svg': {
    w: 820,
    h: 380,
    title:
      "Factors 5 to 8. The model proposes a refund of 1,200 dollars. Your loop, not the prompt, checks the rule with an if statement: is the amount over 1,000 dollars (factor 8)? If not, the refund is issued. If so, the agent calls ask_human to get a manager's approval (factor 7), then saves and pauses with status waiting (factor 6). When the manager approves, the run resumes and issues the refund. Underneath it all is one saved record holding both where the run is and the real data (factor 5).",
    body: () =>
      text(20, 30, '*Your loop runs the rules; the model only proposes', { anchor: 'start' }) +
      box(20, 70, 150, 64, 'model', ['Model proposes', '`refund(1200)']) +
      note(95, 158, '8 · a rule is an `if`,') +
      note(95, 176, 'not a line in the prompt') +
      arrow([
        [170, 102],
        [214, 102],
      ]) +
      diamond(290, 102, 74, 46, ['amount', '> $1,000?']) +
      arrow(
        [
          [364, 102],
          [638, 102],
        ],
        { label: 'no' }
      ) +
      box(640, 70, 160, 64, 'code', ['Issue refund']) +
      arrow(
        [
          [290, 148],
          [290, 200],
        ],
        { label: 'yes', at: [304, 180], anchor: 'start' }
      ) +
      box(205, 202, 170, 64, 'code', ['`ask_human', '"Approve $1,200?"']) +
      note(290, 290, '7 · a person is a tool') +
      arrow([
        [375, 234],
        [405, 234],
      ]) +
      box(407, 202, 180, 64, 'bad', ['Save and pause', '`status: waiting']) +
      note(497, 290, '6 · pause, resume later') +
      arrow(
        [
          [587, 234],
          [720, 234],
          [720, 136],
        ],
        { label: 'approved', at: [652, 226] }
      ) +
      box(
        20,
        316,
        780,
        46,
        'data',
        ['5 · one saved record holds both: where the run is (status, steps) and the real data (order, refund)'],
        { plain: true }
      ),
  },

  '12-factor-agents-1/router.svg': {
    w: 820,
    h: 300,
    title:
      'Factors 10 and 11. Thin adapters turn Slack, web chat and email messages into the same structured input (factor 11). A small router, which can run on a cheap model, knows who handles what but not how. It sends each request to a specialist: a refund agent with the refund policy and 3 tools, a shipping agent, or an exchange agent (factor 10). The alternative is one agent with a 3,000-token prompt and 15 or more tools, which gets less predictable with every feature.',
    body: () =>
      text(20, 30, '*Thin adapters in, a small router, focused agents', { anchor: 'start' }) +
      ['Slack', 'Web chat', 'Email'].map((s, i) => box(20, 60 + i * 66, 130, 48, 'data', [s])).join('') +
      note(85, 276, '11 · trigger from anywhere') +
      arrow([
        [150, 84],
        [218, 134],
      ]) +
      arrow([
        [150, 150],
        [218, 150],
      ]) +
      arrow([
        [150, 216],
        [218, 166],
      ]) +
      box(220, 106, 170, 88, 'model', ['Router', 'cheap, fast model', 'knows who, not how']) +
      [
        ['Refund agent', 'refund policy, 3 tools'],
        ['Shipping agent', 'tracking, lost parcels'],
        ['Exchange agent', 'swaps and sizes'],
      ]
        .map((l, i) => box(450, 56 + i * 66, 200, 56, 'model', l))
        .join('') +
      arrow([
        [390, 150],
        [448, 84],
      ]) +
      arrow([
        [390, 150],
        [448, 150],
      ]) +
      arrow([
        [390, 150],
        [448, 216],
      ]) +
      note(550, 276, '10 · small, focused agents') +
      box(680, 86, 120, 128, 'bad', ['Instead of', 'one agent:', '3,000-token', 'prompt,', '15+ tools'], {
        dashed: true,
      }),
  },

  '12-factor-agents-1/laptop-return.svg': {
    w: 760,
    h: 345,
    title:
      "One request, start to finish: returning a laptop bought 35 days ago. Step 1, a Slack adapter and a router send it to the returns agent (factors 11 and 10). Step 2, the prompt file and only this order's details go to the model, which fills in a form to look up the order (factors 2, 3, 1 and 4). Step 3, code checks the 30-day rule, finds it is too late and asks a manager (factors 8 and 7). Step 4, the run pauses with everything in one record (factors 6 and 5). Step 5, the manager approves, any copy of the agent resumes, and a failed refund call would go back as a one-line error (factors 12 and 9).",
    body: () =>
      text(20, 30, '*Returning a laptop bought 35 days ago: which factor does what', { anchor: 'start' }) +
      [
        ['code', '1  Slack adapter → router → returns agent', [11, 10]],
        ['model', '2  Prompt file + this order → model fills in "look up order"', [2, 3, 1, 4]],
        ['choice', '3  Code checks the 30-day rule: 35 days → ask a manager', [8, 7]],
        ['bad', '4  Run pauses; everything is saved in one record', [6, 5]],
        ['code', '5  Manager approves; any copy resumes; errors return as one line', [12, 9]],
      ]
        .map(([kind, s, fs], i) => {
          const y = 50 + i * 52;
          return (
            box(20, y, 560, 42, kind, [s], { align: 'left', plain: true, size: 13.5 }) +
            fs
              .map(
                (f, j) =>
                  `<circle cx="${610 + j * 36}" cy="${y + 21}" r="14" fill="#fff" stroke="#94a3b8" stroke-width="1.5"/>` +
                  text(610 + j * 36, y + 26, String(f), { size: 13, bold: true })
              )
              .join('')
          );
        })
        .join('') +
      note(380, 330, 'The model made a couple of small decisions; the rest is code you can read and replay'),
  },

  '12-factor-agents-2/ask-for-json.svg': {
    w: 760,
    h: 260,
    title:
      'Asking for JSON in the prompt. The same prompt can get two kinds of reply. Usually the model returns plain JSON, {"answer": "42"}, and json.loads works. Sometimes it adds "Sure! Here\'s your answer:" before the JSON, and json.loads raises JSONDecodeError, so the code needs a fallback.',
    body: () =>
      text(20, 30, '*Asking for JSON works most of the time', { anchor: 'start' }) +
      box(20, 100, 170, 60, 'data', ['Prompt', '"only answer in JSON"']) +
      arrow([
        [190, 130],
        [218, 130],
      ]) +
      box(220, 100, 100, 60, 'model', ['Model']) +
      arrow([
        [320, 130],
        [345, 130],
        [345, 78],
        [368, 78],
      ]) +
      arrow([
        [320, 130],
        [345, 130],
        [345, 182],
        [368, 182],
      ]) +
      box(370, 50, 200, 56, 'data', ['`{"answer": "42"}'], { plain: true }) +
      box(370, 154, 200, 56, 'data', ["`Sure! Here's your answer:", '`{"answer": "42"}'], { plain: true }) +
      arrow([
        [570, 78],
        [598, 78],
      ]) +
      arrow([
        [570, 182],
        [598, 182],
      ]) +
      box(600, 50, 140, 56, 'code', ['`json.loads', 'works']) +
      box(600, 154, 140, 56, 'bad', ['JSONDecodeError', '→ fallback']) +
      note(380, 244, 'A prompt is a request, so the code needs a `try`/`except`'),
  },

  '12-factor-agents-2/model-asks-code-acts.svg': {
    w: 760,
    h: 280,
    title:
      'The model asks, your code acts. The model writes a request: name add, arguments a 15 and b 27. Your code matches on the name. add runs add(a=15, b=27) and gets 42. multiply runs multiply. Any other name falls through to the last case and becomes an error string, so a made-up tool cannot crash the program.',
    body: () =>
      text(20, 30, '*The model writes a request; your code decides what runs', { anchor: 'start' }) +
      box(20, 100, 110, 64, 'model', ['Model']) +
      arrow([
        [130, 132],
        [158, 132],
      ]) +
      box(160, 92, 230, 80, 'data', ['Request', '`name: add', '`arguments: {a: 15, b: 27}']) +
      arrow([
        [390, 132],
        [418, 132],
      ]) +
      box(420, 102, 120, 60, 'choice', ['`match name']) +
      arrow([
        [540, 132],
        [578, 64],
      ]) +
      arrow([
        [540, 132],
        [578, 132],
      ]) +
      arrow([
        [540, 132],
        [578, 200],
      ]) +
      box(580, 36, 160, 56, 'code', ['`add', '`add(15, 27) → 42'], { plain: true }) +
      box(580, 104, 160, 56, 'code', ['`multiply', '`multiply(…)'], { plain: true }) +
      box(580, 172, 160, 56, 'bad', ['any other name', '→ error string']) +
      note(380, 262, "A made-up tool name can't crash the program: it falls through to the last case"),
  },

  '12-factor-agents-2/error-to-message.svg': {
    w: 760,
    h: 300,
    title:
      'Without error handling, the model asks for a divide tool that does not exist, the lookup raises an exception, and the program crashes mid-task. With try/except, the exception is caught and added to the context as {"error": "Tool divide not found"}. On the next step the model reads it and tries something else.',
    body: () =>
      text(20, 30, '*A failed tool becomes something the model can read', { anchor: 'start' }) +
      text(20, 89, '*Without', { anchor: 'start' }) +
      box(100, 56, 150, 56, 'model', ['Model asks', 'for `divide`']) +
      arrow([
        [250, 84],
        [283, 84],
      ]) +
      box(285, 56, 170, 56, 'bad', ['No such tool:', 'exception raised']) +
      arrow([
        [455, 84],
        [488, 84],
      ]) +
      box(490, 56, 250, 56, 'bad', ['Program crashes,', 'the task stops'], { dashed: true }) +
      text(20, 193, '*With', { anchor: 'start' }) +
      box(100, 160, 150, 56, 'model', ['Model asks', 'for `divide`']) +
      arrow([
        [250, 188],
        [283, 188],
      ]) +
      box(285, 160, 170, 56, 'code', ['`except` catches it']) +
      arrow([
        [455, 188],
        [488, 188],
      ]) +
      box(490, 160, 250, 56, 'data', ['Added to the context', '`{"error": "Tool divide not found"}'], { size: 11.5 }) +
      curve(615, 216, 395, 278, 175, 218, { label: 'next step: the model reads it and tries again', at: [395, 270] }),
  },

  '12-factor-agents-2/step-limit-bug.svg': {
    w: 760,
    h: 254,
    title:
      'The step-limit bug. Three runs with max_steps 5. A run that finishes at step 3 gets no warning from either check. A run that finishes at exactly step 5 gets a false "limit hit" warning from step >= max_steps, but no warning from not done. A run stopped by the limit gets a warning from both. Only the run that finishes on exactly the last step is misreported.',
    body: () =>
      text(120, 48, '*Run (max_steps = 5)') +
      text(400, 48, '*`if step >= max_steps`') +
      text(640, 48, '*`if not done`') +
      [
        ['Finished at step 3', ['code', '✓ no warning'], ['code', '✓ no warning']],
        ['Finished at step 5', ['bad', '✗ "limit hit" (wrong)'], ['code', '✓ no warning']],
        ['Still going at step 5', ['code', '✓ "limit hit"'], ['code', '✓ "limit hit"']],
      ]
        .map(([c, [k1, a], [k2, b]], i) => {
          const y = 66 + i * 50;
          return (
            box(20, y, 200, 42, 'data', [c], { plain: true }) +
            box(290, y, 220, 42, k1, [a], { plain: true }) +
            box(540, y, 200, 42, k2, [b], { plain: true })
          );
        })
        .join('') +
      note(380, 236, 'Only the run that finishes on exactly the last step is misreported'),
  },

  '12-factor-agents-3/three-jobs.svg': {
    w: 760,
    h: 290,
    title:
      'The agent split into three small methods. run() loops until the task is done or the step limit is hit. Each time, it calls _next_step(), which does one step on the state and hands back a new state. _next_step() calls _call_model(), the only method that talks to the model. Tool descriptions live in their own tools/*.json files, so they can be reworded without touching Python.',
    body: () =>
      text(20, 30, '*Three small methods, each with one job', { anchor: 'start' }) +
      box(20, 100, 190, 80, 'code', ['`run()', 'loops until done', 'or the step limit']) +
      arrow([
        [210, 140],
        [248, 140],
      ]) +
      curve(330, 100, 230, 46, 130, 98, { label: 'new state', at: [230, 62] }) +
      box(250, 100, 190, 80, 'code', ['`_next_step()', 'does one step', 'on the state']) +
      arrow([
        [440, 140],
        [478, 140],
      ]) +
      box(480, 100, 140, 80, 'code', ['`_call_model()', 'talks to', 'the model']) +
      arrow([
        [620, 140],
        [648, 140],
      ]) +
      box(650, 110, 90, 60, 'model', ['Model']) +
      box(480, 220, 140, 46, 'data', ['`tools/*.json'], { plain: true }) +
      arrow([
        [550, 220],
        [550, 182],
      ]) +
      note(468, 248, 'tool descriptions, editable without touching Python', { anchor: 'end' }),
  },

  '12-factor-agents-3/prompt-in-files.svg': {
    w: 760,
    h: 270,
    title:
      'Before, the system prompt was a string inside agent.py. After, the prompt lives in prompts/base_system.md and the tool descriptions in tools/*.json, and agent.py reads them. Prompt edits now show up in code review, can be compared and can be undone.',
    body: () =>
      text(185, 40, '*Before') +
      text(575, 40, '*After') +
      box(20, 56, 330, 164, 'ghost', []) +
      text(40, 84, '*`agent.py`', { anchor: 'start' }) +
      text(40, 118, '`system_prompt = """', { anchor: 'start' }) +
      text(40, 140, '`  You are an autonomous agent…', { anchor: 'start' }) +
      text(40, 162, '`  ALWAYS prefer calling tools…', { anchor: 'start' }) +
      text(40, 184, '`"""', { anchor: 'start' }) +
      note(185, 248, 'the prompt is a string buried in the code') +
      box(410, 56, 330, 44, 'data', ['`prompts/base_system.md'], { plain: true }) +
      box(410, 108, 330, 44, 'data', ['`tools/*.json'], { plain: true }) +
      arrow([
        [575, 152],
        [575, 174],
      ]) +
      box(410, 176, 330, 44, 'code', ['`agent.py` reads them']) +
      note(575, 248, 'edits show up in review, diffs and undo', { fill: KIND.code.ink }),
  },

  '12-factor-agents-4/polling.svg': {
    w: 760,
    h: 316,
    title:
      'Start now, check back later. The client sends POST /agent/launch. The server starts the agent in the background and immediately returns the run ID. The agent works through its steps. Meanwhile the client sends GET /agent/state/{id} once a second: the first answers say running, and the last says complete after 8 steps.',
    body: () => {
      const lane = (x) => `<path d="M${x} 80V304" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="4 5"/>`;
      return (
        box(80, 40, 140, 40, 'data', ['Client']) +
        box(310, 40, 160, 40, 'code', ['Server']) +
        box(550, 40, 180, 40, 'code', ['Agent, in background']) +
        lane(150) +
        lane(390) +
        lane(640) +
        `<rect x="632" y="128" width="16" height="152" rx="4" fill="${KIND.model.fill}" stroke="${KIND.model.stroke}" stroke-width="1.5"/>` +
        text(656, 208, 'steps 1 … 8', { anchor: 'start', size: 12.5, fill: KIND.model.ink }) +
        arrow(
          [
            [150, 108],
            [388, 108],
          ],
          { label: '`POST /agent/launch`' }
        ) +
        arrow(
          [
            [390, 128],
            [630, 128],
          ],
          { label: 'start', dashed: true }
        ) +
        arrow(
          [
            [390, 152],
            [152, 152],
          ],
          { label: 'run id, right away' }
        ) +
        arrow(
          [
            [150, 186],
            [388, 186],
          ],
          { label: '`GET /agent/state/{id}`' }
        ) +
        arrow(
          [
            [390, 216],
            [152, 216],
          ],
          { label: '"running"' }
        ) +
        note(20, 240, 'once a', { anchor: 'start' }) +
        note(20, 256, 'second…', { anchor: 'start' }) +
        arrow(
          [
            [150, 256],
            [388, 256],
          ],
          { label: '`GET /agent/state/{id}`' }
        ) +
        arrow(
          [
            [390, 290],
            [152, 290],
          ],
          { label: '"complete", 8 steps' }
        )
      );
    },
  },

  '12-factor-agents-4/save-every-step.svg': {
    w: 760,
    h: 260,
    title:
      'Save after every step. The agent does one step and calls a progress callback. The server saves the state as one row in SQLite, then the agent does the next step. The agent itself knows nothing about databases. If the server restarts, the run stops, but its saved state survives.',
    body: () =>
      box(20, 80, 150, 64, 'code', ['Agent', 'does one step']) +
      arrow(
        [
          [170, 112],
          [240, 112],
        ],
        { label: 'callback', at: [205, 134] }
      ) +
      box(242, 80, 160, 64, 'code', ['Server', 'saves the state']) +
      curve(322, 80, 208, 26, 95, 78, { label: 'next step', at: [208, 44] }) +
      arrow([
        [402, 112],
        [440, 112],
      ]) +
      box(442, 70, 298, 84, 'data', ['SQLite: one row per run', '`id | status | steps | context …']) +
      arrow(
        [
          [591, 154],
          [591, 182],
        ],
        { dashed: true }
      ) +
      box(442, 184, 298, 56, 'bad', ['If the server restarts', 'the run stops; the saved row survives'], { size: 13 }) +
      note(220, 212, 'The agent never touches the database:') +
      note(220, 230, 'it only calls the function it was given'),
  },

  '12-factor-agents-4/any-client.svg': {
    w: 760,
    h: 256,
    title:
      'Any client works. The test script and a web page for a garden-planning demo both use the same five endpoints: launch, state, pause, resume and provide_input. A Slack bot would just be another client; the course does not build one. Behind the endpoints the agent core is unchanged. No server code changed for the web page.',
    body: () =>
      box(20, 56, 210, 44, 'data', ['Test script']) +
      box(20, 113, 210, 44, 'data', ['Web page (garden demo)']) +
      box(20, 170, 210, 44, 'ghost', ['Slack bot (not built)'], { dashed: true }) +
      arrow([
        [230, 78],
        [298, 112],
      ]) +
      arrow([
        [230, 135],
        [298, 135],
      ]) +
      arrow(
        [
          [230, 192],
          [298, 158],
        ],
        { dashed: true }
      ) +
      box(300, 50, 200, 170, 'code', [
        'Same five endpoints',
        '`launch',
        '`state',
        '`pause · resume',
        '`provide_input',
      ]) +
      arrow([
        [500, 135],
        [558, 135],
      ]) +
      box(560, 95, 180, 80, 'code', ['Agent core', 'unchanged']) +
      note(380, 244, 'No server code changed for the web page'),
  },

  '12-factor-agents-4/gaps.svg': {
    w: 800,
    h: 316,
    title:
      'Four gaps found by reading the code, each with a fix. A restart mid-run leaves the row saying running, and resume refuses it: on startup, mark leftover running rows as interrupted and allow resuming them. "Paused" really means pause requested, so resuming in that gap can start two copies: separate pause requested from paused. Resume only blocks running runs, so it would restart finished or waiting runs: list the statuses resume accepts. Clients have to keep polling even when a run waits for days: notify them with a webhook, which the course does not build.',
    body: () =>
      text(205, 36, '*Gap (from reading the code)') +
      text(600, 36, '*Fix') +
      [
        [
          ['Restart mid-run', 'row still says running; resume refuses it'],
          ['Mark leftover running rows as', 'interrupted on startup; let those resume'],
        ],
        [
          ['"Paused" means pause requested', 'resume in the gap → two copies run'],
          ['Separate "pause requested"', 'from "paused"'],
        ],
        [
          ['Resume checks the wrong way', 'would restart finished or waiting runs'],
          ['List the statuses resume accepts'],
        ],
        [
          ['Clients have to keep polling', 'even when a run waits for days'],
          ['Notify the client with a webhook', '(not built in the course)'],
        ],
      ]
        .map(([gap, fix], i) => {
          const y = 52 + i * 64;
          return (
            box(20, y, 370, 52, 'bad', gap, { align: 'left', size: 13.5, lh: 18 }) +
            arrow([
              [390, y + 26],
              [418, y + 26],
            ]) +
            box(420, y, 360, 52, 'code', fix, { align: 'left', plain: true, size: 13.5, lh: 18 })
          );
        })
        .join(''),
  },

  '12-factor-agents-4/series-map.svg': {
    w: 760,
    h: 330,
    title:
      "The whole series as nested layers. Part 2 built the loop: the model asks for a tool, your code runs it, and the context grows. Part 3 wrapped that loop in a stateless agent: one State in, a new State out, with prompts in files. Part 4 wrapped the agent in an API with launch, state, pause, resume and provide_input, saved in SQLite. Part 1's rules shaped all of them.",
    body: () =>
      text(20, 30, "*Each part wrapped the last; part 1's rules shaped all of them", { anchor: 'start' }) +
      `<rect x="20" y="46" width="720" height="268" rx="14" fill="${KIND.code.fill}" stroke="${KIND.code.stroke}" stroke-width="1.5" stroke-dasharray="6 5"/>` +
      text(40, 72, '*Part 4 · an API: launch, state, pause, resume, provide_input, saved in SQLite', {
        anchor: 'start',
        fill: KIND.code.ink,
      }) +
      `<rect x="50" y="88" width="660" height="200" rx="12" fill="#ffffff" stroke="#94a3b8" stroke-width="1.5"/>` +
      text(70, 114, '*Part 3 · a stateless agent: one State in, a new State out; prompts in files', {
        anchor: 'start',
      }) +
      `<rect x="80" y="130" width="600" height="132" rx="12" fill="${KIND.model.fill}" stroke="${KIND.model.stroke}" stroke-width="1.5"/>` +
      text(100, 156, '*Part 2 · the loop, with a step limit', { anchor: 'start', fill: KIND.model.ink }) +
      box(110, 176, 150, 56, 'model', ['Model', 'asks for a tool']) +
      arrow([
        [260, 204],
        [308, 204],
      ]) +
      box(310, 176, 150, 56, 'code', ['Your code', 'runs it']) +
      arrow([
        [460, 204],
        [508, 204],
      ]) +
      box(510, 176, 150, 56, 'data', ['Context', 'grows']) +
      curve(585, 232, 385, 268, 187, 234),
  },

  'agentic-ai-module-1/decompose.svg': {
    w: 640,
    h: 290,
    title:
      'The main skill: take a step of the job and ask whether an AI, a short piece of code or a tool can do it. If yes, build it. If no, ask how a person would do it, split it into smaller steps, and ask again for each smaller step.',
    body: () =>
      text(20, 30, '*Keep splitting until every step is buildable', { anchor: 'start' }) +
      box(20, 100, 140, 64, 'data', ['A step', 'of the job']) +
      arrow([
        [160, 132],
        [192, 132],
      ]) +
      diamond(290, 132, 96, 56, ['Can an AI, code', 'or a tool do it?']) +
      arrow(
        [
          [386, 132],
          [448, 132],
        ],
        { label: 'yes' }
      ) +
      box(450, 100, 170, 64, 'code', ['Build it', 'AI · code · tool']) +
      arrow(
        [
          [290, 188],
          [290, 214],
        ],
        { label: 'no', at: [302, 205], anchor: 'start' }
      ) +
      box(180, 216, 220, 52, 'data', ['How would a person do it?', 'Split it into smaller steps']) +
      arrow(
        [
          [180, 242],
          [90, 242],
          [90, 166],
        ],
        { label: 'try again', at: [135, 234] }
      ),
  },

  'agentic-ai-module-1/essay-rounds.svg': {
    w: 760,
    h: 290,
    title:
      "Ng's essay writer in three rounds. Round 1, one prompt that writes the essay: it only covered the obvious points. Round 2, outline, search, then write: better, but choppy, as if pieces were glued together. Round 3, outline, search, draft, review, revise: now one step's whole job is to find choppy parts and fix them.",
    body: () =>
      [
        ['Round 1', [['model', 'Write']], 'only covered the obvious points', 'bad'],
        [
          'Round 2',
          [
            ['model', 'Outline'],
            ['code', 'Search'],
            ['model', 'Write'],
          ],
          'better, but choppy: pieces glued together',
          'bad',
        ],
        [
          'Round 3',
          [
            ['model', 'Outline'],
            ['code', 'Search'],
            ['model', 'Draft'],
            ['model', 'Review'],
            ['model', 'Revise'],
          ],
          'one step now exists just to fix choppy parts',
          'code',
        ],
      ]
        .map(([label, steps, result, rk], r) => {
          const y = 34 + r * 84;
          return (
            text(20, y + 28, `*${label}`, { anchor: 'start' }) +
            steps
              .map(
                ([k, s], i) =>
                  box(110 + i * 112, y, 92, 44, k, [s]) +
                  (i < steps.length - 1
                    ? arrow([
                        [202 + i * 112, y + 22],
                        [220 + i * 112, y + 22],
                      ])
                    : '')
              )
              .join('') +
            text(110, y + 66, result, { anchor: 'start', size: 13, fill: KIND[rk].ink })
          );
        })
        .join(''),
  },

  'agentic-ai-module-1/four-patterns.svg': {
    w: 760,
    h: 250,
    title:
      'The four patterns of the course along the autonomy scale. Reflection (module 2): the AI reviews its own work. Tool use (module 3): the AI decides which tools to call. In both, the programmer still sets the steps. Planning (module 5): the AI writes the steps. Multi-agent (module 5): several AIs, each with a role. These hand more control to the AI.',
    body: () =>
      text(196, 40, 'the programmer still sets the steps', { fill: KIND.code.ink, size: 13 }) +
      text(560, 40, 'the AI takes more of the control', { fill: KIND.model.ink, size: 13 }) +
      [
        ['code', ['Reflection', 'the AI reviews', 'its own work'], 'module 2'],
        ['code', ['Tool use', 'the AI decides', 'which tools to call'], 'module 3'],
        ['model', ['Planning', 'the AI writes', 'the steps'], 'module 5'],
        ['model', ['Multi-agent', 'several AIs,', 'each with a role'], 'module 5'],
      ]
        .map(([k, l, m], i) => box(20 + i * 182, 56, 170, 90, k, l) + note(105 + i * 182, 170, m))
        .join('') +
      arrow([
        [40, 200],
        [720, 200],
      ]) +
      note(40, 224, 'less autonomous', { anchor: 'start' }) +
      note(720, 224, 'more autonomous', { anchor: 'end' }),
  },

  'agentic-ai-module-2/negative-sales.svg': {
    w: 800,
    h: 330,
    title:
      'The bug only the result could reveal. The first query summed qty_delta times unit_price per color and sorted from biggest to smallest. Sales are stored as negative numbers, so it returned the lowest seller: blue, minus 190,571.46. A reviewer that saw only the question, the query and the column list said the query fully answers the question. The same reviewer, also given the result row, noticed the total was negative and suggested ABS. The fixed query answered white, 358,315.09.',
    body: () =>
      box(20, 46, 280, 80, 'model', ['First query', '`SUM(qty_delta * unit_price)', '`ORDER BY total_sales DESC']) +
      arrow([
        [300, 86],
        [338, 86],
      ]) +
      box(340, 61, 230, 50, 'bad', ['blue, −190,571.46']) +
      note(590, 82, 'sales are stored as negative,', { anchor: 'start' }) +
      note(590, 100, 'so this is the lowest seller', { anchor: 'start' }) +
      text(20, 160, '*Review with only the query', { anchor: 'start', size: 13 }) +
      box(20, 168, 280, 56, 'data', ['Reviewer sees: question,', 'query, column list'], { plain: true }) +
      arrow([
        [300, 196],
        [338, 196],
      ]) +
      box(340, 168, 230, 56, 'model', ['`gpt-4.1', '"fully answers the question"']) +
      arrow([
        [570, 196],
        [598, 196],
      ]) +
      box(600, 168, 180, 56, 'bad', ['Bug missed']) +
      text(20, 254, '*Review with the result too', { anchor: 'start', size: 13 }) +
      box(20, 262, 280, 56, 'data', ['… plus the result row', '`blue, −190,571.46'], { plain: true }) +
      arrow([
        [300, 290],
        [338, 290],
      ]) +
      box(340, 262, 230, 56, 'model', ['`gpt-4.1', '"negative total → use ABS"']) +
      arrow([
        [570, 290],
        [598, 290],
      ]) +
      box(600, 262, 180, 56, 'code', ['Fixed query', 'white, 358,315.09']),
  },

  'agentic-ai-module-2/measure-reflection.svg': {
    w: 800,
    h: 290,
    title:
      "Measure reflection before keeping it. If there is a right answer, build a test set of 10 to 15 questions, run each with and without reflection and count the right answers; in Ng's store example, items sold in May came out as 980 without reflection and 1201, the right answer, with it. If there is no right answer, asking an AI which of two charts is better is unreliable because of position bias. Instead, grade one chart at a time against a yes/no checklist; Ng's charts scored 4, 5 and 5 points without reflection and 6, 8 and 7 with it.",
    body: () =>
      text(20, 30, '*Measure reflection before keeping it', { anchor: 'start' }) +
      diamond(130, 150, 110, 56, ['Is there a', 'right answer?']) +
      arrow(
        [
          [240, 150],
          [270, 150],
          [270, 95],
          [298, 95],
        ],
        { label: 'yes', at: [256, 118] }
      ) +
      arrow(
        [
          [240, 150],
          [270, 150],
          [270, 215],
          [298, 215],
        ],
        { label: 'no', at: [256, 192] }
      ) +
      box(300, 50, 480, 90, 'code', [
        'Test set of 10–15 questions',
        'run each with and without reflection, count the right ones',
        'e.g. items sold in May: 980 without, 1201 (right) with',
      ]) +
      box(300, 170, 230, 90, 'bad', ['Asking which of two', 'charts is better:', 'unreliable (position bias)']) +
      arrow([
        [530, 215],
        [558, 215],
      ]) +
      box(560, 170, 220, 90, 'code', ['Instead: a yes/no', 'checklist per chart', '4, 5, 5 → 6, 8, 7 points']),
  },

  'agentic-ai-module-3/tools-are-limits.svg': {
    w: 800,
    h: 280,
    title:
      '"Delete Alice\'s email" with two tool lists. Without a delete tool (list, search, mark read, send), the AI finds the email, then says "I can\'t delete emails" and offers to mark it read or reply. With a delete tool added, it searches and deletes: "Done — I found and deleted the email." The list of tools is the list of things the agent can do.',
    body: () =>
      text(20, 30, '*"Delete Alice\'s email", with two different tool lists', { anchor: 'start' }) +
      text(20, 66, '*Without a delete tool', { anchor: 'start', size: 13 }) +
      box(20, 76, 250, 56, 'data', ['Tools', 'list · search · mark read · send'], { size: 13 }) +
      arrow([
        [270, 104],
        [298, 104],
      ]) +
      box(300, 76, 200, 56, 'model', ['Finds the email']) +
      arrow([
        [500, 104],
        [528, 104],
      ]) +
      box(530, 76, 250, 56, 'bad', ['"I can\'t delete emails"', 'offers to mark read or reply'], { size: 13 }) +
      text(20, 172, '*With a delete tool added', { anchor: 'start', size: 13 }) +
      box(20, 182, 250, 56, 'data', ['Tools', '… + delete'], { size: 13 }) +
      arrow([
        [270, 210],
        [298, 210],
      ]) +
      box(300, 182, 200, 56, 'model', ['Search → delete']) +
      arrow([
        [500, 210],
        [528, 210],
      ]) +
      box(530, 182, 250, 56, 'code', ['"Done — I found and', 'deleted the email"'], { size: 13 }) +
      note(400, 266, 'The list of tools is the list of things your agent can do'),
  },

  'agentic-ai-module-4/build-analyze.svg': {
    w: 760,
    h: 300,
    title:
      'Build first, then look. Build a rough version, analyze its outputs, and go back to build. For the invoice reader, run 20 invoices and note what went wrong with each: invoice 1 is fine, invoice 2 mixed up the invoice date with the due date, invoices 3 and 4 are fine. If date mix-ups keep showing up, that is the most common problem and the thing to measure next.',
    body: () =>
      box(20, 70, 160, 64, 'code', ['Build', 'a rough version']) +
      arrow([
        [70, 134],
        [70, 184],
      ]) +
      box(20, 186, 160, 64, 'choice', ['Analyze', 'read the outputs']) +
      curve(180, 218, 240, 160, 182, 104) +
      text(500, 46, '*20 invoices, read one by one') +
      [
        ['code', 'Invoice 1   ✓ fine'],
        ['bad', 'Invoice 2   ✗ invoice date mixed up with due date'],
        ['code', 'Invoice 3   ✓ fine'],
        ['code', 'Invoice 4   ✓ fine'],
        ['choice', '…  date mix-ups keep showing up → measure that next'],
      ]
        .map(([k, s], i) => box(280, 60 + i * 46, 460, 38, k, [s], { align: 'left', plain: true, size: 13.5 }))
        .join(''),
  },

  'agentic-ai-module-4/component-eval.svg': {
    w: 800,
    h: 330,
    title:
      'Test one step on its own. Rerunning the whole research agent (request, search terms, web search, pick sources, write) after every change is slow, costly and noisy. Instead, pull out the web search step and check its result links: pass if at least 40 percent come from preferred sites such as arxiv.org and nature.com. In my run, a request for recent papers passed with 4 of 4 links, 100 percent, for papers from 1998 and 2006: the eval checks where links point, not how old the papers are, so the eval needs fixing.',
    body: () =>
      ['Request', 'Search terms', 'Web search', 'Pick sources', 'Write']
        .map(
          (s, i) =>
            box(20 + i * 126, 46, 110, 44, i === 2 ? 'code' : 'ghost', [s], { size: 13 }) +
            (i < 4
              ? arrow([
                  [130 + i * 126, 68],
                  [144 + i * 126, 68],
                ])
              : '')
        )
        .join('') +
      note(650, 64, 'rerunning it all:', { anchor: 'start' }) +
      note(650, 82, 'slow, costly, noisy', { anchor: 'start' }) +
      arrow(
        [
          [327, 90],
          [327, 122],
          [110, 122],
          [110, 148],
        ],
        { dashed: true, label: 'pull out one step', at: [218, 114] }
      ) +
      box(20, 150, 180, 70, 'code', ['Web search', 'on its own']) +
      arrow([
        [200, 185],
        [238, 185],
      ]) +
      box(240, 150, 220, 70, 'data', ['Result links', 'arxiv.org, nature.com, …']) +
      arrow([
        [460, 185],
        [498, 185],
      ]) +
      box(500, 150, 280, 70, 'choice', ['≥ 40% from preferred sites?', 'PASS or FAIL']) +
      box(
        20,
        250,
        760,
        56,
        'bad',
        [
          'My run: "recent" papers from 1998 and 2006 still scored 4 of 4, 100%, PASS',
          'The eval checks where links point, not how old the papers are: fix the eval first',
        ],
        { size: 13 }
      ),
  },

  'agentic-ai-module-5/five-habits.svg': {
    w: 760,
    h: 346,
    title:
      'Five modules, five habits. Module 1: break the job into steps an AI, a bit of code or a tool can do. Module 2: give the reviewer a new fact, not just a second look. Module 3: let the AI ask for tools, and let it write code when small tools keep piling up. Module 4, the one worth rereading: measure, and count which step causes the errors before fixing anything. Module 5: hand over only as much control as the job needs.',
    body: () =>
      text(20, 30, '*Five modules, five habits', { anchor: 'start' }) +
      [
        'Break the job into steps an AI, a bit of code or a tool can do',
        'Give the reviewer a new fact, not just a second look',
        'Let the AI ask for tools; let it write code when small tools pile up',
        'Measure, and count which step causes the errors, before fixing anything',
        'Hand over only as much control as the job needs',
      ]
        .map((h, i) => {
          const y = 50 + i * 54;
          const k = i === 3 ? 'choice' : 'data';
          return (
            box(20, y, 120, 44, k, [`Module ${i + 1}`]) +
            box(150, y, 590, 44, k, [h], { align: 'left', plain: true, size: 13.5 })
          );
        })
        .join('') +
      note(740, 332, 'module 4 is the one to reread: every other pattern needs a way to measure', { anchor: 'end' }),
  },

  'llm-costs-1/reasoning-tokens.svg': {
    w: 760,
    h: 250,
    title:
      'Thinking tokens are already inside the output count. In the course run the model reported 148 output tokens: 109 in the answer you see and 39 of hidden thinking, all billed at the output price of $6.00 per million. The right cost uses the 148. A common bug adds the 39 reasoning tokens again, billing 187 tokens and charging the thinking twice.',
    body: () =>
      text(20, 30, '*Thinking tokens are already inside the output count', { anchor: 'start' }) +
      box(20, 54, 530, 50, 'data', ['Answer you see: 109 tokens']) +
      box(550, 54, 190, 50, 'model', ['Hidden thinking: 39'], { dashed: true }) +
      `<path d="M20 116V124H740V116" fill="none" stroke="#94a3b8" stroke-width="1.5"/>` +
      note(380, 144, 'Output reported by the company: 148 tokens, all at $6.00 per million') +
      box(20, 168, 350, 60, 'code', ['Right: bill the output once', '148 tokens × $6.00 / million']) +
      box(390, 168, 350, 60, 'bad', ['Bug: add reasoning again', '148 + 39 = 187 tokens billed']),
  },

  'llm-costs-1/request-log.svg': {
    w: 760,
    h: 250,
    title:
      'Three logged requests, drawn as cost bars to scale. "Define latency in one sentence" on gpt-5.6-luna cost $0.000120. "Summarize why prompt caching reduces cost" on gpt-5.6-luna cost $0.000561. "Analyze the tradeoffs of model routing" on gpt-5.6-sol, five times the price, cost $0.035320. The total was $0.036001, and the one premium request was 98 percent of the bill.',
    body: () =>
      text(20, 30, '*Three logged requests, cost drawn to scale', { anchor: 'start' }) +
      [
        ['Define latency in one sentence.', 'gpt-5.6-luna', 0.00012, '$0.000120'],
        ['Summarize why prompt caching reduces cost.', 'gpt-5.6-luna', 0.000561, '$0.000561'],
        ['Analyze the tradeoffs of model routing.', 'gpt-5.6-sol', 0.03532, '$0.035320'],
      ]
        .map(([q, m, c, s], i) => {
          const y = 56 + i * 54;
          const w = Math.max(2, (c / 0.03532) * 330);
          const k = i === 2 ? KIND.choice : KIND.model;
          return (
            text(20, y + 14, q, { anchor: 'start', size: 13 }) +
            text(20, y + 32, `\`${m}\``, { anchor: 'start', size: 12.5, fill: MUTED }) +
            `<rect x="330" y="${y + 4}" width="${w.toFixed(1)}" height="28" rx="4" fill="${k.fill}" stroke="${k.stroke}" stroke-width="1.5"/>` +
            text(330 + w + 10, y + 23, s, { anchor: 'start', size: 13, mono: true })
          );
        })
        .join('') +
      text(20, 232, '*Total $0.036001: the one premium request is 98% of the bill', { anchor: 'start' }),
  },

  'llm-costs-2/same-question.svg': {
    w: 760,
    h: 290,
    title:
      'Same question, two models. The quality bar is set first: the answer must explain how indexes work and name one tradeoff. The question about database indexes goes to gpt-5.6-luna, the cheap tier, which answered correctly with two tradeoffs for $0.000535, and to gpt-5.6-sol, the premium tier at five times the price, which answered correctly with one tradeoff for $0.001775. Premium cost 3.3 times more for no better answer; not the full 5 times, because the cheap model wrote a longer answer.',
    body: () =>
      box(20, 30, 720, 44, 'choice', [
        'Quality bar, set before reading: explains how indexes work, names one tradeoff',
      ]) +
      box(20, 136, 170, 64, 'data', ['Question', 'about database indexes']) +
      arrow([
        [190, 168],
        [220, 168],
        [220, 128],
        [248, 128],
      ]) +
      arrow([
        [190, 168],
        [220, 168],
        [220, 208],
        [248, 208],
      ]) +
      box(250, 100, 220, 56, 'model', ['`gpt-5.6-luna', 'cheap tier']) +
      arrow([
        [470, 128],
        [498, 128],
      ]) +
      box(500, 100, 240, 56, 'code', ['✓ $0.000535', 'correct, names two tradeoffs']) +
      box(250, 180, 220, 56, 'model', ['`gpt-5.6-sol', 'premium, 5× the price']) +
      arrow([
        [470, 208],
        [498, 208],
      ]) +
      box(500, 180, 240, 56, 'code', ['✓ $0.001775', 'correct, names one tradeoff']) +
      note(380, 272, 'Premium cost 3.3× more for no better answer (not 5×: the cheap model wrote more)'),
  },

  'llm-costs-2/routing-gaps.svg': {
    w: 800,
    h: 252,
    title:
      'Three gaps in the router, found by reading the code. A failed cheap answer never moves up to premium: it tries other cheap models, then gives up; part 4 adds the escalation. The quality check is word matching, so a wrong answer containing the right words passes; the course has no fix for this. The final error only remembers crashes, so when every answer failed the check it reads "No acceptable response: None"; remembering the last rejected answer too would say what happened.',
    body: () =>
      text(205, 36, '*Gap (from reading the code)') +
      text(600, 36, '*Fix') +
      [
        [
          ['A failed cheap answer never goes premium', 'other cheap models, then it gives up'],
          ['Escalate to premium when the cheap tier fails', '(part 4 adds this)'],
          'code',
        ],
        [
          ['The quality check is word matching', 'a wrong answer with the right words passes'],
          ['Needs a check of meaning, not words', '(not covered in the course)'],
          'ghost',
        ],
        [
          ['The final error hides the cause', '"No acceptable response: None"'],
          ['Also remember the last rejected answer', 'so the error says what happened'],
          'code',
        ],
      ]
        .map(([gap, fix, k], i) => {
          const y = 52 + i * 64;
          return (
            box(20, y, 370, 52, 'bad', gap, { align: 'left', size: 13.5, lh: 18 }) +
            arrow([
              [390, y + 26],
              [418, y + 26],
            ]) +
            box(420, y, 360, 52, k, fix, { align: 'left', plain: true, size: 13.5, lh: 18, dashed: k === 'ghost' })
          );
        })
        .join(''),
  },

  'llm-costs-3/response-cache.svg': {
    w: 800,
    h: 296,
    title:
      "A response cache in your own app. Each question is checked: has this exact question been seen before? On a hit, the saved answer comes back for $0. On a miss, the model is called and paid for, and the answer is saved for next time. In the lesson's run, 5 questions needed only 2 paid calls and 3 were avoided. The simple version is missing two things: saved answers should expire, and one customer's answer must never be reused for another.",
    body: () =>
      box(20, 110, 140, 60, 'data', ['Question']) +
      arrow([
        [160, 140],
        [173, 140],
      ]) +
      diamond(255, 140, 80, 50, ['Same question', 'seen before?']) +
      arrow(
        [
          [335, 140],
          [360, 140],
          [360, 80],
          [388, 80],
        ],
        { label: 'hit', at: [352, 104], anchor: 'end' }
      ) +
      arrow(
        [
          [335, 140],
          [360, 140],
          [360, 200],
          [388, 200],
        ],
        { label: 'miss', at: [352, 190], anchor: 'end' }
      ) +
      box(390, 52, 170, 56, 'code', ['Saved answer', '`$0.000000']) +
      box(390, 172, 170, 56, 'model', ['Call the model', 'paid']) +
      arrow([
        [560, 200],
        [598, 200],
      ]) +
      box(600, 172, 180, 56, 'code', ['Save the answer', 'for next time']) +
      box(600, 52, 180, 56, 'data', ['This run: 5 questions', '2 paid calls, 3 avoided']) +
      note(400, 272, "Missing from the lesson's version: expiry, and never reusing one customer's answer for another", {
        fill: KIND.bad.ink,
      }),
  },

  'llm-costs-4/noise-vs-saving.svg': {
    w: 760,
    h: 276,
    title:
      'Noise versus a real saving, drawn to scale. The same unchanged conversation cost $0.102 on one run and $0.111 on another, about 9 percent apart. The full 14-message test went from $0.298967 for the original bot to $0.035259 for the optimized one, an 88 percent saving. The regression alert sits between the two, at 20 percent more per message.',
    body: () => {
      const bar = (y, label, v, s, k) => {
        const w = (v / 0.298967) * 420;
        return (
          text(20, y + 18, label, { anchor: 'start', size: 13 }) +
          `<rect x="130" y="${y}" width="${w.toFixed(1)}" height="26" rx="4" fill="${KIND[k].fill}" stroke="${KIND[k].stroke}" stroke-width="1.5"/>` +
          text(130 + w + 10, y + 18, s, { anchor: 'start', size: 13, mono: true })
        );
      };
      return (
        text(20, 36, '*Noise: the same conversation, run twice (about 9% apart)', { anchor: 'start' }) +
        bar(50, 'run 1', 0.102, '$0.102', 'data') +
        bar(84, 'run 2', 0.111, '$0.111', 'data') +
        text(20, 148, '*The saving: the full 14-message test (88% less)', { anchor: 'start' }) +
        bar(162, 'original', 0.298967, '$0.298967', 'bad') +
        bar(196, 'optimized', 0.035259, '$0.035259', 'code') +
        note(380, 256, 'The regression alert sits between the two: it fires at +20% per message')
      );
    },
  },

  'llm-costs-4/series-map.svg': {
    w: 760,
    h: 226,
    title:
      'The series in four steps and the number each one found. 1, measure: record every request; one request was 98 percent of the bill. 2, pick the model: rules plus a quality check; a perfect router saved only 2.5 percent. 3, send less work: shorter history and answers, reused answers and prompt caching; output was cut 95 percent. 4, prove and guard: check quality before cost; the bot became 88 percent cheaper with facts still 14 of 14.',
    body: () =>
      text(20, 30, '*Four steps, and the number each one found', { anchor: 'start' }) +
      [
        ['data', ['1 · Measure', 'record every request', 'one request was', '98% of the bill']],
        ['choice', ['2 · Pick the model', 'rules + quality check', 'a perfect router', 'saved only 2.5%']],
        ['code', ['3 · Send less work', 'history, answer length,', 'reuse, prompt caching', 'output cut 95%']],
        ['code', ['4 · Prove and guard', 'quality before cost', '88% cheaper,', 'facts still 14/14']],
      ]
        .map(
          ([k, l], i) =>
            box(20 + i * 186, 50, 160, 120, k, l, { size: 13 }) +
            (i < 3
              ? arrow([
                  [180 + i * 186, 110],
                  [204 + i * 186, 110],
                ])
              : '')
        )
        .join('') +
      note(380, 204, 'Check the top of your prompt: anything that changes on every request breaks the cache'),
  },

  'long-term-agentic-memory/semantic-store.svg': {
    w: 800,
    h: 290,
    title:
      'Adding semantic memory. The response agent gets two more tools and decides when to use them: manage_memory creates, updates or deletes a memory, and search_memory returns up to 10 of the closest memories by meaning. Both work on one drawer of the store, named email_assistant / lance / collection. Each memory, like "Jim is John Doe\'s friend.", is saved as text plus an embedding from text-embedding-3-small. In a new conversation, "who is jim?" led to a search for "Jim" that found it with a score of 0.39.',
    body: () =>
      box(20, 100, 170, 80, 'model', ['Response agent', 'decides when to', 'save or search']) +
      arrow([
        [190, 125],
        [238, 88],
      ]) +
      arrow([
        [190, 155],
        [238, 192],
      ]) +
      box(240, 60, 210, 56, 'code', ['`manage_memory', 'create · update · delete']) +
      box(240, 164, 210, 56, 'code', ['`search_memory', 'up to 10 closest by meaning']) +
      arrow([
        [450, 88],
        [498, 100],
      ]) +
      arrow([
        [450, 192],
        [498, 180],
      ]) +
      box(500, 40, 280, 196, 'data', []) +
      text(640, 66, '*One drawer of the store') +
      text(640, 88, '`email_assistant / lance / collection', { size: 12 }) +
      `<rect x="520" y="106" width="240" height="40" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>` +
      text(640, 131, '"Jim is John Doe\'s friend."', { size: 13.5 }) +
      text(640, 176, 'saved as text + an embedding', { size: 12.5, fill: MUTED }) +
      text(640, 196, '`text-embedding-3-small`', { size: 12.5, fill: MUTED }) +
      note(400, 272, 'New conversation: "who is jim?" → search "Jim" → found it, score 0.39'),
  },

  'long-term-agentic-memory/remember-gap.svg': {
    w: 760,
    h: 262,
    title:
      'Where it broke, in my first run. Alice\'s email asked about missing API endpoints. The agent searched memory and found only the Jim fact, at 0.26, then replied to Alice that it would send an update once the docs were revised. It never called manage_memory, so the promise was not saved. Instead it asked John: "Would you like me to schedule a reminder?" When Alice\'s second email asked for an update, the search found only the Jim fact again, at 0.22, so the agent had to ask John what she had wanted.',
    body: () =>
      text(20, 30, '*Email 1: it told John to remember, instead of remembering', { anchor: 'start' }) +
      box(20, 54, 170, 64, 'data', ["Alice's email", 'missing API endpoints?']) +
      arrow([
        [190, 86],
        [228, 86],
      ]) +
      box(230, 54, 180, 64, 'model', ['`search_memory', 'only Jim, score 0.26']) +
      arrow([
        [410, 86],
        [438, 86],
      ]) +
      box(440, 54, 300, 64, 'code', ['Reply to Alice', '"I\'ll send you an update once…"']) +
      arrow(
        [
          [590, 118],
          [590, 146],
        ],
        { dashed: true }
      ) +
      box(440, 148, 300, 64, 'bad', ['`manage_memory` never called', 'the promise was not saved'], { dashed: true }) +
      box(20, 148, 390, 64, 'choice', ['To John instead', '"Would you like me to schedule a reminder?"']) +
      note(380, 246, 'Email 2, "Any update on my previous ask?": only Jim again (0.22), so it asked John'),
  },

  'query-side-explained/result-pile.svg': {
    w: 760,
    h: 280,
    title:
      'The catch with asking several questions. The original question and five AI-written variations each get five results, up to 30 chunks instead of 5. Some answer a neighboring question rather than yours, like "decreases in revenue". A reranker scores every chunk against the original question, and only the top 5 go to the AI.',
    body: () => {
      const neighbor = new Set([7, 13, 14, 21, 26, 28]);
      let out = text(279, 28, '5 results each: up to 30 chunks', { size: 13 });
      for (let r = 0; r < 6; r++) {
        const cy = 50 + r * 34;
        out +=
          box(20, cy - 14, 150, 28, r === 0 ? 'choice' : 'data', [r === 0 ? 'original question' : `variation ${r}`], {
            size: 12.5,
            plain: r !== 0,
          }) +
          arrow([
            [170, cy],
            [204, cy],
          ]);
        for (let c = 0; c < 5; c++) {
          const k = neighbor.has(r * 5 + c) ? KIND.choice : KIND.data;
          out += `<rect x="${210 + c * 28}" y="${cy - 11}" width="22" height="22" rx="4" fill="${k.fill}" stroke="${k.stroke}" stroke-width="1.5"/>`;
        }
      }
      return (
        out +
        arrow([
          [358, 135],
          [398, 135],
        ]) +
        box(400, 99, 170, 72, 'model', ['Reranker', 'scores each chunk', 'vs the original']) +
        arrow([
          [570, 135],
          [598, 135],
        ]) +
        box(600, 99, 140, 72, 'code', ['Top 5', 'go to the AI']) +
        `<rect x="210" y="246" width="16" height="16" rx="3" fill="${KIND.choice.fill}" stroke="${KIND.choice.stroke}" stroke-width="1.5"/>` +
        note(234, 259, 'answers a neighboring question, like "decreases in revenue"', { anchor: 'start' })
      );
    },
  },

  'reranking-explained/next-ideas.svg': {
    w: 844,
    h: 260,
    title:
      'Where researchers are pushing next, one idea per step of the pipeline. Chunking: let AI models decide where to cut, an often overlooked piece. Embedding model: fine-tune it with good and bad examples, then re-save every chunk. Adaptor: a full neural network or a transformer layer instead of one grid. Reranker: a more powerful relevance model. Answer model: fine-tune it to expect retrieved text, as in RA-DIT and InstructRetro.',
    body: () =>
      text(20, 30, '*Where researchers are pushing next, step by step', { anchor: 'start' }) +
      [
        ['data', 'Chunking', ['AI decides', 'where to cut', '(often overlooked)']],
        ['model', 'Embedding model', ['fine-tune it,', 'then re-save', 'every chunk']],
        ['code', 'Adaptor', ['a full network or a', 'transformer layer,', 'not one grid']],
        ['model', 'Reranker', ['a more powerful', 'relevance model']],
        ['model', 'Answer model', ['fine-tune it to use', 'retrieved text', '(RA-DIT, InstructRetro)']],
      ]
        .map(([k, name, idea], i) => {
          const x = 20 + i * 164;
          return (
            box(x, 50, 148, 50, k, [name]) +
            (i < 4
              ? arrow([
                  [x + 148, 75],
                  [x + 162, 75],
                ])
              : '') +
            arrow(
              [
                [x + 74, 100],
                [x + 74, 128],
              ],
              { dashed: true }
            ) +
            box(x, 130, 148, 100, 'data', idea, { dashed: true, plain: true, size: 12.5 })
          );
        })
        .join(''),
  },

  'reranking-explained/course-map.svg': {
    w: 800,
    h: 226,
    title:
      'The whole course on one pipeline. A question is rewritten (step 2, part 1), turned into numbers and adjusted by an adaptor (step 4, part 2), searched by meaning (step 1, part 1), and reranked against the original question (step 3, part 2) before the top 5 go to the AI. Start with reranking: it runs locally and needs no training. Train an adaptor only once real users give feedback.',
    body: () =>
      text(20, 30, '*The whole course on one pipeline', { anchor: 'start' }) +
      [
        ['data', ['Question', 'from the user'], ''],
        ['model', ['Rewrite', 'the question'], '2 · part 1'],
        ['code', ['Embed', '+ adaptor'], '4 · part 2'],
        ['code', ['Search', 'by meaning'], '1 · part 1'],
        ['model', ['Rerank', 'vs the original'], '3 · part 2'],
        ['code', ['Top 5', 'to the AI'], ''],
      ]
        .map(([k, l, step], i) => {
          const x = 20 + i * 130;
          return (
            box(x, 60, 110, 64, k, l, { size: 13, dashed: i === 2 }) +
            (i < 5
              ? arrow([
                  [x + 110, 92],
                  [x + 128, 92],
                ])
              : '') +
            (step ? note(x + 55, 146, step) : '')
          );
        })
        .join('') +
      text(335, 178, 'train it only once', { size: 13, fill: MUTED }) +
      text(335, 196, 'users give feedback', { size: 13, fill: MUTED }) +
      text(595, 178, 'add this first: it runs', { size: 13, fill: KIND.code.ink }) +
      text(595, 196, 'locally, no training', { size: 13, fill: KIND.code.ink }),
  },

  'structured-output-explained/pydantic-to-schema.svg': {
    w: 760,
    h: 240,
    title:
      'Describe the form once. A short Pydantic class, User with name as text, age as a whole number and an optional email, is turned by Pydantic into a JSON Schema: name is a required string, age a required integer, and email a string or nothing. Way 1 hands that description to the AI company to enforce; Way 2 uses it in your own code to check the answer.',
    body: () =>
      box(
        20,
        50,
        240,
        120,
        'code',
        ['`class User(BaseModel):', '`  name: str', '`  age: int', '`  email: Optional[str] = None'],
        {
          align: 'left',
          size: 12,
        }
      ) +
      arrow(
        [
          [260, 110],
          [338, 110],
        ],
        { label: 'Pydantic', at: [299, 100] }
      ) +
      box(
        340,
        50,
        200,
        120,
        'data',
        ['JSON Schema', 'name: string, required', 'age: integer, required', 'email: string or nothing'],
        {
          size: 13,
        }
      ) +
      arrow([
        [540, 110],
        [568, 70],
      ]) +
      arrow([
        [540, 110],
        [568, 150],
      ]) +
      box(570, 40, 170, 56, 'model', ['Way 1', 'the company enforces']) +
      box(570, 124, 170, 56, 'code', ['Way 2', 'your code checks']) +
      note(380, 216, 'Write the form once; both ways use the same description'),
  },

  'structured-output-explained/box-order.svg': {
    w: 780,
    h: 300,
    title:
      'The AI fills in the form from top to bottom and can see what it already wrote. In the fake-customer-post form, user_mood comes first and the AI wrote "awful". Then product and sentiment, then an internal_monologue with thoughts like "This app is really frustrating me." Only then did it write the message: "I\'ve been having constant issues with the app crashing on my phone…" Put the thinking boxes first; after the answer, they only explain a choice already made.',
    body: () =>
      text(20, 30, '*The AI fills the form top to bottom, and sees what it already wrote', { anchor: 'start' }) +
      `<path d="M184 52V212" stroke="#94a3b8" stroke-width="1.5" fill="none"/>` +
      text(20, 128, '*thinking first', { anchor: 'start', size: 13 }) +
      text(20, 266, '*then the answer', { anchor: 'start', size: 13 }) +
      box(200, 52, 520, 40, 'model', ['`user_mood: "awful"'], { align: 'left', size: 12 }) +
      box(200, 102, 520, 40, 'ghost', ['`product: …   sentiment: …'], { align: 'left', size: 12 }) +
      box(200, 152, 520, 60, 'model', ['`internal_monologue:', '`  ["This app is really frustrating me.", …]'], {
        align: 'left',
        size: 12,
      }) +
      box(200, 238, 520, 50, 'data', ['`message: "I\'ve been having constant issues with the app crashing…"'], {
        align: 'left',
        size: 12,
      }) +
      arrow([
        [748, 56],
        [748, 282],
      ]) +
      note(748, 46, 'order'),
  },

  'structured-output-explained/which-way-1.svg': {
    w: 760,
    h: 270,
    title:
      'Which way to use. If you need dates, patterns or custom rules, or want to switch providers easily, use Way 2, check and retry: it works with almost any provider and every Pydantic check, but count your retries, because each is a full request. Otherwise start with Way 1, where the AI company enforces the form: a few extra lines, but tied to one provider and only part of JSON.',
    body: () =>
      diamond(160, 130, 140, 70, ['Need dates, patterns,', 'custom rules or', 'several providers?']) +
      arrow(
        [
          [300, 130],
          [340, 130],
          [340, 75],
          [378, 75],
        ],
        { label: 'yes', at: [346, 104], anchor: 'start' }
      ) +
      arrow(
        [
          [300, 130],
          [340, 130],
          [340, 195],
          [378, 195],
        ],
        { label: 'no', at: [346, 166], anchor: 'start' }
      ) +
      box(
        380,
        40,
        360,
        70,
        'code',
        ['Way 2: check and retry', 'any provider, every Pydantic check;', 'each retry is a full request'],
        {
          size: 13,
        }
      ) +
      box(
        380,
        160,
        360,
        70,
        'model',
        ['Way 1: the AI company enforces it', 'a few extra lines; one provider,', 'only part of JSON'],
        {
          size: 13,
        }
      ) +
      note(380, 256, 'Both ask the model to behave, then check whether it did'),
  },

  'structured-output-explained/pattern-vs-model.svg': {
    w: 760,
    h: 240,
    title:
      "The pattern does the layout, the model makes the choices. In the phone number (206) 555-1234, the brackets, space and dash are fixed by the pattern and the digits are chosen by the model. On the tic-tac-toe board's top row, X|O|O, the bars are fixed by the pattern and the model only picks X, O or blank in each spot, so it cannot draw a broken board.",
    body: () => {
      const row = (y, label, segs) => {
        let x = 200;
        let out = text(20, y + 25, `*${label}`, { anchor: 'start', size: 13.5 });
        for (const [s, k] of segs) {
          const w = s.length * 15 + 22;
          out += box(x, y, w, 40, k, ['`' + s], { plain: true, size: 15 });
          x += w + 6;
        }
        return out;
      };
      return (
        text(20, 30, '*The pattern does the layout; the model makes the choices', { anchor: 'start' }) +
        row(56, 'Phone number', [
          ['(', 'code'],
          ['206', 'model'],
          [')', 'code'],
          ['555', 'model'],
          ['-', 'code'],
          ['1234', 'model'],
        ]) +
        row(126, 'Tic-tac-toe, top row', [
          ['X', 'model'],
          ['|', 'code'],
          ['O', 'model'],
          ['|', 'code'],
          ['O', 'model'],
        ]) +
        `<rect x="200" y="200" width="16" height="16" rx="3" fill="${KIND.code.fill}" stroke="${KIND.code.stroke}" stroke-width="1.5"/>` +
        note(224, 213, 'fixed by the pattern', { anchor: 'start' }) +
        `<rect x="400" y="200" width="16" height="16" rx="3" fill="${KIND.model.fill}" stroke="${KIND.model.stroke}" stroke-width="1.5"/>` +
        note(424, 213, 'chosen by the model', { anchor: 'start' })
      );
    },
  },

  'structured-output-explained/shape-vs-truth.svg': {
    w: 760,
    h: 220,
    title:
      'Correct shape isn\'t correct answer. An answer like Person(name=\'John\', age=30) passes the question "does it fit the form?", which all three ways make sure of. It fails "is it true?", which none of them check: it is perfect JSON that describes nobody. You still have to check the facts yourself, with code or a person.',
    body: () =>
      box(20, 70, 240, 80, 'data', ['The answer', "`Person(name='John', age=30)"], { size: 12.5 }) +
      arrow([
        [260, 110],
        [298, 70],
      ]) +
      arrow([
        [260, 110],
        [298, 160],
      ]) +
      box(300, 40, 210, 60, 'code', ['Fits the form?', '✓ all three ways check']) +
      box(300, 130, 210, 60, 'bad', ['Is it true?', '✗ none of them check']) +
      arrow([
        [510, 160],
        [538, 160],
      ]) +
      box(540, 130, 200, 60, 'choice', ['You check the facts', 'with code or a person']) +
      note(540, 66, 'perfect JSON that', { anchor: 'start' }) +
      note(540, 84, 'describes nobody', { anchor: 'start' }),
  },

  'structured-output-explained/which-way-3.svg': {
    w: 800,
    h: 340,
    title:
      'Which of the three ways to use. If you run your own model, or the output is not JSON at all, use Way 3, structured generation: a broken format cannot be written, and it handles labels, phone numbers, CSV rows and game boards. Otherwise, if you need custom checks or want to switch between companies, use Way 2, check and retry, which costs a full request for every retry. Otherwise use Way 1, where the AI company enforces a simple form.',
    body: () =>
      diamond(150, 90, 130, 56, ['Own model, or', 'output not JSON?']) +
      arrow(
        [
          [280, 90],
          [418, 90],
        ],
        { label: 'yes' }
      ) +
      box(
        420,
        54,
        360,
        72,
        'code',
        ['Way 3: structured generation', "a broken format can't be written", 'labels, phones, CSV rows, boards'],
        {
          size: 13,
        }
      ) +
      arrow(
        [
          [150, 146],
          [150, 162],
        ],
        { label: 'no', at: [164, 158], anchor: 'start' }
      ) +
      diamond(150, 220, 130, 56, ['Custom checks or', 'several companies?']) +
      arrow(
        [
          [280, 220],
          [418, 220],
        ],
        { label: 'yes' }
      ) +
      box(
        420,
        184,
        360,
        72,
        'code',
        ['Way 2: check and retry', 'any company, every Pydantic check', 'a full request for every retry'],
        {
          size: 13,
        }
      ) +
      arrow(
        [
          [150, 276],
          [150, 300],
          [418, 300],
        ],
        { label: 'no', at: [164, 294], anchor: 'start' }
      ) +
      box(420, 272, 360, 52, 'model', ['Way 1: the AI company enforces it', 'one provider, a simple form'], {
        size: 13,
      }),
  },
};

for (const [path, d] of Object.entries(DIAGRAMS)) {
  const file = `${OUT}/${path}`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, svg(d.w, d.h, d.title, d.body()));
}
console.log(`${Object.keys(DIAGRAMS).length} diagrams written`);
