# Implementation Plan: Project Discontinuation and Cloud Run Reference Removal

**Branch**: `003-descontinuacao-projeto` | **Date**: 2026-10-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification for marking the public project as discontinued, removing Cloud Run deployment material, and documenting the requested Spec Kit workflow.

## Summary

Update the README to identify the project as discontinued, state the maintainer-provided learning and yt-dlp production limitation rationale, and explain the nine Spec Kit stages in order. Remove Cloud Run-specific deployment guidance and artifacts, generalize Cloud Run labels in the root Dockerfile, and preserve local development instructions plus platform-neutral container files. No application behavior, deployment alternative, or new dependency is in scope.

## Technical Context

**Language/Version**: Markdown and Dockerfile syntax; no application language changes.

**Primary Dependencies**: None. Reuse existing documentation and repository tooling.

**Storage**: N/A. No application data or persistence changes.

**Testing**: Static documentation and tracked-file searches, `git diff --check`, README sequence/content review, and `docker compose config --quiet` when Docker Compose is available. No application test suite is required for documentation-only changes.

**Target Platform**: Public repository readers and maintainers using local development tooling.

**Project Type**: Documentation and deployment-artifact cleanup in the existing web monorepo.

**Performance Goals**: N/A.

**Constraints**: Do not provide deployment instructions for Cloud Run or another hosting platform. Preserve local development guidance, generic Dockerfiles, local `compose.yaml`, and runtime behavior. Keep the nine Spec Kit command headings in the exact user-provided order and do not claim unverified command history.

**Scale/Scope**: README update; removal of Cloud Run-only guide/configuration; wording-only changes in the root Dockerfile; no backend/frontend source changes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Research Gate

- **Authorized scope (Principles III-IV)**: PASS. The user explicitly requested discontinuation messaging, Cloud Run removal, and Spec Kit documentation; no application behavior or architecture changes are proposed.
- **Documentation (Principle V)**: PASS. The README and platform-specific artifacts are the requested documentation/configuration surface.
- **Simplicity (Principle VI)**: PASS. Remove unused platform-specific guidance rather than adding an archive or replacement deployment abstraction.
- **Quality gates (Principle IX)**: PASS. Validate edited package documentation and local Compose configuration where available; disclose unavailable tooling.
- **Security and confidentiality (Principle X)**: PASS. No secrets, credentials, or media data are added to documentation.
- **Other principles**: PASS / NOT APPLICABLE. Monorepo contracts, dependencies, persistence, backend unit coverage, and runtime dependency wiring are unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/003-descontinuacao-projeto/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
└── quickstart.md
```

### Source Code (repository root)

```text
README.md                         # Public project status and Spec Kit workflow
Dockerfile                        # Keep runtime; generalize platform-specific labels
compose.yaml                      # Preserve local development environment
backend/Dockerfile                # Preserve package container build
frontend/Dockerfile               # Preserve package container build
docs/cloud-run.md                 # Remove
compose.cloudrun.yaml             # Remove
.gcloudignore                     # Remove
```

**Structure Decision**: Keep changes at the repository documentation and root deployment-configuration boundary. Remove the only Cloud Run guide and its dedicated Compose/ignore files. Retain generic development and package container files; the root Dockerfile's build/runtime commands remain unchanged apart from neutral wording.

## Design Decisions

- Place the discontinued status and rationale near the beginning of `README.md`; keep local setup and test instructions available.
- Describe the commands as a workflow, in the requested order, using the command definitions and existing feature artifacts. Explain each stage's purpose and primary artifact; do not assert execution details that are not supported by the repository.
- Delete `docs/cloud-run.md` rather than retaining it as an archived guide, because its operational instructions would remain deployment recommendations.
- Delete `compose.cloudrun.yaml` and `.gcloudignore`, which exist only for the removed platform-specific build/deploy flow.
- Replace Cloud Run wording in the root Dockerfile comments and startup messages with platform-neutral terms. Preserve the target, environment variables, migration handling, process supervision, ports, and entrypoint behavior.
- Do not add instructions for another host or deployment platform. Existing local Docker Compose instructions are for development and remain in scope for preservation.

## Implementation and Validation Approach

1. Update the README status and rationale, then add the nine ordered Spec Kit sections with accurate stage descriptions and links to the existing `specs/` artifacts.
2. Remove `docs/cloud-run.md`, `compose.cloudrun.yaml`, and `.gcloudignore`; remove README references to those files and any Cloud Run-specific troubleshooting wording.
3. Generalize only the root Dockerfile's comments and emitted startup labels.
4. Search user-facing documentation and deployment configuration for platform-specific deployment commands; inspect the README to ensure it offers no substitute deployment recipe.
5. Run `git diff --check`, verify the nine headings and the required deprecation rationale, and validate `compose.yaml` when Docker Compose is installed.

## Post-Design Constitution Check

- **Scope and architecture (Principles III-IV)**: PASS. The plan deletes only platform-specific artifacts and edits documentation/labels; generic local tooling and application behavior remain unchanged.
- **Documentation and simplicity (Principles V-VI)**: PASS. The old guide is removed instead of being retained as a competing historical deployment procedure.
- **Quality (Principle IX)**: PASS. Static checks cover changed docs/config; local Compose validation is run if the CLI is available.
- **Security and confidentiality (Principle X)**: PASS. No secret handling changes or sensitive examples are introduced.
- **Remaining principles**: PASS / NOT APPLICABLE. No changes to package boundaries, third-party dependencies, service dependencies, or backend behavior.

## Complexity Tracking

No constitution violations or additional project layers are proposed.
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
