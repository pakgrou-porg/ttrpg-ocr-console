# HITL Training Data Workflow

The HITL review queue can now produce task-specific records for OCR tuning and prompt regression. The export is intended for local Nemotron 3 Nano Omni improvement work and for validating cloud fallback behavior before using Qwen3.6 Super.

## Review Flow

1. Run ingestion with local primary and secondary providers configured for `layout_analysis`, `bbox_detection`, and `ocr_extraction`.
2. Let the pipeline flag pages when a critical stage fails, confidence is low, or native-text similarity is poor.
3. In Trials of Truth, correct the relevant tab:
   - Layout: select the corrected page layout type and save it to the page record.
   - Regions: draw, move, resize, type, add, or delete bounding boxes and save them to the page record.
   - Text or JSON: corrected OCR output.
4. Re-run OCR extraction after saving layout or region corrections when the existing OCR should be regenerated from the curated page configuration. The `Save + OCR` action saves the active layout or region correction and retries only OCR extraction so the curated page configuration is preserved.
5. Resolve the HITL item after the correction is saved.
6. Export `Training Data` from Trials of Truth for the selected status bucket, or export a document page range by document ID and page range.

## Export Shape

Each exported page emits one page-level record with task-specific payloads for:

```text
layout_analysis
bbox_detection
ocr_extraction
```

Each page record contains:

```json
{
  "schema_version": "hitl_page_training_v1",
  "source": {
    "document_id": 1,
    "document_title": "Example Rulebook",
    "game_system": "Example",
    "page_id": 42,
    "page_number": 7,
    "image_url": "/api/pipeline/pages/...",
    "image_width": 1240,
    "image_height": 1754
  },
  "review": {
    "hitl_id": 99,
    "status": "resolved",
    "priority": "high",
    "reason": "Low confidence OCR result"
  },
  "labels": {
    "page_layout": { "layout_type": "body_text", "columns": 2 },
    "regions": [
      { "sequence": 1, "type": "header", "regionType": "header", "bbox": { "x": 8, "y": 3, "w": 84, "h": 8 } }
    ],
    "ocr_text": "Corrected text",
    "ocr_structured": {}
  },
  "tasks": {
    "layout_analysis": { "input": {}, "model_output": {}, "expected": {} },
    "bbox_detection": { "input": {}, "model_output": [], "expected": [] },
    "ocr_extraction": { "input": {}, "model_output": {}, "expected": {} }
  }
}
```

The `expected` value uses the human correction when present. If a reviewer resolves an item as acceptable without corrections, the current pipeline output is exported as the accepted target.

Document range exports include pages without HITL records. Those records have `"review": null` and still include page image, layout, bbox, OCR, and model trace fields when available.

## Use Cases

- Build a prompt regression corpus for layout and bbox changes.
- Build supervised examples for local OCR model tuning.
- Compare Nemotron primary, local secondary, and Qwen cloud fallback behavior on the same reviewed pages.
- Track which document layouts produce unstable boxes or layout labels.

## Tuning Notes

Keep layout and bbox examples separate from OCR text examples. Layout and region quality fails for different reasons than transcription quality, so mixing them into one training target makes the feedback weaker.

For bbox data, prefer reviewed pages with diverse structures: two-column prose, stat blocks, sidebars, tables, full-page art, page headers, page numbers, and mixed text/art pages.
