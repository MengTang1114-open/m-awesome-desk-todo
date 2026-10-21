#!/bin/bash
# 把 page-mascot（MIT，© Kamran Ahmed，github.com/nilbuild/page-mascot）的内置形象拷进 characters/<名>/，
# 再用 normalize.py 统一成和我们自己的宠物一样大小、对齐底边，写进 public/pets/。
#   bash scripts/import_page_mascot.sh            全部（跳过作者本人的头像 kamran）
#   bash scripts/import_page_mascot.sh fox owl    只导这几个
set -e
cd "$(dirname "$0")/.."
# PAGE_MASCOT_DIR 指向已经 clone 好的 page-mascot 就不再下载
if [ -n "$PAGE_MASCOT_DIR" ]; then TMP=$PAGE_MASCOT_DIR; KEEP=1
else TMP=$(mktemp -d); git clone -q --depth 1 https://github.com/nilbuild/page-mascot.git "$TMP"; fi
names=("$@")
[ ${#names[@]} -eq 0 ] && names=($(ls "$TMP/public/mascots" | sed -n 's/-directions\.webp$//p' | grep -vx kamran))
done=()
for n in "${names[@]}"; do
  mkdir -p "characters/$n"
  cp "$TMP/public/mascots/$n-directions.webp" "characters/$n/directions.webp"
  cp "$TMP/public/mascots/$n-reactions.webp" "characters/$n/reactions.webp"
  done+=("$n")
done
[ -z "$KEEP" ] && rm -rf "$TMP"
uv run --with pillow --with numpy --with scipy python scripts/normalize.py "${done[@]}"
