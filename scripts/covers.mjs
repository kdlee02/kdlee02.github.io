// Draws the 1200x630 cover of every post into src/assets/images/covers/<slug>.svg,
// plus a <slug>.png copy used as the social preview image (Astro does not rasterize SVG).
// Run: node scripts/covers.mjs   (then look at the files before publishing)
// A new post needs one entry in COVERS: its series key, part and a small diagram of its core idea.
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const OUT = 'src/assets/images/covers';
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, Menlo, Consolas, 'DejaVu Sans Mono', monospace";

// One ground and one accent per series. Posts outside a series use `rag`.
const SERIES = {
  '12f': { name: '12-FACTOR AGENTS', total: 4, bg: '#121a3d', ac: '#9db4ff' },
  agentic: { name: 'AGENTIC AI', total: 5, bg: '#3a2707', ac: '#ffc861' },
  langgraph: { name: 'LANGGRAPH', total: 6, bg: '#0c3a3d', ac: '#7de3d6' },
  costs: { name: 'OPTIMIZING LLM COSTS', total: 4, bg: '#12331b', ac: '#a8e89a' },
  memory: { name: 'AGENT MEMORY', total: 2, bg: '#40170f', ac: '#ff9d7e' },
  retrieval: { name: 'ADVANCED RETRIEVAL', total: 2, bg: '#10293f', ac: '#8fd0ff' },
  structured: { name: 'STRUCTURED OUTPUT', total: 2, bg: '#2b2a10', ac: '#e8e272' },
  rag: { name: 'RAG', total: 0, bg: '#1d2430', ac: '#b9c7dc' },
};

// --- drawing helpers. `c` is the series entry; accent shapes are filled with c.ac. ---
const W = '#ffffff';
const txt = (x, y, s, o = {}) =>
  `<text x="${x}" y="${y}" font-family="${o.mono ? MONO : SANS}" font-size="${o.size ?? 26}" font-weight="${o.weight ?? 500}" text-anchor="${o.anchor ?? 'middle'}" fill="${o.fill ?? W}" opacity="${o.op ?? 1}">${s}</text>`;
const box = (c, x, y, w, h, label, o = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.rx ?? 14}" fill="${o.accent ? c.ac : W}" fill-opacity="${o.accent ? 1 : (o.fill ?? 0.07)}" stroke="${o.accent ? c.ac : W}" stroke-width="2.5" stroke-opacity="${o.op ?? 0.9}"${o.dashed ? ' stroke-dasharray="9 8"' : ''}/>` +
  (label
    ? txt(x + w / 2, y + h / 2 + (o.size ?? 26) * 0.35, label, {
        fill: o.accent ? c.bg : W,
        size: o.size,
        mono: o.mono,
        weight: o.accent ? 600 : 500,
      })
    : '');
const circle = (c, cx, cy, r, label, o = {}) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${o.accent ? c.ac : W}" fill-opacity="${o.accent ? 1 : 0.07}" stroke="${o.accent ? c.ac : W}" stroke-width="2.5" stroke-opacity="0.9"/>` +
  (label
    ? txt(cx, cy + (o.size ?? 24) * 0.35, label, { fill: o.accent ? c.bg : W, size: o.size ?? 24, weight: 600 })
    : '');
const diamond = (c, cx, cy, r, o = {}) =>
  `<path d="M${cx - r} ${cy}L${cx} ${cy - r}L${cx + r} ${cy}L${cx} ${cy + r}Z" fill="${o.accent ? c.ac : W}" fill-opacity="${o.accent ? 1 : 0.07}" stroke="${o.accent ? c.ac : W}" stroke-width="2.5" stroke-opacity="0.9"/>`;
const line = (d, o = {}) =>
  `<path d="${d}" fill="none" stroke="${o.stroke ?? W}" stroke-width="${o.width ?? 2.5}" stroke-opacity="${o.op ?? 0.75}"${o.dashed ? ' stroke-dasharray="9 8"' : ''}${o.head === false ? '' : ' marker-end="url(#a)"'} stroke-linecap="round"/>`;
