# Porting a working copy to another computer

How to move a working copy of the `photos` and `slideshow` projects — code,
images, database and Claude Code state — to a second machine with `rsync`, and
how to prove the copy is good once it lands.

This is a **copy**, not a migration. Nothing on the source machine is modified,
so nothing has to be undone if the copy turns out wrong.

## What is being moved

| | Size | Notes |
|---|---|---|
| `photos/` total | 54 G | |
| ├ `images3/` | 21 G | 7,278 files; the catalog's images |
| ├ `backup/` | 33 G | an older `images3` copy + 3 db snapshots — **excluded below** |
| ├ `trash/` | 58 M | deleted files, never emptied |
| └ `photos3.db` | 4.3 M | the catalog |
| `slideshow/` | 3.3 M | code only |

`backup/` is 61% of the transfer and is itself a backup, so the commands below
leave it behind. To take it too, drop the `--exclude` and expect 54 G.

## Before you start: the absolute path changes

rsync does not care where the files land — `$DST` can be anything. But two
things outside rsync are bound to the **absolute path**, and both break when it
changes:

1. `fotos.path` holds 7,269 absolute paths to the image files.
2. Claude Code stores session history under `~/.claude/projects/`, in a
   directory named after the project's absolute path with `/` replaced by `-`
   (`-Users-mac24-a-projects-slideshow`).

The two machines have different usernames — `mac24` here, `m4book` there — so
the paths **cannot** match and both fixes are required. They are step 4, and
they must happen before the verification in step 5 means anything.

Everything else is path-independent: the code takes its paths from params, and
`notes` and `actions` reference images by `img_id` only.

## 1. Prepare the connection

rsync goes over SSH, and macOS ships with SSH **off**. On the destination
machine, turn on Remote Login — System Settings → General → Sharing → **Remote
Login**, or in a terminal there:

```bash
sudo systemsetup -setremotelogin on
```

Check that "Allow access for" includes your user. Then, from the source:

```bash
LAP=m4book@phil25s-macbook-air.local   # user@host of the destination

ssh "$LAP" true                        # silent = ready
```

`Connection refused` means the name resolved but nothing is listening — Remote
Login is still off. `Could not resolve hostname` is a different problem: check
what `hostname` prints on the laptop.

Optional but useful, since you will rerun these commands: `ssh-copy-id "$LAP"`
installs a key and stops the password prompts.

### Keep both machines awake

A laptop that sleeps mid-transfer is the most likely way a 21 G copy fails.
Run `caffeinate -dimsu` in a terminal **on the destination** for the duration,
and prefix the source-side commands with `caffeinate -i`.

Over wifi, 21 G takes a long while. `--partial` means an interruption resumes
rather than restarts, so stopping and continuing is safe. For a one-time copy
this size, a Thunderbolt or Ethernet cable between the two machines is
dramatically faster and worth the trouble.

## 2. Copy the two projects

Run these **on the source machine**, in the same shell as step 1 — they reuse
`$LAP`.

```bash
SRC=/Users/mac24/a/projects            # source parent
DST=/Users/m4book/a/projects           # destination parent — differs, see step 4

caffeinate -i rsync -aE --info=progress2 --partial \
      --exclude 'backup/' \
      "$SRC/photos/"    "$LAP:$DST/photos/"

caffeinate -i rsync -aE --info=progress2 --partial \
      "$SRC/slideshow/" "$LAP:$DST/slideshow/"
```

- `-a` preserves times, permissions and symlinks, and recurses.
- `-E` (macOS) preserves extended attributes and resource forks.
- `--partial` lets an interrupted 21 G transfer resume instead of restarting.
- **No `--delete`.** Not on the first run, and not until you are certain the
  destination holds nothing you want.
- The trailing slashes matter: `photos/` → `photos/` copies the *contents*.

Nothing here needs the destination to be empty, and rerunning the same command
is safe — it copies only what differs.

### What `-a` carries that you might not expect

- **`.git/`** — which matters: `photos` has no remote, so this rsync is the
  only copy of its history. `slideshow` has one (`github.com:pwvirgo/slideshow.git`).
- **`.claude/settings.local.json`** — gitignored globally, so git never carries
  it; rsync is the only way it travels.
- **`.discuss`** — the discussion-mode flag, if one is present.
- **`.DS_Store`** files — harmless.

## 3. Copy the Claude Code state

None of this lives inside the project folders, so step 2 does not touch it.
Note the destination directory names are already **re-mangled for `m4book`** —
that is fix 3 of step 4, done here in passing.

```bash
rsync -aE ~/.claude/settings.json  "$LAP:~/.claude/"
rsync -aE ~/.claude/hooks/         "$LAP:~/.claude/hooks/"
rsync -aE ~/.config/git/ignore     "$LAP:~/.config/git/"

rsync -aE ~/.claude/projects/-Users-mac24-a-projects-photos/ \
          "$LAP:~/.claude/projects/-Users-m4book-a-projects-photos/"
rsync -aE ~/.claude/projects/-Users-mac24-a-projects-slideshow/ \
          "$LAP:~/.claude/projects/-Users-m4book-a-projects-slideshow/"
```

