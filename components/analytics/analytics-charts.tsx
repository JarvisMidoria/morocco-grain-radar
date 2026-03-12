"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnalyticsPayload } from "@/lib/types";

interface AnalyticsChartsProps {
  analytics: AnalyticsPayload;
}

const palette = ["#2563eb", "#10b981", "#f59e0b", "#0ea5e9", "#f97316", "#14b8a6", "#6366f1", "#ef4444"];

function SmallBarChart({ data, color }: { data: Array<{ name: string; value: number }>; color: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 36 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="name" angle={-35} textAnchor="end" interval={0} height={74} tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip />
        <Bar dataKey="value" fill={color} radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AnalyticsCharts({ analytics }: AnalyticsChartsProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Top Recent Departure Ports</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px]">
          <SmallBarChart data={analytics.topRecentDeparturePorts} color="#2563eb" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top Departure Countries</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px]">
          <SmallBarChart data={analytics.topDepartureCountries} color="#0ea5e9" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vessels by Detection Phase</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px]">
          <SmallBarChart data={analytics.vesselsByDetectionPhase} color="#10b981" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Average Days to Morocco (by Phase)</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px]">
          <SmallBarChart data={analytics.averageDaysToMoroccoByPhase} color="#f59e0b" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Most Likely Commodities Distribution</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={analytics.commodityDistribution} dataKey="value" nameKey="name" outerRadius={95} label>
                {analytics.commodityDistribution.map((entry, index) => (
                  <Cell key={entry.name} fill={palette[index % palette.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Likely Morocco-Bound Vessels by Corridor</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px]">
          <SmallBarChart data={analytics.moroccoBoundByCorridor} color="#6366f1" />
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Agri Cargo Score Distribution</CardTitle>
        </CardHeader>
        <CardContent className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics.agriCargoScoreDistribution} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" interval={0} tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#15803d" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
