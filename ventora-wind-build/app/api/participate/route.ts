import { supabaseServer } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const { projectId, units } = await request.json();
    const quantity = Number(units);
    if (!projectId || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      return Response.json({ error: "Participação inválida." }, { status: 400 });
    }
    const db = await supabaseServer();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return Response.json({ error: "Faça login para continuar." }, { status: 401 });
    const { data, error } = await db.rpc("purchase_wind_project", { p_project_slug: projectId, p_units: quantity });
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ ok: true, result: data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível concluir." }, { status: 400 });
  }
}