| | Carries |
|---|---|
| `~/.claude/settings.json` | hook wiring, `defaultMode: plan`, model and effort |
| `~/.claude/hooks/` | `discuss-guard.sh` — the discussion-mode guard |
| `~/.claude/projects/-Users-…-{photos,slideshow}/` | session transcripts (~15 M for slideshow) and the memory directory |
| `~/.config/git/ignore` | the global ignore hiding `.claude/settings.local.json` |

`~` in the destination expands to the **remote** user's home, which is what you
want here.

`discuss-guard.sh` keys off a `.discuss` file in the cwd, never an absolute
path, so it is portable as-is.

If the destination already has a `~/.claude/settings.json` you care about,
merge it by hand rather than letting rsync overwrite it.

## 4. Adjust for the new path

Run these **on the destination**, after step 2. Two fixes remain; the third
(Claude history) was handled by the destination names in step 3.

### 4a. The database

Rewrite the absolute paths in `fotos` — and nothing else. `notes` and `actions`
reference images by `img_id`, so they cannot be orphaned by this.

```bash
DB=/Users/m4book/a/projects/photos/photos3.db
cp "$DB" "$DB.pre-port"                # cheap insurance, 4.3 M

sqlite3 -init /dev/null -batch "$DB" "
  UPDATE fotos
     SET path = replace(path, '/Users/mac24/', '/Users/m4book/');
  SELECT COUNT(*) AS still_old FROM fotos WHERE path LIKE '/Users/mac24/%';"
```

`still_old` must be **0**. The `UPDATE` touches every row, deleted ones
included, which is correct — a `status='deleted'` row's path should still
describe where the file used to be on this machine.

### 4b. The params

In `slideshow/params_db.json`:

| Key | Current value | Action |
|---|---|---|
| `imageFolderPath` | `/Users/mac24/a/projects/photos/images3` | **absolute — must be edited** |
| `dataDir` | `../photos` | relative — works as-is, *if run from the project root* |
| `trashDir` | `../photos/trash` | relative — same |

The two relative values follow the **working directory**, not the project root,
so they are correct only while you run from `slideshow/`. Making them absolute
is the safer choice and costs nothing.

## 5. Verify the copy

Run these **on the destination**, after step 4. The expected values are the
baseline from the source database; if they all match, the copy is good.

```bash
DB=/Users/m4book/a/projects/photos/photos3.db
sqlite3 -init /dev/null -batch "$DB" "
  SELECT COUNT(*)              AS rows_ok,
         SUM(md5 IS NULL OR TRIM(md5)='') AS md5_missing,
         COUNT(DISTINCT md5)   AS distinct_md5
    FROM fotos WHERE status='ok';
  SELECT action, status, COUNT(*) FROM actions GROUP BY 1,2;
  SELECT COUNT(*) FROM notes;"
```

| Check | Expected |
|---|---|
| live `fotos` rows (`status='ok'`) | 7,269 |
| rows with missing md5 | 0 |
| distinct md5 | 7,260 (9 duplicate groups) |
| `delete` actions done / failed | 1,949 / 13 |
| pending actions | 0 |
| `notes` rows | 0 |
| files under `images3/` | 7,278 |

Then the two end-to-end checks:

```bash
cd /Users/m4book/a/projects/slideshow

# files on disk match the catalog — dry run by default (--execute writes)
deno run --allow-read --allow-write recon/findMissing.ts --params=params_db.json

# the viewer loads — expect the same image count as on the source machine
deno run --allow-read --allow-net --allow-write slideshow.ts --params=params_db.json
```

A `findMissing.ts` dry run reporting **0 changes** is the strongest single
check: it proves every path in the database resolves to a real file at the
destination — which means step 4a worked, not just step 2.

As a transfer-level check, rerun the step 2 rsync with `-ni` — it lists what
*would* still be copied, and should list nothing but directories.

```bash
rsync -aEni --exclude 'backup/' "$SRC/photos/" "$LAP:$DST/photos/"
```

Once verification passes, delete `photos3.db.pre-port`.

## 6. Decide which database is authoritative

Once two copies exist they can diverge, and there is **no merge story**:
`notes` and `actions` are keyed on `img_id`, so two copies will happily assign
the same ids to different things.

**Pick one writable copy and treat the other as read-only reference.** The
images can stay identical forever without trouble; the database cannot.

Today this costs nothing — `notes` is empty and all 1,962 actions are terminal
(`done`/`failed`, none pending). It becomes real the first time you annotate an
image on either machine.

## The same three fixes apply to a folder rename

Renaming `photos/` on one machine is the same operation as step 4: an `UPDATE`
on `fotos.path`, a couple of params values, and renaming the
`~/.claude/projects/-…` directory so the transcripts stay associated. No code
changes — paths come from params, and `fotos.path` is data.

One extra for a rename: `dataDir` is the *relative* `../photos`, so it names
the sibling folder directly and breaks on a rename even though it is not
absolute.

## Before pushing `photos` to GitHub for the first time

`photos` is in git but has no remote. Before creating one:

- Check the **history**, not just the working tree, for anything large or
  private — the database, images, or `logs/`. A big blob deep in history is
  awkward to remove later.
- Its `.gitignore` covers only `.gitignore`, `*.swp` and `.DS_Store`; `images3/`
  and `photos3.db` are not listed. `git ls-files` currently shows neither —
  confirm that still holds.
- Decide public vs. private deliberately: this is personal photo metadata.
