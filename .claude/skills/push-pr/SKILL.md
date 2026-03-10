---
name: push-pr
description: Push current branch and create a GitHub PR if one doesn't exist
disable-model-invocation: true
allowed-tools: Bash(gh *), Bash(git *)
---

# Push and Create PR

## Steps

0. Parse the branch to which you should open a PR from the arguments. Pull latest for that branch before doing anything. Ask user whether to open a new branch from this branch or to continue from the branch on which the user is currently sitting.
1. If there are uncommited files, commit them, adding an appropriate commit message of a short to medium length.
2. Lint and build the affected packages. API build might fail because of Sentry misconfiguration - ignore that. Otherwise, try to lint and build everything.
3. Run the tests. If those fail - stop the execution of the following steps and propose steps to resolve the issue. 
4. Get the current branch name with `git rev-parse --abbrev-ref HEAD`
5. Push the branch: `git push -u origin "$BRANCH"`
6. Check if a PR already exists: `gh pr list --head "$BRANCH" --json number,url --jq '.[0]'`
7. If no PR exists:
   - Run `git diff main...HEAD` and `git log main..HEAD --oneline` to understand ALL changes on the branch
   - Create a PR with `gh pr create` using a descriptive title and body based on the actual changes
8. If a PR already exists:
   - Print the existing PR URL
## PR format

Use this format for `gh pr create`:

```
gh pr create --title "short title under 70 chars" --body "$(cat <<'EOF'
## Summary
<detailed summary of what changed, why, tradeoffs if needed>

## Test plan
- [ ] relevant test checklist items
EOF
)"
```

## Rules

- Never force-push
- Keep the PR title under 70 characters
- The body should summarize the "why", not just list files
- If the branch has no commits ahead of main, stop and tell the user
