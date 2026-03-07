---
name: chartjs-patterns
description: Load when building charts with Chart.js. Covers chart configuration, Vue integration with vue-chartjs, the annotation plugin, performance optimization, and responsive patterns. Sources — Chart.js official docs (chartjs.org), vue-chartjs docs (vue-chartjs.org).
---

# Chart.js Patterns

Official documentation references:
- Chart.js: https://www.chartjs.org/docs/latest/
- vue-chartjs: https://vue-chartjs.org/guide/
- chartjs-plugin-annotation: https://www.chartjs.org/chartjs-plugin-annotation/latest/

---

## 1. Setup with Vue 3

### Install

```bash
npm install chart.js vue-chartjs chartjs-plugin-annotation
```

### Register components

```js
// In main.js or a plugin file
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'
import annotationPlugin from 'chartjs-plugin-annotation'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  annotationPlugin
)
```

Register only what you use — Chart.js is tree-shakeable.

---

## 2. Vue Component Pattern

```vue
<script setup>
import { Bar } from 'vue-chartjs'
import { computed } from 'vue'

const props = defineProps({
  records: { type: Array, required: true },
  title: { type: String, default: '' }
})

const chartData = computed(() => ({
  labels: props.records.map(r => r.label),
  datasets: [{
    label: props.title,
    data: props.records.map(r => r.value),
    backgroundColor: 'rgba(54, 96, 146, 0.8)'
  }]
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: true, position: 'top' },
    title: { display: !!props.title, text: props.title }
  },
  scales: {
    y: { beginAtZero: true }
  }
}))
</script>

<template>
  <div style="position: relative; height: 300px">
    <Bar :data="chartData" :options="chartOptions" />
  </div>
</template>
```

### Key points

- Wrap the chart in a container with `position: relative` and a set height
- Use `computed` for reactive data/options — vue-chartjs auto-updates on changes
- Keep `chartData` and `chartOptions` as separate computed properties

---

## 3. Chart Types

Available from vue-chartjs: `Bar`, `Line`, `Pie`, `Doughnut`, `Radar`, `PolarArea`, `Bubble`, `Scatter`.

```vue
<script setup>
import { Line, Pie, Doughnut } from 'vue-chartjs'
</script>
```

---

## 4. Annotation Plugin

Add reference lines, boxes, and labels to charts:

```js
const chartOptions = {
  plugins: {
    annotation: {
      annotations: {
        targetLine: {
          type: 'line',
          yMin: 25,
          yMax: 25,
          borderColor: 'red',
          borderWidth: 2,
          borderDash: [5, 5],
          label: {
            display: true,
            content: 'Target: 25L',
            position: 'start'
          }
        },
        warningZone: {
          type: 'box',
          yMin: 0,
          yMax: 10,
          backgroundColor: 'rgba(255, 0, 0, 0.1)',
          borderWidth: 0
        }
      }
    }
  }
}
```

### Annotation types

- `line` — horizontal or vertical reference line
- `box` — shaded rectangular region
- `point` — marked point
- `label` — text label at coordinates
- `polygon` — custom shape
- `ellipse` — elliptical region

---

## 5. Responsive Design

```js
const options = {
  responsive: true,
  maintainAspectRatio: false  // fill container height
}
```

The chart canvas must be inside a positioned container with explicit dimensions:

```html
<div style="position: relative; width: 100%; height: 400px">
  <canvas id="chart"></canvas>
</div>
```

In vue-chartjs, the component handles the canvas — just style the wrapper div.

---

## 6. Multiple Datasets

```js
const chartData = {
  labels: ['Jan', 'Feb', 'Mar'],
  datasets: [
    {
      label: 'Actual',
      data: [12, 19, 8],
      borderColor: '#366092',
      backgroundColor: 'rgba(54, 96, 146, 0.2)',
      fill: true
    },
    {
      label: 'Target',
      data: [15, 15, 15],
      borderColor: '#dc3545',
      borderDash: [5, 5],
      fill: false
    }
  ]
}
```

---

## 7. Performance Optimization

### For large datasets (1000+ points)

```js
const options = {
  animation: false,             // disable animations
  parsing: false,               // skip parsing if data is pre-formatted
  normalized: true,             // data is sorted and unique
  scales: {
    x: { min: 0, max: 100 },   // explicit range — skip auto-calc
    y: { min: 0, max: 50 }
  }
}
```

### Line chart specific

```js
{
  datasets: [{
    pointRadius: 0,      // hide points — major perf gain
    tension: 0,          // no bezier curves (default, keep it)
    spanGaps: true,      // skip null gaps instead of segmenting
    showLine: true       // set false for scatter-like perf
  }]
}
```

### General tips

- Register only needed components (tree-shaking)
- Disable animations for data that updates frequently
- Use `decimation` plugin for time-series with thousands of points
- Set explicit `min`/`max` on scales to avoid auto-range calculation

---

## 8. Tooltip Customization

```js
const options = {
  plugins: {
    tooltip: {
      callbacks: {
        label: (context) => {
          const value = context.parsed.y
          return `${context.dataset.label}: ${value.toFixed(1)}L`
        }
      }
    }
  }
}
```

---

## 9. Accessing the Chart Instance

```vue
<script setup>
import { ref } from 'vue'
import { Bar } from 'vue-chartjs'

const chartRef = ref(null)

function downloadChart () {
  const chart = chartRef.value.chart
  const url = chart.toBase64Image()
  // use url for download
}
</script>

<template>
  <Bar ref="chartRef" :data="chartData" :options="chartOptions" />
</template>
```

---

## 10. Common Pitfalls

- Must register all used components before rendering — missing registrations cause silent failures
- vue-chartjs v4+ auto-watches `data` and `options` — no need for manual update logic
- Reactive readonly data (from Pinia) may warn — clone with `JSON.parse(JSON.stringify(data))` if needed
- Chart container MUST have explicit dimensions — without them, `responsive: true` has nothing to fill
- `maintainAspectRatio: false` is usually what you want for dashboard layouts
- Annotation plugin must be registered globally via `ChartJS.register()` — inline plugins don't work for it
- Destroying charts: vue-chartjs handles cleanup on unmount — don't manually destroy
