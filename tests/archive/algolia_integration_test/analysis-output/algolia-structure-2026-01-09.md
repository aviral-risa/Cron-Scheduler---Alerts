# Algolia Order JSON Structure Analysis

**Analysis Date:** 2026-01-09
**Total Orders Analyzed:** 3,412
**Facilities:** 4

## Facility Breakdown

| Facility | Facility ID | Order Count |
|----------|-------------|-------------|
| NYCBS | HhwIHO4npKhrxyylkC33 | 1,359 |
| MBPCC | 3GKbZtgpPru1vJGCkxwR | 1,313 |
| CHC/CHCU | 4BlQ4SsqAVTDgFKApKZr | 475 |
| UCBC/CBC | W14MolgUu7OYvX4CFQJn | 265 |

## Field Analysis

**Total Unique Fields:** 105

### Fields Always Present (64)

| Field Name | Present | Type(s) | Sample Values | Unique Values | Description |
|------------|---------|---------|---------------|---------------|-------------|
| `objectID` | 100.0% | string | ee6d81e5-100f-45e0-821a-6a4c1c..., ed125f94-df67-4b1f-8f47-0d08c5..., 7d379744-11d9-4400-b021-b0a33d... | 1000+ | Algolia unique identifier for the document |
| `_highlightResult` | 100.0% | object | {"assigned_to":{"value":"i2kq2..., {"assigned_to":{"value":"unass..., {"assigned_to":{"value":"5ycly... | 1000+ | Algolia search highlighting results |
| `_highlightResult.assigned_to` | 100.0% | object | {"value":"i2kq2DqPnCe6otzBscWF..., {"value":"unassigned","matchLe..., {"value":"5yclyafYgYaZXdAVqXSn... | 37 | - |
| `_highlightResult.assigned_to.value` | 100.0% | string | i2kq2DqPnCe6otzBscWFSge5kd72, unassigned, 5yclyafYgYaZXdAVqXSnrbdzRXK2, tnco9I2B6YNmLdBJefIOIeFYSmZ2... | 37 | - |
| `_highlightResult.assigned_to.matchLevel` | 100.0% | string | none | 1 | - |
| `_highlightResult.assigned_to.matchedWords` | 100.0% | array | []..., []..., []..., []..., []... | 1 | - |
| `_highlightResult.assigned_to_name` | 100.0% | object | {"value":"Risa Agent","matchLe..., {"value":"unassigned","matchLe..., {"value":"Ankita","matchLevel"... | 37 | - |
| `_highlightResult.assigned_to_name.value` | 100.0% | string | Risa Agent, unassigned, Ankita, sivaparvathy, Chandra Lekha | 37 | - |
| `_highlightResult.assigned_to_name.matchLevel` | 100.0% | string | none | 1 | - |
| `_highlightResult.assigned_to_name.matchedWords` | 100.0% | array | []..., []..., []..., []..., []... | 1 | - |
| `_highlightResult.location` | 100.0% | object | {"value":"U - BKLYN - 11th FL ..., {"value":"*MED/ONC - East Isli..., {"value":"*MED/ONC - New Hyde ... | 97 | - |
| `_highlightResult.location.value` | 100.0% | string | U - BKLYN - 11th FL - 175 Rems..., *MED/ONC - East Islip - 136 E ..., *MED/ONC - New Hyde Park - 1 D... | 97 | - |
| `_highlightResult.location.matchLevel` | 100.0% | string | none | 1 | - |
| `_highlightResult.location.matchedWords` | 100.0% | array | []..., []..., []..., []..., []... | 1 | - |
| `_highlightResult.practitioner_name` | 100.0% | object | {"value":"Edward Zoltan, MD","..., {"value":"Maxine Epstein, PA",..., {"value":"Jahan Aghalar MD","m... | 298 | - |
| `_highlightResult.practitioner_name.value` | 100.0% | string | Edward Zoltan, MD, Maxine Epstein, PA, Jahan Aghalar MD, Gerry Rubin MD, Visaharan Sivasubramaniam, ... | 298 | - |
| `_highlightResult.practitioner_name.matchLevel` | 100.0% | string | none | 1 | - |
| `_highlightResult.practitioner_name.matchedWords` | 100.0% | array | []..., []..., []..., []..., []... | 1 | - |
| `_highlightResult.regimen_name` | 100.0% | object | {"value":"UROLOGY: TESTOPEL- T..., {"value":"Venofer 200mg IV x 5..., {"value":"5-FU 400mg/m2 IVP + ... | 1000+ | - |
| `_highlightResult.regimen_name.value` | 100.0% | string | UROLOGY: TESTOPEL- Testosteron..., Venofer 200mg IV x 5 doses, 5-FU 400mg/m2 IVP + 5-FU 2400m..., Ar... | 1000+ | - |
| `_highlightResult.regimen_name.matchLevel` | 100.0% | string | none | 1 | - |
| `_highlightResult.regimen_name.matchedWords` | 100.0% | array | []..., []..., []..., []..., []... | 1 | - |
| `_highlightResult.patient_id` | 100.0% | object | {"value":"6864372","matchLevel..., {"value":"6885477","matchLevel..., {"value":"7789552","matchLevel... | 1000+ | - |
| `_highlightResult.patient_id.value` | 100.0% | string | 6864372, 6885477, 7789552, 6873608, 7759484 | 1000+ | - |
| `_highlightResult.patient_id.matchLevel` | 100.0% | string | none | 1 | - |
| `_highlightResult.patient_id.matchedWords` | 100.0% | array | []..., []..., []..., []..., []... | 1 | - |
| `_highlightResult.ev_bv_primary` | 100.0% | object | {"value":"completed","matchLev..., {"value":"completed","matchLev..., {"value":"completed","matchLev... | 9 | - |
| `_highlightResult.ev_bv_primary.value` | 100.0% | string | completed, field_validation_error, in_progress, request_error, communication_error,_retrying | 9 | - |
| `_highlightResult.ev_bv_primary.matchLevel` | 100.0% | string | none | 1 | - |
| `_highlightResult.ev_bv_primary.matchedWords` | 100.0% | array | []..., []..., []..., []..., []... | 1 | - |
| `_highlightResult.last_name` | 100.0% | object | {"value":"MOROZOW","matchLevel..., {"value":"AMAYA","matchLevel":..., {"value":"BOSAK","matchLevel":... | 1000+ | - |
| `_highlightResult.last_name.value` | 100.0% | string | MOROZOW, AMAYA, BOSAK, MAJID, STOCKS | 1000+ | - |
| `_highlightResult.last_name.matchLevel` | 100.0% | string | none | 1 | - |
| `_highlightResult.last_name.matchedWords` | 100.0% | array | []..., []..., []..., []..., []... | 1 | - |
| `_highlightResult.first_name` | 100.0% | object | {"value":"CHONON","matchLevel"..., {"value":"SONIA","matchLevel":..., {"value":"GLENN","matchLevel":... | 1000+ | - |
| `_highlightResult.first_name.value` | 100.0% | string | CHONON, SONIA, GLENN, ABIDA, ZINA | 1000+ | - |
| `_highlightResult.first_name.matchLevel` | 100.0% | string | none | 1 | - |
| `_highlightResult.first_name.matchedWords` | 100.0% | array | []..., []..., []..., []..., []... | 1 | - |
| `id` | 100.0% | string | ee6d81e5-100f-45e0-821a-6a4c1c..., ed125f94-df67-4b1f-8f47-0d08c5..., 7d379744-11d9-4400-b021-b0a33d... | 1000+ | Order ID (same as order_id) |
| `created_at` | 100.0% | number | 1767939819, 1767939818, 1767939817, 1767939816, 1767939815 | 525 | Unix timestamp when order was created |
| `created_at_iso` | 100.0% | string | 2026-01-09 06:23:39.109334+00:..., 2026-01-09 06:23:39.324308+00:..., 2026-01-09 06:23:39.738858+00:... | 1000+ | ISO 8601 timestamp when order was created |
| `indexed_at` | 100.0% | number | 1767942988, 1767942979, 1767970219, 1767963473, 1767940433 | 1000+ | Unix timestamp when indexed in Algolia |
| `indexed_at_iso` | 100.0% | string | 2026-01-09T07:16:28.386999Z, 2026-01-09T07:16:19.305066Z, 2026-01-09T14:50:19.617004Z, 2026-01-09T12... | 1000+ | ISO 8601 timestamp when indexed in Algolia |
| `assigned_to` | 100.0% | string | i2kq2DqPnCe6otzBscWFSge5kd72, unassigned, 5yclyafYgYaZXdAVqXSnrbdzRXK2, tnco9I2B6YNmLdBJefIOIeFYSmZ2... | 37 | User ID of the person assigned to this order |
| `assigned_to_name` | 100.0% | string | Risa Agent, unassigned, Ankita, sivaparvathy, Chandra Lekha | 37 | Name of the person assigned to this order |
| `primary_member_id` | 100.0% | string | 74476973400, 74116066800, 74485855800, 74331285300, 74422041200 | 1000+ | Insurance member ID |
| `primary_payer_name` | 100.0% | string | Fidelis Care, Fidelis Medicare Claims, Fidelis Care Ny (533), Healthfirst Medicaid, HealthFirst Esse... | 124 | Name of primary insurance payer |
| `primary_status` | 100.0% | string | completed, field_validation_error, in_progress, request_error, communication_error,_retrying | 8 | Primary workflow status |
| `service_type` | 100.0% | string | 78 | 1 | Type of medical service |
| `location` | 100.0% | string | U - BKLYN - 11th FL - 175 Rems..., *MED/ONC - East Islip - 136 E ..., *MED/ONC - New Hyde Park - 1 D... | 97 | Service location |
| `order_id` | 100.0% | string | ee6d81e5-100f-45e0-821a-6a4c1c..., ed125f94-df67-4b1f-8f47-0d08c5..., 7d379744-11d9-4400-b021-b0a33d... | 1000+ | Unique identifier for the medical order |
| `practitioner_name` | 100.0% | string | Edward Zoltan, MD, Maxine Epstein, PA, Jahan Aghalar MD, Gerry Rubin MD, Visaharan Sivasubramaniam, ... | 298 | Name of the prescribing practitioner |
| `regimen_name` | 100.0% | string | UROLOGY: TESTOPEL- Testosteron..., Venofer 200mg IV x 5 doses, 5-FU 400mg/m2 IVP + 5-FU 2400m..., Ar... | 1000+ | Name of the treatment regimen |
| `date_of_service` | 100.0% | number | 1770163200, 1770076800, 1769990400, 1770681600, 1769731200 | 28 | Unix timestamp of service date |
| `date_of_service_iso` | 100.0% | string | 02/04/2026, 02/03/2026, 02/02/2026, 02/10/2026, 01/30/2026 | 28 | ISO 8601 date of service |
| `org_id` | 100.0% | string | HhwIHO4npKhrxyylkC33, 3GKbZtgpPru1vJGCkxwR, 4BlQ4SsqAVTDgFKApKZr, W14MolgUu7OYvX4CFQJn | 4 | Organization/Facility ID |
| `patient_id` | 100.0% | string | 6864372, 6885477, 7789552, 6873608, 7759484 | 1000+ | Unique identifier for the patient |
| `ev_bv_primary` | 100.0% | string | completed, field_validation_error, in_progress, request_error, communication_error,_retrying | 9 | Primary EV/BV status |
| `patient_fhir_identifier` | 100.0% | string | PD--01423674247294890--1.GH--C..., PD--08111671678914710--1.GH--C..., PD--05XZ82TCQZ9X66M3DT2H.GH--C... | 1000+ | FHIR identifier for the patient |
| `date_of_birth` | 100.0% | string | 1970-08-03, 1977-02-28, 1964-05-11, 1976-05-13, 1962-12-17 | 1000+ | Patient date of birth |
| `last_name` | 100.0% | string | MOROZOW, AMAYA, BOSAK, MAJID, STOCKS | 1000+ | Patient last name |
| `first_name` | 100.0% | string | CHONON, SONIA, GLENN, ABIDA, ZINA | 1000+ | Patient first name |
| `alert_badges` | 100.0% | array | []..., []..., []..., []..., []... | 8 | Array of alert badge identifiers |
| `alerts` | 100.0% | array | []..., []..., []..., []..., []... | 502 | Array of alert objects |

### Fields Usually Present (≥50%, 31)

| Field Name | Present | Type(s) | Sample Values | Unique Values | Description |
|------------|---------|---------|---------------|---------------|-------------|
| `_highlightResult.bo_status` | 99.8% | object | {"value":"Not Applicable","mat..., {"value":"AuthMate","matchLeve..., {"value":"Authorized","matchLe... | 15 | - |
| `_highlightResult.bo_status.value` | 99.8% | string | Not Applicable, AuthMate, Authorized, Financial, POD - Verify | 15 | - |
| `_highlightResult.bo_status.matchLevel` | 99.8% | string | none | 1 | - |
| `_highlightResult.bo_status.matchedWords` | 99.8% | array | []..., []..., []..., []..., []... | 1 | - |
| `document_upload_status` | 99.8% | string | not_initiated, Success, (empty), Error | 4 | Status of document uploads |
| `ev_write_back_status` | 99.8% | string | not_initiated, Success, Error, (empty) | 4 | Eligibility Verification write-back status |
| `bo_status` | 99.8% | string | Not Applicable, AuthMate, Authorized, Financial, POD - Verify | 15 | Benefits/Benefits Office status |
| `master_auth_status` | 99.8% | string | urology, new, no_auth_required, auth_on_file, auth_required | 24 | Primary authorization status of the order |
| `mark_as_completed` | 99.7% | boolean | false, true | 2 | Flag indicating if order is marked complete |
| `_highlightResult.auth_on_file_status` | 99.7% | object | {"value":"completed","matchLev..., {"value":"completed","matchLev..., {"value":"completed","matchLev... | 4 | - |
| `_highlightResult.auth_on_file_status.value` | 99.7% | string | completed, error, initiated, in_progress | 4 | - |
| `_highlightResult.auth_on_file_status.matchLevel` | 99.7% | string | none | 1 | - |
| `_highlightResult.auth_on_file_status.matchedWords` | 99.7% | array | []..., []..., []..., []..., []... | 1 | - |
| `auth_on_file_status` | 99.7% | string | completed, error, initiated, in_progress | 4 | Status of authorization on file |
| `auth_on_file_updated_at` | 99.7% | string | 2026-01-09T07:16:28.225772+00:..., 2026-01-09T07:16:19.170695+00:..., 2026-01-09T06:29:01.432714+00:... | 1000+ | Last update timestamp for auth on file |
| `financial_review` | 99.7% | string | new | 1 | Financial review status |
| `order_creation` | 99.7% | string | completed | 1 | Order creation status |
| `_highlightResult.auth_status` | 92.8% | object | {"value":"urology","matchLevel..., {"value":"auth_required","matc..., {"value":"no_auth_required","m... | 24 | - |
| `_highlightResult.auth_status.value` | 92.8% | string | urology, auth_required, no_auth_required, auth_on_file, patient_owned_drug | 24 | - |
| `_highlightResult.auth_status.matchLevel` | 92.8% | string | none | 1 | - |
| `_highlightResult.auth_status.matchedWords` | 92.8% | array | []..., []..., []..., []..., []... | 1 | - |
| `auth_status` | 92.8% | string | urology, auth_required, no_auth_required, auth_on_file, patient_owned_drug | 24 | Current authorization status |
| `medical_order_status` | 92.8% | string | order_completed_by_agent, yet_to_start_work_on_order, order_completed_by_human, order_in_progress | 4 | Overall medical order status |
| `regimen_type` | 92.4% | string | multi_agent, single_agent | 2 | Type of treatment regimen |
| `primary_active` | 82.9% | string | active coverage, -, Active Coverage, Inactive Coverage, Coverage Unknown | 7 | Whether primary insurance is active |
| `auth_on_file_error_type` | 55.7% | string | refresh_error, visit_date_content_not_found, regimen_not_found | 3 | Type of auth on file error |
| `auth_on_file_error_message` | 55.7% | string | Error refreshing auth data: No..., Error refreshing auth data: No..., Error refreshing auth data: No... | 1000+ | Error message for auth on file |
| `nar_check_status` | 50.5% | string | completed | 1 | NAR (Narcotic Authorization Request) check status |
| `date_of_work` | 50.4% | number | 1767940119, 1767969985, 1767963259, 1767963190, 1767963017 | 1000+ | Unix timestamp for the date work was performed |
| `date_of_work_iso` | 50.4% | string | 2026-01-09T06:28:39.352682+00:..., 2026-01-09T14:46:25.823311+00:..., 2026-01-09T12:54:19.159182+00:... | 1000+ | ISO 8601 date when work was performed |
| `updated_at` | 50.3% | string | 2026-01-09T07:16:25.095984+00:..., 2026-01-09T14:50:16.186517+00:..., 2026-01-09T12:57:50.211082+00:... | 1000+ | Last update timestamp |

### Fields Sometimes Present (<50%, 10)

| Field Name | Present | Type(s) | Sample Values | Unique Values | Description |
|------------|---------|---------|---------------|---------------|-------------|
| `assigned_at` | 46.5% | number | 1767960355, 1767962146, 1767962555, 1767962502, 1767990656 | 148 | Unix timestamp when order was assigned |
| `assigned_at_iso` | 46.5% | string | 2026-01-09T12:05:55.216000+00:..., 2026-01-09T12:35:46.772000+00:..., 2026-01-09T12:42:35.693000+00:... | 149 | ISO 8601 timestamp when order was assigned |
| `ev_bv_secondary` | 36.4% | string | ev_type_not_supported, completed, in_progress, pinf, request_error | 8 | - |
| `ai_agent_type` | 30.0% | string | human | 1 | Type of AI agent used (if any) |
| `health_first_nar_rpa_status` | 9.0% | string | Error, Success | 2 | - |
| `ev_bv_tertiary` | 5.8% | string | ev_type_not_supported, request_error, completed, error, pinf | 7 | - |
| `date_of_hold_until` | 0.5% | number | 1768348800, 1768780800, 1769472000, 1768176000, 1768003200 | 8 | - |
| `date_of_hold_until_iso` | 0.5% | string | 2026-01-14T00:00:00.000000+00:..., 2026-01-19T00:00:00.000000+00:..., 2026-01-27T00:00:00.000000+00:... | 8 | - |
| `submission` | 0.1% | string | in_progress, completed | 2 | - |
| `fax_submission_status` | 0.1% | string | in_progress, completed | 2 | - |

