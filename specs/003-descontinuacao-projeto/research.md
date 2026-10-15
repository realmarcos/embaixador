# Research: Project Discontinuation and Cloud Run Reference Removal

## Decision 1: Make the README the public status notice

**Decision**: Add a prominent discontinued status and the maintainer-provided rationale near the beginning of `README.md`.

**Rationale**: The README is the repository's entry point and already describes the project's purpose and local setup. The explanation should be visible before readers evaluate adoption or operation.

**Alternatives considered**: Add a separate status file or only change the repository description. Rejected because readers may not see a separate notice, and repository metadata is not a substitute for project documentation.

## Decision 2: Remove platform-specific deployment instructions and artifacts

**Decision**: Remove `docs/cloud-run.md`, `compose.cloudrun.yaml`, and `.gcloudignore`; remove the README's Cloud Run deployment section and references to Cloud Run in proxy/troubleshooting text.

**Rationale**: The guide and configuration exist exclusively for this platform and contain deploy commands, resource setup, costs, and operational recommendations. Retaining them as archived guidance would conflict with the request to offer no deployment suggestions.

**Alternatives considered**: Keep the guide with a deprecation banner or move it into an archive. Rejected because its actionable deploy instructions would remain in the public repository. Preserve generic `compose.yaml`, `backend/Dockerfile`, `frontend/Dockerfile`, and the root Dockerfile because they are not Cloud Run-only and local development must remain usable.

## Decision 3: Generalize root Dockerfile labels without changing runtime behavior

**Decision**: Replace Cloud Run-specific comments and startup log prefixes in the root `Dockerfile` with neutral container/runtime wording. Do not change build stages, ports, environment defaults, migration behavior, process supervision, or the entrypoint.

**Rationale**: The root Dockerfile is a generic multi-stage container build with a platform-specific label. Removing the label satisfies the reference cleanup without changing a user's ability to build or run the image independently.

**Alternatives considered**: Delete or redesign the root Dockerfile. Rejected because that would expand the request into removing generic container functionality and could break independent use.

## Decision 4: Document the nine Spec Kit stages as an ordered process

**Decision**: Add nine numbered README subsections, matching the requested command names and order. Explain each command's purpose and the artifact or state it contributes, using the local skill definitions and checked-in feature artifacts as evidence.

**Rationale**: Spec Kit's commands form a requirements-to-implementation workflow. Existing feature directories contain specifications, plans, research, data models, contracts, quickstarts, checklists, and tasks. The README should explain the workflow without implying that every command leaves a dedicated report or making unsupported claims about execution history.

**Alternatives considered**: List only command names, or describe them as a generic SDD flow without repository artifacts. Rejected because the user asked for details and the repository already contains concrete examples.

## Decision 5: Keep deployment guidance out of the replacement documentation

**Decision**: Do not add generic hosting, self-hosting, migration-away, or alternative-platform recipes. Preserve only local development and test instructions.

**Rationale**: The user explicitly leaves any deployment choices to readers and does not want recommendations in project documentation.

**Alternatives considered**: Replace Cloud Run instructions with a provider-neutral production guide. Rejected because it would still be deployment advice.

## Repository Evidence

- The tracked-file search found platform references in `.gcloudignore`, `Dockerfile`, `README.md`, `compose.cloudrun.yaml`, and `docs/cloud-run.md`.
- `compose.yaml` documents local development services and is not specific to a production platform.
- The package Dockerfiles and the root Dockerfile build generic Node.js containers; only the root Dockerfile's comments and startup messages explicitly name Cloud Run.
- The feature specifications under `specs/001-download-midias-online/` and `specs/002-formatos-padrao-download/` demonstrate the staged artifacts but do not provide Cloud Run deployment guidance.
