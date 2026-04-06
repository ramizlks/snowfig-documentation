# SnowfigIP Codebase Annotations (External Expanded)

> **Architectural Note:** The mandate was strictly to *not modify the original, executing source code*. The following document acts as the master, highly technical "external inline comments" dictionary for the SnowfigIP ecosystem. When navigating the listed files, consider these annotations as the definitive explanation of the original developer's intent.

---

## 1. Frontend Annotations: APIs and Utilities (`SnowfigIP-FE`)

### 1.1 The Ultimate API Wrapper (`Api/InvoiceReporting.js`, `Api/Matter.js`, etc.)
**Code in reality:**
```javascript
export: (payload) =>
HELPERS.secureRequest({
  method: "post",
  url: `${BASE_URL}/api/invoice-reporting/v1/invoice-reporting/export/`,
  data: payload,
  responseType: "arraybuffer", // <--- CRITICAL
  headers: { "Content-Type": "application/json" },
}),
```
**Codebase Annotations (The "Why" and "How"):**
*   **The Abstraction:** Never use `fetch()` or raw `axios` inside a React component. The `Api/` folder isolates all HTTP contracts. This allows for unit testing the API layer without spinning up React, and allows a single point of failure update if the base URL or API versioning changes.
*   **The Payload Signature:** Notice `responseType: "arraybuffer"`. This tells Axios *not* to parse the backend response as JSON. In SnowfigIP, reporting endpoints return raw binary files (Excel). If `arraybuffer` is missing, the frontend will attempt to parse binary logic into a string, silently corrupting the downloaded Excel file and throwing generic "File is corrupted" errors in Microsoft Excel.
*   **Security Injection:** `HELPERS.secureRequest` is an interceptor. It invisibly attaches `Authorization: Bearer <token>` to the request. If the token is expired, it pauses the request, calls a `/refresh` endpoint, gets a new token, and resumes the original export request, entirely transparent to the user.

### 1.2 The Formatting Engine (`utils/helper.js`)
**Codebase Annotations:**
*   **Objective:** IP data is geographically agnostic (filed in Japan, billed in Europe, managed in India). The `helper.js` functions sanitize dates and currencies.
*   **`formatCurrency()`:** A custom utility that takes purely numerical values from the backend and maps them to user-preference locales.
*   **Timezone Defense:** The backend strictly outputs ISO-8601 UTC. `helper.parseDateBlock()` or equivalent functions ensure that "Due: 2026-04-15T23:59:59Z" renders as the exact localized midnight, preventing a scenario where a Japanese client thinks a US patent deadline is a day later than it legally is.

---

## 2. Backend Annotations: ViewSets, Email Orchestration, and Utils (`SnowfigIP-BE`)

### 2.1 Deep ViewSet Architecture (`ipcms_new/matter/v1/views.py`)
**Code in reality:**
```python
@action(detail=True, methods=["GET"])
def client_instruction(self, request, pk):
    data = request.GET
    matter = get_object_or_404(Matter, pk=pk)
    mails = matter.matter_mail_set.all().values_list("mail_id", flat=True)
    client_ids = MatterContact.objects.filter(matter_id=matter.id).values_list("contact__office__client_id", flat=True)
    ...
```
**Codebase Annotations:**
*   **Custom `@action` routing:** In Django REST Framework, a `ModelViewSet` gives you standard CRUD natively. However, `Matter` instances are massively complex. The developers use `@action(detail=True)` to create highly specific sub-routes (e.g., `/api/matter/v1/{id}/client_instruction/`).
*   **Query Filtering:** Notice the extraction of `mails` utilizing `.values_list("mail_id", flat=True)`. This is explicitly used to generate a subquery or a lightweight IN clause, rather than loading hundreds of full ORM objects into Python memory just to get their IDs.
*   **Security Scope:** The use of `get_object_or_404` isn't just for laziness; it securely guarantees that if a user tries to access a Matter ID they don't have access to (due to the modified `get_queryset()` dropping it), it naturally returns a 404 rather than an exploitable 403 or 500.

### 2.2 The Custom Storage Adapter (`ipcms_new/utils/storages.py`)
**Codebase Annotations:**
*   **Objective:** To bypass local container storage for uploaded files like bulky PDF patent specifications.
*   **Mechanism:** It extends standard `django.core.files.storage`. It ensures files are uploaded directly to the cloud blob storage (Azure/S3). Crucially, the system utilizes "Pre-Signed URLs" rather than public URLs, meaning an uploaded patent spec is secure by default and the URL expires, enforcing constant re-authorization via the Django backend.

### 2.3 Email Trigger Pipeline (`ipcms_new/mail/mail_create.py`)
**Codebase Annotations:**
*   **Context Generation:** The function gathers complex context (Matter ID, Client Name, Deadline Date). It compiles these into a single dictionary.
*   **Template Rendering:** It passes the dictionary to the Django templating engine (`render_to_string("templates/deadline_alert.html", context)`).
*   **Decoupled Sending:** The function *does not* actually send the email over SMTP. It pushes a serialized task to the Celery broker. *Why?* Because an SMTP handshake takes ~800ms. If an associate uploads 10 documents triggering 10 emails, a synchronous send would freeze the API for 8 seconds. Celery makes this instantaneous.

---

## 4. Reports Service Annotations (`SFIP-Reports`)
### 4.1 The Celery Brain (`background_tasks.py` and `IASR_data_extract.py`)
**Codebase Annotations:**
*   **The Chunked Extractor:** In IP Reporting, a client might request "All data since 2010" which evaluates to 250,000 rows. The `large_dataset_handler` or legacy integration scripts (`iasr_patent.py`) utilize paginated SQL limits (e.g., fetching 5,000 rows per loop).
*   **Memory Eviction:** Once 5,000 rows are parsed, they are written to a localized temp binary buffer, and Python's garbage collector is permitted to delete the rows from RAM, preventing the Docker container from throwing an OOM (Out Of Memory) kill signal.
*   **The Sanitizer:** (`file_name_sanitizer.py`). When the backend tries to save an Excel file titled "Patents: Client X / Subsidiary Y", the colon and forwards slash will critically break Linux and Unix filesystems. The sanitizer uses Regex to strip out OS-illegal characters before invoking system `File.open()`.
