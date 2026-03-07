---
name: exceljs-patterns
description: Load when generating Excel reports. Covers workbook creation, cell formatting, styling, streaming large files, and HTTP response patterns. Sources — exceljs official docs (github.com/exceljs/exceljs).
---

# ExcelJS Report Patterns

Official documentation: https://github.com/exceljs/exceljs

---

## 1. Workbook & Worksheet Creation

```js
const ExcelJS = require('exceljs')

const workbook = new ExcelJS.Workbook()
workbook.creator = 'System'
workbook.created = new Date()

const sheet = workbook.addWorksheet('Report', {
  views: [{ state: 'frozen', ySplit: 1 }],  // freeze header row
  pageSetup: { paperSize: 9, orientation: 'landscape' }  // A4 landscape
})
```

---

## 2. Column Definitions

Define columns with keys for object-based row insertion:

```js
sheet.columns = [
  { header: 'ID', key: 'id', width: 10 },
  { header: 'Name', key: 'name', width: 30 },
  { header: 'Email', key: 'email', width: 40 },
  { header: 'Amount', key: 'amount', width: 15, style: { numFmt: '#,##0.00' } }
]
```

---

## 3. Adding Data

```js
// Single row (object — uses column keys)
sheet.addRow({ id: 1, name: 'Jane', email: 'jane@example.com', amount: 1250.50 })

// Single row (array — positional)
sheet.addRow([2, 'John', 'john@example.com', 800.00])

// Multiple rows
sheet.addRows([
  { id: 3, name: 'Alice', amount: 950.00 },
  { id: 4, name: 'Bob', amount: 1100.00 }
])
```

---

## 4. Cell Formatting & Styling

### Number formats

```js
sheet.getCell('D2').numFmt = '#,##0.00'     // currency
sheet.getCell('E2').numFmt = 'yyyy-mm-dd'   // date
sheet.getCell('F2').numFmt = '0%'           // percentage
```

### Font styling

```js
cell.font = {
  name: 'Arial',
  size: 12,
  bold: true,
  color: { argb: 'FFFF0000' }  // red
}
```

### Alignment

```js
cell.alignment = {
  horizontal: 'center',
  vertical: 'middle',
  wrapText: true
}
```

### Fill (background color)

```js
cell.fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF366092' }  // dark blue
}
```

### Borders

```js
cell.border = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' }
}
```

---

## 5. Header Row Styling Pattern

```js
const headerRow = sheet.getRow(1)
headerRow.eachCell(cell => {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF366092' } }
  cell.alignment = { horizontal: 'center' }
  cell.border = {
    bottom: { style: 'medium', color: { argb: 'FF000000' } }
  }
})
```

---

## 6. Formulas & Summary Rows

```js
const lastDataRow = sheet.lastRow.number

// Add summary row
const summaryRow = sheet.addRow({
  name: 'TOTAL',
  amount: { formula: `SUM(D2:D${lastDataRow})` }
})
summaryRow.font = { bold: true }
```

---

## 7. Merged Cells

```js
sheet.mergeCells('A1:D1')
sheet.getCell('A1').value = 'Report Title'
sheet.getCell('A1').alignment = { horizontal: 'center' }
sheet.getCell('A1').font = { size: 16, bold: true }
```

---

## 8. Data Validation

```js
sheet.dataValidations.add('C2:C100', {
  type: 'list',
  formulae: ['"Active,Inactive,Pending"'],
  showErrorMessage: true,
  errorTitle: 'Invalid Status',
  error: 'Choose from the list'
})
```

---

## 9. Conditional Formatting

```js
sheet.addConditionalFormatting({
  ref: 'D2:D100',
  rules: [{
    type: 'cellIs',
    operator: 'lessThan',
    formulae: [0],
    style: {
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } },
      font: { color: { argb: 'FFFFFFFF' } }
    }
  }]
})
```

---

## 10. Auto-fit Column Widths

ExcelJS doesn't auto-fit natively. Use this pattern:

```js
sheet.columns.forEach(column => {
  let maxLength = column.header ? column.header.length : 10
  column.eachCell({ includeEmpty: false }, cell => {
    const length = cell.value ? cell.value.toString().length : 0
    if (length > maxLength) maxLength = length
  })
  column.width = Math.min(maxLength + 2, 50)  // cap at 50
})
```

---

## 11. Output Patterns

### Write to file

```js
await workbook.xlsx.writeFile('report.xlsx')
```

### Write to HTTP response (Express)

```js
res.setHeader(
  'Content-Type',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
)
res.setHeader('Content-Disposition', 'attachment; filename="report.xlsx"')
await workbook.xlsx.write(res)
```

### Write to buffer

```js
const buffer = await workbook.xlsx.writeBuffer()
```

---

## 12. Streaming for Large Files

For datasets with 10k+ rows, use the streaming writer to avoid memory issues:

```js
const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
  filename: 'large-report.xlsx'
})
const sheet = workbook.addWorksheet('Data')

sheet.columns = [
  { header: 'ID', key: 'id', width: 10 },
  { header: 'Name', key: 'name', width: 30 }
]

for (const row of largeDataset) {
  sheet.addRow(row).commit()  // commit flushes each row to disk
}

sheet.commit()
await workbook.commit()
```

When streaming to HTTP response:

```js
const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res })
```

---

## 13. Sheet Protection

```js
await sheet.protect('password', {
  selectLockedCells: true,
  selectUnlockedCells: true,
  formatCells: false,
  formatColumns: false
})
```

---

## 14. Report Generation Pattern

```js
async function generateExcelReport (res, data, title) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Report', {
    views: [{ state: 'frozen', ySplit: 2 }]
  })

  // Title row
  sheet.mergeCells('A1:E1')
  const titleCell = sheet.getCell('A1')
  titleCell.value = title
  titleCell.font = { size: 16, bold: true }
  titleCell.alignment = { horizontal: 'center' }

  // Column definitions (row 2 becomes header)
  sheet.getRow(2).values = ['ID', 'Name', 'Date', 'Status', 'Amount']
  sheet.columns = [
    { key: 'id', width: 10 },
    { key: 'name', width: 30 },
    { key: 'date', width: 15 },
    { key: 'status', width: 15 },
    { key: 'amount', width: 15 }
  ]

  // Style header row
  const headerRow = sheet.getRow(2)
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF366092' } }
  })

  // Data rows
  data.forEach(item => {
    const row = sheet.addRow(item)
    row.getCell('date').numFmt = 'yyyy-mm-dd'
    row.getCell('amount').numFmt = '#,##0.00'
  })

  // Auto-fit columns
  sheet.columns.forEach(column => {
    let maxLength = 10
    column.eachCell({ includeEmpty: false }, cell => {
      const len = cell.value ? cell.value.toString().length : 0
      if (len > maxLength) maxLength = len
    })
    column.width = Math.min(maxLength + 2, 50)
  })

  // Write to response
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${title}.xlsx"`)
  await workbook.xlsx.write(res)
}
```

---

## 15. Common Pitfalls

- ARGB colors are 8 characters: `FF` (alpha) + `RRGGBB` — e.g. `'FFFF0000'` for red
- Row/column indices are 1-based, not 0-based
- `addRow()` returns the row object — use it for immediate styling
- Streaming writer requires `.commit()` on rows, sheets, and the workbook
- `writeBuffer()` and `writeFile()` are async — always await them
- Column `key` must match object property names for object-based `addRow()`
