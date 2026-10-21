import { useEffect, useMemo, useRef, useState } from 'react'
import { Pet } from './Pet'
import type { Reaction } from './Pet'
import { bridge, inElectron, DEFAULT_SETTINGS } from './bridge'
import type { Point, Settings, Theme } from './bridge'
import { parse, serialize, quickAdd, tidy, ymd, STATUSES, TITLES } from './todoMd.js'

type Status = 'todo' | 'pending' | 'completed' | 'archived'
type Task = { id: string; title: string; tag: string | null; due: string | null; done: string | null; status: Status }

// 四个位置各管一个分组；每个位置用哪个形象在 settings.json 的 pets 里（右键宠物也能换）
const PETS: { status: Status; empty: (days: number) => string }[] = [
  { status: 'todo', empty: () => '今天没有要做的，出去玩吧' },
  { status: 'pending', empty: () => '没有在等的事' },
  { status: 'completed', empty: () => '做完一件，我就在这儿等你' },
  { status: 'archived', empty: days => `做完超过 ${days} 天的会自动收到我这里；不做的事也拖给我` },
]
// 形象的两张图：自己做的在 pets/<名字>/（pet:// 由 Electron 读），内置的在 public/pets/
const sprite = (name: string, s: Settings) => s.custom.includes(name)
  ? { directions: `pet://local/${encodeURIComponent(name)}/directions.webp?v=${s.version}`, reactions: `pet://local/${encodeURIComponent(name)}/reactions.webp?v=${s.version}` }
  : { directions: `pets/${name}-directions.webp`, reactions: `pets/${name}-reactions.webp` }
