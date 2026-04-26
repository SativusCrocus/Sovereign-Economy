# Contributing

This project ships with two parallel pre-commit gating systems that
enforce the same checks. Pick one based on how you commit:

| You commit via                | The gate is                                            |
|-------------------------------|--------------------------------------------------------|
| Claude Code (any session)     | [.claude/scripts/verify.sh](.claude/scripts/verify.sh) — wired through the PreToolUse hook on Bash; runs automatically before `git commit` and `git push` |
| Anything else (`git commit` from your terminal, IDE plugin, etc.) | [pre-commit](https://pre-commit.com) using [.pre-commit-config.yaml](.pre-commit-config.yaml) |

Both run the same set of checks against the same change-set rules (only
the file types you actually touched). Use either one — don't try to use
both at once.

If a check fails, fix the underlying issue rather than bypassing the
hook. The bypass switches exist (see below) for genuine emergencies, not
"I don't have time for this right now."

---

## One-time setup (non-Claude contributors)

```bash
# 1. Install the pre-commit framework.
pip install --user pre-commit         # or: brew install pre-commit / pipx install pre-commit

# 2. Register the git hooks in your local clone. This writes
#    .git/hooks/pre-commit and .git/hooks/pre-push that delegate to
#    pre-commit. Re-run after `git clone` on a new machine.
pre-commit install
pre-commit install --hook-type pre-push

# 3. (Optional) prime the cache by running every hook against the whole
#    tree. The first real commit will be fast afterward.
pre-commit run --all-files
```

The hook config splits checks into two stages:

- **`pre-commit`** (runs on `git commit`) — fast checks under ~5s:
  trailing whitespace / EOF, JSON / YAML syntax, gitleaks, docs-mirror,
  yamllint.
- **`pre-push`** (runs on `git push`) — heavy checks: solhint, hardhat
  test, forge invariants, slither, ruff, pytest, tsc, caddy validate.
  Each is scoped to the touched file type.

This matches the cadence of [.claude/scripts/verify.sh](.claude/scripts/verify.sh):
heavy checks at push time, fast ones at commit time.

---

## Required tools

The hooks use `language: system` so they re-use the project's installed
toolchain rather than pinning isolated environments. Install whichever
languages you intend to touch:

| Tool         | Install                                                                        | Used by                                       |
|--------------|--------------------------------------------------------------------------------|-----------------------------------------------|
| Node 20+     | https://nodejs.org or `nvm install 20`                                         | hardhat, solhint, tsc, npm hooks              |
| Foundry      | `curl -L https://foundry.paradigm.xyz \| bash; foundryup`                       | forge invariants                              |
| slither      | `pip install slither-analyzer`                                                  | static analysis                               |
| Python 3.12  | https://python.org or `pyenv install 3.12.2`                                    | ruff, pytest, yamllint, pre-commit            |
| ruff         | `pip install ruff`                                                              | python lint                                   |
| pytest       | `pip install -e services/agent-swarm-runtime[dev]`                              | swarm-runtime tests                           |
| yamllint     | `pip install yamllint`                                                          | yaml lint                                     |
| docker       | https://docker.com                                                              | caddy validate (skips silently if absent)     |
| gitleaks     | bundled (pre-commit fetches the `gitleaks` repo) — no manual install needed     | secret scan                                   |

If a tool is missing, the hook fails with a clear error rather than
silently passing. The pre-commit framework caches `gitleaks` itself, so
that's the one tool you don't need to install separately.

---

## Bypass switches

In genuine emergencies (e.g. you're already debugging a prod outage and
can't pause for slither):

```bash
# Skip ALL hooks for one commit / push
git commit --no-verify
git push --no-verify

# Skip a specific hook
SKIP=hardhat-test git push
SKIP=slither,solhint git commit -m "wip"
```

The Claude verify hook has its own bypass: `DAES_SKIP_VERIFY=1`.

Document why you bypassed in the PR description so reviewers know what
wasn't checked. CI will run all the checks regardless — the local hooks
are about catching things before they reach review, not about replacing
CI.

---

## Why two parallel systems?

Claude Code intercepts `Bash` tool calls before they execute, so the
verify hook can synthesize a check-then-block-or-allow gate without
git's hook machinery. That's faster and more precise inside Claude
sessions, but it doesn't fire when you commit from your editor or
terminal directly. The pre-commit framework gives non-Claude
contributors the same gate via git's native pre-commit / pre-push hooks.

When you change [.claude/scripts/verify.sh](.claude/scripts/verify.sh),
update [.pre-commit-config.yaml](.pre-commit-config.yaml) to match —
the two should stay in lockstep on what they enforce. Where possible,
both delegate to a shared script (e.g.
[scripts/caddy-validate.sh](scripts/caddy-validate.sh)) so there's only
one source of truth for each check.

---

## CI (GitHub Actions)

CI runs the heavyweight version of every check on PRs and main:

- [.github/workflows/ci.yml](.github/workflows/ci.yml) — the full gate
  matrix on every push.
- [.github/workflows/nightly.yml](.github/workflows/nightly.yml) —
  multi-hour Echidna campaign + markdown link check, scheduled at 04:00
  UTC daily.

Local hooks are advisory; CI is authoritative. If your push passes
locally but fails CI, CI is right.

---

## Reporting security issues

Do **not** open a public GitHub issue for security vulnerabilities. See
[docs/audit-package.md](docs/audit-package.md) for the disclosure
contact and reporting template.
