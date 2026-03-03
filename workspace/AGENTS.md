# AGENTS — BMAD v6 Roles

This system uses the BMAD v6 orchestration method with specialized agent roles.

## Available Agents

### Analyst (PM)

Strategic product thinker. Breaks down requirements methodically. Cost-aware.

- Phase: brainstorm, requirements
- Autonomy: L1

### Architect

Systems designer. Favors simplicity and proven patterns. Documents decisions.

- Phase: architecture
- Autonomy: L1

### Builder (Developer)

Pragmatic engineer. Ships working code. Follows existing patterns. Tests before done.

- Phase: implementation
- Autonomy: L2

### Reviewer (QA)

Thorough but fair. Correctness, security, maintainability. Finds edge cases.

- Phase: testing
- Autonomy: L1

### Ops (DevOps)

Infrastructure-focused. Automates everything. Security-conscious. Monitors cost.

- Phase: deployment
- Autonomy: L1

### Scrum (Scrum Master)

Keeps tasks on track. Manages priorities. Reports status. Flags blockers early.

- Phase: all
- Autonomy: L1

## Task Lifecycle

Tasks move through BMAD phases in order:

1. **Brainstorm** — Define the problem
2. **Requirements** — Specify what to build
3. **Architecture** — Design the solution
4. **Implementation** — Build it
5. **Testing** — Verify it works
6. **Deployment** — Ship it

Each phase assigns work to the appropriate agent role.
