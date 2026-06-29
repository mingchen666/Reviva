---
name: flashcard-generator
description: Generate educational flashcards from topics, documents, notes, or study materials. Produces structured JSON data and can create polished Tailwind CSS HTML flashcard review pages with interactive card flipping, progress, tags, and difficulty labels.
---

# Flashcard Generator

## Purpose

This skill helps the agent create effective learning flashcards from user-provided topics, documents, notes, lecture slides, textbooks, or study goals.

It supports two main outputs:

1. Structured flashcard data in JSON.
2. A polished HTML flashcard review page styled with Tailwind CSS.

The goal is to help users memorize, review, and actively recall important knowledge.

---

## When to Use

Use this skill when the user asks to:

- create flashcards;
- generate memory cards;
- turn notes into flashcards;
- make Anki-style cards;
- create cards from a document;
- create JSON flashcard data;
- create an HTML flashcard page;
- make a Tailwind CSS flashcard review page;
- generate review cards for exams;
- make concept-definition cards;
- create cloze deletion cards;
- create formula, term, event, or process cards.

Examples:

- “把这份文档做成闪卡。”
- “根据这章内容生成 30 张复习卡。”
- “生成 JSON 格式的闪卡。”
- “帮我做一个高颜值 HTML 闪卡页面。”
- “用 Tailwind CSS 做一个可翻面的闪卡复习网页。”
- “把这些术语做成 Anki 风格卡片。”
- “根据这份课件生成闪卡并创建 HTML 文件。”

---

## When Not to Use

Do not use this skill when:

- the user wants a general explanation rather than flashcards;
- the user wants a quiz or exam instead of memory cards;
- the user wants a full document summary only;
- no topic, document, or learning material is provided and the user refuses to provide one;
- the user asks for fabricated facts or unsupported source-specific content.

If the user actually wants assessment questions, use or suggest the quiz generator instead.

---

## Inputs

The user may provide:

- topic;
- pasted notes;
- uploaded documents;
- textbook excerpts;
- lecture slides;
- vocabulary lists;
- formulas;
- exam scope;
- desired card count;
- difficulty level;
- card type;
- tags;
- target audience;
- output format;
- request for JSON;
- request for HTML;
- visual style preference;
- file creation request.

---

## Missing Information Handling

### If No Topic or Material Is Provided

Ask for the source material or topic.

```markdown
可以。请先提供你想制作闪卡的内容，例如：

- 一个知识点或主题；
- 一份文档；
- 一段课堂笔记；
- 一章教材；
- 一个术语列表；
- 一个考试范围。

你也可以告诉我：
1. 需要多少张卡；
2. 卡片难度；
3. 是否需要 JSON；
4. 是否需要生成 Tailwind HTML 复习页面。
```

### If Output Format Is Missing

Default to JSON flashcards and offer HTML.

```markdown
我可以先生成结构化 JSON 闪卡数据。
如果你需要，我也可以继续把它做成一个高颜值 Tailwind HTML 复习页面。
```

### If Card Count Is Missing

Choose a reasonable number based on material length.

Default guidelines:

- Short topic: 8-12 cards.
- Medium notes: 15-25 cards.
- Long document/chapter: 30-50 cards.
- Multiple documents: ask if unclear, or generate a balanced deck.

---

## Document Handling Rules

If the user provides documents, notes, slides, or pasted materials:

1. Read the relevant content before generating cards.
2. Treat the material as the primary source.
3. Preserve terminology, definitions, formulas, examples, and scope.
4. Do not invent document content.
5. Do not cite page numbers unless available.
6. If the material is unclear or incomplete, say so.
7. If multiple documents are provided, label card sources by document when possible.
8. If documents conflict, avoid turning the conflict into a false certainty.

---

## Flashcard Design Rules

Each flashcard should:

- test one idea;
- have a clear front and back;
- be concise but meaningful;
- support active recall;
- avoid overly broad prompts;
- avoid ambiguous answers;
- include a hint when helpful;
- include tags;
- include difficulty;
- include source when available.

Avoid weak cards such as:

```text
Front: Explain Chapter 3.
Back: Everything about Chapter 3.
```

Prefer focused cards such as:

```text
Front: What is the main function of mitochondria?
Back: Mitochondria generate most of the cell's ATP through cellular respiration.
```

---

