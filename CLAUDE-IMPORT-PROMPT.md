# Prompt for making RECALL import files

Paste this into the Claude chat where you upload your lecture PDFs (fill in the subject and unit).

---

Turn the attached lecture material into flashcards for my app RECALL. Give me a downloadable **.zip** that contains
`cards.json` and an `images/` folder (only if a picture really helps, e.g. a table or diagram from the slides).

`cards.json` must follow exactly this format:

```json
{
  "format": "recall-v1",
  "subject": "Business Law I",
  "units": [ { "name": "Unit 03 – Capital Companies: Incorporation", "order": 3 } ],
  "cards": [
    {
      "id": "bl1-u03-min-capital-sl",
      "unit": "Unit 03 – Capital Companies: Incorporation",
      "section": "A. S.A. vs S.L.",
      "front": "Minimum share capital of an **S.L.**?",
      "back": "**€3,000** (course). Law 18/2022 allows €1 with safeguards.",
      "front_image": null,
      "back_image": "images/sa-vs-sl-table.png",
      "tags": ["exam", "case-study-1"],
      "source": "Unit 3 slides"
    }
  ]
}
```

Rules:
- Subject: **[SUBJECT, e.g. Business Law I]**. Unit: **[UNIT NAME]**, order **[NUMBER]**. Use the exact same subject and unit names every time.
- `id`: short, stable and unique, like `bl1-u03-<topic>`. Never reuse an id for a different question (re-importing the same id updates that card).
- `section`: the slide section, e.g. "A. S.A. vs S.L.".
- One fact per card. Front = a clear question. Back = a short answer.
- In the back, put the **key terms in bold**: the concepts, numbers and article references (e.g. **Art. 58 LSC**).
  My brain-dump check uses the bold words, numbers and article references to see what I remembered.
- Markdown only: **bold**, *italic*, lists with "- ". No HTML.
- Tags (lowercase, with hyphens):
  - `exam` for anything the professor marked as exam-relevant or that is likely to be asked,
  - `case-study-1`, `case-study-2`, … for cards needed for that case study,
  - otherwise no tag.
- Pictures: PNG or JPG in `images/`, referenced as `"images/<file>"`; `null` when there is none.
