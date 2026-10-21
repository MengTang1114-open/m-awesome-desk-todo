"""把用户自己生成的两张九宫格（绿幕或透明底）做成桌宠形象，不用改代码、不用重新打包。

    uv run --with pillow --with numpy --with scipy python scripts/add_pet.py <名字> <朝向图> <表情图> [--slot todo]

做三件事：
1. 去背景：纯色幕布（绿幕、品红幕）用 key.py 抠掉；本来就是透明底的跳过。
2. 统一大小、对齐底边（normalize.py），和内置形象一样大。
3. 写进 ~/Documents/DeskPet/pets/<名字>/（和 To-Do.md 同一个文件夹；DESK_PET_TODO 改了路径就跟着走），
   另存一张 preview.png 方便看效果。加了 --slot 就顺手把 settings.json 里那个位置换成它。
桌宠监听这个文件夹，一秒内就能在宠物右键菜单里选到它。
"""
import argparse, json, os, re, shutil, sys, tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from key import key_file              # noqa: E402
from normalize import normalize, TILE  # noqa: E402
from PIL import Image                  # noqa: E402

SLOTS = ['todo', 'pending', 'completed', 'archived']
DEFAULT_PETS = ['fox', 'cat', 'panda', 'owl']   # 和 electron/main.cjs 的默认值一致


def home():
    todo = os.environ.get('DESK_PET_TODO') or os.path.expanduser('~/Documents/DeskPet/To-Do.md')
    return os.path.dirname(todo)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('name', help='形象名字，只用字母、数字、中文和 -（会显示在右键菜单里）')
    ap.add_argument('directions', help='朝向九宫格：9 个转头方向')
    ap.add_argument('reactions', help='表情九宫格：9 个表情')
    ap.add_argument('--slot', choices=SLOTS, help='顺手放到这个分组的位置上')
    a = ap.parse_args()
    if not re.fullmatch(r'[\w-]+', a.name):
        sys.exit('名字只能用字母、数字、中文和 -')

    out = os.path.join(home(), 'pets', a.name)
    os.makedirs(out, exist_ok=True)
    tmp = tempfile.mkdtemp()
    try:
        for kind, path in (('directions', a.directions), ('reactions', a.reactions)):
            img = os.path.join(tmp, f'{kind}.png')
            Image.open(path).convert('RGBA').save(img)
            try:
                line = key_file(img, in_place=True)
            except ValueError as problem:
                sys.exit(f'{path}：去背景失败：{problem}')
            print(f'{kind:10s} 去背景：{line or "本来就是透明底，跳过"}')
            scale, lo, hi = normalize(img, os.path.join(out, f'{kind}.webp'))
            print(f'{kind:10s} 统一大小：缩放 {scale:.2f}')
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    # 预览：两张并排，棋盘格底，方便看抠得干不干净
    d, r = (Image.open(os.path.join(out, f'{k}.webp')) for k in ('directions', 'reactions'))
    W = TILE * 3
    prev = Image.new('RGBA', (W * 2 + 40, W), (255, 255, 255, 255))
    for x in range(0, prev.width, 30):
        for y in range(0, prev.height, 30):
            if (x // 30 + y // 30) % 2:
                prev.paste((230, 230, 234, 255), (x, y, x + 30, y + 30))
    prev.alpha_composite(d, (0, 0)); prev.alpha_composite(r, (W + 40, 0))
    prev.convert('RGB').resize((prev.width // 2, prev.height // 2)).save(os.path.join(out, 'preview.png'))
    print(f'已保存到 {out}（preview.png 是预览）')

    if a.slot:
        path = os.path.join(home(), 'settings.json')
        try:
            settings = json.load(open(path))
        except (OSError, ValueError):
            settings = {}
        pets = (settings.get('pets') or DEFAULT_PETS)[:4]
        pets += DEFAULT_PETS[len(pets):]
        pets[SLOTS.index(a.slot)] = a.name
        settings['pets'] = pets
        with open(path, 'w') as f:
            json.dump(settings, f, ensure_ascii=False, indent=2)
            f.write('\n')
        print(f'settings.json：{a.slot} 换成了 {a.name}')


if __name__ == '__main__':
    main()
