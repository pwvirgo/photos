#!/bin/zsh
# Find all image and video files recognized by ExifTool, using their actual
# contents rather than trusting filename extensions. This combines the coverage
# of getfiles.zsh and getMoreFiles.zsh and also finds supported media with an
# incorrect or missing extension.
#
# Output uses the same CSV column order as getfiles.zsh and can be piped through
# add_MD5.py.
#
# Usage: ./findAllImages.zsh [directory]

TARGET_DIR="${1:-.}"
SCRIPT_NAME="${0:t}"
SCRIPT_DIR="${0:A:h}"
LOG_FILE="$SCRIPT_DIR/logs/exiftool_warnings.log"

print -u2 -- "=== $SCRIPT_NAME target=$TARGET_DIR ==="

if [[ ! -d "$TARGET_DIR" ]]; then
    print -u2 "Error: $TARGET_DIR is not a valid directory."
    exit 1
fi

# Use an absolute path so SourceFile remains usable when downstream programs
# run from a different working directory.
TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"
mkdir -p "$SCRIPT_DIR/logs"
trap 'status=$?; print -u2 -- "=== $SCRIPT_NAME done exit=$status ==="' EXIT

# Most recognized images and videos have an image/* or video/* MIME type.
# Photoshop PSD/PSB files use application/* MIME types, so include their
# content-derived FileType values explicitly.
exiftool -q -q -f -csv -r -d "%Y-%m-%d %H:%M:%S" \
-if '$mimetype =~ /^(image|video)\//i or $filetype eq "PSD" or $filetype eq "PSB"' \
-FileSize# -DateTimeOriginal -CreateDate \
-Model -LensID -GPSLatitude# -GPSLongitude# -ImageSize -Duration \
-FileModifyDate \
2>>"$LOG_FILE" \
"$TARGET_DIR"
