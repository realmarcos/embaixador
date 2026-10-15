# Feature Specification: Project Discontinuation and Cloud Run Reference Removal

**Feature Branch**: `003-descontinuacao-projeto`

**Created**: 2026-10-15

**Status**: Draft

**Input**: User description: "Discontinue the project, explain that it was created to learn Spec-Driven Development and that yt-dlp production hosting IP blocks make media downloads unreliable; remove Google Cloud Run deployment guidance and document the project's Spec Kit workflow in the requested nine-step order."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Understand the project status (Priority: P1)

A public reader opens the repository documentation and can immediately understand that the project is discontinued and why no further development is planned.

**Why this priority**: The repository is public; its status and limitations must be visible before readers invest time adopting or deploying it.

**Independent Test**: Review the README status section and confirm it states the learning purpose, yt-dlp production IP blocking, and the high effort and cost of mitigation.

**Acceptance Scenarios**:

1. **Given** a reader opens the README, **When** they scan the opening sections, **Then** they find a clear discontinued status and the stated reason.
2. **Given** a reader sees the deprecation explanation, **When** they read it, **Then** it does not promise a mitigation, continued support, or future deployment guidance.

### User Story 2 - Understand the Spec Kit development workflow (Priority: P1)

A reader can follow a documented, ordered explanation of how Spec Kit supported the project's Spec-Driven Development process, including each command's purpose and the design or implementation artifacts it produced or reviewed.

**Why this priority**: Learning Spec-Driven Development was the project's primary educational purpose and should remain understandable after discontinuation.

**Independent Test**: Review the README workflow section and verify it contains all nine requested commands in order, with concise and accurate explanations.

**Acceptance Scenarios**:

1. **Given** a reader opens the Spec Kit section, **When** they follow its headings, **Then** the commands appear in this order: constitution, specify, clarify, plan, checklist, tasks, analyze, implement, converge.
2. **Given** a command is described, **When** its explanation is compared with the repository's Spec Kit workflow and feature artifacts, **Then** its purpose and related artifact are not misrepresented.

### User Story 3 - Find no Cloud Run deployment recommendations (Priority: P1)

A reader can find local development instructions without encountering a Cloud Run deployment guide, commands, or recommendations for another deployment platform.

**Why this priority**: The maintainer explicitly wants users who choose to deploy the project to make their own platform decisions without deployment suggestions from this repository.

**Independent Test**: Search user-facing documentation and tracked deployment assets for Cloud Run-specific deployment commands and confirm none remain; verify local development guidance remains intact.

**Acceptance Scenarios**:

1. **Given** a reader searches README and documentation for deployment instructions, **When** they inspect the repository's published guidance, **Then** no Cloud Run or alternative-platform deployment procedure is provided.
2. **Given** the Cloud Run-only deployment guide and configuration are removed, **When** a developer follows local setup, **Then** local Compose and package-specific development instructions remain available.

## Edge Cases

- Historical feature specifications or the new change plan may name Cloud Run as the target being removed; they must not provide deploy commands or recommendations.
- Generic Dockerfiles and local Compose are not platform-specific deployment advice and must not be removed as collateral cleanup.
- The deprecation reason must describe production IP blocking and the cost/effort of mitigation without suggesting a workaround.
- The Spec Kit section must preserve the user's requested sequence even where the repository does not retain a separate report for a command.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The README MUST prominently state that the project is discontinued.
- **FR-002**: The README MUST explain that the project was built to learn Spec-Driven Development and was discontinued because yt-dlp production hosting IPs are blocked during media downloads; possible mitigation would require excessive effort and cost.
- **FR-003**: The README MUST describe the nine Spec Kit commands in the exact requested order, with each command's role and relevant artifacts or stage outcome.
- **FR-004**: The README and user-facing documentation MUST NOT recommend or describe deployment to Google Cloud Run or any alternative hosting platform.
- **FR-005**: Cloud Run-specific deployment documentation and configuration MUST be removed, including `docs/cloud-run.md`, `compose.cloudrun.yaml`, and `.gcloudignore`.
- **FR-006**: Remaining Cloud Run-branded comments and startup messages in the root Dockerfile MUST be generalized without changing its runtime behavior.
- **FR-007**: Local development instructions, generic Compose configuration, package Dockerfiles, and application functionality MUST remain unchanged.
- **FR-008**: The change MUST NOT introduce deployment guidance for users choosing to deploy the project themselves.

### Key Entities *(include if data involved)*

- No application data entities are introduced or changed. The scope is repository documentation and removal of platform-specific deployment artifacts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The README presents the discontinued status and all three parts of the maintainer-provided reason in its opening section.
- **SC-002**: The README includes exactly nine ordered Spec Kit subsections matching the requested command sequence.
- **SC-003**: No Cloud Run deployment commands, deployment steps, or alternative-platform recommendations remain in user-facing documentation or deployment configuration.
- **SC-004**: The local setup and local Docker Compose instructions remain available and contain no Cloud Run-specific configuration references.
- **SC-005**: The generic root Dockerfile no longer labels its runtime or startup logs as Cloud Run, while its build and startup behavior is preserved.

## Assumptions

- The project status should be stated as discontinued now; this does not imply deleting the repository or application code.
- README remains the primary public documentation; no replacement deployment guide will be added.
- Cloud Run-specific deployment assets are in scope for removal, while generic container builds and local development support are preserved.
- The Spec Kit workflow will be described as a process and tied to available artifacts; no unsupported claim about command execution history is required.
