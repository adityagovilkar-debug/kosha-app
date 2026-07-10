"use client";

// Central tree-shaken ECharts registration (KOSHA-PLAN.md §12: "import
// per-chart modules — the full bundle is heavy"). Only the chart types and
// components Kosha's Insights actually use are pulled in.
import * as echarts from "echarts/core";
import {
  SankeyChart,
  SunburstChart,
  TreemapChart,
  HeatmapChart,
  LineChart,
  BarChart,
  PieChart,
  CustomChart,
} from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  CalendarComponent,
  TitleComponent,
  MarkLineComponent,
  MarkPointComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  SankeyChart,
  SunburstChart,
  TreemapChart,
  HeatmapChart,
  LineChart,
  BarChart,
  PieChart,
  CustomChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  CalendarComponent,
  TitleComponent,
  MarkLineComponent,
  MarkPointComponent,
  CanvasRenderer,
]);

export { echarts };
export type { EChartsOption } from "echarts";
