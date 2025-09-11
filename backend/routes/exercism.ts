import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { ExercismService } from "../services/exercismService.ts";

const router = new Router({ prefix: "/api/exercism" });

router.get("/exercises", (ctx) => {
  try {
    const exercises = ExercismService.listExercises();
    ctx.response.body = { success: true, data: exercises };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
});

router.post("/run", async (ctx) => {
  try {
    const body = await ctx.request.body({ type: "json" }).value;
    const { exerciseId, models, testCount } = body || {};
    if (!exerciseId || !Array.isArray(models) || models.length === 0) {
      ctx.response.status = 400;
      ctx.response.body = { success: false, error: "exerciseId and at least one model are required" };
      return;
    }
    const result = await ExercismService.run({ exerciseId, models, testCount });
    ctx.response.body = { success: true, data: result };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
});

router.get("/history", (ctx) => {
  try {
    const limit = parseInt(ctx.request.url.searchParams.get("limit") || "50");
    const data = ExercismService.getHistory(limit);
    ctx.response.body = { success: true, data };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
});

export default router;

