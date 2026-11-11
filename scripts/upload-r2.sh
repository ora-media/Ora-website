#!/usr/bin/env bash
# Upload the staged red-tagged videos to Cloudflare R2, grouped by industry.
#
# Source : /Volumes/Extreme Pro/untitled folder 2/vimeo_upload/<industry>/*.mp4
# Target : s3://<R2_BUCKET>/videos/work/<industry>/{1..N}.mp4   (+ .jpg poster)
#
# Requires AWS CLI v2:  brew install awscli
#
# Required env vars (pass inline, don't save to disk):
#   R2_ACCOUNT_ID=<32-char hex from Cloudflare dashboard>
#   R2_ACCESS_KEY_ID=<R2 API token access key>
#   R2_SECRET_ACCESS_KEY=<R2 API token secret>
#   R2_BUCKET=<bucket name>
#
# Optional:
#   STAGE_ROOT=<path to vimeo_upload folder>  (default: Extreme Pro path)
#
# Usage:
#   R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
#   R2_BUCKET=ora-media ./scripts/upload-r2.sh

set -u

: "${R2_ACCOUNT_ID:?set R2_ACCOUNT_ID}"
: "${R2_ACCESS_KEY_ID:?set R2_ACCESS_KEY_ID}"
: "${R2_SECRET_ACCESS_KEY:?set R2_SECRET_ACCESS_KEY}"
: "${R2_BUCKET:?set R2_BUCKET}"

STAGE_ROOT="${STAGE_ROOT:-/Volumes/Extreme Pro/untitled folder 2/vimeo_upload}"
[ -d "$STAGE_ROOT" ] || { echo "staging missing: $STAGE_ROOT" >&2; exit 1; }
command -v aws >/dev/null || { echo "aws cli missing. brew install awscli" >&2; exit 1; }

ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_REGION=auto
export AWS_DEFAULT_REGION=auto

# Map staged dir names → URL-safe industry slugs (match work.astro `ind`).
slug() {
  case "$1" in
    automotive)        echo "automotive" ;;
    corporate)         echo "corporate" ;;
    events)            echo "events" ;;
    "food & Beverage") echo "food-beverage" ;;
    hospitality)       echo "hospitality" ;;
    products)          echo "products" ;;
    realstate)         echo "real-estate" ;;
    schools)           echo "schools" ;;
    *)                 echo "$1" ;;
  esac
}

total=0
for ind_dir in "$STAGE_ROOT"/*/; do
  ind=$(basename "$ind_dir")
  key_ind=$(slug "$ind")
  # Collect files: the stage script wrote <N>_<orig>.mp4; the leading N
  # is the compressed index, which is what we keep as the upload name.
  tmp=$(mktemp)
  find "$ind_dir" -maxdepth 1 -type f -name '*.mp4' \! -name '._*' | sort > "$tmp"
  count=$(wc -l < "$tmp" | tr -d ' ')
  [ "$count" -eq 0 ] && { rm -f "$tmp"; continue; }

  echo "── $ind → $key_ind ($count files) ─────────"
  n=0
  while IFS= read -r f; do
    n=$((n + 1))
    mp4_key="videos/work/${key_ind}/${n}.mp4"
    jpg_key="videos/work/${key_ind}/${n}.jpg"
    # Prefer the poster that lives in the matching _compressed folder.
    src_idx=$(basename "$f" | sed -E 's/^([0-9]+)_.*/\1/')
    poster="$STAGE_ROOT/../${ind}_compressed/${src_idx}.jpg"

    echo "  → $mp4_key"
    aws s3 cp --endpoint-url "$ENDPOINT" --content-type video/mp4 \
      --cache-control "public, max-age=31536000, immutable" \
      "$f" "s3://${R2_BUCKET}/${mp4_key}" >/dev/null
    if [ -s "$poster" ]; then
      echo "  → $jpg_key"
      aws s3 cp --endpoint-url "$ENDPOINT" --content-type image/jpeg \
        --cache-control "public, max-age=31536000, immutable" \
        "$poster" "s3://${R2_BUCKET}/${jpg_key}" >/dev/null
    fi
    total=$((total + 1))
  done < "$tmp"
  rm -f "$tmp"
  echo "└── $ind: $n done"
done

echo ""
echo "Uploaded $total video(s) to r2://${R2_BUCKET}/videos/work/"
