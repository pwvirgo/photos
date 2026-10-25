#!/bin/zsh
# db_after_cp.zsh — update photos4.db after files were COPIED to a new folder.
#
#   db_after_cp.zsh [--tree] [--execute] SRC DST
#
#   SRC  folder (searched recursively) or single file that was copied from
#   DST  folder the files were copied into
#   --tree  the folder structure was kept (rsync -a): a file in SRC/a/b is
#           expected in DST/a/b. Without it the copy was flat (cp_to_1_folder,
#           or a single file): every file is expected directly in DST.
#
# For each fotos row (status='ok') under SRC it checks that DST/<name> exists
# and has the same md5 as the row. Rows that pass get
#   - an actions row: action='mv', status='done', info='old_path -> new_path'
#   - fotos.path = the new folder (DST, or DST/<subfolder> with --tree)
# Rows whose copy is missing or differs are listed and left untouched.
# Dry run unless --execute (one transaction; db copy is NOT made here).
#
# Same format as dbase/history/4_mv_dropbox.code. Originals are not touched.
#
# Example (quote paths with spaces):
#   db_after_cp.zsh \
#     '/Users/mac24/a/projects/photos_now/images4/macbook2012/Pictures/iPhoto Library.migratedphotolibrary/Masters/2013' \
#     '/Users/mac24/a/projects/photos_now/images4/photos/2013'

DB=~/a/projects/photos_now/photos4.db
EXECUTE=0 TREE=0
while [[ $1 == --* ]]; do
  case $1 in
    --execute) EXECUTE=1 ;;
    --tree)    TREE=1 ;;
    *) print -u2 "unknown option $1"; exit 2 ;;
  esac
  shift
done
if (( $# != 2 )); then print -u2 "usage: $0 [--tree] [--execute] SRC DST"; exit 2; fi
SRC=${1%/}
DST=${2%/}

[[ -f $DB ]]  || { print -u2 "no db: $DB"; exit 1; }
if (( TREE )); then
  [[ -f $SRC ]] && { print -u2 "--tree needs a folder SRC: $SRC"; exit 1; }
else
  [[ -d $DST ]] || { print -u2 "DST is not a folder: $DST"; exit 1; }
fi

q() { print -r -- ${1//\'/\'\'}; }   # double single quotes for SQL

# Which fotos rows does SRC cover?
if [[ -f $SRC ]]; then
  WHERE="path = '$(q ${SRC:h})' AND name = '$(q ${SRC:t})'"
else
  S=$(q $SRC)
  WHERE="(path = '$S' OR substr(path, 1, length('$S') + 1) = '$S/')"
fi

SQL=$(mktemp "${TMPDIR:-/tmp}/db_after_cp.XXXXXX")
trap 'rm -f $SQL' EXIT
print "BEGIN;" > $SQL

typeset -i n=0 ok=0 missing=0 differ=0 same=0
while IFS=$'\t' read -r img_id dir name md5; do
  (( n++ ))
  if (( TREE )); then newdir=$DST${dir#$SRC}; else newdir=$DST; fi
  if [[ $dir == $newdir ]]; then (( same++ )); continue; fi
  new=$newdir/$name
  if [[ ! -f $new ]]; then
    print "MISSING  img_id=$img_id  $new"; (( missing++ )); continue
  fi
  if [[ -n $md5 && $(md5 -q $new) != $md5 ]]; then
    print "DIFFERS  img_id=$img_id  $new  (not the same file as the catalog row)"; (( differ++ )); continue
  fi
  info="$(q $dir/$name) -> $(q $new)"
  print "INSERT INTO actions (action, info, status, status_dt, img_id) VALUES ('mv', '$info', 'done', datetime('now'), $img_id);" >> $SQL
  print "UPDATE fotos SET path = '$(q $newdir)' WHERE img_id = $img_id;" >> $SQL
  (( ok++ ))
done < <(sqlite3 -init /dev/null -batch -readonly -list -noheader -separator $'\t' $DB \
  "SELECT img_id, path, name, coalesce(md5,'') FROM fotos WHERE status='ok' AND $WHERE ORDER BY img_id;")

print "COMMIT;" >> $SQL

print "\nfotos rows under SRC: $n"
print "  will move          : $ok"
print "  already at DST     : $same"
print "  copy missing       : $missing"
print "  copy differs       : $differ"

if (( ! EXECUTE )); then print "\nDry run — nothing changed. Re-run with --execute to apply."; exit 0; fi
if (( ok == 0 )); then print "Nothing to apply."; exit 0; fi

sqlite3 -init /dev/null -batch -bail $DB < $SQL && print "\nApplied: $ok actions inserted, $ok fotos rows updated."