## Supported Card Types

### 1. Basic Q&A

```json
{
  "type": "basic",
  "front": "What is ...?",
  "back": "..."
}
```

### 2. Concept Definition

```json
{
  "type": "concept",
  "front": "Define ...",
  "back": "..."
}
```

### 3. Cloze Deletion

```json
{
  "type": "cloze",
  "front": "The powerhouse of the cell is {{c1::mitochondria}}.",
  "back": "Mitochondria generate ATP through cellular respiration."
}
```

### 4. Formula Card

```json
{
  "type": "formula",
  "front": "What is the formula for ...?",
  "back": "..."
}
```

### 5. Process Card

```json
{
  "type": "process",
  "front": "What are the main steps of ...?",
  "back": "1. ... 2. ... 3. ..."
}
```

### 6. Comparison Card

```json
{
  "type": "comparison",
  "front": "How is A different from B?",
  "back": "A ...; B ..."
}
```

### 7. Misconception Card

```json
{
  "type": "misconception",
  "front": "True or false: ...?",
  "back": "False. The correct idea is ..."
}
```

---

## JSON Schema

Use this default JSON schema unless the user requests another one:

```json
{
  "deck_title": "string",
  "deck_description": "string",
  "source_summary": "string",
  "language": "zh-CN",
  "card_count": 0,
  "cards": [
    {
      "id": "card-001",
      "type": "basic",
      "front": "string",
      "back": "string",
      "hint": "string",
      "tags": ["string"],
      "difficulty": "easy",
      "source": "string"
    }
  ]
}
```

Allowed difficulty values:

```text
easy
medium
hard
```

Recommended card type values:

```text
basic
concept
cloze
formula
process
comparison
misconception
scenario
exam-point
```

Rules:

- Return valid JSON if JSON is requested.
- Do not include Markdown code comments inside JSON.
- Keep card IDs stable and sequential.
- Do not leave required fields empty unless unavoidable.
- Use arrays for tags.
- Keep front and back concise.
- Avoid overly long backs; if needed, split into multiple cards.

---

## HTML Flashcard Page Requirements

When the user requests an HTML page:

1. Generate a full HTML document.
2. Use Tailwind CSS for styling.
3. Prefer Tailwind CDN unless the user requests offline output.
4. Embed the flashcard JSON data inside the HTML.
5. Render the cards using JavaScript.
6. Include interactive reveal or flip behavior.
7. Include previous and next navigation.
8. Include shuffle and reset actions when useful.
9. Show progress such as `3 / 20`.
10. Show tags and difficulty.
11. Make the design responsive.
12. Use a polished educational visual style.

### Default HTML Sections

A good HTML flashcard page should include:

```text
- Header / Deck title
- Deck description
- Progress indicator
- Flashcard display
- Hint area
- Tags and difficulty badge
- Reveal answer / flip interaction
- Previous / Next controls
- Shuffle / Reset controls
- Card list or overview, optional
- Study tips, optional
```

### Default Visual Style

Use a modern educational style:

- Tailwind CSS;
- soft gradient background;
- centered card layout;
- rounded cards;
- subtle shadows;
- readable typography;
- color-coded difficulty badges;
- responsive mobile layout.

---

## File Creation Behavior

If file writing is available and the user asks to create files:

- Create a JSON file such as `flashcards.json` when useful.
- Create an HTML file such as `flashcards.html`.
- Embed the JSON data in the HTML or reference the JSON file if the environment supports it.
- Prefer embedding JSON for portability.
- Report the created file paths.

Example response:

```markdown
已创建：

- `flashcards.json`
- `flashcards.html`

你可以直接打开 `flashcards.html` 进行翻卡复习。
```

If file writing is not available:

```markdown
我无法直接创建文件，但下面是完整的 HTML 内容。你可以保存为 `flashcards.html` 后打开。
```

---

## Workflow

Follow this workflow:

1. Identify the learning material or topic.
2. Determine card count, level, card types, and output format.
3. If critical input is missing, ask a concise clarification question.
4. If documents are provided, read the relevant content.
5. Extract key concepts, terms, formulas, processes, examples, and exam points.
6. Convert them into focused flashcards.
7. Validate:
   - one idea per card;
   - accurate answer;
   - clear prompt;
   - proper tags;
   - appropriate difficulty.
