
export default async () => Response.json({
  aiConfigured: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_BASE_URL)
});
export const config = { path: "/api/status" };
