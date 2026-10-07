import { z } from "zod";

export const ALLOWED_AGENT_SORT_FIELDS = [
  "name",
  "city",
  "agencyName",
  "status",
  "createdAt",
  "updatedAt",
] as const;

export const createAgentSchema = z.object({
  name: z.string({ required_error: "Missing required field: name" }).min(1, "Name cannot be empty"),
  email: z.string({ required_error: "Missing required field: email" }).email("Invalid email format"),
  phone: z.string({ required_error: "Missing required field: phone" }).min(1, "Phone cannot be empty"),
  agencyName: z.string({ required_error: "Missing required field: agencyName" }).min(1, "Agency name cannot be empty"),
  city: z.string({ required_error: "Missing required field: city" }).min(1, "City cannot be empty"),
  licenseNumber: z.string({ required_error: "Missing required field: licenseNumber" }).min(1, "License number cannot be empty"),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional().default("ACTIVE"),
});

export const updateAgentSchema = createAgentSchema.partial();
