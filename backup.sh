#!/bin/sh

OUT="nbb-db-$(date +%Y-%m-%d).sql"

wrangler d1 export naifaru-blood-bot --remote --output="$OUT"

xz -z9e "$OUT"

mv "$OUT.xz" "/Users/majudhuahmed/Library/CloudStorage/OneDrive-Personal/Projects/naifaru blood bot/"
