# SnowfigIP Codebase Reading Guide (Expanded Edition)

This extremely detailed guide serves as the definitive manual for navigating the SnowfigIP ecosystem. By reading this, a senior engineer will exactly understand the design patterns, code structures, and linkage nuances across the Frontend, Backend, and async reporting architectures.

---

## 1. Navigating the Frontend (SnowfigIP-FE)
The Frontend is built on **Next.js**, acting as an SPA (Single Page Application) with severe API abstraction.

### 1.1 The API Abstraction Layer (`SnowfigIP-FE/Api/`)
Unlike basic React apps that sprinkle `fetch()` or `axios()` inside components, SnowfigIP-FE centralizes all backend communications inside the `Api/` folder. 
**Real Example:** `SnowfigIP-FE/Api/InvoiceReporting.js`
```javascript
import HELPERS from "@/utils/helper";
const BASE_URL = process.env.NEXT_PUBLIC_USER;

const InvoiceReportingApi = {
  list: (params) =>
    HELPERS.secureRequest({
      method: "get",
      url: `${BASE_URL}/api/invoice-reporting/v1/invoice-reporting/`,
      params,
    }),
  export: (payload) =>
    HELPERS.secureRequest({
      method: "post",
      url: `${BASE_URL}/api/invoice-reporting/v1/invoice-reporting/export/`,
      data: payload,
      responseType: "arraybuffer",
      headers: { "Content-Type": "application/json" },
    }),
};
export default InvoiceReportingApi;
```
**How to read this:**
- When debugging a frontend network issue (like why an Excel export failed), *do not look in the React component*. Look for `InvoiceReportingApi.export`. 
- See `HELPERS.secureRequest`? This means `utils/helper.js` handles injecting the JWT Bearer token into headers globally, catching 401s, and attempting token refreshes automatically.
- Notice the `responseType: "arraybuffer"`. This is crucial for binary files (PDF/Excel). If this is missing on an export endpoint, the download will yield corrupted files.

### 1.2 The UI and Routing (`pages/` and `components/`)
Routing is file-system based (e.g., `pages/billing/[id].js`).
When you read a page, immediately locate the `useEffect` or React Query hook calling the `Api` methods. The state is then passed down selectively to modular UI fragments in the `components/` folder.

---

## 2. Navigating the Backend (SnowfigIP-BE)
The backend is a monolithic Django DRF (Django REST Framework) application built for enterprise IP rules.

### 2.1 Understanding Modularity (`ipcms_new/`)
The `ipcms_new` directory is the core of the monolith. It contains strict domain apps: `matter`, `billing`, `stageflow`, `corporate`.

### 2.2 Deep Dive into Views: The Query Optimization Pattern
Because IP data is massive (a Matter can have 50 related dates, 10 parties, 30 emails), SnowfigIP-BE does not use simple `Matter.objects.all()`. Doing so would trigger the "N+1 Query Problem", crashing the database.

**Real Example:** `ipcms_new/matter/v1/views.py` -> `MatterViewSet`
```python
class MatterViewSet(viewsets.ViewSet):
    permission_classes = (IsAuthenticated,)
    queryset = (
        Matter.objects.all()
        .select_related(
            "case_type", "property_type", "status", "country_of_filing"
        )
        .prefetch_related(
            Prefetch(
                "matter_mail_set",
                MatterMail.objects.all().prefetch_related(
                    Prefetch("mail", Mail.objects.all().select_related("assign_to"))
                )
            ),
            Prefetch("matter_official_numbers", MatterOfficialNumber.objects.all(), to_attr="official_numbers")
        )
    )
```
**How to read this:**
- The Backend Engineers explicitly map out SQL JOINs using `.select_related()` for ForeignKeys (loading them in a single fast query).
- They use `.prefetch_related(Prefetch(...))` to execute highly optimized sub-queries for Many-To-Many or Reverse Foreign Key relations (like `matter_mail_set`). 
- **The Rule:** If you add a new relationship to the `Matter` model and expose it in the Serializer, you **must** add it to this explicit `prefetch_related` block, or you will cause an N+1 database meltdown on the list API.

### 2.3 The URL Routing Structure
Inside an app like `matter`, look at `v1/urls.py` and `v1/serializers.py` to trace the data flow. 
- API endpoints are versioned (e.g., `/api/matter/v1/matter_update/`).
- Using `@action(detail=True, methods=["PATCH"])` inside the `MatterViewSet` is standard for granular updates without overloading standard PUT requests.

---

## 3. Navigating the Reports Service (SFIP-Reports)
When a user requests a multi-thousand row report, `SnowfigIP-BE` offloads this to `SFIP-Reports`.

### 3.1 The Async Queue
- Do not look for HTTP response rendering here. Look in `background_tasks.py`. 
- **Tracing a task**: A Celery worker picks up a message from Redis (`task_name="generate_matter_report"`). It invokes `IASRProcessingService` or equivalent mappers, streams the SQL query in batches, writes localized binary chunks, compiles the `.xlsx`, signs an ephemeral cloud URI, and triggers `mailgun_handler.py` to notify the requesting user.
