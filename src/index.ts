import { Elysia, redirect, t } from "elysia";
import { openapi } from "@elysiajs/openapi";
import { cors } from "@elysiajs/cors";
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, ne } from "drizzle-orm";
import { urlTable } from "./db/schema";
import uuidBase62 from "uuid-base62";

const db = drizzle(process.env.DATABASE_URL!);

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 100;
const requests = new Map<string, { count: number; start: number }>();

const rateLimiter = new Elysia().onRequest(({ request }) => {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const now = Date.now();
  const entry = requests.get(ip);

  if (!entry) {
    requests.set(ip, { count: 1, start: now });
    return;
  }

  if (now - entry.start > WINDOW_MS) {
    entry.count = 1;
    entry.start = now;
    return;
  }

  entry.count++;
  if (entry.count > MAX_REQUESTS) {
    return new Response("Too Many Requests", { status: 429 });
  }
});

const app = new Elysia()
  .use(openapi())
  .use(
    cors({
      origin: "*",
    })
  )
  .use(rateLimiter)

  .post(
    "/shorten",
    async ({ body: { url } }) => {
      // check if url is already in db and return existing short url
      const existing = await db
        .select({
          shortUrl: urlTable.shortUrl,
        })
        .from(urlTable)
        .where(eq(urlTable.targetUrl, url));

      if (existing[0]?.shortUrl) {
        return { newUrl: "https://" + process.env.URL + existing[0]?.shortUrl };
      }

      const shortUrl = uuidBase62.v4();

      await db
        .insert(urlTable)
        .values({
          shortUrl: shortUrl,
          targetUrl: url,
        })
        .onConflictDoNothing();

      return { newUrl: "https://" + process.env.URL + shortUrl };
    },
    {
      body: t.Object({
        url: t.String(),
      }),
    }
  )
  // Redirect from generated URL to original
  .get(
    "/:newUrl",
    async ({ params: { newUrl }, redirect }) => {
      const result = await db
        .select({
          targetUrl: urlTable.targetUrl,
        })
        .from(urlTable)
        .where(eq(urlTable.shortUrl, newUrl));

      const targetUrl = result[0]?.targetUrl;

      if (!targetUrl) {
        return { error: "Not found" };
      }

      return redirect(targetUrl, 301);
    },
    {
      params: t.Object({
        newUrl: t.String(),
      }),
    }
  )
  .get("/status", () => "All good");

export default app;
