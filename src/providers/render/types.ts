import { z } from "zod";

// ------------------------------------------------------------------
// Render API response shape (service list). Tolerant: the plan lives under
// service.serviceDetails.plan. Field names are sourced-but-not-live-verified (R8).
// ------------------------------------------------------------------

export const RenderServicesSchema = z.array(
  z.object({
    service: z.object({
      name: z.string(),
      serviceDetails: z.object({ plan: z.string() }).nullish(),
    }),
  }),
);

// ------------------------------------------------------------------
// Active config schema (from workspaces.json active.render). The operator
// declares each service's environment; the live plan is fetched from the API
// and reconciled against it (mirrors the atlas module).
// ------------------------------------------------------------------

export const RenderActiveSchema = z.object({
  services: z.array(z.object({ name: z.string(), env: z.string() })),
});

export type RenderActive = z.infer<typeof RenderActiveSchema>;
