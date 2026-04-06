# SnowfigIP Database and Schemas Documentation (Expanded Edition)

## 1. The PostgreSQL + ORM Paradigm
An absolute rule across the SnowfigIP-BE is that standard transactional queries MUST flow through the strict Object-Relational Mapping (ORM) provided by Django. Standard SQL files (e.g., `Inprotech-Report-SQL-Queries`) are sequestered explicitly to the asynchronous `SFIP-Reports` service for complex lateral joins against legacy schemas.

The `ipcms_new` database schema is designed around **Massive Relational Normalization.** The core philosophy is that a `Matter` is the center of gravity; everything else orbits it via `ForeignKey` or `OneToOneField`.

## 2. Dissecting the Center of Gravity: The `Matter` Table
Let's analyze actual codebase snippets from `ipcms_new/matter/models.py`.

```python
class Matter(LogAuditMixin, FieldTrackingMixin, StatusMixin, TimeStampedModel, SyncMixin):
    irn_no = models.CharField(verbose_name="IRN NUMBER", max_length=50, blank=False, null=False, unique=True)
    reference_irn = models.CharField(verbose_name="REFERENCE IRN", max_length=50, blank=True, null=True, default=None)
    case_type = models.ForeignKey(CaseType, on_delete=models.DO_NOTHING, verbose_name="Case Type", blank=True, null=True)
    property_type = models.ForeignKey(MatterProperty, on_delete=models.DO_NOTHING, blank=True, null=True)
    ...
```

### 2.1 The Architectural "Mixins"
The sheer volume of compliance tracking in SnowfigIP is abstracted away from the raw schema via Django Inheritance (Mixins).
*   **`TimeStampedModel`**: Automatically injects `created` and `modified` UTC timestamps into the SQL table. No developer needs to remember to set `datetime.now()`.
*   **`LogAuditMixin` & `FieldTrackingMixin`**: This is hyper-critical. When `.save()` is called on a `Matter`, these mixins intercept the diff. If `status` changed from "Pending" to "Granted", the mixin automatically generates an un-deletable record in the `LogMatter` table documenting the exact user ID, timestamp, and the delta. 

### 2.2 Relational Guardrails
Notice `on_delete=models.DO_NOTHING` vs `on_delete=models.CASCADE`. 
In Intellectual Property, you cannot delete a `CaseType` (e.g., "Standard Patent") if 100,000 matters rely on it. The backend intentionally enforces `DO_NOTHING` or `PROTECT` on master configuration tables. Attempting to delete a core master table via the Admin portal will purposefully throw an `IntegrityError` to stop DB corruption.

## 3. The One-To-One "Extension" Tables (`MatterDates`)
If you inspect `Matter`, it lacks deadline fields (like `ipo_filing_date`, `grant_date`). Instead, it links to `MatterDates`:

```python
class MatterDates(StatusMixin, TimeStampedModel):
    matter = models.OneToOneField(Matter, on_delete=models.CASCADE, related_name="matter_dates")
    ipo_filing_date = models.DateField(blank=True, null=True)
    ipo_filing_due_date = models.DateField(blank=True, null=True)
    poa_filing_date = models.DateField(blank=True, null=True)
    poa_filing_due_date = models.DateField(blank=True, null=True)
    grant_date = models.DateField(blank=True, null=True)
    ...
```

*   **Why Abstract Dates?**: A standard IP record can possess upwards of 50 temporal events. If these were columns on the `Matter` table, a simple `SELECT * FROM matter limit 10` for displaying names on a dashboard would drag thousands of unused DateTime variables over the network wire.
*   **The Power of `related_name`**: Because the `OneToOneField` defines `related_name="matter_dates"`, a developer can easily call `my_matter.matter_dates.grant_date`. Behind the scenes, the Django ORM handles the massive `LEFT OUTER JOIN` cleanly.

## 4. Tracing the Foreign Key Web (`MatterParty`)
A matter does not exist in isolation. It belongs to an Applicant, has 3 Inventors, and is managed by a specific Patent Agent. This is mapped via `MatterParty`.

```python
class MatterParty(StatusMixin, TimeStampedModel):
    matter = models.ForeignKey(Matter, on_delete=models.CASCADE, related_name='matter_parties')
    party_type = models.ForeignKey(MatterPartyType, on_delete=models.DO_NOTHING)
    client = models.ForeignKey(Client, on_delete=models.CASCADE, null=True, blank=True)
    patent_agent = models.ForeignKey(User, on_delete=models.CASCADE, blank=True, null=True)
```
*   **The Orchestration:** Notice that `client` links to a model that exists entirely outside the `matter/` app. It points to `ipcms_new.corporate.models.Client`. Django's app-registration system organically weaves these isolated schemas together. 
*   **Safeguards:** `on_delete=models.CASCADE` on the `Matter` foreign key implies that if a Matter *is* ever deleted, all attached parties are instantly dropped from the DB, ensuring no orphaned party data litters the PostgreSQL system.

## 5. Connecting to the "Old World": Inprotech Integration
The `SFIP-Reports` service handles the dirty reality of large law firms: legacy systems.
*   The system routinely encounters raw `.sql` files inside the `Inprotech-Report-SQL-Queries` folder.
*   The `sfip_reports/app/generalized_field_mapper.py` operates as an active translator. It executes highly complex raw SQL using `pyodbc` against closed-source legacy database schemas (often running on MS SQL Server), renames obscure columns like `NME.NAMENO` to localized JSON formats, and pipes the cleaned results into Pandas DataFrames for user consumption or caching into the modern `ipcms_new` schema.
