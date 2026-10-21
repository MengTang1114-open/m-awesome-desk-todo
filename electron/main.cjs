// 桌宠窗口：透明、无边框、置顶、所有桌面都在、不进 Dock；没碰到宠物和面板的地方点击穿透到桌面。
// 数据就是一份 Markdown（默认 ~/Documents/DeskPet/To-Do.md，环境变量 DESK_PET_TODO 可改），外面改了自动推给页面。
// 同一个文件夹里还有 settings.json（外观、四个位置的形象、快捷键、Completed 留几天）和 pets/（用户自己的形象），也都是改了就生效。
const { app, BrowserWindow, ipcMain, screen, shell, Tray, Menu, nativeImage, globalShortcut, clipboard, nativeTheme, protocol, net } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { pathToFileURL } = require('url')

const W = 470, H = 640
const FILE = process.env.DESK_PET_TODO || path.join(os.homedir(), 'Documents', 'DeskPet', 'To-Do.md')
const DIR = path.dirname(FILE)
const SETTINGS = path.join(DIR, 'settings.json')
const PETS_DIR = path.join(DIR, 'pets')
const BUILTIN = path.join(__dirname, '..', 'dist', 'pets')
const SLOTS = ['To-do', 'Pending', 'Completed', 'Archived']
// 默认形象和 scripts/add_pet.py 里的一致
const DEFAULTS = { theme: 'system', pets: ['fox', 'cat', 'panda', 'owl'], hotkey: '', keepCompletedDays: 7 }
const THEMES = { system: '跟随系统', light: '浅色', dark: '深色' }
const REPO = 'https://github.com/MengTang1114-open/m-awesome-desk-todo'
const SEED = `# Desk Pet To-Do

<!-- 这份文件就是桌宠的全部数据，可以直接改，也可以让 AI 改，保存后桌宠自动刷新。
     一行一条：- [ ] 任务内容 #分类 due:2026-10-25（#分类、due 都可省）。四个分组的标题别改。 -->

## To-do

- [ ] 鼠标移到第一只宠物上，清单就出来了 #上手
- [ ] 把这条拖到第二只宠物身上，它就到 Pending 了 #上手
- [ ] 按 ⌥ 空格，随时加一条待办 #上手
- [ ] 右键点一只宠物，换个形象 #上手
- [ ] 点菜单栏的爪印，「复制给 AI 的说明」，以后让 AI 帮你管清单 #上手

## Pending

## Completed

## Archived
`

let win, tray, lastText = null, hotkey = null, lastSettings = null, settings = DEFAULTS

// 全局快捷键：随时弹出 To-do 加任务。⌥空格常被别的 App 占（ChatGPT、Raycast），占了就换下一个；
// settings.json 的 hotkey 或环境变量 DESK_PET_HOTKEY 可指定
const hotkeys = () => process.env.DESK_PET_HOTKEY ? [process.env.DESK_PET_HOTKEY]
  : settings.hotkey ? [settings.hotkey] : ['Alt+Space', 'Alt+Shift+Space', 'Control+Alt+Space']
function registerHotkey() {
  globalShortcut.unregisterAll()
  hotkey = hotkeys().find(k => { try { return globalShortcut.register(k, quickAdd) } catch { return false } }) || null
}
const showName = k => k.replace('Alt', '⌥').replace('Shift', '⇧').replace('Control', '⌃').replace('Command', '⌘').replace('Space', '空格').replace(/\+/g, ' ')

function quickAdd() {
  app.focus({ steal: true })
  win.focus()
  win.setIgnoreMouseEvents(false)
  win.webContents.send('quickadd')
}

// ---------- 设置：settings.json，缺的字段用默认值 ----------
function readSettings() {
  let s = {}
  try { lastSettings = fs.readFileSync(SETTINGS, 'utf8'); s = JSON.parse(lastSettings) } catch { /* 没有或写坏了就用默认值 */ }
  const pets = Array.isArray(s.pets) ? s.pets : []
  return {
    theme: THEMES[s.theme] ? s.theme : DEFAULTS.theme,
    pets: DEFAULTS.pets.map((d, i) => (typeof pets[i] === 'string' && pets[i] ? pets[i] : d)),
    hotkey: typeof s.hotkey === 'string' ? s.hotkey : DEFAULTS.hotkey,
    keepCompletedDays: Number.isInteger(s.keepCompletedDays) && s.keepCompletedDays > 0 ? s.keepCompletedDays : DEFAULTS.keepCompletedDays,
  }
}
function saveSettings(patch) {
  settings = { ...settings, ...patch }
  const text = JSON.stringify(settings, null, 2) + '\n'
  lastSettings = text
  fs.mkdirSync(DIR, { recursive: true })
  fs.writeFileSync(SETTINGS + '.tmp', text)
  fs.renameSync(SETTINGS + '.tmp', SETTINGS)
  applySettings()
}
// 形象：内置的在 dist/pets/（index.json 列出全部，names.json 是中文名），自己做的在 pets/<名字>/
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return d } }
const builtinPets = () => readJson(path.join(BUILTIN, 'index.json'), [])
const petNames = () => readJson(path.join(BUILTIN, 'names.json'), {})
function customPets() {
  try {
    return fs.readdirSync(PETS_DIR).filter(n => ['directions.webp', 'reactions.webp'].every(f => fs.existsSync(path.join(PETS_DIR, n, f)))).sort()
  } catch { return [] }
}
let petsVersion = Date.now()   // 自己的形象重做了，换个版本号让页面重新加载图片
const state = () => ({ ...settings, custom: customPets(), version: petsVersion })
function applySettings() {
  nativeTheme.themeSource = settings.theme
  const want = hotkeys().join()
  if (want !== applySettings.hotkeys) { applySettings.hotkeys = want; registerHotkey() }
  win?.webContents.send('settings', state())
}

