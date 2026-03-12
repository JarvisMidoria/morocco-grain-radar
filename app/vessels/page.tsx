import { VesselTable } from "@/components/dashboard/vessel-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getRadarVessels } from "@/lib/radar/service";

export const dynamic = "force-dynamic";

export default async function VesselsPage() {
  const vessels = await getRadarVessels();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Vessels</h1>
        <p className="text-sm text-slate-500">
          Early-detection vessel intelligence with explainable Morocco-bound, agri-cargo, and commodity hypotheses.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vessel Intelligence Table</CardTitle>
          <CardDescription>
            {vessels.length} vessels with departure-driven detection phases and layered scoring outputs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VesselTable vessels={vessels} />
        </CardContent>
      </Card>
    </div>
  );
}
