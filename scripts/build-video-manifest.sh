#!/usr/bin/env bash
# Walk the staged vimeo_upload folders (whose ordering matches what was
# uploaded to R2) and read each poster's pixel dimensions to build a
# manifest work.astro can import.
#
# Output: src/data/work-videos.json
# Shape : { "<industry-slug>": [ { "n": 1, "w": 1920, "h": 1080 }, ... ] }

set -u

STAGE_ROOT="/Volumes/Extreme Pro/untitled folder 2/vimeo_upload"
OUT="/Users/suhaib.jallad/Documents/ORA-website/src/data/work-videos.json"
mkdir -p "$(dirname "$OUT")"

slug() {
  case "$1" in
    "food & Beverage") echo "food-beverage" ;;
    realstate)         echo "real-estate" ;;
    *)                 echo "$1" ;;
  esac
}

echo "{" > "$OUT"
first_ind=1
for ind_dir in "$STAGE_ROOT"/*/; do
  ind=$(basename "$ind_dir")
  key=$(slug "$ind")
  tmp=$(mktemp)
  find "$ind_dir" -maxdepth 1 -type f -name '*.mp4' \! -name '._*' | sort > "$tmp"
  count=$(wc -l < "$tmp" | tr -d ' ')
  [ "$count" -eq 0 ] && { rm -f "$tmp"; continue; }

  [ "$first_ind" -eq 0 ] && echo "," >> "$OUT"
  first_ind=0
  printf '  "%s": [' "$key" >> "$OUT"

  n=0
  first_item=1
  while IFS= read -r f; do
    n=$((n + 1))
    src_idx=$(basename "$f" | sed -E 's/^([0-9]+)_.*/\1/')
    poster="$STAGE_ROOT/../${ind}_compressed/${src_idx}.jpg"
    if [ -s "$poster" ]; then
      w=$(sips -g pixelWidth  "$poster" 2>/dev/null | awk '/pixelWidth/{print $2}')
      h=$(sips -g pixelHeight "$poster" 2>/dev/null | awk '/pixelHeight/{print $2}')
    else
      w=1920; h=1080
    fi
    [ "$first_item" -eq 0 ] && printf ',' >> "$OUT"
    first_item=0
    printf '\n    { "n": %d, "w": %d, "h": %d }' "$n" "$w" "$h" >> "$OUT"
  done < "$tmp"
  rm -f "$tmp"
  printf '\n  ]' >> "$OUT"
done
echo "" >> "$OUT"
echo "}" >> "$OUT"

echo "wrote $OUT"
cat "$OUT"
