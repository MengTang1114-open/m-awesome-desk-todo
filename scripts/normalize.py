"""把形象的 18 个格子统一大小、对齐位置，写成 <名>-directions.webp 和 -reactions.webp。

为什么不直接用 page-mascot 的 build.py：九宫格里，同一只的「表情」图常比「朝向」图画得大（有的大 25%），
不同形象之间身体宽度也差到 1.4 倍，有几格还上下错位，换格子时就像在放大缩小、上下跳；
桌宠是四只排成一排，大小不一更显眼。

做法：每格取最大的连通块（角色本体，不含飘着的爱心、星星、zzz），量它的面积、底边位置和肩膀中心；
每张图按面积中位数缩放到同一个面积（看起来一样大；按肩宽对的话换表情时头会变大），
再把每格的肩膀底边对齐到同一条线、左右居中。

    uv run --with pillow --with numpy --with scipy python scripts/normalize.py [名字…]
处理 characters/<名>/directions.(png|webp)、reactions.(png|webp)（透明底），写进 public/pets/。
不写名字就处理 characters/ 下所有形象。处理完更新 public/pets/index.json（内置形象清单）。
绿幕图先用 scripts/key.py 去背景；用户自己的形象走 scripts/add_pet.py（去背景 + 这一步一起做）。
"""
import glob, json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

TILE = 360          # 输出每格边长
AREA = 50000        # 角色本体面积统一成这么多像素（每格 360×360）
BASE = 352          # 肩膀底边落在这一行
BAND = 14           # 量肩宽用底部这么多行


def cells(path):
    im = Image.open(path).convert('RGBA')
    W, H = im.size
    w, h = W // 3, H // 3
    return [im.crop(((i % 3) * w, (i // 3) * h, (i % 3 + 1) * w, (i // 3 + 1) * h)) for i in range(9)]


def body(cell):
    """最大连通块的底边行、面积、底部肩膀中心 x"""
    a = np.asarray(cell)[:, :, 3] > 60
    lab, n = ndimage.label(ndimage.binary_closing(a, iterations=2))
    if n == 0:
        raise ValueError('有一格是空的（整格透明）：九宫格没画满，或者背景没去干净')
    big = lab == (np.argmax(ndimage.sum(a, lab, range(1, n + 1))) + 1)
    ys = np.where(big.any(axis=1))[0]
    bottom = ys.max()
    band = big[max(bottom - BAND, 0):max(bottom - 2, 1)]
    xs = np.where(band.any(axis=0))[0]
    return bottom, int(big.sum()), (xs.max() + xs.min()) / 2


def place(cell, scale, bottom, cx):
    w, h = cell.size
    im = cell.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    out = Image.new('RGBA', (TILE, TILE), (0, 0, 0, 0))
    out.paste(im, (round(TILE / 2 - cx * scale), round(BASE - bottom * scale)), im)
    return out


def normalize(src, dst):
    """一张透明底的 3×3 九宫格 → 统一大小、对齐底边的 webp。返回 (缩放, 最小面积, 最大面积)。"""
    cs = cells(src)
    ms = [body(c) for c in cs]
    scale = (AREA / float(np.median([m[1] for m in ms]))) ** 0.5   # 一张图一个缩放，格子之间不抖
    sheet = Image.new('RGBA', (TILE * 3, TILE * 3), (0, 0, 0, 0))
    for i, (c, (bottom, _, cx)) in enumerate(zip(cs, ms)):
        sheet.paste(place(c, scale, bottom, cx), ((i % 3) * TILE, (i // 3) * TILE))
    sheet.save(dst, 'WEBP', quality=86, method=6)
    return scale, min(m[1] for m in ms), max(m[1] for m in ms)


def src(name, kind):
    for ext in ('png', 'webp'):
        if os.path.exists(f'characters/{name}/{kind}.{ext}'):
            return f'characters/{name}/{kind}.{ext}'


def main():
    names = sys.argv[1:] or sorted(os.path.basename(d) for d in glob.glob('characters/*')
                                   if src(os.path.basename(d), 'directions') and src(os.path.basename(d), 'reactions'))
    os.makedirs('public/pets', exist_ok=True)
    for name in names:
        for kind in ('directions', 'reactions'):
            scale, lo, hi = normalize(src(name, kind), f'public/pets/{name}-{kind}.webp')
            print(f'{name:10s} {kind:10s} 缩放 {scale:.3f}  面积 {lo}–{hi}')
    built = sorted(f[:-len('-directions.webp')] for f in os.listdir('public/pets') if f.endswith('-directions.webp'))
    with open('public/pets/index.json', 'w') as f:
        json.dump(built, f)
        f.write('\n')


if __name__ == '__main__':
    main()