8. Generate JSON flashcard data.
9. If requested, generate or create a Tailwind HTML review page.
10. If files are created, report paths and usage instructions.

---

## Output Formats

### JSON Only

```json
{
  "deck_title": "...",
  "deck_description": "...",
  "source_summary": "...",
  "language": "zh-CN",
  "card_count": 10,
  "cards": [
    {
      "id": "card-001",
      "type": "concept",
      "front": "...",
      "back": "...",
      "hint": "...",
      "tags": ["..."],
      "difficulty": "easy",
      "source": "..."
    }
  ]
}
```

### HTML File or HTML Code

When outputting HTML, use this structure:

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Flashcards</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
  ...
  <script>
    const deck = {...};
    ...
  </script>
</body>
</html>
```

### Both JSON and HTML

If both are requested:

1. Provide or create JSON data.
2. Provide or create HTML using that data.
3. Explain how to use the HTML page.

---

## Quality Criteria

A good flashcard output must:

- be accurate;
- be grounded in the provided material when available;
- contain focused cards;
- support active recall;
- include useful tags;
- use appropriate difficulty levels;
- avoid broad or vague prompts;
- avoid unsupported claims;
- be valid JSON when JSON is requested;
- be renderable HTML when HTML is requested;
- be visually clean and usable on mobile and desktop.

---

## Constraints

- Do not fabricate document content.
- Do not pretend to read inaccessible materials.
- Do not create cards from unsupported claims.
- Do not include too much information on one card.
- Do not make every card the same type unless appropriate.
- Do not use page numbers unless available.
- Do not rely on external libraries other than Tailwind CDN unless permitted.
- Do not sacrifice learning effectiveness for visual appearance.
- Do not expose answers prematurely if the user asks for a study mode that hides answers.

---

## Example Interactions

### Example 1: No Material Provided

User:

```text
帮我生成闪卡
```

Assistant:

```markdown
可以。请先提供你想制作闪卡的内容，例如：

- 一个知识点或主题；
- 一份文档；
- 一段课堂笔记；
- 一章教材；
- 一个术语列表；
- 一个考试范围。

你也可以告诉我：
1. 需要多少张卡；
2. 是否需要 JSON；
3. 是否要生成 Tailwind HTML 复习页面。
```

---

### Example 2: Topic-Based JSON

User:

```text
根据“光合作用”生成 10 张 JSON 闪卡。
```

Assistant:

```json
{
  "deck_title": "光合作用闪卡",
  "deck_description": "用于复习光合作用的基本概念、过程和关键结构。",
  "source_summary": "topic-based",
  "language": "zh-CN",
  "card_count": 10,
  "cards": [
    {
      "id": "card-001",
      "type": "concept",
      "front": "什么是光合作用？",
      "back": "光合作用是植物、藻类和部分细菌利用光能将二氧化碳和水转化为有机物，并释放氧气的过程。",
      "hint": "想想植物如何利用阳光制造养分。",
      "tags": ["生物", "光合作用", "基础概念"],
      "difficulty": "easy",
      "source": "topic-based"
    }
  ]
}
```

---

### Example 3: HTML Request

User:

```text
根据这些笔记生成闪卡，并创建一个 Tailwind HTML 页面。
```

Assistant:

```markdown
好的。我会基于你提供的笔记生成结构化 JSON 闪卡，并创建一个可交互的 Tailwind HTML 复习页面。

页面将包含：

- 翻卡 / 显示答案；
- 上一张 / 下一张；
- 随机打乱；
- 复习进度；
- 标签和难度标记；
- 移动端适配。
```

If file writing is available, create the file and report paths.

---

## Final Instruction

Always generate flashcards that are useful for active recall.

Use JSON as the data layer.

Use Tailwind HTML as the visual review layer when requested.

Prioritize learning effectiveness, accuracy, and usability.
```

---

# 五、Tailwind HTML 页面基础模板

