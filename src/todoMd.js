// To-Do.md 的读写。这份 Markdown 就是全部数据：桌宠改它，AI（Claude Code、Codex……）也能直接改，桌宠自动刷新。
//
// 格式（解析很宽松，AI 手写也认）：
//   ## To-do / ## Pending / ## Completed / ## Archived    四个分组（也认 待办 / 进行中 / 已完成 / 归档；旧的 Cancelled / 已取消 算 Archived）
//   - [ ] 任务内容 #分类 due:2026-10-25                  一行一条；#分类、due:日期 都可省
//   - [x] 任务内容 #分类 done:2026-10-21                 做完的带完成日期（桌宠自动写）；Archived 里 [x] 是做完的，[-] 是不做了
// 不在四个分组下的任务行算 To-do；[x] 在 To-do 或 Pending 下的算 Completed。

export const STATUSES = ['todo', 'pending', 'completed', 'archived']
export const TITLES = { todo: 'To-do', pending: 'Pending', completed: 'Completed', archived: 'Archived' }
export const KEEP_DAYS = 7   // Completed 只留最近这么多天，更早的自动进 Archived

const ALIASES = {
  todo: ['to-do', 'todo', 'to do', '待办', '要做'],
  pending: ['pending', 'waiting', '进行中', '等待', '待定'],
  completed: ['completed', 'done', '已完成', '完成'],
  archived: ['archived', 'archive', '归档', '已归档', 'cancelled', 'canceled', '已取消', '取消'],
}

function headingStatus(text) {
  const t = text.trim().toLowerCase()
  for (const s of STATUSES) if (ALIASES[s].some(a => t === a || t.startsWith(a + ' '))) return s
  return null
}

const TASK = /^\s*[-*]\s+\[([ xX\-~])\]\s+(.*)$/
const DUE = /\s+due:(\d{4}-\d{2}-\d{2})\b/
const DONE = /\s+done:(\d{4}-\d{2}-\d{2})\b/
const TAG = /(?:^|\s)#([^\s#]+)/

/** 一行任务文字 → {title, tag, due, done} */
export function parseLine(rest) {
  let title = rest, due = null, tag = null, done = null
  const f = title.match(DONE)
  if (f) { done = f[1]; title = title.replace(DONE, '') }
  const d = title.match(DUE)
  if (d) { due = d[1]; title = title.replace(DUE, '') }
  const g = title.match(TAG)
  if (g) { tag = g[1]; title = title.replace(TAG, ' ') }
  return { title: title.replace(/\s+/g, ' ').trim(), tag, due, done }
}

/**
 * Markdown 文本 → 任务数组 [{id, title, tag, due, done, status}]
 * done：完成日期；'' = 做完了但没写日期（AI 手写的 [x]）；null = 没做完（Archived 里就是不做了）
 */
export function parse(md) {
  const tasks = []
  let section = null
  for (const line of md.split(/\r?\n/)) {
    const h = line.match(/^#{1,6}\s+(.*)$/)
    if (h) { section = headingStatus(h[1]); continue }
    const m = line.match(TASK)
    if (!m) continue
    const mark = m[1].toLowerCase()
    let status = section || 'todo'
    if (mark === 'x' && (status === 'todo' || status === 'pending')) status = 'completed'
    if ((mark === '-' || mark === '~') && !section) status = 'archived'
    const { title, tag, due, done } = parseLine(m[2])
    const finished = status === 'completed' || (status === 'archived' && mark === 'x')
    if (title) tasks.push({ id: `t${tasks.length}-${hash(title)}`, title, tag, due, done: finished ? done ?? '' : null, status })
  }
  return tasks
}

const mark = t => (t.status === 'completed' || (t.status === 'archived' && t.done !== null) ? 'x' : t.status === 'archived' ? '-' : ' ')

/** 任务数组 → Markdown 文本（分组按固定顺序，组内保持数组顺序） */
export function serialize(tasks) {
  const out = [
    '# Desk Pet To-Do',
    '',
    '<!-- 这份文件就是桌宠的全部数据，可以直接改，也可以让 AI 改，保存后桌宠自动刷新。',
    '     一行一条：- [ ] 任务内容 #分类 due:2026-10-25（#分类、due 都可省）。做完的 [x] 带 done:完成日期，Completed 超过 7 天自动进 Archived。四个分组的标题别改。 -->',
  ]
  for (const s of STATUSES) {
    out.push('', `## ${TITLES[s]}`, '')
    for (const t of tasks.filter(t => t.status === s)) {
      out.push(`- [${mark(t)}] ${t.title}${t.tag ? ` #${t.tag}` : ''}${t.due ? ` due:${t.due}` : ''}${t.done ? ` done:${t.done}` : ''}`)
    }
  }
  return out.join('\n') + '\n'
}

/**
 * 每天整理一次：Completed 里没写完成日期的记成今天，超过 days 天（settings.json 的 keepCompletedDays）的挪进 Archived。
 * 没变化就原样返回同一个数组（调用方据此判断要不要写文件）。
 */
export function tidy(tasks, today = new Date(), days = KEEP_DAYS) {
  const cut = new Date(today); cut.setDate(cut.getDate() - days)
  const now = ymd(today), old = ymd(cut)
  let changed = false
  const next = tasks.map(t => {
    if (t.status !== 'completed') return t
    if (!t.done) { changed = true; return { ...t, done: now } }
    if (t.done < old) { changed = true; return { ...t, status: 'archived' } }
    return t
  })
  if (!changed) return tasks
  // 挪进 Archived 的排在最前（最新的在上）
  const moved = next.filter((t, i) => t.status === 'archived' && tasks[i].status === 'completed')
  return [...moved, ...next.filter(t => !moved.includes(t))]
}

function hash(s) {
  let h = 0
  for (const c of s) h = (h * 31 + c.codePointAt(0)) | 0
  return (h >>> 0).toString(36)
}

const pad = n => String(n).padStart(2, '0')
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/**
 * 快速添加：从输入里拆出 #分类 和日期。
 * 日期认：2026-10-25、10/25、10-25、今天、明天、后天、周一…周日（下一个）
 */
export function quickAdd(input, today = new Date()) {
  let text = ` ${input} `, due = null
  const take = (re, fn) => { const m = text.match(re); if (m && !due) { due = fn(m); text = text.replace(re, ' ') } }
  take(/\s(\d{4})-(\d{1,2})-(\d{1,2})\s/, m => ymd(new Date(+m[1], m[2] - 1, +m[3])))
  take(/\s(\d{1,2})[/-](\d{1,2})\s/, m => {
    let d = new Date(today.getFullYear(), m[1] - 1, +m[2])
    if (d < new Date(today.getFullYear(), today.getMonth(), today.getDate())) d = new Date(today.getFullYear() + 1, m[1] - 1, +m[2])
    return ymd(d)
  })
  const rel = { 今天: 0, 明天: 1, 后天: 2 }
  take(/\s(今天|明天|后天)\s/, m => { const d = new Date(today); d.setDate(d.getDate() + rel[m[1]]); return ymd(d) })
  take(/\s(?:周|星期)([一二三四五六日天])\s/, m => {
    const want = '日一二三四五六'.indexOf(m[1] === '天' ? '日' : m[1])
    const d = new Date(today); d.setDate(d.getDate() + (((want - d.getDay()) + 7) % 7 || 7)); return ymd(d)
  })
  const { title, tag } = parseLine(text)
  return { title, tag, due }
}
