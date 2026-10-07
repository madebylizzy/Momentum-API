import { z } from "zod";

export const ALLOWED_LISTING_SORT_FIELDS = [
  "price",
  "bedrooms",
  "bathrooms",
  "city",
  "createdAt",
  "updatedAt",
] as const;

export const createListingSchema = z.object({
  title: z.string({ required_error: "Missing required field: title" }).min(1, "Title cannot be empty"),
  description: z.string({ required_error: "Missing required field: description" }).min(1, "Description cannot be empty"),
  price: z.number({ required_error: "Missing required field: price" }).int("Price must be an integer in cents").positive("Price must be positive"),
  propertyType: z.enum(["APARTMENT", "HOUSE", "CONDO", "TOWNHOUSE", "LAND"], {
    required_error: "Missing required field: propertyType",
    invalid_type_error: "Property type must be APARTMENT, HOUSE, CONDO, TOWNHOUSE, or LAND",
  }),
  status: z.enum(["AVAILABLE", "PENDING", "SOLD", "RENTED"]).optional().default("AVAILABLE"),
  bedrooms: z.number({ required_error: "Missing required field: bedrooms" }).int().min(0, "Bedrooms cannot be negative"),
  bathrooms: z.number({ required_error: "Missing required field: bathrooms" }).min(0, "Bathrooms cannot be negative"),
  squareFeet: z.number().int().positive().optional().nullable(),
  address: z.string({ required_error: "Missing required field: address" }).min(1, "Address cannot be empty"),
  city: z.string({ required_error: "Missing required field: city" }).min(1, "City cannot be empty"),
  state: z.string({ required_error: "Missing required field: state" }).min(1, "State cannot be empty"),
  zipCode: z.string({ required_error: "Missing required field: zipCode" }).min(1, "Zip code cannot be empty"),
  agentId: z.string({ required_error: "Missing required field: agentId" }).min(1, "Agent ID cannot be empty"),
});

export const updateListingSchema = createListingSchema.partial();