// 右键宠物：换成内置或自己的形象
function petMenu(slot) {
  const names = petNames(), current = settings.pets[slot]
  const item = id => ({ label: names[id] ? `${names[id]}（${id}）` : id, type: 'radio', checked: id === current,
    click: () => saveSettings({ pets: settings.pets.map((p, i) => (i === slot ? id : p)) }) })
  const custom = customPets()
  Menu.buildFromTemplate([
    { label: `${SLOTS[slot]} 换成…`, enabled: false },
    ...(custom.length ? [{ label: '我的形象', submenu: custom.map(item) }] : []),
    { label: '内置形象', submenu: builtinPets().map(item) },
    { type: 'separator' },
    { label: '自己做一个…（打开说明）', click: () => shell.openExternal(`${REPO}/blob/main/docs/make-your-own-pet.md`) },
    { label: '打开形象文件夹', click: () => { fs.mkdirSync(PETS_DIR, { recursive: true }); shell.openPath(PETS_DIR) } },
  ]).popup({ window: win })
}

// 给 AI 的说明：粘贴进 Claude Code / Codex 的对话，它就知道怎么管你的清单
const aiNote = () => `我的待办清单在 ${FILE}，是一份 Markdown，桌面上的桌宠会实时显示它。帮我管理时请直接改这个文件：
- 四个分组标题：## To-do / ## Pending / ## Completed / ## Archived（别改标题）
- 一行一条：- [ ] 任务内容 #分类 due:YYYY-MM-DD（#分类、due 可省）
- 做完：挪到 Completed，写成 - [x] 任务内容 #分类 done:完成日期（done 不写也行，桌宠会补成当天）；Completed 超过 7 天的桌宠会自动挪进 Archived
- 不做了：挪到 Archived，写成 - [-] 任务内容
- 换分组就是把这一行挪到对应标题下面；保留文件开头的注释
桌宠的设置在 ${SETTINGS}（JSON）：theme 是 system / light / dark，pets 是四个位置（To-do、Pending、Completed、Archived）的形象名，hotkey 是快速添加的快捷键，keepCompletedDays 是 Completed 留几天。改完保存就生效。`

function read() {
  if (!fs.existsSync(FILE)) { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, SEED) }
  return fs.readFileSync(FILE, 'utf8')
}

function write(text) {
  lastText = text
  const tmp = FILE + '.tmp'
  fs.writeFileSync(tmp, text)
  fs.renameSync(tmp, FILE)   // 原子替换，编辑器和 AI 不会读到写了一半的文件
}

function watch() {
  // 监听目录而不是文件：编辑器和 AI 常常是「写新文件再改名」，盯文件会丢事件
  let t
  fs.watch(DIR, (_, name) => {
    if (name === 'settings.json') return settingsChanged()
    if (name && name !== path.basename(FILE)) return
    clearTimeout(t)
    t = setTimeout(() => {
      let text
      try { text = fs.readFileSync(FILE, 'utf8') } catch { return }
      if (text === lastText) return   // 自己刚写的
      lastText = text
      win?.webContents.send('file', text)
    }, 120)
  })
  // 自己的形象：add_pet.py 写完 pets/<名字>/ 就出现在右键菜单里；重做了同名形象，页面也换新图
  fs.mkdirSync(PETS_DIR, { recursive: true })
  let p
  fs.watch(PETS_DIR, { recursive: true }, () => {
    clearTimeout(p)
    p = setTimeout(() => { petsVersion = Date.now(); win?.webContents.send('settings', state()) }, 300)
  })
}
function settingsChanged() {
  clearTimeout(settingsChanged.t)
  settingsChanged.t = setTimeout(() => {
    let text
    try { text = fs.readFileSync(SETTINGS, 'utf8') } catch { return }
    if (text === lastSettings) return
    settings = readSettings()
    applySettings()
  }, 120)
}

