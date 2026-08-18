# AI Security

## Objective
Ensure AI capabilities cannot become a path around TechSight security controls.

## Rules
- AI queries inherit authenticated user identity.
- Retrieval is tenant-scoped.
- RBAC is enforced before tool execution.
- AI cannot directly change payroll or attendance without an explicit authorized workflow.
- Sensitive fields are minimized.
- Prompt/tool/output activity can be audited according to tenant policy.
- External model providers must receive only approved data.
- Secrets and credentials are never supplied to the model.

## Prompt Injection
Treat retrieved employee text, documents, visitor notes and external content as untrusted input. Tool permissions are enforced independently of model instructions.
