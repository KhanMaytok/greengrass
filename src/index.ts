import { Elysia, t } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { simulate } from "./ogame";

const app = new Elysia()
  .use(swagger())
  .get("/", () => "Hello Elysia")
  .post(
    "/simulate",
    ({ body }) => {
      const { attackers, defenders, rapidFire, simulations } = body;
      return simulate(simulations, attackers, defenders, rapidFire);
    },
    {
      body: t.Object({
        simulations: t.Numeric(),
        attackers: t.Object({}, { additionalProperties: true }),
        defenders: t.Object({}, { additionalProperties: true }),
        rapidFire: t.Boolean(),
      }),
    }
  )
  .listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
