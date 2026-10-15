# Data Model

## Scope

This feature does not add or change application data, persistence, API payloads, or database schema. There are no runtime entities or state transitions.

## Documentation Content Model

The following content elements are used to keep the README change complete and reviewable; they are not persisted application entities.

| Element | Required content | Relationship / constraint |
|---|---|---|
| Project status notice | Discontinued status and maintainer-provided rationale | Appears near the beginning of `README.md`; does not imply repository deletion or ongoing support. |
| Spec Kit workflow stage | Requested command name, ordered position, purpose, and relevant artifact or outcome | Exactly nine stages, in the order defined by FR-003; descriptions must match local command definitions and checked-in artifacts. |
| Deployment reference | User-facing deploy command, procedure, or platform recommendation | Cloud Run-specific deployment material is removed; no alternative deployment recommendation is introduced. |
| Local development guidance | Existing install, configuration, run, and test instructions | Preserved; local Compose remains distinct from production deployment advice. |

## Validation Invariants

- The status notice includes the learning purpose, yt-dlp production IP blocking, and the high effort/cost of mitigation.
- The workflow stage sequence is `/speckit-constitution`, `/speckit-specify`, `/speckit-clarify`, `/speckit-plan`, `/speckit-checklist`, `/speckit-tasks`, `/speckit-analyze`, `/speckit-implement`, `/speckit-converge`.
- README and remaining user-facing documentation contain no deployment procedure for Cloud Run or another hosting platform.
- Local development instructions and generic container files remain present.