const COUNTED: Status[] = ['todo', 'pending']   // 只有还没做完的显示数字；Completed、Archived 只会越堆越多，不显示
const SLEEP_AFTER = 90_000   // 这么久没动鼠标，四只一起打瞌睡
const OVERLOAD = 10          // To-do 堆到这么多条，腊肠隔一会儿就晕一下
// 分类名里不能有空格和 #（文件里是「#分类」）
const cleanTag = (s: string) => s.trim().replace(/^#+/, '').replace(/[\s#]+/g, '-') || null
const WEEK = '日一二三四五六'

// 外观：跟随系统 / 浅色 / 深色，存在 settings.json。页面上设 data-theme；Electron 里同时改 nativeTheme，系统下拉和日期选择器也跟着变
const THEMES: Theme[] = ['system', 'light', 'dark']
const THEME_NAME = { system: '跟随系统', light: '浅色', dark: '深色' }
const THEME_ICON = {
  system: 'M12 3a9 9 0 1 0 0 18zM12 3a9 9 0 0 1 0 18',
  light: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  dark: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
}
function applyTheme(t: Theme) {
  if (t === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = t
}

// Archived 按月：今年的写「10月做完」，往年的带上年份
const monthLabel = (done: string) => `${done.slice(0, 4) === String(new Date().getFullYear()) ? '' : done.slice(0, 4) + '年'}${+done.slice(5, 7)}月做完`

// Completed 按完成日期分组：今天 / 昨天 / 10/19 周日
function doneLabel(done: string) {
  if (!done) return '更早'
  const y = new Date(); y.setDate(y.getDate() - 1)
  if (done === ymd(new Date())) return '今天'
  if (done === ymd(y)) return '昨天'
  const [yy, m, d] = done.split('-').map(Number)
  return `${m}/${d} 周${WEEK[new Date(yy, m - 1, d).getDay()]}`
}

// 日期选择器、分类下拉是系统弹窗，鼠标在上面不算在面板里：开着的时候面板先不收，选完再按鼠标位置决定
const PICK = { open: false, done: () => {} }
setInterval(() => { PICK.open = false }, 20_000)   // 选择器被取消时没有事件，兜底

let seq = 0
const newId = () => `n${Date.now().toString(36)}${seq++}`

function dueLabel(due: string) {
  const today = ymd(new Date())
  const t = new Date(); t.setDate(t.getDate() + 1)
  if (due === today) return { text: '今天', cls: 'today' }
  if (due === ymd(t)) return { text: '明天', cls: '' }
  const [, m, d] = due.split('-').map(Number)
  return { text: `${m}/${d}`, cls: due < today ? 'late' : '' }
}

export function App() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [panel, setPanel] = useState<{ open: boolean; tab: Status }>({ open: false, tab: 'todo' })
  const panelRef = useRef<HTMLElement>(null)
  const hovering = useRef(false)
  const keepOpenRef = useRef(() => {}), leaveSoonRef = useRef(() => {})
  const [pointer, setPointer] = useState<Point | null>(null)
  const [sleepy, setSleepy] = useState(false)
  const [cues, setCues] = useState<Partial<Record<Status, { kind: Reaction; at: number }>>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [editSeed, setEditSeed] = useState<string | null>(null)   // 「新分组…」：改名框里预先带上 #
  const [editingGroup, setEditingGroup] = useState<string | null>(null)
  const addRef = useRef<HTMLInputElement>(null)
  const [dropOn, setDropOn] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [draftDue, setDraftDue] = useState<string | null>(null)
  const [filePath, setFilePath] = useState('')
  const boops = useRef<Record<string, (() => void) | null>>({})
  const closeTimer = useRef<number>()
  const lastMove = useRef(Date.now())
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const dragging = useRef<string | null>(null)
  const hit = useRef(false)

  // ---------- 数据：读 To-Do.md，外面（AI、编辑器）改了自动刷新 ----------
  // 读进来顺手整理：Completed 补上完成日期、超过 keepCompletedDays 天的挪进 Archived（有变化才写回文件）
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const days = useRef(DEFAULT_SETTINGS.keepCompletedDays)
  days.current = settings.keepCompletedDays
  const load = (text: string) => {
    const raw = parse(text) as Task[], next = tidy(raw, new Date(), days.current) as Task[]
    setTasks(next)
    if (next !== raw) bridge.write(serialize(next))
  }
  const theme = settings.theme
  useEffect(() => applyTheme(theme), [theme])
  useEffect(() => {
    // 先拿到设置（Completed 留几天）再读清单
    bridge.settings().then(s => { setSettings(s); days.current = s.keepCompletedDays; bridge.read().then(load) })
    bridge.onSettings(setSettings)
    bridge.onFile(load)
    bridge.filePath().then(setFilePath)
    // 全局快捷键：弹出 To-do 并把光标放进输入框
    bridge.onQuickAdd(() => { setPanel({ open: true, tab: 'todo' }); window.setTimeout(() => addRef.current?.focus(), 60) })
  }, [])
  const save = (next: Task[]) => { setTasks(next); bridge.write(serialize(next)) }
  // 过了午夜也要整理（桌宠一般一直开着）
  useEffect(() => {
    const t = window.setInterval(() => setTasks(cur => { const next = tidy(cur, new Date(), days.current) as Task[]; if (next !== cur) bridge.write(serialize(next)); return next }), 3_600_000)
    return () => window.clearInterval(t)
  }, [])

  // ---------- 鼠标：Electron 里是全屏系统鼠标（窗口坐标），浏览器里是页面鼠标 ----------
  useEffect(() => {
    const seen = (p: Point) => { setPointer(p); lastMove.current = Date.now(); setSleepy(false) }
    bridge.onCursor(p => {
      seen(p)
      // 系统鼠标位置也用来判断在不在面板上：鼠标甩出窗口时页面收不到最后一次移动，靠它兜底
      if (dragging.current) return
      const over = !!document.elementFromPoint(p.x, p.y)?.closest('.panel, .pets')
      if (over !== hovering.current) over ? keepOpenRef.current() : leaveSoonRef.current()
    })
    const onMove = (e: MouseEvent) => {
      if (!inElectron) seen({ x: e.clientX, y: e.clientY })
      // 点击穿透：只有鼠标在宠物或面板上时窗口才接收点击，其余地方点到桌面
      const el = e.target as Element
      const on = !!el.closest?.('[data-hit]') || !!dragging.current || !!drag.current
      if (on !== hit.current) { hit.current = on; bridge.interactive(on) }
      // 面板开关也按鼠标此刻停在哪儿判断（拖放期间没有进出事件，靠 mouseenter/leave 会判断错）
      const over = !!el.closest?.('.panel, .pets')
      if (over !== hovering.current) over ? keepOpenRef.current() : leaveSoonRef.current()
    }
    window.addEventListener('mousemove', onMove)
    const t = window.setInterval(() => { if (Date.now() - lastMove.current > SLEEP_AFTER) setSleepy(true) }, 5000)
    return () => { window.removeEventListener('mousemove', onMove); window.clearInterval(t) }
  }, [])

  const cue = (s: Status, kind: Reaction) => setCues(c => ({ ...c, [s]: { kind, at: Date.now() } }))
  const celebrate = () => STATUSES.forEach((s, i) => window.setTimeout(() => cue(s as Status, 'delighted'), i * 140))

  // To-do 太多：腊肠隔一会儿晕一下
  const todoCount = tasks.filter(t => t.status === 'todo').length
  useEffect(() => {
    if (todoCount < OVERLOAD) return
    cue('todo', 'dizzy')
    const t = window.setInterval(() => cue('todo', 'dizzy'), 25_000)
    return () => window.clearInterval(t)
  }, [todoCount >= OVERLOAD])

  // ---------- 面板：移上宠物看一眼，点一下固定；固定后不碰它就变半透明 ----------
  // 鼠标在宠物或面板上就开着，移开就收；正在输入（加任务、改名）或开着下拉/日期时先不收，输完再收
  const busyRef = useRef(false)
  busyRef.current = !!editing || editingGroup !== null || draft.trim() !== ''
  const busy = () => busyRef.current || PICK.open || !!dragging.current
  const keepOpen = () => { hovering.current = true; PICK.open = false; window.clearTimeout(closeTimer.current) }
  const leaveSoon = () => {
    hovering.current = false
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => {
      if (hovering.current || busy()) return
      if (panelRef.current?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur()
      setPanel(p => ({ ...p, open: false }))
    }, 300)
  }
  keepOpenRef.current = keepOpen; leaveSoonRef.current = leaveSoon
  PICK.done = () => { PICK.open = false; if (!hovering.current) leaveSoon() }
  // 按着鼠标（拖任务）经过宠物时不切分组：切了被拖的那条会从列表里消失，拖放就断了
  const hoverPet = (s: Status, buttons: number) => { keepOpen(); if (!dragging.current && !buttons) setPanel({ open: true, tab: s }) }

  const petDown = (e: React.MouseEvent) => { drag.current = { x: e.screenX, y: e.screenY, moved: false } }
  useEffect(() => {
    // 按住宠物拖：整排宠物（整个窗口）跟着走
    const move = (e: MouseEvent) => {
      const d = drag.current
      if (!d) return
      const dx = e.screenX - d.x, dy = e.screenY - d.y
      if (!d.moved && Math.hypot(dx, dy) < 4) return
      d.moved = true; d.x = e.screenX; d.y = e.screenY
      bridge.moveBy(dx, dy)
    }
    const up = () => { window.setTimeout(() => { drag.current = null }, 0) }
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [])
  const clickPet = (s: Status) => {
    if (drag.current?.moved) return
    boops.current[s]?.()
    setPanel({ open: true, tab: s })
  }

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !editing && !editingGroup) { (document.activeElement as HTMLElement | null)?.blur(); setPanel(p => ({ ...p, open: false })); bridge.blur() } }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [editing, editingGroup])

  // ---------- 任务操作 ----------
  const moveTo = (id: string, status: Status, before?: string) => {
    const t = tasks.find(x => x.id === id)
    if (!t) return
    const rest = tasks.filter(x => x.id !== id)
    // 完成日期：进 Completed 时记今天（从 Archived 拿回来的保留原日期），回到 To-do / Pending 就去掉
    const done = status === 'completed' ? t.done || ymd(new Date()) : status === 'archived' ? t.done : null
    const moved = { ...t, status, done }
    const i = before ? rest.findIndex(x => x.id === before) : -1
    i >= 0 ? rest.splice(i, 0, moved) : rest.push(moved)
    save(rest)
    if (t.status === status) return
    // 今天该做的（到期日 ≤ 今天）全做完了，或者 To-do 清空了：四只一起庆祝
    const today = ymd(new Date())
    const open = rest.filter(x => x.status === 'todo' || x.status === 'pending')
    const cleared = status === 'completed' && (
      (t.due !== null && t.due <= today && !open.some(x => x.due !== null && x.due <= today)) ||
      (t.status === 'todo' && !rest.some(x => x.status === 'todo')))
    if (cleared) celebrate()
    else cue(status, status === 'completed' ? 'delighted' : status === 'archived' ? 'surprised' : 'heart')
  }
  const toggle = (t: Task) => moveTo(t.id, t.status === 'todo' || t.status === 'pending' ? 'completed' : 'todo')
  const update = (id: string, patch: Partial<Task>) => save(tasks.map(t => (t.id === id ? { ...t, ...patch } : t)))
  const remove = (id: string) => save(tasks.filter(t => t.id !== id))
  // 整组改名：所有分组里这个分类的任务一起改；改成空就是取消分类。「未分类」改名 = 给这些任务加上分类（只改当前分组）
  const renameTag = (from: string, to: string) => {
    const tag = cleanTag(to)
    save(tasks.map(t => (from ? t.tag === from : t.tag === null && t.status === panel.tab) ? { ...t, tag } : t))
    setEditingGroup(null)
  }
  const allTags = useMemo(() => [...new Set(tasks.map(t => t.tag).filter((x): x is string => !!x))], [tasks])
  const add = () => {
    const q = quickAdd(draft)
    if (!q.title) return
    save([...tasks, { id: newId(), title: q.title, tag: q.tag, due: q.due ?? draftDue, done: panel.tab === 'completed' ? ymd(new Date()) : null, status: panel.tab }])
    setDraft(''); setDraftDue(null); cue(panel.tab, 'sparkle')
  }

  const counts = useMemo(() => Object.fromEntries(STATUSES.map(s => [s, tasks.filter(t => t.status === s).length])) as Record<Status, number>, [tasks])
  const lateTodo = tasks.some(t => (t.status === 'todo' || t.status === 'pending') && t.due && t.due < ymd(new Date()))
  const list = tasks.filter(t => t.status === panel.tab)
  // To-do、Pending 按分类分组；Completed 按完成日期（新的在上）；Archived 按完成月份，不做了的单独一组
  const byDate = panel.tab === 'completed' || panel.tab === 'archived'
  const groups = useMemo(() => {
    const m = new Map<string, Task[]>()
    const key = (t: Task) => panel.tab === 'completed' ? doneLabel(t.done ?? '')
      : panel.tab === 'archived' ? (t.done === null ? '不做了' : t.done ? monthLabel(t.done) : '更早做完')
      : t.tag ?? ''
    const sorted = byDate ? [...list].sort((a, b) => (b.done ?? '').localeCompare(a.done ?? '')) : list
    for (const t of sorted) { const k = key(t); m.set(k, [...(m.get(k) ?? []), t]) }
    const entries = [...m.entries()]
    return byDate ? entries.sort((a, b) => (a[0] === '不做了' ? 1 : b[0] === '不做了' ? -1 : 0))
      : entries.sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : 0))
  }, [list, panel.tab])

  // 拖放：拖到宠物或标签上换分组，拖到某一条上插到它前面。
  // 拖到别的分组后那一行就从列表里消失了，它的 dragend 不会触发，所以放下时就结束拖动，窗口上再兜一层
  const endDrag = () => { if (!dragging.current) return; dragging.current = null; setDropOn(null); if (!hovering.current) leaveSoon() }
  useEffect(() => {
    const end = () => window.setTimeout(endDrag, 0)
    window.addEventListener('drop', end); window.addEventListener('dragend', end); window.addEventListener('mouseup', end)
    return () => { window.removeEventListener('drop', end); window.removeEventListener('dragend', end); window.removeEventListener('mouseup', end) }
  })
  const dropZone = (key: string, onDrop: (id: string) => void) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDropOn(key) },
    onDragLeave: () => setDropOn(d => (d === key ? null : d)),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDropOn(null); endDrag(); const id = e.dataTransfer.getData('text/plain'); if (id) onDrop(id) },
  })

  const now = new Date()
  const open = panel.open
  const pet = PETS.find(p => p.status === panel.tab)!

  return (
    <div className={`stage ${inElectron ? '' : 'preview'}`}>
      {open && (
        <section
          data-hit
          ref={panelRef}
          className="panel"
          onBlur={() => { if (!hovering.current) leaveSoon() }}
        >
          <header>
            <div className="date"><b>{now.getMonth() + 1}月{now.getDate()}日</b> 周{WEEK[now.getDay()]}</div>
            <div className="tools">
              <button title={`外观：${THEME_NAME[theme]}（点一下切换）`} onClick={() => bridge.saveSettings({ theme: THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length] })}>
                <Icon d={THEME_ICON[theme]} />
              </button>
              {inElectron && <button title={`打开数据文件：${filePath}`} onClick={() => bridge.reveal()}>MD</button>}
            </div>
          </header>
          <nav>
            {PETS.map(p => (
              <button key={p.status} className={`tab ${p.status === panel.tab ? 'on' : ''} ${dropOn === 'tab-' + p.status ? 'drop' : ''}`}
                onClick={() => setPanel(x => ({ ...x, tab: p.status }))} {...dropZone('tab-' + p.status, id => moveTo(id, p.status))}>
                {TITLES[p.status]}{COUNTED.includes(p.status) && <i>{counts[p.status]}</i>}
              </button>
            ))}
          </nav>
          <div className="list" {...dropZone('list', id => moveTo(id, panel.tab))}>
            {list.length === 0 && <p className="empty">{pet.empty(settings.keepCompletedDays)}</p>}
            {groups.map(([tag, items]) => (
              <div key={tag} className="group">
                {byDate
                  ? <h4 className="plain">{tag}</h4>
                  : groups.length > 1 || tag
                  ? editingGroup === tag
                    ? <GroupInput from={tag} onSave={to => renameTag(tag, to)} onCancel={() => setEditingGroup(null)} />
                    : <h4 onDoubleClick={() => setEditingGroup(tag)} title="双击给整组改名">{tag || '未分类'}</h4>
                  : null}
                {items.map(t => (
                  <Row key={t.id} t={t} showTag={byDate} editing={editing === t.id} seed={editing === t.id ? editSeed : null} dropping={dropOn === 'row-' + t.id}
                    tags={allTags} onTag={tag => update(t.id, { tag })}
                    onNewTag={() => { setEditSeed(t.title + ' #'); setEditing(t.id) }}
                    onToggle={() => toggle(t)} onEdit={() => { setEditSeed(null); setEditing(t.id) }} onDone={() => setEditing(null)}
                    onSave={(title, tag) => { update(t.id, { title, tag }); setEditing(null) }}
                    onDue={due => update(t.id, { due })} onDelete={() => remove(t.id)}
                    dragProps={{
                      draggable: editing !== t.id,
                      onDragStart: (e: React.DragEvent) => { dragging.current = t.id; e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move' },
                      onDragEnd: endDrag,
                      ...dropZone('row-' + t.id, id => id !== t.id && moveTo(id, panel.tab, t.id)),
                    }} />
                ))}
              </div>
            ))}
          </div>
          <footer>
            <input ref={addRef} value={draft} placeholder={`添加到 ${TITLES[panel.tab]}，可写 #分类 明天 10/25`}
              onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) add() }} />
            <DateButton value={draftDue} onChange={setDraftDue} />
          </footer>
        </section>
      )}

      <div className="pets" data-hit>
        {PETS.map((p, i) => (
          <div key={p.status} className={`pet ${panel.tab === p.status && open ? 'active' : ''} ${dropOn === 'pet-' + p.status ? 'drop' : ''}`}
            title={`${TITLES[p.status]}（右键换形象）`}
            onMouseEnter={e => hoverPet(p.status, e.buttons)} onMouseDown={petDown} onClick={() => clickPet(p.status)}
            onContextMenu={e => { e.preventDefault(); bridge.petMenu(i) }}
            {...dropZone('pet-' + p.status, id => moveTo(id, p.status))}>
            {COUNTED.includes(p.status) && counts[p.status] > 0 && <span className={`badge ${p.status === 'todo' && lateTodo ? 'late' : ''}`}>{counts[p.status]}</span>}
            <Pet key={settings.pets[i]} src={sprite(settings.pets[i], settings)} pointer={pointer} cue={cues[p.status]} sleepy={sleepy}
              boopRef={{ get current() { return boops.current[p.status] ?? null }, set current(f) { boops.current[p.status] = f } }} />
            <span className="label">{TITLES[p.status]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Row({ t, showTag, editing, seed, dropping, tags, onTag, onNewTag, onToggle, onEdit, onDone, onSave, onDue, onDelete, dragProps }: {
  t: Task; showTag: boolean; editing: boolean; seed: string | null; dropping: boolean; tags: string[]
  onTag(tag: string | null): void; onNewTag(): void
  onToggle(): void; onEdit(): void; onDone(): void; onSave(title: string, tag: string | null): void
  onDue(due: string | null): void; onDelete(): void; dragProps: Record<string, unknown>
}) {
  const [text, setText] = useState('')
  useEffect(() => { if (editing) setText(seed ?? t.title + (t.tag ? ` #${t.tag}` : '')) }, [editing, seed, t.title, t.tag])
  const commit = () => { const q = quickAdd(text); q.title ? onSave(q.title, q.tag) : onDone() }
  const due = t.due ? dueLabel(t.due) : null
  return (
    <div className={`row ${t.status} ${t.status === 'archived' && t.done === null ? 'dropped' : ''} ${dropping ? 'drop' : ''}`} {...dragProps}>
      <button className="check" onClick={onToggle} title={t.status === 'completed' || t.status === 'archived' ? '放回 To-do' : '完成'}>
        {t.done !== null ? '✓' : t.status === 'archived' ? '–' : ''}
      </button>
      {editing
        ? <input autoFocus value={text} onChange={e => setText(e.target.value)} onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) commit(); if (e.key === 'Escape') onDone() }} />
        : <span className="title" onDoubleClick={onEdit} title="双击修改">{t.title}</span>}
      {!editing && showTag && t.tag && <span className="tagname">#{t.tag}</span>}
      {!editing && <TagButton value={t.tag} tags={tags} onChange={onTag} onNew={onNewTag} />}
      {t.status === 'todo' || t.status === 'pending' || t.due
        ? <DateButton value={t.due} onChange={onDue} label={due?.text} cls={t.done === null ? due?.cls : ''} />
        : null}
      <button className="del" onClick={onDelete} title="删除">×</button>
    </div>
  )
}

// 换分组：悬停出现，点开是系统下拉菜单
const NONE = '\u0000none', NEW = '\u0000new'
function TagButton({ value, tags, onChange, onNew }: { value: string | null; tags: string[]; onChange(tag: string | null): void; onNew(): void }) {
  return (
    <span className="tagpick" title="换分组">
      #
      <select value={value ?? NONE} onMouseDown={() => { PICK.open = true }} onBlur={() => PICK.done()}
        onChange={e => { const v = e.target.value; PICK.done(); v === NEW ? onNew() : onChange(v === NONE ? null : v) }}>
        {tags.map(g => <option key={g} value={g}>{g}</option>)}
        <option value={NONE}>未分类</option>
        <option value={NEW}>新分组…</option>
      </select>
    </span>
  )
}

// 分组标题改名
function GroupInput({ from, onSave, onCancel }: { from: string; onSave(to: string): void; onCancel(): void }) {
  const [v, setV] = useState(from)
  return (
    <input className="group-input" autoFocus value={v} placeholder="分类名（留空 = 取消分类）" onChange={e => setV(e.target.value)}
      onBlur={() => onSave(v)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) onSave(v); if (e.key === 'Escape') onCancel() }} />
  )
}

// 日期：点开系统日期选择器；已有日期时右键清掉
function DateButton({ value, onChange, label, cls = '' }: { value: string | null; onChange(v: string | null): void; label?: string; cls?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  const shown = label ?? (value ? dueLabel(value).text : '')
  return (
    <span className={`due ${cls} ${value ? 'set' : ''}`} title={value ? `${value}（右键清除）` : '设日期'}
      onClick={() => { const i = ref.current; if (!i) return; PICK.open = true; try { i.showPicker() } catch { i.focus(); i.click() } }}
      onContextMenu={e => { e.preventDefault(); onChange(null) }}>
      {shown || <Icon d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" />}
      <input ref={ref} type="date" value={value ?? ''} onChange={e => { PICK.done(); onChange(e.target.value || null) }} onBlur={() => PICK.done()} tabIndex={-1} />
    </span>
  )
}

// 线条图标（不用 emoji：各台机器显示一致）
function Icon({ d }: { d: string }) {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}><path d={d} /></svg>
}
