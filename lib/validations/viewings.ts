import { z } from "zod";

export const ALLOWED_VIEWING_SORT_FIELDS = [
  "scheduledAt",
  "status",
  "createdAt",
  "updatedAt",
] as const;

export const createViewingSchema = z.object({
  listingId: z.string({ required_error: "Missing required field: listingId" }).min(1, "Listing ID cannot be empty"),
  viewerName: z.string({ required_error: "Missing required field: viewerName" }).min(1, "Viewer name cannot be empty"),
  viewerEmail: z.string({ required_error: "Missing required field: viewerEmail" }).email("Invalid email format"),
  viewerPhone: z.string({ required_error: "Missing required field: viewerPhone" }).min(1, "Viewer phone cannot be empty"),
  scheduledAt: z.string({ required_error: "Missing required field: scheduledAt" }).datetime({ message: "scheduledAt must be an ISO 8601 date-time string" }),
  status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"]).optional().default("SCHEDULED"),
  notes: z.string().optional().nullable(),
});

export const updateViewingSchema = createViewingSchema.partial();
