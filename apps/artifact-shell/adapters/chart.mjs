const view = (type) => Object.freeze({
  pattern: 'chart/1',
  chart: Object.freeze({ type }),
});

export const createAdapter = () => Object.freeze({
  featureModule: 'packages/semantic-map/feature.mjs',
  id: 'chart',
  kind: 'feature',
  label: 'chart',
  source: 'examples/chart/bar-horizontal.jsonl',
  variants: Object.freeze([
    Object.freeze({ id: 'bar-horizontal', source: 'examples/chart/bar-horizontal.jsonl', view: view('bar-horizontal/1') }),
    Object.freeze({ id: 'bar-vertical', source: 'examples/chart/bar-vertical.jsonl', view: view('bar-vertical/1') }),
    Object.freeze({ id: 'line', source: 'examples/chart/line.jsonl', view: view('line/1') }),
    Object.freeze({ id: 'pie', source: 'examples/chart/pie.jsonl', view: view('pie/1') }),
    Object.freeze({ id: 'donut', source: 'examples/chart/donut.jsonl', view: view('donut/1') }),
    Object.freeze({ id: 'scatter', source: 'examples/chart/scatter.jsonl', view: view('scatter/1') }),
    Object.freeze({ id: 'heatmap', source: 'examples/chart/heatmap.jsonl', view: view('heatmap/1') }),
    Object.freeze({ id: 'sunburst', source: 'examples/chart/sunburst.jsonl', view: view('sunburst/1') }),
  ]),
});
