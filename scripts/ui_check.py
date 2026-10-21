"""在浏览器里把桌宠走一遍，每步截图（Linux 上没法跑 Electron，界面逻辑在这里验）。
用法：先 npm run build，然后 uv run --with playwright python scripts/ui_check.py <截图目录>"""
import functools, http.server, socketserver, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
H = functools.partial(http.server.SimpleHTTPRequestHandler, directory='dist')
H.log_message = lambda *a: None
srv = socketserver.TCPServer(('127.0.0.1', 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{srv.server_address[1]}/index.html'
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 470, 'height': 640})
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    pg.goto(url); pg.wait_for_timeout(600)
    shot = lambda n: pg.screenshot(path=str(out / f'{n}.png'))
    pg.mouse.move(20, 20); pg.wait_for_timeout(200); shot('1-看左上')
    pets = pg.locator('.pet')
    pets.nth(0).hover(); pg.wait_for_timeout(300); shot('2-移上腊肠看一眼')
    pg.mouse.move(5, 5); pg.wait_for_timeout(500); shot('3-移开就收起')
    assert pg.locator('.panel').count() == 0
    pets.nth(0).hover(); pg.wait_for_timeout(200); pg.locator('.panel').hover(); pg.wait_for_timeout(400)
    assert pg.locator('.panel').count() == 1, '从宠物移到面板上，面板应该一直开着'
    pg.locator('footer input:not([type=date])').click(); pg.keyboard.type('还没写完'); pg.mouse.move(5, 5); pg.wait_for_timeout(500)
    assert pg.locator('.panel').count() == 1, '输入框里有没提交的字，移开先不收'
    pg.locator('.panel').hover(); pg.fill('footer input:not([type=date])', '')
    pg.fill('footer input:not([type=date])', '给妈妈打电话 #生活 明天'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300); shot('4-添加')
    row = pg.locator('.row', has_text='给妈妈打电话')
    assert row.count() == 1 and '明天' in row.inner_text(), row.inner_text()
    row.drag_to(pets.nth(1)); pg.wait_for_timeout(300)
    assert pg.locator('.row', has_text='给妈妈打电话').count() == 0
    pg.locator('.tab').nth(1).click(); pg.wait_for_timeout(200); shot('5-拖到小白后在Pending')
    assert pg.locator('.row', has_text='给妈妈打电话').count() == 1
    pg.locator('.tab').nth(0).click()
    pg.locator('.row', has_text='周报').locator('.check').click(); pg.wait_for_timeout(300)
    pg.locator('.tab').nth(2).click(); pg.wait_for_timeout(200); shot('6-勾选后到Completed')
    assert pg.locator('.row', has_text='周报').count() == 1
    assert pg.locator('.group h4', has_text='今天').count() == 1, 'Completed 按完成日期分组'
    assert '#工作' in pg.locator('.row', has_text='周报').inner_text(), 'Completed 里显示分类'
    assert pg.locator('.tab').nth(2).inner_text().strip() == 'Completed', 'Completed 不显示数字'
    assert pg.locator('.badge').count() == 2, '只有 To-do、Pending 有角标'
    pg.locator('.tab').nth(3).click(); pg.wait_for_timeout(200); shot('6b-Archived')
    pg.locator('.tab').nth(0).click()
    pg.locator('.row', has_text='买菜').locator('.title').dblclick()
    pg.keyboard.press('ControlOrMeta+a'); pg.keyboard.type('买菜和水果 #生活'); pg.keyboard.press('Enter'); pg.wait_for_timeout(200)
    assert pg.locator('.row', has_text='买菜和水果').count() == 1
    r = pg.locator('.row', has_text='剪素材'); r.hover(); r.locator('.del').click(); pg.wait_for_timeout(200)
    assert pg.locator('.row', has_text='剪素材').count() == 0
    # 拖到另一条前面：排序
    pg.locator('.row', has_text='流量分析').drag_to(pg.locator('.row', has_text='周报').first if pg.locator('.row', has_text='周报').count() else pg.locator('.row').first)
    shot('7-改名删除后')
    # 分组：双击标题整组改名；悬停用 # 下拉换分组；「新分组…」进改名框
    pg.locator('.group h4', has_text='生活').dblclick()
    pg.locator('.group-input').fill('家里'); pg.keyboard.press('Enter'); pg.wait_for_timeout(200)
    assert pg.locator('.group h4', has_text='家里').count() == 1 and pg.locator('.group h4', has_text='生活').count() == 0
    r = pg.locator('.row', has_text='流量分析'); r.hover(); r.locator('.tagpick select').select_option('家里'); pg.wait_for_timeout(200)
    assert '流量分析' in pg.locator('.group', has=pg.locator('h4', has_text='家里')).inner_text()
    r = pg.locator('.row', has_text='流量分析'); r.hover(); r.locator('.tagpick select').select_option('\u0000new'); pg.wait_for_timeout(200)
    pg.keyboard.type('学习'); pg.keyboard.press('Enter'); pg.wait_for_timeout(200)
    assert pg.locator('.group h4', has_text='学习').count() == 1
    shot('7b-分组改名和换分组')
    # 把 To-do 全部勾完：四只一起庆祝
    while pg.locator('.row .check').count():
        pg.locator('.row .check').first.click(); pg.wait_for_timeout(150)
    pg.wait_for_timeout(250); shot('7c-清空后一起庆祝')
    md = pg.evaluate("localStorage.getItem('desk-pet-todo')")
    (out / 'To-Do.md').write_text(md)
    assert '## Archived' in md and 'done:' in md, md
    # 外观：跟随系统 → 浅色 → 深色
    theme = pg.locator('.tools button').first
    theme.click(); pg.wait_for_timeout(100)
    # 右键宠物换形象（浏览器预览里是按顺序换下一个内置形象）
    style = lambda: pg.locator('.pet').nth(0).locator('span span span').first.evaluate('e => e.style.backgroundImage')
    before = style(); pg.locator('.pet').nth(0).click(button='right'); pg.wait_for_timeout(300)
    assert style() != before, '右键后第一只应该换了形象'; theme.click(); pg.wait_for_timeout(200)
    assert pg.evaluate("document.documentElement.dataset.theme") == 'dark'
    pg.locator('.tab').nth(2).click(); pg.wait_for_timeout(200); shot('7d-深色')
    theme.click(); pg.wait_for_timeout(100)
    pg.mouse.move(5, 5); pg.wait_for_timeout(500)
    assert pg.locator('.panel').count() == 0, '加完任务移开就收'
    for i in range(4): pets.nth(3).click(); pg.wait_for_timeout(120)
    pg.mouse.move(460, 630); pg.wait_for_timeout(150); shot('8-连戳虎斑晕了')
    # 旧文件：## Cancelled 认成 Archived；没写日期的 [x] 补今天，8 天前做完的自动归档
    old = "## To-do\n- [ ] A\n## Completed\n- [x] 没日期\n- [x] 很久以前 done:2020-01-01\n## Cancelled\n- [-] 不做了\n"
    pg.evaluate("t => localStorage.setItem('desk-pet-todo', t)", old); pg.reload(); pg.wait_for_timeout(500)
    md = pg.evaluate("localStorage.getItem('desk-pet-todo')")
    assert '## Archived\n\n- [x] 很久以前 done:2020-01-01\n- [-] 不做了' in md and '- [x] 没日期 done:' in md, md
    pets.nth(3).hover(); pg.wait_for_timeout(300); shot('9-旧文件自动归档')
    b.close()
srv.shutdown()
print('errors:', errs or 'none')
