import { z } from "zod";

// ─── Sub-schemas ─────────────────────────────────────────────────────

export const ProbeConfigSchema = z.object({
  type: z.enum(["http", "tcp", "grpc"]),
  path: z.string().optional(),
  port: z.number().optional(),
});

export const EndpointConfigSchema = z.object({
  type: z.enum(["cdn", "anycast"]),
  ssl: z.boolean().optional(),
  ports: z
    .array(z.object({ public: z.number(), container: z.number() }))
    .optional(),
});

export const VolumeConfigSchema = z.object({
  name: z.string(),
  mount: z.string(),
  size: z.number(),
});

export const ContainerConfigSchema = z.object({
  image: z.string().optional(),
  dockerfile: z.string().optional(),
  command: z.array(z.string()).optional(),
  registry: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  probes: z
    .object({
      readiness: ProbeConfigSchema.optional(),
      liveness: ProbeConfigSchema.optional(),
      startup: ProbeConfigSchema.optional(),
    })
    .optional(),
  endpoints: z.array(EndpointConfigSchema).optional(),
  volumes: z.array(VolumeConfigSchema).optional(),
});

// ─── Root schema ─────────────────────────────────────────────────────

export const BunnyAppConfigSchema = z.object({
  $schema: z.string().optional(),
  app: z.object({
    id: z.string().optional(),
    name: z.string(),
    scaling: z.object({ min: z.number(), max: z.number() }).optional(),
    regions: z
      .object({
        allowed: z.array(z.string()).optional(),
        required: z.array(z.string()).optional(),
      })
      .optional(),
    containers: z.record(z.string(), ContainerConfigSchema),
  }),
});

// ─── Inferred types ──────────────────────────────────────────────────

export type BunnyAppConfig = z.infer<typeof BunnyAppConfigSchema>;
export type ContainerConfig = z.infer<typeof ContainerConfigSchema>;
export type EndpointConfig = z.infer<typeof EndpointConfigSchema>;
export type VolumeConfig = z.infer<typeof VolumeConfigSchema>;
export type ProbeConfig = z.infer<typeof ProbeConfigSchema>;
