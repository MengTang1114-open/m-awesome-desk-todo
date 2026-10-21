// 和外面打交道：在 Electron 里走 preload 暴露的 window.desk（读写 To-Do.md、系统鼠标、点击穿透、拖窗口），
// 在浏览器里（npm run dev 预览）退回 localStorage 和页面内的鼠标。
export type Point = { x: number; y: number }
export type Theme = 'system' | 'light' | 'dark'
// settings.json（和 To-Do.md 同一个文件夹）；custom 是 pets/ 里用户自己的形象，version 变了就重新加载它们的图
export type Settings = { theme: Theme; pets: string[]; hotkey: string; keepCompletedDays: number; custom: string[]; version: number }
export const DEFAULT_SETTINGS: Settings = { theme: 'system', pets: ['fox', 'cat', 'panda', 'owl'], hotkey: '', keepCompletedDays: 7, custom: [], version: 0 }
export type Desk = {
  read(): Promise<string>
  write(text: string): Promise<void>
  onFile(cb: (text: string) => void): void
  onCursor(cb: (p: Point) => void): void
  interactive(on: boolean): void
  moveBy(dx: number, dy: number): void
  reveal(): void
  filePath(): Promise<string>
  onQuickAdd(cb: () => void): void
  blur(): void
  settings(): Promise<Settings>
  onSettings(cb: (s: Settings) => void): void
  saveSettings(patch: Partial<Pick<Settings, 'theme' | 'pets'>>): void
  petMenu(slot: number): void
}
declare global { interface Window { desk?: Desk } }

const KEY = 'desk-pet-todo'
const SEED = `## To-do
- [ ] 周报 #工作 due:${dayOffset(1)}
- [ ] 流量分析 #工作
- [ ] 买菜 #生活
- [ ] 订 10 月底的机票 #生活 due:${dayOffset(4)}
- [ ] 剪素材 #内容
## Pending
- [ ] 等设计稿回来 #工作
## Completed
- [x] 交水电费 #生活 done:${dayOffset(0)}
- [x] 回复合作邮件 #工作 done:${dayOffset(-1)}
## Archived
- [-] 周末爬山 #生活
`

function dayOffset(n: number) {
  const d = new Date(); d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const inElectron = typeof window !== 'undefined' && !!window.desk

export const bridge: Desk = window.desk ?? {
  read: async () => { try { return localStorage.getItem(KEY) ?? SEED } catch { return SEED } },
  write: async text => { try { localStorage.setItem(KEY, text) } catch { /* 预览用，存不了也没关系 */ } },
  onFile: () => {},
  onCursor: () => {},
  interactive: () => {},
  moveBy: () => {},
  reveal: () => {},
  filePath: async () => '浏览器预览（数据存在 localStorage）',
  onQuickAdd: () => {},
  blur: () => {},
  // 浏览器预览：设置存 localStorage；右键换形象按顺序换下一个内置形象
  settings: async () => previewSettings(),
  onSettings: cb => { settingsListeners.push(cb) },
  saveSettings: patch => {
    const next = { ...previewSettings(), ...patch }
    try { localStorage.setItem(KEY + '-settings', JSON.stringify(next)) } catch { /* 预览用 */ }
    settingsListeners.forEach(cb => cb(next))
  },
  petMenu: async slot => {
    const all: string[] = await fetch('pets/index.json').then(r => r.json()).catch(() => [])
    const s = previewSettings(), i = all.indexOf(s.pets[slot])
    bridge.saveSettings({ pets: s.pets.map((p, k) => (k === slot ? all[(i + 1) % all.length] : p)) })
  },
}
const settingsListeners: ((s: Settings) => void)[] = []
function previewSettings(): Settings {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY + '-settings') ?? '{}') } } catch { return DEFAULT_SETTINGS }
}
