import { z } from "zod";

export const CreateUserSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1).max(120),
  password: z.string().min(8).max(128),
  role: z.enum(["event_admin", "volunteer"]).optional(),
});
export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export const AssignUserToEventSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["event_admin", "volunteer"]).optional(),
});
export type AssignUserToEventInput = z.infer<typeof AssignUserToEventSchema>;
