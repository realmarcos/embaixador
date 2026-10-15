---
description: "Dependency-ordered tasks for project discontinuation documentation"
---

# Tasks: Project Discontinuation and Cloud Run Reference Removal

**Input**: Design documents from `/specs/003-descontinuacao-projeto/`

**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `quickstart.md`

**Tests**: No application code or runtime behavior changes are planned. Validate documentation and preserved local Compose behavior using `quickstart.md`.

**Organization**: Tasks follow the three P1 user stories. The README tasks are sequential because they edit the same file; Cloud Run artifact removal and Dockerfile wording cleanup can run in parallel after the README work begins.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Task can run in parallel with other marked tasks because it edits different files and has no dependency on incomplete tasks.
- **[Story]**: User-story label for story-phase tasks only.
- Every task names the exact file paths to create, update, validate, or remove.

## Phase 1: Setup

**Purpose**: Confirm the documentation boundary before making changes.

- [ ] T001 Inventory Cloud Run-specific references in `README.md`, `docs/cloud-run.md`, `compose.cloudrun.yaml`, `.gcloudignore`, and `Dockerfile`; confirm that local `compose.yaml`, `backend/Dockerfile`, and `frontend/Dockerfile` are preserved per `specs/003-descontinuacao-projeto/plan.md`.

## Phase 2: Foundational

**Purpose**: No application foundation, package setup, dependencies, or data model changes are needed for this documentation-only feature.

No foundational tasks.

## Phase 3: User Story 1 - Understand the Project Status (Priority: P1) - MVP

**Goal**: A public reader immediately understands that the project is discontinued and why.

**Independent Test**: Review the opening of `README.md` and confirm the discontinued status, Spec-Driven Development learning purpose, production hosting IP blocking with yt-dlp, and the high effort and cost of possible mitigation are all stated without promising workarounds or continued support.

- [ ] T002 [US1] Add a prominent discontinued-status notice and the maintainer-provided rationale near the beginning of `README.md`, without changing the local setup instructions.

**Checkpoint**: The public status and reason are clear before a reader reaches setup instructions.

## Phase 4: User Story 2 - Understand the Spec Kit Workflow (Priority: P1)

**Goal**: A reader can understand the project's Spec-Driven Development process from its nine ordered Spec Kit stages.

**Independent Test**: Review the Spec Kit section in `README.md`; verify the nine requested commands appear in order and each description accurately states its purpose and relevant artifact based on `.github/skills/speckit-*.md` and `specs/001-download-midias-online/` or `specs/002-formatos-padrao-download/`.

- [ ] T003 [US2] Add nine numbered Spec Kit workflow subsections to `README.md` in this exact order: `/speckit-constitution`, `/speckit-specify`, `/speckit-clarify`, `/speckit-plan`, `/speckit-checklist`, `/speckit-tasks`, `/speckit-analyze`, `/speckit-implement`, `/speckit-converge`; describe each stage and its artifact without claiming unsupported command history.

**Checkpoint**: The workflow section explains the requested sequence and can be read independently of deployment guidance.

## Phase 5: User Story 3 - Find No Cloud Run Deployment Recommendations (Priority: P1)

**Goal**: Readers retain local development instructions but receive no Cloud Run or alternative-platform deployment recipe.

**Independent Test**: Follow `README.md` local setup and the local Compose section; search user-facing documentation and deployment files for Cloud Run deployment procedures; confirm the generic local Compose and package Dockerfiles remain.

- [ ] T004 [US3] Remove the Google Cloud Run deployment section and Cloud Run-specific proxy/Secret Manager troubleshooting references from `README.md`; keep local development and test instructions intact.
- [ ] T005 [P] [US3] Delete the Cloud Run-only deployment guide `docs/cloud-run.md`, the platform-specific `compose.cloudrun.yaml`, and `.gcloudignore`.
- [ ] T006 [P] [US3] Replace Cloud Run labels in comments and startup log messages in the root `Dockerfile` with platform-neutral wording; preserve all build stages, environment values, migration handling, ports, process supervision, and entrypoint commands.

**Checkpoint**: Cloud Run-only documentation/configuration is gone, generic container/local files remain, and runtime behavior in the root Dockerfile is unchanged.

## Phase 6: Polish and Cross-Cutting Validation

**Purpose**: Validate the complete documentation change and verify local development remains intact.

- [ ] T007 Run the scenarios in `specs/003-descontinuacao-projeto/quickstart.md`; verify the README status and rationale, nine-command order, removal of platform-specific deployment instructions, preserved local setup, `git diff --check`, and `docker compose config --quiet` when Docker Compose v2 is available.

## Dependencies and Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; inventory establishes the removal boundary.
- **Foundational (Phase 2)**: No work is required because no application infrastructure changes are planned.
- **User Story 1 (Phase 3)**: Depends on Setup; independent of the other stories.
- **User Story 2 (Phase 4)**: Depends on User Story 1 because both edit `README.md`.
- **User Story 3 (Phase 5)**: README cleanup depends on User Story 2; the Cloud Run-only file deletions and root Dockerfile wording cleanup do not depend on each other and may run in parallel.
- **Polish (Phase 6)**: Depends on all three user stories.

### User Story Dependencies

- **US1 (P1)**: Starts after Setup; no dependencies on other stories.
- **US2 (P1)**: Follows US1 to avoid concurrent edits to `README.md`.
- **US3 (P1)**: README cleanup follows US2; independent file cleanup can be parallelized within the story.

### Parallel Opportunities

- T005 and T006 edit disjoint files and can run in parallel after the initial inventory.
- README work T002, T003, and T004 is intentionally sequential because each task updates the same file.
- T007 runs only after all story tasks complete.

## Parallel Example: User Story 3

```text
Task: T005 Delete docs/cloud-run.md, compose.cloudrun.yaml, and .gcloudignore
Task: T006 Generalize Cloud Run labels in the root Dockerfile
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 inventory.
2. Complete US1 to publish the discontinued status and reason.
3. Stop and validate the README notice independently.

US1 is the smallest independently useful increment. The full requested outcome also requires US2 and US3.

### Incremental Delivery

1. Complete US1 and review the public status/rationale.
2. Add US2's Spec Kit workflow to the README.
3. Complete US3's reference removal and platform-only asset cleanup.
4. Run the full quickstart validation in Phase 6.

## Format Validation

Every task uses the required checkbox, sequential task ID, optional `[P]` marker, required story label in user-story phases, and exact file paths. No automated application tests are specified because no application behavior changes are planned.
