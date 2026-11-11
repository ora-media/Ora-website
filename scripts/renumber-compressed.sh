#!/usr/bin/env bash
# One-shot: renumber N.mp4 + N.jpg pairs in each _compressed folder to be
# contiguous 1..N (sorted by current numeric filename). Use after a run
# that left gaps (e.g. when source folders contained AppleDouble ._* files
# that failed to encode).

set -u

ROOT="/Volumes/Extreme Pro/untitled folder 2"

for dir in "$ROOT"/*_compressed; do
  [ -d "$dir" ] || continue
  echo "── $(basename "$dir") ──"
  # Stage in a temp subdir so we don't collide with existing numbers.
  stage="$dir/.stage.$$"
  mkdir -p "$stage"
  n=0
  # Iterate pairs sorted numerically by the .mp4 filename stem.
  ls "$dir"/*.mp4 2>/dev/null \
    | awk -F/ '{print $NF}' \
    | sort -n \
    | while IFS= read -r f; do
        stem="${f%.mp4}"
        [ -s "$dir/$f" ] || continue
        [ -s "$dir/${stem}.jpg" ] || continue
        n=$((n + 1))
        mv "$dir/$f" "$stage/${n}.mp4"
        mv "$dir/${stem}.jpg" "$stage/${n}.jpg"
        echo "  ${f} + ${stem}.jpg  →  ${n}.mp4 + ${n}.jpg"
      done
  # Move staged files back to parent, drop stage dir.
  mv "$stage"/* "$dir/" 2>/dev/null || true
  rmdir "$stage" 2>/dev/null || true
done

echo "done."
