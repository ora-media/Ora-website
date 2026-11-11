#!/usr/bin/env bash
# For every source video tagged "Red" in Finder, copy its compressed
# counterpart to a staging folder ready for Vimeo upload.
#
# Mapping: the compress script sorts each source folder's non-dotfile
# videos alphabetically and numbers them 1..N. We replay that same sort
# here and pick the ones whose source carries the Red tag.
#
# Output: <SRC_ROOT>/vimeo_upload/<industry>/<index>_<original_stem>.mp4

set -u
IFS=$'\n\t'

SRC_ROOT="/Volumes/Extreme Pro/untitled folder 2"
STAGE_ROOT="$SRC_ROOT/vimeo_upload"
INDUSTRIES=(automotive corporate events "food & Beverage" hospitality products realstate schools)

[ -d "$SRC_ROOT" ] || { echo "Source not mounted: $SRC_ROOT" >&2; exit 1; }
command -v mdls >/dev/null || { echo "mdls missing (requires macOS)" >&2; exit 1; }

mkdir -p "$STAGE_ROOT"
total=0

for ind in "${INDUSTRIES[@]}"; do
  src_dir="$SRC_ROOT/$ind"
  cmp_dir="$SRC_ROOT/${ind}_compressed"
  stage_dir="$STAGE_ROOT/$ind"
  [ -d "$src_dir" ] || { echo "skip: $ind (no source)"; continue; }
  [ -d "$cmp_dir" ] || { echo "skip: $ind (no compressed)"; continue; }
  mkdir -p "$stage_dir"

  # Same sort/filter as the compression script.
  tmp=$(mktemp)
  find "$src_dir" -maxdepth 1 -type f \! -name '._*' \
    \( -iname '*.mp4' -o -iname '*.mov' -o -iname '*.m4v' -o -iname '*.avi' -o -iname '*.mkv' -o -iname '*.mts' -o -iname '*.webm' \) \
    | sort > "$tmp"

  idx=0
  staged_here=0
  while IFS= read -r src; do
    idx=$((idx + 1))
    tags=$(mdls -raw -name kMDItemUserTags "$src" 2>/dev/null)
    case "$tags" in
      *Red*) ;;
      *) continue ;;
    esac
    cmp="$cmp_dir/${idx}.mp4"
    if [ ! -s "$cmp" ]; then
      echo "  ! $ind #$idx missing compressed: $(basename "$src")" >&2
      continue
    fi
    stem=$(basename "$src")
    stem="${stem%.*}"
    # Sanitise for filesystem; keep readable.
    safe=$(echo "$stem" | tr -c 'A-Za-z0-9._-' '_' | cut -c1-80)
    out="$stage_dir/${idx}_${safe}.mp4"
    cp -p "$cmp" "$out"
    # Mirror the Red Finder tag onto the compressed source so it stays
    # visible in the _compressed folder too.
    osascript -e "tell application \"Finder\" to set tag names of (POSIX file \"$cmp\" as alias) to {\"Red\"}" >/dev/null 2>&1
    staged_here=$((staged_here + 1))
    echo "  ✓ $ind  $(basename "$out")"
  done < "$tmp"
  rm -f "$tmp"

  echo "── $ind: $staged_here staged"
  total=$((total + staged_here))
done

echo ""
echo "Staged $total file(s) in: $STAGE_ROOT"
echo "Drag each industry subfolder into Vimeo upload, or use vimeo-cli."
