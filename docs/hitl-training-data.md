# HITL Training Data Workflow

The HITL review queue can now produce task-specific records for OCR tuning and prompt regression. The export is intended for local Nemotron 3 Nano Omni improvement work and for validating cloud fallback behavior before using Qwen3.6 Super.

## Review Flow

1. Run ingestion with local primary and secondary providers configured for `layout_analysis`, `bbox_detection`, and `ocr_extraction`.
2. Let the pipeline flag pages when a critical stage fails, confidence is low, or native-text similarity is poor.
3. In Trials of Truth, correct the relevant tab:
   - Layout: corrected layout type and structural flags.
   - Regions: corrected bounding boxes and region labels.
   - Text or JSON: corrected OCR output.
4. Resolve the HITL item after the correction is saved.
5. Export `Training Data` from Trials of Truth for the selected status bucket.

## Export Shape

Each reviewed HITL item emits separate records for:

```text
layout_analysis
bbox_detection
ocr_extraction
```

Each record contains:

```json
{
  "task": "bbox_detection",
  "source": {
    "document_id": 1,
    "document_title": "Example Rulebook",
    "game_system": "Example",
    "page_id": 42,
    "page_number": 7,
    "image_url": "/api/pipeline/pages/..."
  },
  "input": {
    "image_url": "/api/pipeline/pages/..."
  },
  "model_output": [],
  "expected": []
}
```

The `expected` value uses the human correction when present. If a reviewer resolves an item as acceptable without corrections, the current pipeline output is exported as the accepted target.

## Use Cases

- Build a prompt regression corpus for layout and bbox changes.
- Build supervised examples for local OCR model tuning.
- Compare Nemotron primary, local secondary, and Qwen cloud fallback behavior on the same reviewed pages.
- Track which document layouts produce unstable boxes or layout labels.

## Tuning Notes

Keep layout and bbox examples separate from OCR text examples. Layout and region quality fails for different reasons than transcription quality, so mixing them into one training target makes the feedback weaker.

For bbox data, prefer reviewed pages with diverse structures: two-column prose, stat blocks, sidebars, tables, full-page art, page headers, page numbers, and mixed text/art pages.
