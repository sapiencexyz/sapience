# show-commit

Show files changed in a git commit and help navigate to them.

## Usage

```
/show-commit <commit-hash> [--context-size=<N>]
```

- `<commit-hash>` — A full or abbreviated git commit hash (required, passed as the argument).
- `--context-size=<N>` — Optional. Search N commits forward and N commits backward from the given commit and identify related commits to provide broader context. When omitted, only the single commit is shown.

## Steps

### 1. Validate the commit

Run `git rev-parse --verify <commit-hash>` to confirm the hash exists. If it fails, tell the user the hash is invalid and stop.

### 2. Gather commit metadata

```bash
git log -1 --format="%H%n%an%n%ad%n%s%n%n%b" <commit-hash>
```

Extract: full hash, author, date, subject, body.

### 3. List changed files

```bash
git show --stat <commit-hash>
```

### 4. Context search (only when `--context-size=N` is provided)

When the user supplies `--context-size=N`:

1. Get the list of files touched by the target commit:
   ```bash
   git diff-tree --no-commit-id --name-only -r <commit-hash>
   ```
2. Retrieve the surrounding commits (N before and N after):
   ```bash
   git log --format="%H %s" <commit-hash>~N..<commit-hash>
   git log --format="%H %s" <commit-hash>..<commit-hash>~-N
   ```
   (Use `--ancestry-path` or `--first-parent` as needed to stay on the current branch.)
3. For each surrounding commit, check which files it touched and compare with the target commit's file list. A commit is **related** if it shares at least one changed file with the target commit.
4. Also look at commit message similarity — commits whose subject mentions the same ticket/issue number, module name, or keywords as the target commit are considered related.
5. Collect all related commits into a list.

### 5. Present results to the user

Display in this order:

1. **Commit metadata** — hash, author, date, subject, body.
2. **Explanation** — what this commit changes and how it is related to other commits given the context inferred from previous/future commits.
3. **Related commits** (only when `--context-size` was used) — a table or list of related commits with their short hash, subject line, and which files they share with the target commit. Mark whether each related commit came before or after the target.
4. **Changed files** — a numbered list of files changed in the target commit, each as a clickable markdown link:
   ```
   1. [filename.rs](path/to/filename.rs) | +12 -3
   ```
5. Ask the user which file(s) they would like to inspect.

### 6. Show file diff on request

When the user picks a file:

1. Run:
   ```bash
   git diff <commit-hash>^..<commit-hash> -- <filepath>
   ```
2. Show the diff to the user.
3. Also read the current version of the file with the Read tool so the user can navigate to it in the IDE.
