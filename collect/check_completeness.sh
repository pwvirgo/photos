#!/bin/zsh
# Verify that every image/video file recognized by ExifTool under a source
# directory has a correspondingly-named file under a destination directory.
#
# This exists because rsync (used by copy_source.zsh) silently skips files
# it can't read (e.g. permission-denied) with no error, and
# --prune-empty-dirs then removes any directory left with zero matched
# files -- so a blocked folder can vanish from the destination without any
# warning. This check catches that regardless of cause.
#
# Usage: ./check_completeness.sh <source_dir> <dest_dir>

if [[ $# -ne 2 ]]; then
    echo "Usage: $0 <source_dir> <dest_dir>"
    exit 1
fi

SCRIPT_NAME="${0:t}"
SOURCE_DIR="$1"
DEST_DIR="$2"
SRC_LIST=$(mktemp)
DST_LIST=$(mktemp)
MEDIA_IF='$mimetype =~ /^(image|video)\//i or $filetype eq "PSD" or $filetype eq "PSB"'
SCRIPT_DIR="${0:A:h}"
LOG_FILE="$SCRIPT_DIR/logs/exiftool_warnings.log"

print -u2 -- "=== $SCRIPT_NAME source=$SOURCE_DIR dest=$DEST_DIR ==="

if [[ ! -d "$SOURCE_DIR" ]]; then
    echo "Error: $SOURCE_DIR is not a valid directory."
    exit 1
fi

mkdir -p "$SCRIPT_DIR/logs"
trap 'status=$?; rm -f "$SRC_LIST" "$DST_LIST"; print -u2 -- "=== $SCRIPT_NAME done exit=$status ==="' EXIT

make_list() {
    local ROOT

    ROOT="$1"
    if [[ ! -d "$ROOT" ]]; then
        return 0
    fi

    ROOT="$(cd "$ROOT" && pwd)"
    exiftool -q -q -r -p '$FilePath' -if "$MEDIA_IF" "$ROOT" \
        2>>"$LOG_FILE" \
        | sed "s|^${ROOT%/}/||" | sort
}

make_list "$SOURCE_DIR" > "$SRC_LIST"
make_list "$DEST_DIR" > "$DST_LIST"

SRC_COUNT=$(wc -l < "$SRC_LIST" | tr -d ' ')
DST_COUNT=$(wc -l < "$DST_LIST" | tr -d ' ')
MISSING=$(comm -23 "$SRC_LIST" "$DST_LIST")
MISSING_COUNT=$(echo -n "$MISSING" | grep -c . )

echo "source matching files: $SRC_COUNT"
echo "dest   matching files: $DST_COUNT"
echo "missing from dest:     $MISSING_COUNT"

if [[ "$MISSING_COUNT" -gt 0 ]]; then
    echo
    echo "--- missing files (first 50) ---"
    echo "$MISSING" | head -50
fi

if [[ "$MISSING_COUNT" -gt 0 ]]; then
    exit 1
fi
exit 0
