# compare 2 folders: 1) file counts, 2) duplicate filenames
#
compare_files() {
    local SRC="$1"
    local DEST="$2"

    echo "Comparing:"
    echo "  Source:      $SRC"
    echo "  Destination: $DEST"
    echo

    echo "File counts:"
    echo "  Source:      $(find "$SRC" -type f | wc -l | tr -d ' ')"
    echo "  Destination: $(find "$DEST" -type f | wc -l | tr -d ' ')"
    echo

    echo "Duplicate filenames:"
    comm -12 \
        <(find "$SRC" -type f -exec basename {} \; | sort -u) \
        <(find "$DEST" -type f -maxdepth 1 -exec basename {} \; | sort -u) |
        awk '{print; found=1} END {if (!found) print "No duplicate filenames found"}'
}

# all files that are only in folder1 or only in folder2,
# (NOT in both)
comm3()
{
  local folder1="$1"
  local folder2="$2"
  echo "Files only in $folder1 or only in $folder2:"

    comm -3 \
    <(cd "$1" && find . -type f | sort) \
    <(cd "$2" && find . -type f | sort)
}
# Copy files recursively from SRC into DEST without preserving
# the source directory structure.
#
# cp -n prevents overwriting existing destination files.
#    -p preserve file metadata
# Duplicate source filenames may cause files to be skipped.
#
cp_to_1_folder() {
    local SRC="$1"
    local DEST="$2"

    if [[ ! -d "$SRC" ]]; then
        echo "ERROR: Source directory does not exist: $SRC" >&2
        return 1
    fi

    if [[ ! -d "$DEST" ]]; then
        echo "ERROR: Destination directory does not exist: $DEST" >&2
        return 1
    fi

    find "$SRC" -type f -exec cp -np {} "$DEST/" \;
}


:<<'COMMENT'
Copy files keeping folder structure
- -a — preserves directory structure, timestamps, permissions, symbolic links, etc.
- -v — displays files being copied.
- --ignore-existing — does not overwrite existing destination files.
- Automatically creates missing subdirectories in DEST.
- Adds new files to existing directories.
- Does not delete anything from DEST.
Important: The trailing / on "$SRC/" means copy the contents of SRC, not the source directory itself.
COMMENT

cp_folders() {
    local SRC="$1"
    local DEST="$2"
    local OPT="$3"      # optional rsync oprions  eg: cp_folders fold1 fold2 -n 

    rsync -av $OPT --ignore-existing "$SRC/" "$DEST/"
}
