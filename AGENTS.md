# 给 Agent 的说明

这是一个 macOS 桌宠 + 待办 App（Electron + React）。用户让你装它、配置它、帮它做形象或管清单时，按下面做。和用户说话用用户的语言（界面是中文）。

## 用户的数据都在一个文件夹

`~/Documents/DeskPet/`（如果设了环境变量 `DESK_PET_TODO`，就是那个文件所在的文件夹）：

- `To-Do.md`：全部待办。格式见 README「数据和设置」。
- `settings.json`：`theme`（`system`/`light`/`dark`）、`pets`（四个位置的形象名，依次是 To-do、Pending、Completed、Archived）、`hotkey`（空 = ⌥ 空格）、`keepCompletedDays`（默认 7）。缺的字段用默认值。
- `pets/<名字>/`：用户自己的形象（`directions.webp`、`reactions.webp`）。

App 开着时这三样改了一秒内生效，不用重启。改 JSON 时保留用户写的其他字段。

## 任务一：装好并配置

1. 确认是 macOS（`sw_vers`）和 Node ≥ 18（`node -v`；没有就建议 `brew install node`，装之前问用户）。
2. 在用户同意的位置 clone 仓库，然后：
   ```bash
   npm install
   npm run app
   ```
   把 `release/mac*/Awesome Desk Todo.app` 拷进 `/Applications`（已有就先退出旧的再覆盖），`open -a "Awesome Desk Todo"`。本机打包的不会被 Gatekeeper 拦。
3. 问用户三个问题，一次问完，每个都说明默认值，用户说「默认 / 随便」就跳过：
   - **外观**：跟随系统（默认）/ 浅色 / 深色。
   - **形象**：四个位置（To-do、Pending、Completed、Archived）各放哪只。默认狐狸、奶牛猫、熊猫、猫头鹰。可选的名字和中文名在 `public/pets/names.json`；给用户看 README 里的形象图，或者挑几个推荐。也告诉他可以自己做（任务二），右键宠物随时能换。
   - **快速添加快捷键**：默认 ⌥ 空格（被占用会自动换 ⌥⇧ 空格）。要改就写成 Electron 的格式，如 `Command+Shift+T`。
4. 把答案写进 `settings.json`。
5. 告诉用户：移上宠物看清单；To-do 里有几条上手任务；以后可以直接让你改 To-Do.md 来管清单（菜单栏爪印 →「复制给 AI 的说明」可以复制格式说明给别的 AI）。

## 任务二：用户想要自己的形象

1. 问用户想要什么角色、什么画风，帮他写成一句英文角色描述（例：`a chibi corgi with orange and white fur, wearing round black glasses`）。角色是绿色的，背景改用品红。
2. 把 [docs/make-your-own-pet.md](docs/make-your-own-pet.md) 里的**两段提示词**填好角色描述，整段给用户，告诉他：先用提示词 1 出朝向图，再把朝向图作为参考图、用提示词 2 出表情图。你自己能生图就直接生成，同样用这两段。
3. 用户把两张图给你后：
   ```bash
   uv run --with pillow --with numpy --with scipy python scripts/add_pet.py <名字> <朝向图> <表情图> --slot <todo|pending|completed|archived>
   ```
   没有 uv 就 `brew install uv`（先问）。不需要 clone 以外的东西，也不用重新打包。
4. 打开 `~/Documents/DeskPet/pets/<名字>/preview.png` 看一眼：边缘有没有残留绿色、两张大小是否一致、表情图第 2/3/7 格有没有爱心/星星/zzz。
5. 失败时脚本会说原因，照着告诉用户重做哪一张：
   - 「painted transparency checkerboard」：模型画了假的透明棋盘格 → 重新生成，提示词里不要提 transparent。
   - 「not one solid colour」/「too close to neutral」：背景不是纯色 → 重新生成，强调纯绿背景、没有边框格线。
   - 「有一格是空的」：九宫格没画满或者格子错位 → 重新生成。

## 任务三：帮用户管清单

直接改 `To-Do.md`：一行一条 `- [ ] 内容 #分类 due:YYYY-MM-DD`；做完挪到 `## Completed` 写成 `- [x] … done:今天`；不做了挪到 `## Archived` 写成 `- [-] …`。四个分组标题别改，文件开头的注释保留。

## 改这个仓库的代码

- 改界面后：`npm test`、`npm run build`，再 `uv run --with playwright python scripts/ui_check.py <截图目录>` 在浏览器里走一遍、看截图。窗口、点击穿透、系统鼠标只能在 Mac 上 `npm start` 验。
- `src/todoMd.js` 的 Markdown 格式和 `settings.json` 的字段是对外接口：用户和 AI 会手改，改了要向后兼容并补测试。
- 内置形象改了以后跑 `scripts/normalize.py`（统一大小、对齐底边），不要用 page-mascot 的 build.py。
- 内置形象、`scripts/key.py`、提示词来自 page-mascot（MIT），保留 LICENSE 里的署名。
