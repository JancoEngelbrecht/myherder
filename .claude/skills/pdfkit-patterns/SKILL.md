---
name: pdfkit-patterns
description: Load when generating PDF reports. Covers document creation, text formatting, layout, streaming, page numbering, and report patterns. Sources — pdfkit official docs (pdfkit.org).
---

# PDFKit Report Patterns

Official documentation references:
- Getting started: https://pdfkit.org/docs/getting_started.html
- Text: https://pdfkit.org/docs/text.html
- Images: https://pdfkit.org/docs/images.html

---

## 1. Document Creation

```js
const PDFDocument = require('pdfkit')
const fs = require('fs')

const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 50, bottom: 50, left: 72, right: 72 },
  bufferPages: true,  // enable if you need page numbers
  info: {
    Title: 'Monthly Report',
    Author: 'System'
  }
})
```

### Key options

- `autoFirstPage: false` — delay first page if you need custom setup
- `bufferPages: true` — required for retroactive page editing (headers/footers/numbering)
- `size` — 'A4', 'LETTER', or `[width, height]` in points

---

## 2. Streaming Output

PDFDocument is a readable Node stream. Always pipe before adding content:

### To file

```js
doc.pipe(fs.createWriteStream('output.pdf'))
// ... add content ...
doc.end()
```

### To HTTP response (Express)

```js
res.setHeader('Content-Type', 'application/pdf')
res.setHeader('Content-Disposition', 'attachment; filename="report.pdf"')
doc.pipe(res)
// ... add content ...
doc.end()
```

### To buffer (for email attachments, storage, etc.)

```js
const chunks = []
doc.on('data', chunk => chunks.push(chunk))
doc.on('end', () => {
  const buffer = Buffer.concat(chunks)
  // use buffer
})
// ... add content ...
doc.end()
```

---

## 3. Text Formatting

```js
// Basic text — auto-wraps within margins, auto-paginates
doc.text('Hello world')

// Positioned text
doc.text('Positioned', 100, 200)

// Styled text
doc.fontSize(16).font('Helvetica-Bold').text('Title')
doc.fontSize(12).font('Helvetica').text('Body text')

// Alignment
doc.text('Centered text', { align: 'center' })
doc.text('Right aligned', { align: 'right' })
doc.text('Justified paragraph text here...', { align: 'justify' })
```

### Inline style changes (continued text)

```js
doc.font('Helvetica-Bold').text('Bold part ', { continued: true })
doc.font('Helvetica').text('normal part.')
```

### Spacing

```js
doc.text('Paragraph one', { paragraphGap: 10 })
doc.text('Paragraph two')
doc.moveDown(2)  // move down 2 lines
doc.text('After gap')
```

### Lists

```js
doc.list(['Item one', 'Item two', 'Item three'], {
  bulletRadius: 2,
  textIndent: 20
})

// Nested lists
doc.list([
  'Item one',
  ['Sub-item A', 'Sub-item B'],
  'Item three'
])
```

---

## 4. Built-in Fonts

Available without embedding: `Courier`, `Courier-Bold`, `Courier-Oblique`, `Courier-BoldOblique`, `Helvetica`, `Helvetica-Bold`, `Helvetica-Oblique`, `Helvetica-BoldOblique`, `Times-Roman`, `Times-Bold`, `Times-Italic`, `Times-BoldItalic`, `Symbol`, `ZapfDingbats`.

For custom fonts, embed TTF/OTF files:

```js
doc.registerFont('CustomFont', 'path/to/font.ttf')
doc.font('CustomFont').text('Custom font text')
```

---

## 5. Page Management

```js
// Add a new page
doc.addPage()

// Add page with custom options
doc.addPage({ size: 'A4', layout: 'landscape' })

// Listen for new pages (useful for headers/footers)
doc.on('pageAdded', () => {
  doc.fontSize(8).text('Header text', 72, 30)
})
```

---

## 6. Page Numbers (buffered pages)

Requires `bufferPages: true` at creation:

```js
const doc = new PDFDocument({ bufferPages: true })
doc.pipe(fs.createWriteStream('output.pdf'))

// ... add all content ...

// After all content, add page numbers
const range = doc.bufferedPageRange()
for (let i = range.start; i < range.start + range.count; i++) {
  doc.switchToPage(i)
  doc.fontSize(8).text(
    `Page ${i + 1} of ${range.count}`,
    72, doc.page.height - 40,
    { align: 'center', width: doc.page.width - 144 }
  )
}

doc.end()
```

---

## 7. Report Generation Pattern

```js
function generateReport (res, data) {
  const doc = new PDFDocument({ bufferPages: true, size: 'A4' })

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="report.pdf"`)
  doc.pipe(res)

  // Title
  doc.fontSize(20).font('Helvetica-Bold').text('Report Title', { align: 'center' })
  doc.moveDown()

  // Metadata
  doc.fontSize(10).font('Helvetica')
    .text(`Generated: ${new Date().toLocaleDateString()}`)
  doc.moveDown(2)

  // Table-like layout using columns
  const startX = 72
  const colWidths = [150, 100, 100, 100]

  // Header row
  doc.font('Helvetica-Bold').fontSize(10)
  doc.text('Name', startX, doc.y, { width: colWidths[0], continued: false })
  // ... repeat for columns

  // Data rows
  doc.font('Helvetica').fontSize(9)
  for (const row of data) {
    const y = doc.y
    doc.text(row.name, startX, y, { width: colWidths[0] })
    doc.text(row.value, startX + colWidths[0], y, { width: colWidths[1] })
    doc.moveDown()
  }

  // Add page numbers last
  addPageNumbers(doc)

  doc.end()
}
```

---

## 8. Common Pitfalls

- Always `pipe()` before adding content — content streams as you write it
- Always call `doc.end()` to finalize — without it, the stream never closes
- `bufferPages` uses more memory — only enable when needed (page numbers, headers)
- Text auto-wraps and auto-paginates — don't manually check page bounds for flowing text
- Position tracking is automatic — `doc.y` gives current vertical position
- Images must be loaded synchronously or awaited before `doc.end()`
