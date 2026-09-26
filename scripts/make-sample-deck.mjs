// Builds samples/recall-sample.zip: a small deck in the exact "recall-v1" import format, with pictures.
// Run: npm run sample
import { mkdir, writeFile } from "node:fs/promises";
import JSZip from "jszip";
import sharp from "sharp";

const table = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="560" font-family="Helvetica,Arial,sans-serif">
<rect width="1200" height="560" fill="#fff"/><rect width="1200" height="90" fill="#1f3a68"/>
<text x="40" y="58" font-size="36" fill="#fff" font-weight="bold">S.A. vs S.L.</text>
<g font-size="28" fill="#222">
<text x="40" y="170" font-weight="bold">Minimum capital</text><text x="470" y="170">€60,000 (25% paid in)</text><text x="890" y="170">€3,000*</text>
<text x="40" y="260" font-weight="bold">Capital divided into</text><text x="470" y="260">acciones</text><text x="890" y="260">participaciones</text>
<text x="40" y="350" font-weight="bold">Transfer</text><text x="470" y="350">free (as a rule)</text><text x="890" y="350">restricted</text>
</g><line x1="40" y1="200" x2="1160" y2="200" stroke="#ddd"/><line x1="40" y1="290" x2="1160" y2="290" stroke="#ddd"/>
<text x="40" y="480" font-size="22" fill="#666">* Law 18/2022 allows €1 with safeguards.</text></svg>`;

const loop = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="460" font-family="Helvetica,Arial,sans-serif">
<rect width="1000" height="460" fill="#fff"/>
<g font-size="26" fill="#1f3a68" text-anchor="middle">
<rect x="40" y="170" width="200" height="110" rx="18" fill="#e8efff"/><text x="140" y="235">New</text>
<rect x="290" y="170" width="200" height="110" rx="18" fill="#fff3df"/><text x="390" y="235">Learning</text>
<rect x="540" y="170" width="200" height="110" rx="18" fill="#e3f8ee"/><text x="640" y="235">Review</text>
<rect x="760" y="30" width="200" height="110" rx="18" fill="#fde8ea"/><text x="860" y="95">Relearning</text>
</g><g stroke="#1f3a68" stroke-width="4" fill="none"><path d="M240 225h45M490 225h45"/><path d="M740 200 C800 170 820 150 830 140"/><path d="M780 140 C700 110 520 120 390 165"/></g>
<text x="500" y="400" font-size="22" fill="#666" text-anchor="middle">Again sends a review card to relearning; Good and Easy move it forward.</text></svg>`;

const unit1 = "Unit 01 – How RECALL works";
const unit3 = "Unit 03 – Capital Companies: Incorporation";

const deck = {
  format: "recall-v1",
  subject: "RECALL Sample",
  units: [
    { name: unit1, order: 1 },
    { name: unit3, order: 3 },
  ],
  cards: [
    {
      id: "sample-u01-buttons",
      unit: unit1,
      section: "A. Rating",
      front: "What do the four buttons mean?",
      back: "- **Again**: forgot, see it again in a few minutes\n- **Hard**: remembered with effort\n- **Good**: normal recall\n- **Easy**: instant, jump further ahead",
      front_image: null,
      back_image: null,
      tags: ["basics"],
      source: "RECALL sample",
    },
    {
      id: "sample-u01-keys",
      unit: unit1,
      section: "A. Rating",
      front: "Keyboard shortcuts on the laptop?",
      back: "**Space** show answer (then Good)\n**1 2 3 4** Again / Hard / Good / Easy\n**Z** undo",
      front_image: null,
      back_image: null,
      tags: ["basics"],
      source: "RECALL sample",
    },
    {
      id: "sample-u01-states",
      unit: unit1,
      section: "B. Scheduling",
      front: "Which stages does a card go through?",
      back: "New → Learning → Review, and back to **Relearning** when you press Again. Tap the picture to zoom.",
      front_image: null,
      back_image: "images/card-states.png",
      tags: ["basics"],
      source: "RECALL sample",
    },
    {
      id: "sample-bl1-u03-min-capital-sl",
      unit: unit3,
      section: "A. S.A. vs S.L.",
      front: "Minimum share capital of an **S.L.**?",
      back: "**€3,000** (course). Law 18/2022 allows €1 with safeguards.",
      front_image: null,
      back_image: "images/sa-vs-sl-table.png",
      tags: ["exam", "case-study-1"],
      source: "Unit 3 slides",
    },
    {
      id: "sample-bl1-u03-min-capital-sa",
      unit: unit3,
      section: "A. S.A. vs S.L.",
      front: "Minimum share capital of an **S.A.**, and how much must be paid in at incorporation?",
      back: "**€60,000**, with at least **25%** of each share's nominal value paid in.",
      front_image: null,
      back_image: null,
      tags: ["exam"],
      source: "Unit 3 slides",
    },
    {
      id: "sample-bl1-u03-table",
      unit: unit3,
      section: "A. S.A. vs S.L.",
      front: "What does this table compare? Name one difference.",
      back: "The two capital companies, **S.A.** and **S.L.**, e.g. minimum capital €60,000 vs €3,000.",
      front_image: "images/sa-vs-sl-table.png",
      back_image: null,
      tags: ["case-study-1"],
      source: "Unit 3 slides",
    },
    {
      id: "sample-bl1-u03-shares",
      unit: unit3,
      section: "B. Shares",
      front: "What is the capital of an S.A. and of an S.L. divided into?",
      back: "- S.A.: **acciones**\n- S.L.: **participaciones sociales**",
      front_image: null,
      back_image: null,
      tags: [],
      source: "Unit 3 slides",
    },
  ],
};

const zip = new JSZip();
zip.file("cards.json", JSON.stringify(deck, null, 2));
zip.file("images/sa-vs-sl-table.png", await sharp(Buffer.from(table)).png().toBuffer());
zip.file("images/card-states.png", await sharp(Buffer.from(loop)).png().toBuffer());
await mkdir(new URL("../samples/", import.meta.url), { recursive: true });
await writeFile(new URL("../samples/recall-sample.zip", import.meta.url), await zip.generateAsync({ type: "uint8array" }));
console.log("Wrote samples/recall-sample.zip");
