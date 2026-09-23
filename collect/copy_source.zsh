#!/bin/zsh
# Copy all image/video files recognized by ExifTool from a source directory
# into a destination directory, preserving relative folder structure.
#
# Usage: ./copy_source.zsh <source_dir> <dest_dir>
#
# Unlike the old copyImages.zsh, source and destination are arguments, not
# hardcoded paths -- adding a new source is a new invocation, not a script
# edit.

if [[ $# -ne 2 ]]; then
    echo "Usage: $0 <source_dir> <dest_dir>"
    exit 1
fi

SCRIPT_NAME="${0:t}"
SOURCE_DIR="$1"
DEST_DIR="$2"
MEDIA_IF='$mimetype =~ /^(image|video)\//i or $filetype eq "PSD" or $filetype eq "PSB"'
FILE_LIST=$(mktemp)
SCRIPT_DIR="${0:A:h}"
LOG_FILE="$SCRIPT_DIR/logs/exiftool_warnings.log"

print -u2 -- "=== $SCRIPT_NAME source=$SOURCE_DIR dest=$DEST_DIR ==="

if [[ ! -d "$SOURCE_DIR" ]]; then
    echo "Error: $SOURCE_DIR is not a valid directory."
    exit 1
fi

# Resolve source to an absolute path before building the relative file list
# used by rsync.
SOURCE_DIR="$(cd "$SOURCE_DIR" && pwd)"

mkdir -p "$DEST_DIR"
mkdir -p "$SCRIPT_DIR/logs"
trap 'status=$?; rm -f "$FILE_LIST"; print -u2 -- "=== $SCRIPT_NAME done exit=$status ==="' EXIT

# ExifTool detects file type from content, so this also catches supported
# media with a wrong or missing filename extension.
exiftool -q -q -r -p '$FilePath' -if "$MEDIA_IF" "$SOURCE_DIR" \
    2>>"$LOG_FILE" \
    | sed "s|^${SOURCE_DIR%/}/||" > "$FILE_LIST"

rsync -rt --modify-window=1 --files-from="$FILE_LIST" --info=progress2 \
    "$SOURCE_DIR/" "$DEST_DIR/"
