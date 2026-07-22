# GitHub Automation

Repository automation lives in [`workflows/`](workflows/README.md). CI and npm
publication call repository-owned commands so local and hosted gates have the
same behavior. Reusable organization workflows are pinned to an audited commit
instead of a mutable branch reference.

No workflow requires a long-lived npm token. Security findings should use the
private process in [`SECURITY.md`](../SECURITY.md).
