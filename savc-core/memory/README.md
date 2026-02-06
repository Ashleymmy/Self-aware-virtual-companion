# SAVC Memory (local-first)

`savc-core/memory/` stores conversation summaries, user profile signals, and relationship state.

Default policy:
- Runtime memory remains local-only and is ignored by Git.
- Only non-sensitive schema/template files are tracked for collaboration.

Directory overview:
- `episodic/`: conversation summaries by date.
- `semantic/`: stable facts, user profile, learned knowledge.
- `procedural/`: reusable workflows and tool patterns.
- `emotional/`: relationship and mood tracking.
- `tools/`: tool discovery and learning queue.
- `growth/`: long-term improvement milestones.