const arrow = (x1, y1, x2, y2, o) => line(`M${x1} ${y1}L${x2} ${y2}`, o);
const bar = (c, x, y, w, h, o = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.rx ?? 6}" fill="${o.accent ? c.ac : W}" fill-opacity="${o.accent ? 1 : (o.op ?? 0.55)}"/>`;
const tick = (x, y) => line(`M${x - 12} ${y}L${x - 3} ${y + 10}L${x + 14} ${y - 11}`, { head: false, width: 4, op: 1 });
const cross = (x, y, o = {}) =>
  line(`M${x - 11} ${y - 11}L${x + 11} ${y + 11}M${x + 11} ${y - 11}L${x - 11} ${y + 11}`, {
    head: false,
    width: 4,
    op: 1,
    stroke: o.stroke ?? W,
  });

// --- one small diagram per post ---
const COVERS = {
  '12-factor-agents-1-the-twelve-principles': [
    '12f',
    1,
    (c) => {
      const rows = ['in and out', 'keep track', 'grow'];
      let s = '';
      rows.forEach((label, r) => {
        const y = 178 + r * 124;
        s += txt(470, y + 58, label, { anchor: 'end', op: 0.8 });
        for (let i = 0; i < 4; i++)
          s += box(c, 520 + i * 124, y, 100, 100, String(r * 4 + i + 1), { accent: r === 0, mono: true, size: 34 });
      });
      return s;
    },
  ],
  '12-factor-agents-2-tool-calls-and-the-agent-loop': [
    '12f',
    2,
    (c) =>
      box(c, 130, 270, 230, 96, 'model') +
      arrow(360, 318, 474, 318) +
      box(c, 485, 270, 230, 96, 'tool call', { accent: true }) +
      arrow(715, 318, 829, 318) +
      box(c, 840, 270, 230, 96, 'your code') +
      line('M955 366C955 500 245 500 245 378') +
      txt(600, 512, 'result goes back in', { op: 0.8, size: 24 }),
  ],
  '12-factor-agents-3-a-stateless-agent': [
    '12f',
    3,
    (c) =>
      box(c, 130, 282, 220, 100, 'state') +
      arrow(350, 332, 498, 332) +
      circle(c, 600, 332, 92, 'agent( )', { accent: true }) +
      arrow(692, 332, 838, 332) +
      box(c, 850, 282, 220, 100, 'new state') +
      bar(c, 516, 478, 12, 40, { op: 0.9 }) +
      bar(c, 538, 478, 12, 40, { op: 0.9 }) +
      txt(566, 507, 'pause, resume later', { anchor: 'start', op: 0.8, size: 24 }),
  ],
  '12-factor-agents-4-agents-behind-an-api': [
    '12f',
    4,
    (c) =>
      ['web', 'Slack', 'CLI']
        .map((l, i) => box(c, 110, 190 + i * 110, 170, 76, l) + arrow(280, 228 + i * 110, 430, 330 + (i - 1) * 14))
        .join('') +
      box(c, 440, 278, 170, 110, 'API', { accent: true }) +
      arrow(610, 333, 698, 333) +
      box(c, 708, 278, 170, 110, 'agent') +
      arrow(878, 333, 936, 333) +
      box(c, 946, 278, 170, 110, 'saved', { dashed: true }),
  ],
  'advanced-retrieval-pipeline': [
    'rag',
    0,
    (c) =>
      box(c, 110, 200, 220, 84, 'keyword') +
      box(c, 110, 400, 220, 84, 'meaning') +
      arrow(330, 242, 458, 318) +
      arrow(330, 442, 458, 366) +
      box(c, 468, 300, 180, 84, 'merge') +
      arrow(648, 342, 738, 342) +
      box(c, 748, 300, 180, 84, 'rerank', { accent: true }) +
      arrow(928, 342, 988, 342) +
      bar(c, 1000, 296, 120, 22, { accent: true }) +
      bar(c, 1000, 332, 90, 22) +
      bar(c, 1000, 368, 60, 22),
  ],
  'agentic-ai-module-1-what-makes-a-workflow-agentic': [
    'agentic',
    1,
    (c) =>
      ['outline', 'research', 'draft', 'revise']
        .map(
          (l, i) =>
            box(c, 110 + i * 262, 200, 190, 84, l, { accent: i === 3 }) +
            (i < 3 ? arrow(300 + i * 262, 242, 362 + i * 262, 242) : '')
        )
        .join('') +
      line('M150 430L1050 430', { head: false, op: 0.5 }) +
      circle(c, 700, 430, 18, '', { accent: true }) +
      txt(150, 486, 'fixed steps', { anchor: 'start', op: 0.8, size: 24 }) +
      txt(1050, 486, 'full autonomy', { anchor: 'end', op: 0.8, size: 24 }),
  ],
  'agentic-ai-module-2-reflection': [
    'agentic',
    2,
    (c) =>
      box(c, 130, 320, 220, 96, 'draft') +
      arrow(350, 368, 478, 368) +
      box(c, 490, 320, 220, 96, 'critique', { accent: true }) +
      arrow(710, 368, 838, 368) +
      box(c, 850, 320, 220, 96, 'revise') +
      line('M960 320C960 190 600 190 600 308') +
      txt(780, 196, 'again, until it passes', { op: 0.8, size: 24 }),
  ],
  'agentic-ai-module-3-tool-use': [
    'agentic',
    3,
    (c) =>
      [
        [130, 200, 'search'],
        [130, 440, 'code'],
        [870, 200, 'calendar'],
        [870, 440, 'database'],
      ]
        .map(
          ([x, y, l]) =>
            line(`M600 360L${x < 600 ? x + 200 : x} ${y + 40}`, { head: false, op: 0.55 }) + box(c, x, y, 200, 80, l)
        )
        .join('') + circle(c, 600, 360, 84, 'LLM', { accent: true, size: 30 }),
  ],
  'agentic-ai-module-4-evals-and-error-analysis': [
    'agentic',
    4,
    (c) =>
      ['plan', 'search', 'write', 'check']
        .map((l, i) => {
          const x = 105 + i * 262;
          return (
            box(c, x, 310, 200, 92, l, { accent: i === 1 }) +
            (i < 3 ? arrow(x + 200, 356, x + 252, 356) : '') +
            (i === 1 ? cross(x + 100, 262, { stroke: c.ac }) : tick(x + 100, 262))
          );
        })
        .join('') + txt(600, 486, 'find the step that broke', { op: 0.8, size: 24 }),
  ],
  'agentic-ai-module-5-planning-and-multi-agent-systems': [
    'agentic',
    5,
    (c) =>
      box(c, 480, 180, 240, 88, 'planner', { accent: true }) +
      ['researcher', 'writer', 'editor']
        .map(
          (l, i) =>
            arrow(600 + (i - 1) * 40, 268, 250 + i * 350 + (1 - i) * 20, 398) + box(c, 140 + i * 350, 410, 220, 88, l)
        )
        .join('') +
      arrow(360, 454, 478, 454, { dashed: true }) +
      arrow(710, 454, 828, 454, { dashed: true }),
  ],
  'five-levels-of-text-splitting': [
    'rag',
    0,
    (c) => {
      const rows = [
        [1, 1, 1, 1, 1, 1, 1, 1],
        [1.6, 0.8, 1.3, 0.7, 1.4, 1.2, 1],
        [0.6, 2.2, 0.6, 1.8, 0.6, 2.2],
        [2.6, 3.2, 2.2],
        [1.9, 1.1, 2.4, 0.9, 1.7],
      ];
      return rows
        .map((parts, r) => {
          const y = 176 + r * 76;
          const total = parts.reduce((a, b) => a + b, 0);
          let x = 250;
          const unit = (840 - (parts.length - 1) * 10) / total;
          return (
            txt(190, y + 33, String(r + 1), { mono: true, size: 30, op: 0.8 }) +
            parts
              .map((p) => {
                const w = p * unit;
                const out = bar(c, x, y, w, 46, { accent: r === 4, op: 0.25 + r * 0.1, rx: 8 });
                x += w + 10;
                return out;
              })
              .join('')
          );
        })
        .join('');
    },
  ],
  'langgraph-1-langchain-tool-calling': [
    'langgraph',
    1,
    (c) =>
      box(c, 80, 290, 200, 88, 'question') +
      arrow(280, 334, 338, 334) +
      box(c, 348, 290, 170, 88, 'model') +
      arrow(518, 334, 576, 334) +
      box(c, 586, 290, 230, 88, 'tool call', { accent: true }) +
      txt(701, 258, '{ name, args }', { mono: true, size: 22, op: 0.8 }) +
      arrow(816, 334, 874, 334) +
      box(c, 884, 290, 190, 88, 'tool') +
      line('M979 378C979 510 433 510 433 390') +
      txt(706, 522, 'result', { op: 0.8, size: 24 }),
  ],
  'langgraph-2-stategraph': [
    'langgraph',
    2,
    (c) =>
      circle(c, 150, 360, 58, 'START', { size: 20 }) +
      arrow(208, 360, 270, 360) +
      box(c, 280, 316, 190, 88, 'node A') +
      arrow(470, 360, 548, 360) +
      diamond(c, 620, 360, 66, { accent: true }) +
      arrow(668, 318, 778, 262) +
      arrow(668, 402, 778, 458) +
      box(c, 788, 206, 190, 88, 'node B') +
      box(c, 788, 414, 190, 88, 'node C') +
      arrow(978, 262, 1052, 326) +
      arrow(978, 458, 1052, 394) +
      circle(c, 1090, 360, 46, 'END', { size: 20 }),
  ],
  'langgraph-3-react-agent-and-memory': [
    'langgraph',
    3,
    (c) =>
      box(c, 490, 168, 220, 88, 'reason', { accent: true }) +
      box(c, 810, 400, 200, 88, 'act') +
      box(c, 190, 400, 200, 88, 'observe') +
      arrow(710, 240, 880, 390) +
      arrow(320, 390, 490, 240) +
      line('M910 488C910 590 290 590 290 500') +
      box(c, 500, 404, 200, 80, 'memory', { dashed: true }),
  ],
  'langgraph-4-routing-and-human-in-the-loop': [
    'langgraph',
    4,
    (c) =>
      box(c, 80, 316, 190, 88, 'question') +
      arrow(270, 360, 332, 360) +
      diamond(c, 400, 360, 60) +
      ['answer directly', 'one search', 'many searches']
        .map((l, i) => {
          const y = 190 + i * 132;
          return (
            arrow(448, 360 + (i - 1) * 30, 588, y + 38) +
            box(c, 598, y, 270, 76, l) +
            arrow(868, y + 38, 962, 360 + (i - 1) * 34)
          );
        })
        .join('') +
      circle(c, 1030, 360, 68, 'person', { accent: true, size: 22 }),
  ],
  'langgraph-5-self-rag-and-subgraphs': [
    'langgraph',
    5,
    (c) =>
      box(c, 80, 290, 190, 88, 'retrieve') +
      arrow(270, 334, 328, 334) +
      box(c, 338, 290, 190, 88, 'generate') +
      arrow(528, 334, 590, 334) +
      [0, 1, 2]
        .map(
          (i) =>
            circle(c, 640 + i * 96, 334, 38, '', { accent: i === 2 }) +
            (i === 2 ? cross(832, 334, { stroke: c.bg }) : tick(640 + i * 96, 334))
        )
        .join('') +
      arrow(870, 334, 938, 334) +
      box(c, 948, 290, 170, 88, 'answer') +
      line('M832 372C832 520 175 520 175 390') +
      txt(504, 532, 'rewrite the question', { op: 0.8, size: 24 }),
  ],
  'langgraph-6-corrective-rag': [
    'langgraph',
    6,
    (c) =>
      box(c, 80, 300, 190, 88, 'retrieve') +
      arrow(270, 344, 338, 344) +
      box(c, 348, 300, 170, 88, 'grade', { accent: true }) +
      bar(c, 348, 412, 170, 12, { op: 0.25 }) +
      bar(c, 348, 412, 85, 12, { accent: true }) +
      txt(433, 462, '0.5', { mono: true, size: 24, op: 0.9 }) +
      arrow(518, 322, 618, 244) +
      arrow(518, 366, 618, 444) +
      box(c, 628, 190, 290, 84, 'use the documents') +
      box(c, 628, 414, 290, 84, 'search the web', { dashed: true }) +
      arrow(918, 244, 966, 292) +
      arrow(918, 444, 966, 396) +
      box(c, 960, 300, 170, 88, 'generate'),
  ],
  'llm-costs-1-measuring-what-a-request-costs': [
    'costs',
    1,
    (c) =>
      box(c, 390, 160, 420, 400, '', { rx: 10 }) +
      [
        ['input', 70, false],
        ['output', 190, false],
        ['thinking', 120, true],
      ]
        .map(
          ([l, w, acc], i) =>
            txt(430, 238 + i * 76, l, { anchor: 'start', mono: true, size: 24 }) +
            bar(c, 580, 218 + i * 76, w, 26, { accent: acc })
        )
        .join('') +
      line('M430 430L770 430', { head: false, dashed: true, op: 0.6 }) +
      txt(430, 500, 'total', { anchor: 'start', mono: true, size: 28, weight: 700 }) +
      bar(c, 580, 476, 190, 32, { accent: true }),
  ],
  'llm-costs-2-model-selection-and-routing': [
    'costs',
    2,
    (c) =>
      box(c, 100, 316, 200, 88, 'request') +
      arrow(300, 360, 368, 360) +
      diamond(c, 440, 360, 62) +
      arrow(486, 322, 628, 248) +
      arrow(486, 398, 628, 472) +
      box(c, 638, 200, 250, 88, 'small model', { accent: true }) +
      box(c, 638, 432, 250, 88, 'large model') +
      txt(920, 256, '$', { anchor: 'start', mono: true, size: 40, fill: c.ac }) +
      txt(920, 488, '$$$', { anchor: 'start', mono: true, size: 40, op: 0.85 }),
  ],
  'llm-costs-3-reducing-llm-work': [
    'costs',
    3,
    (c) =>
      [0, 1, 2, 3, 4, 5]
        .map((i) => bar(c, 120, 180 + i * 60, i % 2 ? 250 : 300, 40, { op: i < 4 ? 0.16 : 0.7, rx: 8 }))
        .join('') +
      txt(270, 572, 'old messages trimmed', { op: 0.8, size: 22 }) +
      arrow(440, 348, 528, 348) +
      box(c, 540, 300, 210, 96, 'cache', { accent: true }) +
      arrow(750, 348, 858, 348) +
      box(c, 870, 300, 210, 96, 'model'),
  ],
  'llm-costs-4-optimizing-a-real-chatbot': [
    'costs',
    4,
    (c) =>
      line('M260 520L800 520', { head: false, op: 0.6 }) +
      bar(c, 330, 180, 160, 340, { op: 0.3, rx: 8 }) +
      bar(c, 570, 479, 160, 41, { accent: true, rx: 8 }) +
      txt(410, 566, 'before', { op: 0.8, size: 24 }) +
      txt(650, 566, 'after', { op: 0.8, size: 24 }) +
      txt(960, 400, '−88%', { size: 92, weight: 700, fill: c.ac }),
  ],
  'long-term-agentic-memory-1-semantic-memory': [
    'memory',
    1,
    (c) =>
      box(c, 120, 300, 230, 110, 'agent', { accent: true }) +
      arrow(350, 332, 628, 332) +
      txt(490, 314, 'save a fact', { op: 0.8, size: 22 }) +
      arrow(628, 380, 362, 380) +
      txt(490, 416, 'look it up', { op: 0.8, size: 22 }) +
      box(c, 640, 180, 440, 350, '', { dashed: true }) +
      [0, 1, 2]
        .map(
          (i) =>
            box(c, 680, 218 + i * 96, 360, 76, '', { fill: 0.12 }) +
            bar(c, 706, 244 + i * 96, 60, 22, { accent: true }) +
            bar(c, 782, 244 + i * 96, 150 + ((i * 53) % 80), 22, { op: 0.5 })
        )
        .join(''),
  ],
  'long-term-agentic-memory-2-episodic-and-procedural-memory': [
    'memory',
    2,
    (c) =>
      ['facts', 'examples', 'instructions']
        .map(
          (l, i) =>
            box(c, 120 + i * 340, 190, 280, 88, l, { dashed: i === 0 }) + arrow(260 + i * 340, 278, 520 + i * 80, 418)
        )
        .join('') +
      box(c, 460, 430, 280, 96, 'agent', { accent: true }) +
      line('M740 478C1000 478 940 380 940 290') +
      txt(1040, 420, 'feedback', { op: 0.8, size: 22 }),
  ],
  'preprocessing-unstructured-data': [
    'rag',
    0,
    (c) =>
      ['PDF', 'PPTX', 'HTML']
        .map(
          (l, i) =>
            box(c, 100, 180 + i * 122, 160, 84, l, { mono: true }) + arrow(260, 222 + i * 122, 398, 344 + (i - 1) * 14)
        )
        .join('') +
      box(c, 410, 300, 210, 88, 'partition', { accent: true }) +
      arrow(620, 344, 738, 344) +
      ['Title', 'Text', 'Table', 'List'].map((l, i) => box(c, 750, 176 + i * 90, 340, 66, l, { fill: 0.12 })).join(''),
  ],
  'query-side-retrieval': [
    'retrieval',
    1,
    (c) => {
      let dots = '';
      for (let i = 0; i < 30; i++) {
        const x = 780 + ((i * 97) % 320);
        const y = 190 + ((i * 61 + (i % 3) * 40) % 340);
        const hit = Math.hypot(x - 900, y - 330) < 80;
        dots += `<circle cx="${x}" cy="${y}" r="${hit ? 11 : 8}" fill="${hit ? c.ac : W}" fill-opacity="${hit ? 1 : 0.4}"/>`;
      }
      return (
        box(c, 90, 316, 200, 88, 'question') +
        [0, 1, 2, 3]
          .map(
            (i) =>
              arrow(290, 360, 418, 216 + i * 96) +
              box(c, 430, 182 + i * 96, 200, 68, `rewrite ${i + 1}`, { size: 22, accent: i === 1 }) +
              arrow(630, 216 + i * 96, 740, 330 + (i - 1.5) * 20, { dashed: true })
          )
          .join('') +
        dots
      );
    },
  ],
  'reranking-and-embedding-adaptors': [
    'retrieval',
    2,
    (c) => {
      const order = [2, 0, 4, 1, 3];
      return (
        txt(600, 190, 'rerank', { size: 28, fill: c.ac, weight: 600 }) +
        [0, 1, 2, 3, 4]
          .map(
            (i) =>
              box(c, 150, 210 + i * 66, 300, 48, String(i + 1), { mono: true, size: 22, rx: 8 }) +
              line(
                `M450 ${234 + i * 66}C600 ${234 + i * 66} 600 ${234 + order.indexOf(i) * 66} 742 ${234 + order.indexOf(i) * 66}`,
                { op: 0.6 }
              ) +
              box(c, 750, 210 + i * 66, 300, 48, String(order[i] + 1), { mono: true, size: 22, rx: 8, accent: i < 2 })
          )
          .join('')
      );
    },
  ],
  'three-ways-to-get-structured-output': [
    'structured',
    1,
    (c) =>
      box(c, 110, 220, 340, 240, '') +
      [260, 200, 280, 160].map((w, i) => bar(c, 140, 256 + i * 46, w, 20, { op: 0.45 })).join('') +
      arrow(450, 340, 688, 340) +
      box(c, 700, 180, 390, 330, '', { rx: 10 }) +
      ['name', 'age', 'email']
        .map(
          (l, i) =>
            txt(736, 262 + i * 88, l + ':', { anchor: 'start', mono: true, size: 24 }) +
            bar(c, 850, 238 + i * 88, [200, 80, 200][i], 34, { accent: true, rx: 6 })
        )
        .join(''),
  ],
  'structured-generation-with-outlines': [
    'structured',
    2,
    (c) => {
      const rows = [
        ['{', 'Sure', 'The', '[', 'Hi', '1'],
        ['}', 'the', '"name"', '42', 'yes', ','],
        ['"', '}', 'is', '=', ':', 'a'],
      ];
      const ok = [0, 2, 4];
      return rows
        .map(
          (r, j) =>
            txt(220, 256 + j * 110, String(j + 1), { mono: true, size: 28, op: 0.8 }) +
            r
              .map((t, i) => {
                const x = 270 + i * 136;
                const y = 206 + j * 110;
                return i === ok[j]
                  ? box(c, x, y, 120, 76, t, { accent: true, mono: true, size: 22 })
                  : box(c, x, y, 120, 76, '', { fill: 0.04, op: 0.3 }) +
                      txt(x + 60, y + 46, t, { mono: true, size: 22, op: 0.35 }) +
                      line(`M${x + 26} ${y + 38}L${x + 94} ${y + 38}`, { head: false, op: 0.35, width: 2 });
              })
              .join('')
        )
        .join('');
    },
  ],
};

mkdirSync(OUT, { recursive: true });
for (const [slug, [key, part, draw]] of Object.entries(COVERS)) {
  const c = SERIES[key];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
<defs>
<marker id="a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${W}" fill-opacity="0.85"/></marker>
<pattern id="d" width="30" height="30" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.5" fill="${W}" fill-opacity="0.09"/></pattern>
</defs>
<rect width="1200" height="630" fill="${c.bg}"/>
<rect width="1200" height="630" fill="url(#d)"/>
${txt(72, 96, c.name, { anchor: 'start', mono: true, size: 24, fill: c.ac, weight: 600 })}
${part ? txt(1128, 96, `${String(part).padStart(2, '0')} / ${String(c.total).padStart(2, '0')}`, { anchor: 'end', mono: true, size: 24, op: 0.7 }) : ''}
${draw(c)}
</svg>
`;
  writeFileSync(`${OUT}/${slug}.svg`, svg);
  await sharp(Buffer.from(svg)).png().toFile(`${OUT}/${slug}.png`);
}
console.log(`${Object.keys(COVERS).length} covers written to ${OUT}`);
