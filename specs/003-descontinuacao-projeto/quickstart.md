# Quickstart: Validate Project Discontinuation Documentation

## Prerequisites

- Run commands from the repository root.
- Git is installed.
- Docker Compose v2 is optional and is needed only for the local Compose preservation check.

## Scenario 1: Verify public status and rationale

1. Open `README.md`.
2. Confirm the opening sections identify the project as discontinued.
3. Confirm the explanation includes all of the following: the project was created to learn Spec-Driven Development; yt-dlp downloads are blocked by production hosting IP restrictions; mitigation was possible but would require high effort and cost.
4. Confirm the notice does not promise a workaround, ongoing support, or future deployment instructions.

**Expected**: A reader can understand the status and reason from the beginning of the README.

## Scenario 2: Verify the Spec Kit sequence

1. Find the Spec Kit workflow section in `README.md`.
2. Read the nine numbered headings from top to bottom.
3. Compare each description and artifact reference to the command definitions under `.github/skills/speckit-*.md` and the existing feature documents under `specs/001-download-midias-online/` and `specs/002-formatos-padrao-download/`.

**Expected**: The headings appear in this exact order: `/speckit-constitution`, `/speckit-specify`, `/speckit-clarify`, `/speckit-plan`, `/speckit-checklist`, `/speckit-tasks`, `/speckit-analyze`, `/speckit-implement`, `/speckit-converge`. Each explanation describes the stage's purpose without claiming unsupported command history.

## Scenario 3: Verify Cloud Run material was removed without adding alternatives

```sh
if git grep -n -I -E 'gcloud run deploy|Cloud Run|cloudrun|compose\.cloudrun|\.gcloudignore' -- README.md Dockerfile compose.yaml backend/Dockerfile frontend/Dockerfile; then
  echo "Unexpected platform-specific deployment reference remains"
  exit 1
else
  echo "No platform-specific deployment reference in the checked files"
fi

test ! -e docs/cloud-run.md
test ! -e compose.cloudrun.yaml
test ! -e .gcloudignore
```

**Expected**: The search prints no matches and all three removed paths are absent. The README contains no replacement recipe for another hosting platform.

## Scenario 4: Preserve local development setup

```sh
test -f compose.yaml
git diff --check
docker compose config --quiet
```

**Expected**: The generic local Compose file remains present and parses successfully when Docker Compose v2 is installed. `git diff --check` reports no whitespace errors. If Docker is unavailable, record that validation as not run; do not infer a successful Compose check.

## Scope of validation

No backend/frontend behavior or public API changes are planned, so application unit tests and production builds are not acceptance gates for this documentation-only change. The root Dockerfile edit is limited to comments and log labels; review the diff to confirm all commands and runtime values are unchanged.