// pet://local/<名字>/directions.webp → pets/<名字>/directions.webp（页面不能直接读 file://，开发模式下页面是 http）
protocol.registerSchemesAsPrivileged([{ scheme: 'pet', privileges: { standard: true, secure: true, supportFetchAPI: true } }])
function servePets() {
  protocol.handle('pet', req => {
    const [name, file] = decodeURIComponent(new URL(req.url).pathname).split('/').filter(Boolean)
    const target = path.join(PETS_DIR, name ?? '', file ?? '')
    if (!name || !['directions.webp', 'reactions.webp'].includes(file) || path.dirname(path.dirname(target)) !== PETS_DIR) {
      return new Response('not found', { status: 404 })
    }
    return net.fetch(pathToFileURL(target).toString())
  })
}

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay()
  win = new BrowserWindow({
    width: W, height: H,
    x: workArea.x + workArea.width - W - 12, y: workArea.y + workArea.height - H,
    transparent: true, frame: false, resizable: false, hasShadow: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true },
  })
  win.setAlwaysOnTop(true, 'floating')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setIgnoreMouseEvents(true, { forward: true })
  if (process.env.VITE_DEV_URL) win.loadURL(process.env.VITE_DEV_URL)
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))

  // 系统鼠标：鼠标在桌面任何地方，宠物都跟着转头（换算成窗口坐标）
  let last = ''
  setInterval(() => {
    if (!win || win.isDestroyed()) return
    const p = screen.getCursorScreenPoint(), b = win.getBounds()
    const key = `${p.x - b.x},${p.y - b.y}`
    if (key === last) return
    last = key
    win.webContents.send('cursor', { x: p.x - b.x, y: p.y - b.y })
  }, 33)
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'trayTemplate.png'))
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('Awesome Desk Todo')
  const menu = () => Menu.buildFromTemplate([
    { label: hotkey ? `快速添加（${showName(hotkey)}）` : '快速添加', click: quickAdd },
    { label: '打开 To-Do.md', click: () => shell.openPath(FILE) },
    { label: '复制给 AI 的说明', click: () => clipboard.writeText(aiNote()) },
    { label: '在访达中显示', click: () => shell.showItemInFolder(FILE) },
    { label: '外观', submenu: Object.entries(THEMES).map(([k, label]) => ({ label, type: 'radio', checked: settings.theme === k, click: () => saveSettings({ theme: k }) })) },
    { label: '换形象：右键点那只宠物', enabled: false },
    { label: '打开设置文件', click: () => { if (!fs.existsSync(SETTINGS)) saveSettings({}); shell.openPath(SETTINGS) } },
    { type: 'separator' },
    { label: '宠物回到右下角', click: () => { const { workArea } = screen.getPrimaryDisplay(); win.setPosition(workArea.x + workArea.width - W - 12, workArea.y + workArea.height - H) } },
    { type: 'separator' },
    { label: '开机启动', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
      click: item => app.setLoginItemSettings({ openAtLogin: item.checked }) },
    { type: 'separator' },
    { label: '退出', role: 'quit' },
  ])
  tray.on('click', () => tray.popUpContextMenu(menu()))
  tray.on('right-click', () => tray.popUpContextMenu(menu()))
}

ipcMain.handle('read', () => { lastText = read(); return lastText })
ipcMain.handle('write', (_, text) => write(text))
ipcMain.handle('path', () => FILE)
ipcMain.on('interactive', (_, on) => win?.setIgnoreMouseEvents(!on, { forward: true }))
ipcMain.on('moveBy', (_, dx, dy) => { const [x, y] = win.getPosition(); win.setPosition(Math.round(x + dx), Math.round(y + dy)) })
ipcMain.handle('settings', () => state())
ipcMain.on('saveSettings', (_, patch) => {
  const ok = {}
  if (THEMES[patch?.theme]) ok.theme = patch.theme
  if (Array.isArray(patch?.pets) && patch.pets.length === 4 && patch.pets.every(x => typeof x === 'string' && x)) ok.pets = patch.pets
  saveSettings(ok)
})
ipcMain.on('petMenu', (_, slot) => { if (Number.isInteger(slot) && slot >= 0 && slot < 4) petMenu(slot) })
ipcMain.on('reveal', () => shell.openPath(FILE))
ipcMain.on('blur', () => { if (process.platform !== 'darwin') return win.blur(); app.hide(); setTimeout(() => win.showInactive(), 60) })   // 把焦点还给刚才在用的 App，宠物留在桌面

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock?.hide()
  read()
  settings = readSettings()
  servePets()
  createWindow()
  applySettings()
  createTray()
  watch()
})
app.on('will-quit', () => globalShortcut.unregisterAll())
app.on('window-all-closed', () => app.quit())
