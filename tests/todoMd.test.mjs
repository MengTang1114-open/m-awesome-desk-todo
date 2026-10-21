import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parse, serialize, quickAdd, tidy } from '../src/todoMd.js'

test('解析四个分组、分类和日期', () => {
  const t = parse(`# x
## To-do
- [ ] weekly report #work due:2026-10-25
- [ ] get groceries #life
## Pending
- [ ] 等设计稿
## Completed
- [x] book flight done:2026-10-20
## Archived
- [x] 老任务 #work done:2026-09-01
- [-] 旧计划 #work`)
  assert.deepEqual(t.map(x => [x.title, x.tag, x.due, x.done, x.status]), [
    ['weekly report', 'work', '2026-10-25', null, 'todo'],
    ['get groceries', 'life', null, null, 'todo'],
    ['等设计稿', null, null, null, 'pending'],
    ['book flight', null, null, '2026-10-20', 'completed'],
    ['老任务', 'work', null, '2026-09-01', 'archived'],
    ['旧计划', 'work', null, null, 'archived'],
  ])
})

test('宽松：中文标题、AI 手写的 [x]、没有分组', () => {
  const t = parse(`## 待办\n- [x] 写完了\n* [ ] 星号也行\n## 已取消\n- [ ] 不做了\n`)
  assert.deepEqual(t.map(x => x.status), ['completed', 'todo', 'archived'])
  assert.equal(t[0].done, '')   // 做完了，日期待补
  assert.deepEqual(parse('- [ ] 散的一条').map(x => x.status), ['todo'])
})

test('写出再读回不变', () => {
  const a = parse(`## To-do\n- [ ] A #w due:2026-01-02\n## Completed\n- [x] B done:2026-10-20\n## Archived\n- [x] D\n- [-] C`)
  const b = parse(serialize(a))
  assert.deepEqual(b.map(({ id, ...r }) => r), a.map(({ id, ...r }) => r))
})

test('快速添加拆出分类和日期', () => {
  const today = new Date(2026, 9, 21)   // 周三
  assert.deepEqual(quickAdd('交周报 #work 10/25', today), { title: '交周报', tag: 'work', due: '2026-10-25' })
  assert.deepEqual(quickAdd('买菜 明天', today), { title: '买菜', tag: null, due: '2026-10-22' })
  assert.deepEqual(quickAdd('开会 周五 #work', today), { title: '开会', tag: 'work', due: '2026-10-23' })
  assert.deepEqual(quickAdd('过期日期 1/5', today).due, '2027-01-05')
  assert.deepEqual(quickAdd('没有日期', today), { title: '没有日期', tag: null, due: null })
})

test('旧文件的 ## Cancelled 读成 Archived，写出成 ## Archived', () => {
  const md = serialize(parse(`## Cancelled\n- [-] 不做了 #life`))
  assert.match(md, /## Archived\n\n- \[-\] 不做了 #life\n/)
  assert.doesNotMatch(md, /Cancelled/)
})

test('整理：补完成日期、超过 7 天进 Archived、没变化返回原数组', () => {
  const today = new Date(2026, 9, 21)
  const t = parse(`## To-do\n- [ ] A\n## Completed\n- [x] 新的\n- [x] 昨天 done:2026-10-20\n- [x] 正好 7 天 done:2026-10-14\n- [x] 8 天前 done:2026-10-13\n## Archived\n- [-] 旧`)
  const n = tidy(t, today)
  assert.deepEqual(n.map(x => [x.title, x.status, x.done]), [
    ['8 天前', 'archived', '2026-10-13'],
    ['A', 'todo', null],
    ['新的', 'completed', '2026-10-21'],
    ['昨天', 'completed', '2026-10-20'],
    ['正好 7 天', 'completed', '2026-10-14'],
    ['旧', 'archived', null],
  ])
  assert.equal(tidy(n, today), n)
  assert.match(serialize(n), /## Archived\n\n- \[x\] 8 天前 done:2026-10-13\n- \[-\] 旧/)
})

test('Completed 留几天可以设', () => {
  const today = new Date(2026, 9, 21)
  const t = parse(`## Completed\n- [x] 三天前 done:2026-10-18`)
  assert.equal(tidy(t, today, 7)[0].status, 'completed')
  assert.equal(tidy(t, today, 2)[0].status, 'archived')
})
