"""生成 README 里的动图（docs/*.gif）。先 npm run build，然后：

    uv run --with playwright --with pillow python scripts/make_gifs.py

- hero.gif：浏览器预览里真实操作一遍（转头跟鼠标 → 移上看清单 → 加一条 → 勾掉 → 移开收起 → 戳到晕）
- 每种神态一张小动图（直接用形象九宫格合成，循环播放）：
  follow.gif 跟着鼠标转头、poke.gif 戳一下、dizzy.gif 连戳会晕、sleepy.gif 放着不动打瞌睡、cheer.gif 做完了一起庆祝
"""
import functools, http.server, shutil, socketserver, subprocess, sys, tempfile, threading
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs'
PETS = ROOT / 'public' / 'pets'
BG = (246, 246, 249)
DIRS = ['up-left', 'up', 'up-right', 'left', 'center', 'right', 'down-left', 'down', 'down-right']
REACTIONS = ['blink', 'heart', 'sparkle', 'surprised', 'wink', 'bashful', 'sleepy', 'dizzy', 'delighted']


def cell(name, kind, key, size):
    sheet = Image.open(PETS / f'{name}-{kind}.webp').convert('RGBA')
    i = (DIRS if kind == 'directions' else REACTIONS).index(key)
    t = sheet.width // 3
    return sheet.crop(((i % 3) * t, (i // 3) * t, (i % 3 + 1) * t, (i // 3 + 1) * t)).resize((size, size), Image.LANCZOS)


def save(frames, durations, path):
    """RGBA 帧铺到浅底上存 GIF（GIF 的透明边缘很难看，所以不用透明）"""
    flat = []
    for f in frames:
        bg = Image.new('RGBA', f.size, BG + (255,)); bg.alpha_composite(f); flat.append(bg.convert('RGB'))
    pal = flat[0].quantize(colors=255, method=Image.MEDIANCUT)
    flat[0].quantize(palette=pal).save(path, save_all=True, loop=0, duration=durations, optimize=True,
                                       append_images=[f.quantize(palette=pal) for f in flat[1:]], disposal=2)
    print(path.name, f'{path.stat().st_size // 1024} KB')


def canvas(n=1, size=200):
    return Image.new('RGBA', (size * n, size), (0, 0, 0, 0))


def follow(names, size=200):
    """四只一起跟着一个转圈的鼠标点转头"""
    order = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right']
    frames, durs = [], []
    for step in range(len(order) * 2):
        d = order[step % len(order)]
        im = canvas(len(names), size)
        for k, n in enumerate(names):
            im.alpha_composite(cell(n, 'directions', d, size), (k * size, 0))
        # 鼠标：一个小箭头绕着整排转
        import math
        a = step / len(order) * math.pi * 2
        x = im.width / 2 + math.cos(a) * (im.width / 2 - 24); y = size / 2 + math.sin(a) * (size / 2 - 14)
        dr = ImageDraw.Draw(im)
        dr.polygon([(x, y), (x, y + 18), (x + 5, y + 13), (x + 9, y + 21), (x + 12, y + 19), (x + 8, y + 12), (x + 14, y + 12)],
                   fill=(30, 30, 34, 255), outline=(255, 255, 255, 255))
        frames.append(im); durs.append(220)
    save(frames, durs, OUT / 'follow.gif')


def loop(name, path, seq, size=200):
    """seq：[(kind, key, 毫秒)…]"""
    frames, durs = [], []
    for kind, key, ms in seq:
        im = canvas(1, size); im.alpha_composite(cell(name, kind, key, size)); frames.append(im); durs.append(ms)
    save(frames, durs, path)


def cheer(names, size=200):
    frames, durs = [], []
    for k in range(len(names) + 1):   # 一只接一只高兴起来
        im = canvas(len(names), size)
        for j, n in enumerate(names):
            im.alpha_composite(cell(n, 'reactions', 'delighted', size) if j < k else cell(n, 'directions', 'center', size), (j * size, 0))
        frames.append(im); durs.append(160 if k < len(names) else 1600)
    im = canvas(len(names), size)
    for j, n in enumerate(names):
        im.alpha_composite(cell(n, 'directions', 'center', size), (j * size, 0))
    frames.append(im); durs.append(900)
    save(frames, durs, OUT / 'cheer.gif')


# 录 hero.gif 时把预览背景换成一个仿桌面：壁纸 + 左边一个正在写的文档窗口，看得出宠物是浮在别的窗口上面的
DESKTOP_CSS = '''
.stage.preview { background: linear-gradient(135deg, #8fb3e6 0%, #b9a7e0 45%, #f0b8c8 100%) }
.fake-win { position: fixed; left: 28px; top: 40px; width: 430px; height: 470px; border-radius: 12px; background: #fff;
  box-shadow: 0 20px 50px rgba(0,0,0,.25); overflow: hidden; font: 13px -apple-system, "PingFang SC", sans-serif; color: #333 }
.fake-win .bar { height: 30px; background: #ececef; display: flex; align-items: center; gap: 7px; padding: 0 12px }
.fake-win .bar i { width: 11px; height: 11px; border-radius: 50%; display: block }
.fake-win .bar b { margin-left: 12px; font-weight: 500; color: #777; font-size: 12px }
.fake-win .body { padding: 22px 26px; line-height: 2 }
.fake-win .body h3 { font-size: 18px; margin-bottom: 8px }
.fake-win .line { height: 9px; border-radius: 5px; background: #e6e6ea; margin: 14px 0 }
.stage > .panel, .stage > .pets { z-index: 2 }
'''
DESKTOP_JS = '''() => {
  const w = document.createElement('div'); w.className = 'fake-win'
  w.innerHTML = '<div class="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><b>周报.md</b></div>'
    + '<div class="body"><h3>本周周报</h3><div class="line" style="width:92%"></div><div class="line" style="width:80%"></div>'
    + '<div class="line" style="width:86%"></div><div class="line" style="width:60%"></div><div class="line" style="width:90%"></div>'
    + '<div class="line" style="width:74%"></div><div class="line" style="width:83%"></div><div class="line" style="width:40%"></div></div>'
  document.querySelector('.stage').prepend(w)
}'''


def hero():
    """浏览器预览里录一段真实操作，ffmpeg 转 GIF"""
    from playwright.sync_api import sync_playwright
    H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT / 'dist'))
    H.log_message = lambda *a: None
    srv = socketserver.TCPServer(('127.0.0.1', 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
    tmp = Path(tempfile.mkdtemp())
    W, Hh = 820, 600
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': W, 'height': Hh}, record_video_dir=str(tmp), record_video_size={'width': W, 'height': Hh})
        pg = ctx.new_page()
        pg.goto(f'http://127.0.0.1:{srv.server_address[1]}/index.html'); pg.wait_for_timeout(800)
        pg.add_style_tag(content=DESKTOP_CSS); pg.evaluate(DESKTOP_JS); pg.wait_for_timeout(200)
        pets = pg.locator('.pet')
        box = lambda i: pets.nth(i).bounding_box()
        import math
        # 鼠标在上面画个弧，四只跟着转头
        for t in range(40):
            a = math.pi * (1 + t / 39)
            pg.mouse.move(W - 230 + math.cos(a) * 220, 380 + math.sin(a) * 230); pg.wait_for_timeout(35)
        # 移上第一只：清单出来
        b0 = box(0); pg.mouse.move(b0['x'] + b0['width'] / 2, b0['y'] + 40, steps=12); pg.wait_for_timeout(900)
        pg.locator('.panel').hover(); pg.wait_for_timeout(300)
        inp = pg.locator('footer input:not([type=date])'); inp.click()
        inp.type('给猫买罐头 #生活 明天', delay=70); pg.keyboard.press('Enter'); pg.wait_for_timeout(700)
        pg.locator('.row', has_text='周报').locator('.check').click(); pg.wait_for_timeout(900)
        # 移开就收起
        pg.mouse.move(150, 300, steps=12); pg.wait_for_timeout(900)
        # 连戳第二只：晕了
        b1 = box(1)
        for _ in range(4):
            pg.mouse.click(b1['x'] + b1['width'] / 2, b1['y'] + 50); pg.wait_for_timeout(140)
        pg.mouse.move(200, 330, steps=10); pg.wait_for_timeout(1600)
        video = pg.video.path(); ctx.close(); b.close()
    srv.shutdown()
    out = OUT / 'hero.gif'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', '1.1', '-i', video, '-vf',
                    'fps=15,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192[p];[b][p]paletteuse=dither=bayer:bayer_scale=4',
                    str(out)], check=True)
    shutil.rmtree(tmp, ignore_errors=True)
    print(out.name, f'{out.stat().st_size // 1024} KB')


if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    four = ['fox', 'cat', 'panda', 'owl']
    follow(four)
    rest = ('directions', 'center', 900)
    loop('fox', OUT / 'poke.gif', [rest, ('reactions', 'heart', 700), rest, ('reactions', 'sparkle', 700), rest, ('reactions', 'delighted', 700)])
    loop('cat', OUT / 'dizzy.gif', [rest, ('reactions', 'surprised', 300), ('reactions', 'bashful', 300), ('reactions', 'dizzy', 1500)])
    loop('panda', OUT / 'sleepy.gif', [('directions', 'center', 1400), ('reactions', 'blink', 500), ('directions', 'center', 600), ('reactions', 'sleepy', 2200)])
    cheer(four)
    if '--no-hero' not in sys.argv:
        hero()