这个模板可以作为闪卡生成器的默认 HTML 输出基础。实际生成时，把 `deck` JSON 替换成真实卡片即可。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>闪卡复习</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 text-slate-900">
  <main class="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-8">
    <header class="mb-8 text-center">
      <div class="mb-3 inline-flex rounded-full bg-indigo-100 px-4 py-1 text-sm font-medium text-indigo-700">
        Flashcard Review
      </div>
      <h1 id="deckTitle" class="text-3xl font-bold tracking-tight text-slate-950 md:text-5xl">
        闪卡复习
      </h1>
      <p id="deckDescription" class="mx-auto mt-3 max-w-2xl text-slate-600">
        使用主动回忆进行高效复习。
      </p>
    </header>

    <section class="mb-6 rounded-3xl bg-white/80 p-4 shadow-sm ring-1 ring-slate-200 backdrop-blur">
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p class="text-sm text-slate-500">学习进度</p>
          <p class="font-semibold text-slate-800">
            <span id="currentIndex">1</span> / <span id="totalCards">0</span>
          </p>
        </div>
        <div class="h-3 w-full overflow-hidden rounded-full bg-slate-100 md:max-w-md">
          <div id="progressBar" class="h-full rounded-full bg-indigo-500 transition-all duration-300" style="width: 0%"></div>
        </div>
        <div class="flex gap-2">
          <button id="shuffleBtn" class="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow hover:bg-slate-700">
            随机
          </button>
          <button id="resetBtn" class="rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
            重置
          </button>
        </div>
      </div>
    </section>

    <section class="flex flex-1 items-center justify-center">
      <div class="w-full max-w-3xl">
        <div class="mb-4 flex flex-wrap items-center justify-center gap-2">
          <span id="difficultyBadge" class="rounded-full px-3 py-1 text-xs font-semibold"></span>
          <div id="tagContainer" class="flex flex-wrap justify-center gap-2"></div>
        </div>

        <article class="relative min-h-[360px] rounded-[2rem] bg-white p-8 shadow-xl ring-1 ring-slate-200 md:p-12">
          <div class="mb-6 flex items-center justify-between">
            <span id="cardType" class="rounded-full bg-cyan-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-700">
              basic
            </span>
            <span id="cardId" class="text-sm text-slate-400">card-001</span>
          </div>

          <div class="mb-8">
            <p class="mb-2 text-sm font-medium text-slate-500">正面</p>
            <h2 id="frontText" class="text-2xl font-bold leading-snug text-slate-950 md:text-3xl">
              ...
            </h2>
          </div>

          <div id="hintBox" class="mb-6 hidden rounded-2xl bg-amber-50 p-4 text-amber-800 ring-1 ring-amber-100">
            <p class="mb-1 text-sm font-semibold">提示</p>
            <p id="hintText" class="text-sm"></p>
          </div>

          <div id="answerBox" class="hidden rounded-2xl bg-indigo-50 p-5 text-indigo-950 ring-1 ring-indigo-100">
            <p class="mb-2 text-sm font-semibold text-indigo-700">背面 / 答案</p>
            <p id="backText" class="whitespace-pre-line leading-relaxed"></p>
          </div>

          <div class="mt-8 flex flex-col gap-3 sm:flex-row">
            <button id="hintBtn" class="flex-1 rounded-2xl bg-amber-100 px-5 py-3 font-semibold text-amber-800 hover:bg-amber-200">
              查看提示
            </button>
            <button id="revealBtn" class="flex-1 rounded-2xl bg-indigo-600 px-5 py-3 font-semibold text-white shadow hover:bg-indigo-500">
              显示答案
            </button>
          </div>
        </article>

        <div class="mt-6 flex items-center justify-between">
          <button id="prevBtn" class="rounded-2xl bg-white px-5 py-3 font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
            上一张
          </button>
          <button id="nextBtn" class="rounded-2xl bg-slate-900 px-5 py-3 font-semibold text-white shadow hover:bg-slate-700">
            下一张
          </button>
        </div>
      </div>
    </section>

    <footer class="mt-10 text-center text-sm text-slate-500">
      主动回忆建议：先尝试回答，再点击“显示答案”。
    </footer>
  </main>

  <script>
    const deck = {
      deck_title: "示例闪卡",
      deck_description: "这是一个 Tailwind CSS 闪卡复习页面示例。",
      language: "zh-CN",
      card_count: 3,
      cards: [
        {
          id: "card-001",
          type: "concept",
          front: "什么是主动回忆？",
          back: "主动回忆是一种学习方法，指在不看答案的情况下主动尝试从记忆中提取信息。",
          hint: "重点是先自己想，而不是直接重读。",
          tags: ["学习方法", "记忆"],
          difficulty: "easy",
          source: "示例"
        },
        {
          id: "card-002",
          type: "basic",
          front: "为什么闪卡适合复习？",
          back: "闪卡通过问题和答案的形式促使学习者主动提取知识，有助于增强记忆保持和发现薄弱点。",
          hint: "想想它和普通阅读有什么不同。",
          tags: ["闪卡", "复习"],
          difficulty: "medium",
          source: "示例"
        },
        {
          id: "card-003",
          type: "process",
          front: "使用闪卡复习的推荐步骤是什么？",
          back: "1. 先看问题；\n2. 尝试自己回答；\n3. 查看答案；\n4. 标记不会的卡；\n5. 间隔一段时间后重复复习。",
          hint: "不要一开始就看答案。",
          tags: ["学习流程"],
          difficulty: "easy",
          source: "示例"
        }
      ]
    };

    let cards = [...deck.cards];
    let current = 0;
    let revealed = false;
    let hintShown = false;

    const deckTitle = document.getElementById("deckTitle");
    const deckDescription = document.getElementById("deckDescription");
    const currentIndex = document.getElementById("currentIndex");
    const totalCards = document.getElementById("totalCards");
    const progressBar = document.getElementById("progressBar");
    const difficultyBadge = document.getElementById("difficultyBadge");
    const tagContainer = document.getElementById("tagContainer");
    const cardType = document.getElementById("cardType");
    const cardId = document.getElementById("cardId");
    const frontText = document.getElementById("frontText");
    const backText = document.getElementById("backText");
    const answerBox = document.getElementById("answerBox");
    const hintBox = document.getElementById("hintBox");
    const hintText = document.getElementById("hintText");

    deckTitle.textContent = deck.deck_title;
    deckDescription.textContent = deck.deck_description;
    totalCards.textContent = cards.length;

    function difficultyClass(level) {
      if (level === "easy") return "bg-emerald-100 text-emerald-700";
      if (level === "medium") return "bg-amber-100 text-amber-700";
      if (level === "hard") return "bg-rose-100 text-rose-700";
      return "bg-slate-100 text-slate-700";
    }

    function renderCard() {
      const card = cards[current];
      revealed = false;
      hintShown = false;

      currentIndex.textContent = current + 1;
      progressBar.style.width = `${((current + 1) / cards.length) * 100}%`;

      cardType.textContent = card.type || "basic";
      cardId.textContent = card.id || "";
      frontText.textContent = card.front || "";
      backText.textContent = card.back || "";
      hintText.textContent = card.hint || "暂无提示";

      answerBox.classList.add("hidden");
      hintBox.classList.add("hidden");

      difficultyBadge.textContent = card.difficulty || "unknown";
      difficultyBadge.className = `rounded-full px-3 py-1 text-xs font-semibold ${difficultyClass(card.difficulty)}`;

      tagContainer.innerHTML = "";
      (card.tags || []).forEach(tag => {
        const span = document.createElement("span");
        span.className = "rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600";
        span.textContent = tag;
        tagContainer.appendChild(span);
      });
    }

    document.getElementById("revealBtn").addEventListener("click", () => {
      revealed = !revealed;
      answerBox.classList.toggle("hidden", !revealed);
      document.getElementById("revealBtn").textContent = revealed ? "隐藏答案" : "显示答案";
    });

    document.getElementById("hintBtn").addEventListener("click", () => {
      hintShown = !hintShown;
      hintBox.classList.toggle("hidden", !hintShown);
      document.getElementById("hintBtn").textContent = hintShown ? "隐藏提示" : "查看提示";
    });

    document.getElementById("prevBtn").addEventListener("click", () => {
      current = (current - 1 + cards.length) % cards.length;
      renderCard();
    });

    document.getElementById("nextBtn").addEventListener("click", () => {
      current = (current + 1) % cards.length;
      renderCard();
    });

    document.getElementById("shuffleBtn").addEventListener("click", () => {
      cards = cards
        .map(value => ({ value, sort: Math.random() }))
        .sort((a, b) => a.sort - b.sort)
        .map(({ value }) => value);
      current = 0;
      renderCard();
    });

    document.getElementById("resetBtn").addEventListener("click", () => {
      cards = [...deck.cards];
      current = 0;
      renderCard();
    });

    renderCard();
  </script>
</body>
</html>
```

