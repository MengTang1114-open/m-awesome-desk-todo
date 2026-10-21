# 自己做一个桌宠形象

一个形象就是两张 3×3 九宫格：**朝向图**（9 个转头方向，宠物跟着鼠标转头用）和**表情图**（9 个表情，戳它、任务完成时用）。
用任何能生图的模型都行（ChatGPT / GPT-Image、Gemini、Grok、即梦、Midjourney……），流程是：

1. 把下面两段提示词里的「角色描述」换成你想要的，先生成朝向图，再生成表情图。
2. 把两张图交给你的 Agent（Claude Code、Codex……），说一句「把这两张做成桌宠形象，放到 To-do 的位置」。
3. Agent 跑 `scripts/add_pet.py`：去掉绿幕、统一大小、放进 `~/Documents/DeskPet/pets/<名字>/`，写进设置。桌宠一秒内换上。

不用 Agent 也行，自己跑第 3 步的命令（见文末）。

提示词改自 [page-mascot](https://github.com/nilbuild/page-mascot)（MIT，© Kamran Ahmed）。英文提示词对各家模型都更稳，直接复制就行。

## 写角色描述

一句英文，写清**是什么、颜色、一两个记忆点**，越具体两张图越容易对上。例：

- `a chibi corgi with orange and white fur, wearing round black glasses`
- `a chibi astronaut cat, grey tabby fur, white space helmet with a blue visor`
- `a chibi green frog wearing a tiny yellow raincoat`

**角色本身是绿色的**（青蛙、恐龙、绿衣服），把两段提示词里的 `pure bright green (#00FF00)` 都换成 `pure magenta (#FF00FF)`，否则抠图会把角色一起抠掉。

想换画风，把第一段里 `Cute storybook sticker art: …` 那一句换成别的，比如：
- 像素：`16-bit pixel art. Chunky visible square pixels on a strict grid, a small limited palette, a crisp one-pixel dark outline, no anti-aliasing.`
- 铅笔：`Loose graphite pencil sketch, soft smudged shading, warm grey tones only. Keep the big-head chibi cartoon proportions.`
- 剪纸：`Cut-paper collage built from flat torn and cut paper shapes in layered matte colours, no drawn outlines.`

## 提示词 1：朝向图

把 `<角色描述>` 换掉后整段复制：

```text
Generate a 3x3 grid sprite sheet of <角色描述>. Cute storybook sticker art: clean bold black outlines with some weight variation, big expressive eyes each with a bright white catchlight, soft pink cheek blush, and warm saturated colours. Give it several tones per colour -- a lighter muzzle or belly, a darker shaded edge, coloured inner ears -- and a textured, tufted silhouette wherever the character has fur or hair. Charming and playful. No photorealism, no heavy 3D gloss, no airbrushed gradients.

This sheet is NINE HEAD DIRECTIONS, not expressions -- the face keeps the same calm expression in every cell and only the direction the head is TURNED changes.

LAYOUT: 3 columns by 3 rows, evenly spaced, on a solid flat pure bright green (#00FF00) background filling the whole cell. Each drawing is head plus upper shoulders, centred in its cell, same character and same head size in all nine cells.

FRAMING: a PORTRAIT BUST. Head, neck and shoulders only. NO arms, NO hands, NO legs, NO lower body. The shoulders are the lowest thing in the cell.

PROPORTIONS: a BIG HEAD chibi that still has a real body. The shoulders are roughly TWO THIRDS the width of the head. Do NOT draw a floating head.

THE RULE THAT MATTERS MOST: draw the BODY ONCE and reuse it. The neck, chest and shoulders must be the EXACT SAME SHAPE in the EXACT SAME POSITION in all nine cells. The body always faces the viewer. Only the head rotates, on top of an unchanging body.

MARGINS: each character sits ENTIRELY INSIDE its own cell with a wide empty gap on all four sides, at roughly 75% of the cell height, centred. The shoulders STOP WELL SHORT of the bottom edge of the cell. Nothing may touch or cross a cell boundary.

Turn the whole head clearly, do not just move the eyes: looking left swings the nose or muzzle left and brings the far ear or cheek into view.
Row 1: up-left, up, up-right. Row 2: left, straight at the viewer, right. Row 3: down-left, down, down-right.

NO hearts, NO sparkles, NO "zzz", NO spiral eyes -- no floating symbols of any kind.
No text, no labels, no borders, no grid lines, no drop shadows. The background is one flat uniform pure bright green (#00FF00) covering the entire canvas edge to edge, with no gradient, texture, pattern or checkerboard, and nothing else on it. Square image, at least 1024x1024.
```

## 提示词 2：表情图

**把第一张图作为参考图一起发**（能上传图片的模型都支持），两张才能对得上。同样把 `<角色描述>` 换成和上面一样的那句：

```text
The attached image is a 3x3 head-direction sprite sheet. Produce the MATCHING EXPRESSIONS sheet for that same character. The character is <角色描述>. Draw it on the same solid pure bright green (#00FF00) background. Copy the character from the attached image exactly: the same colours, the same markings, the same fur or surface detail, the same line weight, the same art style. Every marking visible in the attached sheet must appear here too. Do not restyle, simplify or redraw it.

NOT head directions. The character faces STRAIGHT AT THE VIEWER in all nine cells, head perfectly straight. The only thing that changes between cells is the FACE, plus one small floating symbol in three of them.

CRITICAL: EXACTLY THE SAME SIZE AND POSITION IN THE CELL as the attached sheet. The chest and shoulders must be the same drawing, the same width, and the same height off the bottom of the cell, identical in all nine cells.

Wide margin on all four sides, nothing touching a cell edge including the floating symbols, and clear empty space below the shoulders.

The nine expressions, left to right, top to bottom:
1. Eyes closed as two upward curved arcs. No symbol.
2. Same closed arc eyes, plus one clearly visible SMALL RED HEART floating in the empty space above the head.
3. Same closed arc eyes, plus THREE SMALL YELLOW SPARKLE STARS above the head.
4. Eyes wide open and very round, mouth open in a small round O of surprise.
5. Starstruck: both eyes drawn as bright star shapes, big happy smile.
6. Eyes closed arcs, strong pink blush on both cheeks.
7. Eyes closed sleeping curves, plus a small blue "z z z" above the head.
8. Both eyes drawn as spiral swirls, wavy wobbly mouth. Dizzy.
9. Eyes closed arcs, mouth wide open in a big happy grin.

No text, no labels, no borders, no grid lines, no drop shadows. The background is one flat uniform pure bright green (#00FF00) covering the entire canvas edge to edge, with no gradient, texture, pattern or checkerboard, and nothing else on it. Square image, at least 1024x1024.
```

## 出图后先自己看一眼

- 两张都是 3×3，背景是一整片纯色，没有格子线、白边、棋盘格。
- 两张里是同一个角色：颜色、花纹、配饰一致，身体大小差不多。
- 表情图第 2、3、7 格有爱心、星星、zzz，别的格子没有。

不对就重新生成那一张，比修图快。有的模型会自作主张画格子线或白边，再生成一次通常就好。

## 交给 Agent：它会做什么

跟 Agent 说「把这两张做成桌宠形象，名字叫 corgi，放到 To-do 的位置」，它按仓库里 [AGENTS.md](../AGENTS.md) 的步骤：

1. 跑 `add_pet.py`：
   ```bash
   uv run --with pillow --with numpy --with scipy python scripts/add_pet.py corgi 朝向图.png 表情图.png --slot todo
   ```
   - **去背景**（`scripts/key.py`，来自 page-mascot）：从四个角取背景色，按颜色距离抠掉，边缘去掉绿边；角色里和背景同色、但不和画面边缘连通的部分会保留。背景不是一整片纯色、或者是画出来的棋盘格，会直接报错并说明原因。
   - **统一大小**（`scripts/normalize.py`）：每格找角色本体（不算飘着的爱心星星），按面积统一大小，肩膀底边对齐，和内置形象一样大，换格子时不会忽大忽小。
   - 结果放进 `~/Documents/DeskPet/pets/corgi/`（`directions.webp`、`reactions.webp`，外加一张 `preview.png`）。
   - `--slot todo` 顺手把 `settings.json` 里 To-do 的位置换成 corgi；不写就只加进「我的形象」。
2. 打开 `preview.png` 看抠得干不干净、两张大小是否一致；有问题告诉你重新生成哪一张。
3. 桌宠监听这个文件夹，一秒内换上；右键任意宠物，「我的形象」里也能选到它。

位置可以是 `todo`、`pending`、`completed`、`archived`。同名再跑一次就是覆盖重做。

## 不用 Agent，自己跑

需要 [uv](https://docs.astral.sh/uv/)（`brew install uv`）。在这个仓库目录里：

```bash
uv run --with pillow --with numpy --with scipy python scripts/add_pet.py <名字> <朝向图> <表情图> [--slot todo]
```
