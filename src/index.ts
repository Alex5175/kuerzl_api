import { Elysia, redirect, t } from "elysia";

import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, ne } from "drizzle-orm";
import { urlTable } from "./db/schema";
import uuidBase62 from "uuid-base62";

const db = drizzle(process.env.DATABASE_URL!);

const app = new Elysia()
  .post(
    "/shorten",
    async ({ body: { url } }) => {
      const shortUrl = uuidBase62.v4();

      await db
        .insert(urlTable)
        .values({
          shortUrl: shortUrl,
          targetUrl: url,
        })
        .onConflictDoNothing();

      return `${process.env.URL}${shortUrl}`;
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

      const { targetUrl } = result[0];

      return redirect(targetUrl, 308);
    },
    {
      params: t.Object({
        newUrl: t.String(),
      }),
    }
  );

export default app;
