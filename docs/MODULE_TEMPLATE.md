# MODULE.md — template

Copy to `modules/<name>/MODULE.md` and complete **before implementation begins**.
**CI fails if a module directory lacks one** (architecture test 16).

Answering this after the schema exists means answering it about decisions the schema already made.

---

```markdown
# Module: <name>

## Purpose
One paragraph. What this module owns, in domain terms.

## Ownership
- **Business owner:**
- **Technical owner:**
- **Status:** ALPHA | BETA | GA | DEPRECATED

## Vocabulary
Terms this module owns, with definitions. Where a term is also used elsewhere
with a different meaning, say so — that is a boundary, not a collision.

## Data owned

Every persistent dataset declares its full lifecycle (ADR-0026, architecture test 25):

| Table | Subject relationship | Purpose | Classification | Retention | Export treatment | Erasure strategy |
|---|---|---|---|---|---|---|
|  | SUBJECT_OWNED \| SUBJECT_DERIVED \| AGGREGATE \| NON_PERSONAL | why held | PUBLIC \| INTERNAL \| CONFIDENTIAL \| HIGHLY_SENSITIVE_FINANCIAL \| SECRET \| SEALED | from PolicyPack | included \| excluded (reason) \| n/a | CASCADE_DELETE \| ANONYMIZE_IRREVERSIBLY \| RETAIN_WITH_BASIS \| NON_PERSONAL_BY_DESIGN |

`NON_PERSONAL_BY_DESIGN` requires a stated reason and a demonstration that the data
cannot be re-identified. It is a decision requiring justification, not a description
of an accident. **Pseudonymization is not anonymization** — restorable linkage stays
personal data.

## Events published
| Event | Classification | Allowed consumers | Payload rule |
|---|---|---|---|

## Events consumed
| Event | From | Why |
|---|---|---|

## APIs exposed
| Route | Audience | Capability required |
|---|---|---|

State which admin routes deliberately **do not** exist.

## Permissions
| Permission | Role(s) |
|---|---|

**Permissions deliberately absent:** list them. This is as much a design statement
as the ones that exist.

## Capability
- **CapabilityId:**
- **declaredJurisdictions:** (the MAXIMUM legally-cleared set; `[]` until clearance)
- **Required operating-entity licences:**
- **Required integrations:**
- **Required consent:**
- **SDK exposure:** yes | no — with reason
- **White-label eligible:** yes | no — default no

## Jurisdictions and availability
| Jurisdiction | State | Reason |
|---|---|---|

## Operating entities
Which entities may serve this capability, and any licence requirements.

## Policy dependencies
Which PolicyPack clauses this module reads. Which resolution strategy applies.
Whether it declares subject-elected options.

## Legal documents
Which published documents describe this capability's behaviour to customers.
**Any promise made in those documents must be reflected here** (architecture test 26).

## Dependencies
| Module / package | Via | Why |
|---|---|---|

Cross-module dependencies go through `public-api.ts`. Nothing else.

## Ports declared
| Port | Implementations |
|---|---|

## Projections
| Projection | Carries | Must never carry |
|---|---|---|

## Tests
Domain, state machine, policy resolution, plus capability-specific safety properties.

## Notes and known limitations
Honest. Including anything deliberately not built and why.
```

---

## Why this is written first

Six of the seventeen extension-checklist points are governance decisions, not engineering ones — capability registration, availability, policy, classification, SDK exposure, and white-label entitlement. Several need a legal answer.

Discovering at implementation time that a capability needs legal clearance is discovering it after the schema, the API, and the client work have been done.
