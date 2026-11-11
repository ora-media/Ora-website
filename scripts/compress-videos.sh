#!/usr/bin/env bash
# Compress ORA work-page videos for the web.
#
# Input:  /Volumes/Extreme Pro/untitled folder 2/<industry>/
# Output: /Volumes/Extreme Pro/untitled folder 2/<industry>_compressed/
#          N.mp4  (H.264 1080p max, faststart, AAC 128k)
#          N.jpg  (poster frame, 1s in)
#
# Idempotent: rerun to pick up only new input files. Delete the
# matching output pair if you want to recompress one.
#
# Usage:  ./scripts/compress-videos.sh [industry] [industry]...
#         Omit arguments to process every default industry.

set -u
IFS=$'\n\t'

SRC_ROOT="/Volumes/Extreme Pro/untitled folder 2"
INDUSTRIES=(automotive corporate events "food & Beverage" hospitality products realstate schools)

if [ "$#" -gt 0 ]; then INDUSTRIES=("$@"); fi

command -v ffmpeg >/dev/null || { echo "ffmpeg not installed. brew install ffmpeg" >&2; exit 1; }
[ -d "$SRC_ROOT" ] || { echo "Source not mounted: $SRC_ROOT" >&2; exit 1; }

# Long-edge cap 1920 (keeps 1080p for landscape, 1080×1920 for 9:16).
SCALE="scale=w='if(gt(iw,ih),min(1920,iw),-2)':h='if(gt(iw,ih),-2,min(1920,ih))'"

compress_one() {
  local src="$1" dst_mp4="$2" dst_jpg="$3"
  ffmpeg -nostdin -hide_banner -loglevel error -y \
    -i "$src" \
    -map 0:v:0 -map 0:a? \
    -vf "$SCALE" \
    -c:v libx264 -profile:v high -level 4.2 -pix_fmt yuv420p \
    -preset medium -crf 22 -maxrate 6M -bufsize 12M \
    -c:a aac -b:a 128k -ac 2 \
    -movflags +faststart \
    "$dst_mp4"
  ffmpeg -nostdin -hide_banner -loglevel error -y \
    -ss 00:00:01 -i "$src" -frames:v 1 -q:v 3 \
    -vf "$SCALE" "$dst_jpg"
}

for ind in "${INDUSTRIES[@]}"; do
  src_dir="$SRC_ROOT/$ind"
  dst_dir="$SRC_ROOT/${ind}_compressed"
  if [ ! -d "$src_dir" ]; then
    echo "skip: $ind (no folder)"
    continue
  fi
  mkdir -p "$dst_dir"

  # Collect videos (common containers), sort stable, number sequentially.
  # Portable to bash 3.2 (macOS default) — no mapfile.
  tmp_list=$(mktemp)
  find "$src_dir" -maxdepth 1 -type f \! -name '._*' \
    \( -iname '*.mp4' -o -iname '*.mov' -o -iname '*.m4v' -o -iname '*.avi' -o -iname '*.mkv' -o -iname '*.mts' -o -iname '*.webm' \) \
    | sort > "$tmp_list"
  count=$(wc -l < "$tmp_list" | tr -d ' ')
  if [ "$count" -eq 0 ]; then
    rm -f "$tmp_list"
    echo "skip: $ind (no videos)"; continue
  fi

  echo "── $ind ($count files) ──────────────"
  local_n=0
  while IFS= read -r src; do
    local_n=$((local_n + 1))
    dst_mp4="$dst_dir/${local_n}.mp4"
    dst_jpg="$dst_dir/${local_n}.jpg"
    name=$(basename "$src")
    if [ -s "$dst_mp4" ] && [ -s "$dst_jpg" ]; then
      echo "  ✓ $local_n  (exists)  ← $name"
      continue
    fi
    echo "  … $local_n            ← $name"
    if compress_one "$src" "$dst_mp4" "$dst_jpg"; then
      sz=$(du -h "$dst_mp4" | awk '{print $1}')
      echo "  ✓ $local_n  $sz"
    else
      echo "  ✗ $local_n  FAILED   ← $name" >&2
      rm -f "$dst_mp4" "$dst_jpg"
    fi
  done < "$tmp_list"
  rm -f "$tmp_list"
done

echo "done."
