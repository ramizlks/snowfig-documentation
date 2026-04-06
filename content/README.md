# SnowfigIP Ecosystem Documentation

Welcome to the central repository for the SnowfigIP ecosystem documentation. This folder contains extremely comprehensive, technically grounded guides designed to explain the architecture, workflows, operational procedures, and security paradigms of the SnowfigIP project (a large-scale Intellectual Property CMS).

## 📚 Documentation Index

The following 8 highly verbose documents provide a complete blueprint of the platform:

1. [📖 1_Codebase_Reading_Guide.md](./1_Codebase_Reading_Guide.md)
   * **Subject**: How to actually read the code. An extensive deep dive showing where to look for Frontend API calls, Backend ViewSet optimizations (like N+1 prevention with `Prefetch`), and async routing.

2. [🏢 2_Project_Overview.md](./2_Project_Overview.md)
   * **Subject**: The business rationale, exactly what an IP CMS is, why standard systems fail under statutory deadlines, and the orchestration across the Next.js, Django, and FastAPI microservices.

3. [⚙️ 3_Operations_Manual.md](./3_Operations_Manual.md)
   * **Subject**: The daily operational procedures. Covers role-assignment, Docker/Celery triage, billing invoice processing, and procedural tracking.

4. [📈 4_Executive_Brief.md](./4_Executive_Brief.md)
   * **Subject**: High-level strategic overview meant for the C-Suite. Focuses on risk mitigation, Big-4 style architectural resiliency, and business value realization.

5. [🗄️ 5_Database_and_Schemas.md](./5_Database_and_Schemas.md)
   * **Subject**: Detailed dive into the PostgreSQL database design. Showcases Django ORM mixin strategies, complex decoupled dating relationships (`MatterDates`), and the integration of legacy `Inprotech` schema.

6. [🔒 6_Security_Architecture.md](./6_Security_Architecture.md)
   * **Subject**: The system's defense mechanisms. Broken down for both management (why it matters) and hardcore developers (JWT handling, Django Role-Based Access Control, CSRF/XSS, and transit encryption).

7. [☁️ 7_Handover_and_Migration_Guide.md](./7_Handover_and_Migration_Guide.md)
   * **Subject**: Playbooks for platform migration. Covers specific instructions for moving to AWS (ECS/Fargate), Azure (AKS/App Service), or On-Premise Air-Gapped environments.

8. [💻 8_Codebase_Annotations.md](./8_Codebase_Annotations.md)
   * **Subject**: The external master index of inline annotations. Analyzes specific edge functions, backend optimization techniques, utility wrappers, and Celery asynchronous strategies without polluting the executing code.

---

## 📝 Inline Comment Conventions

While the actual source code is kept clean, whenever developers add inline code comments to the SnowfigIP repositories, they absolutely must follow these structured conventions to maintain reality-grounded context:

### 1. The "Why-What-How" Pattern
Comments must not repeat what the code simply *does* (e.g., `// Adds 5 to the date`). They must explain the *intent*.
* **WHY**: `// WHY: The Japanese Patent Office (JPO) requires a strict 5-day grace period distinct from standard WIPO rules.`
* **WHAT**: `// WHAT: This function overrides the base WIPO date calculation if 'country_code' == 'JP'.`
* **HOW**: `// HOW: It fetches the initial UTC timestamp, intercepts it before the timezone parsing utility acts, and applies a rigid +120 hour delta.`

### 2. Explicit Database Warnings
When touching ORMs in Django `views.py` or `serializers.py`, developers must comment on query implications.
* `// WARNING [PERF]: Utilizing .all() here without a .select_related('case_type') will trigger an N+1 query lock under heavy matter loads.`

### 3. JSDoc formatting (Frontend Utils)
Shared utilities in `SnowfigIP-FE/utils/` must be prefixed with JSDoc typing for IDE intellisense.
```javascript
/**
 * Wraps outgoing requests to ensure JWT Bearer tokens are attached and refreshed.
 * @param {Object} config - The Axios request configuration object.
 * @returns {Promise} The intercepted API response or rejection.
 */
```

### 4. Docstrings (Backend Scripts)
All background tasks (e.g., `tasks.py` or FastAPI endpoints) must use standard Python PEP 257 docstrings outlining the parameter expectations and expected exceptions, especially for memory-heavy endpoints.
