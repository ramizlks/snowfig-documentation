# SnowfigIP Handover & Migration Guide (Expanded Edition)

## 1. Entering the Ecosystem
To whichever engineering team is assuming control of the SnowfigIP project: the application you are adopting is not a simple monolithic CRUD app. It is a highly orchestration-dependent trifecta. 
You must simultaneously manage:
1. `SnowfigIP-FE` (Node.js/Next.js UI)
2. `SnowfigIP-BE` (Python/Django DRF core logic, Celery Beat scheduler, Database wrapper)
3. `SFIP-Reports` (FastAPI memory-intensive reporter, Celery Worker pool)

The immediate "Source of Truth" for your local environment runtimes are the respective `Dockerfile` and `docker-compose.yml` configs. The BE requires PostgreSQL (SQL storage), Redis (Async message broker / Cache), and standard Worker containers to function.

---

## 2. Infrastructure as Code (IaC) Migration Matrices
The system is explicitly designed completely cloud-agnostic. The overarching rule: **Deploy the databases as Managed Services, configure the code as Stateless Containers.**

### 2.1 The AWS (Amazon Web Services) Matrix
If the organization dictates a move entirely into AWS, the target architecture is as follows:
*   **Compute (ECS Fargate)**: Do not spin up EC2 instances manually. Build your 3 Docker images (`frontend`, `backend`, `reports`) and push them to ECR (Elastic Container Registry). Create an ECS Fargate cluster. The `backend` and `reports` containers should map to an internal Application Load Balancer. The `frontend` should map to a public ALB.
*   **Database (RDS)**: Migrate from local PostgreSQL to an **RDS Postgres 14+** Multi-AZ deployment. Ensure the Security Group only permits inbound traffic natively from the Fargate cluster's Security Group.
*   **Cache/Queue (ElastiCache)**: Spin up ElastiCache for Redis. This is crucial for Celery. The `broker_url` in both Python repositories must point here.
*   **File Storage (S3)**: Form generations (`generated_forms_upload`) managed by Django `storages.py` must be repointed to an S3 bucket configured for private access with pre-signed URL generation enabled.

### 2.2 The Microsoft Azure Matrix
If integrating into corporate Microsoft topologies (Active Directory, Business Central):
*   **Compute (Azure App Service / ACA)**: Deploy the Next.js frontend to Azure Static Web Apps (which natively parses Next.js API routes into Azure Functions). Deploy the Python backends via Azure Container Apps (ACA) or Azure App Service for Containers.
*   **Database (Flexible Server)**: Migrate the database to Azure Database for PostgreSQL - Flexible Server. Use standard `pg_dump` for the initial load.
*   **Cache/Queue (Azure Cache for Redis)**: Provision a standard tier cache. Append the primary access key to the Redis connection string injected into the environment variables.
*   **File Storage (Blob Storage)**: Update Django `django-storages` to utilize the Azure backend. Map `AZURE_ACCOUNT_KEY` and `AZURE_CONTAINER`.

### 2.3 On-Premise / Bare Metal Air-Gapped Matrix
If the IP data is required to stay 100% on internal firm hardware:
*   Deploy a highly available Kubernetes cluster (if IT allows) or stick to robust multi-node `docker-compose` setups.
*   **The Mail Challenge**: You cannot use Mailgun. You must bypass the external wrappers. Update `ipcms_new/config/settings/production.py`:
    ```python
    EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
    EMAIL_HOST = 'internal-exchange.lks.local'
    EMAIL_PORT = 25
    EMAIL_USE_TLS = False # If fully internal
    ```
    This ensures `MatterMail` notifications route blindly to the firm's internal Exchange routing rules without hitting the public internet.

---

## 3. The Continuous Integration / Delivery (CI/CD) Blueprint
You will notice a `.github/` folder containing workflows.
*   Before any code is merged, GitHub Actions will fire up a test container.
*   **Linting**: It forces `flake8`, `mypy` (for explicit Python typings which are vital in the `reports` schemas), and `bandit` (which scans the filesystem for accidentally hardcoded secrets). 
*   **Testing**: It runs `pytest` and emits a coverage map.
*   **Deployment**: Merging into the `main` branch inherently triggers a secure Docker build push to the production registry, rolling over the containers seamlessly.

## 4. The Critical Secrets Checklist
If you lose these, the system burns down. Ensure these are securely passed through an encrypted vault (like LastPass, 1Password, or Azure KeyVault):
1.  **`DJANGO_SECRET_KEY`**: The cryptographic hash signing all JWT sessions. If this is changed, all currently logged-in users are immediately kicked out.
2.  **`CELERY_BROKER_URL`**: The redis connection string.
3.  **`DATABASE_URL`**: E.g., `postgres://username:password@localhost/dbname`.
4.  **`MAILGUN_API_KEY`**: Required for the `SFIP-Reports` to actually deliver the compiled Excel sheets.
5.  **`INPROTECH_DB_URI`**: Required for the FastAPI `abstract_mapper` to connect to the read-only legacy SQL instances.
