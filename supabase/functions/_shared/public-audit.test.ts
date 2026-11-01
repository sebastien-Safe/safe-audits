import { assertEquals, assertNotEquals } from "@std/assert";
import { empreinteAudit, normaliserEmailAudit } from "./public-audit.ts";

Deno.test("normalise l'adresse avant de l'associer au quota", () => {
  assertEquals(
    normaliserEmailAudit("  Prospect@Example.FR "),
    "prospect@example.fr",
  );
});

Deno.test("les empreintes sont stables et liées au secret", async () => {
  const first = await empreinteAudit("secret-a", "email:prospect@example.fr");
  assertEquals(
    first,
    await empreinteAudit("secret-a", "email:prospect@example.fr"),
  );
  assertNotEquals(
    first,
    await empreinteAudit("secret-b", "email:prospect@example.fr"),
  );
  assertNotEquals(
    first,
    await empreinteAudit("secret-a", "email:autre@example.fr"),
  );
});
