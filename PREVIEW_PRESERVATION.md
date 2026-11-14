# V1 Preview Preservation Documentation

## 1. V1 Source Files Inspected (Read-Only)
Before implementing `./version2`, the following V1 files in `../AM-Jwellers` were inspected without modification:
- `AM-Jwellers/src/components/ManufacturingWorksheetPreview.tsx` (409 lines): 400px live HTML job card preview.
- `AM-Jwellers/src/utils/manufacturingWorksheetGenerator.ts` (326 lines): `jsPDF` A4 portrait worksheet generator.
- `AM-Jwellers/src/utils/excelWorksheetGenerator.ts` (399 lines): `ExcelJS` worksheet generator.
- `AM-Jwellers/src/utils/billPreviewGenerator.ts` & `AM-Jwellers/src/components/BillPreview.tsx`: 9-column invoice HTML preview and summary box.
- `AM-Jwellers/src/components/BillTemplate.tsx`, `ModernBillTemplate.tsx`, `EnhancedBillTemplate.tsx`: A4 print templates.

## 2. Self-Contained V2 Copies & Adapters
All preview components inside `./version2` are completely self-contained (zero runtime imports from `../AM-Jwellers`):
- `src/components/previews/v1/ManufacturingWorksheetPreview.tsx`: Preserves exact 400px width, `Arial, sans-serif` 10px font, yellow `AM JEWELLARS` header, `FAILING`, `F PALISH`, `SETTING`, blue `AD` and `KL` rows, `WT-` red/blue weight badge, `TOTAL`, `FENESH WT`, `PALISH`, paired AD detail rows, and `TOTAL LOSS` footer.
- `src/components/previews/v1/manufacturingWorksheetGenerator.ts`: Preserves the V1 `jsPDF` generator.
- `src/components/previews/v1/BillPreview.tsx`: Preserves the V1 9-column bill layout and synthetic fixtures for Increment 2 billing.
- `src/lib/previews/v2-preview-adapter.ts`: Maps V2 `Order`, `Customer`, `PurityDefinition`, `OrderProcess`, and `adDetailsJson` records to the exact props expected by `ManufacturingWorksheetPreview`.

## 3. External QR Code Attachment Policy
- The original 400px `ManufacturingWorksheetPreview` DOM structure is **unchanged**.
- `src/components/previews/OrderQrAttachment.tsx` renders the scannable QR code (`APP_BASE_URL/production-register?order=<id>`) as an external footer below the 400px worksheet box so the original layout is never shrunk or rearranged.

## 4. Side-by-Side Comparison Route
- Visit **`http://localhost:3001/dev/preview-comparison`** to compare the raw V1 fixture and the V2 adapter output side-by-side and test browser Print/PDF output.

