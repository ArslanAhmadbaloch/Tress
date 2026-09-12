#!/bin/sh
# Cuts the app mark out of the delivered icon render, for the lock screen.
#
# The icon arrives as a lit squircle photographed on a pale field with a
# soft drop shadow. Edge detection is no use here — the tile is white on a
# near-white field, and the only thing separating them is a shadow fainter
# than the paper texture — so the tile's bounds were measured off the
# render once and are recorded here. The app rounds the corners itself, so
# the crop sits just inside the tile's own edge.
#
# Usage: scripts/crop-app-mark.sh "<App Logo.png>"

set -e

SOURCE="${1:?usage: crop-app-mark.sh <App Logo.png>}"
OUT="assets/images/app-mark.jpg"

# x 173, y 161, 930 square, measured on the 1254x1254 render.
sips -c 930 930 --cropOffset 161 173 "$SOURCE" --out "$OUT" > /dev/null
# 512 is four times the largest size it is ever drawn at.
sips -Z 512 "$OUT" --out "$OUT" > /dev/null
# The tile is opaque and the app rounds it, so it needs no alpha channel.
sips -s format jpeg -s formatOptions 92 "$OUT" --out "$OUT" > /dev/null

echo "wrote $OUT"
