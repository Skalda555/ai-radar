import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { Db } from "../src/lib/db/client";
import { canonicalCategory, setChannelCategory } from "../src/lib/channels/service";
import { CHANNEL_ID, openTestDb, seedChannel } from "./helpers";

let db: Db | null = null;

function setup(): Db {
  db = openTestDb();
  seedChannel(db, { channelId: CHANNEL_ID, title: "AI Explained", category: "AI modely" });
  return db;
}

afterEach(() => {
  db?.close();
  db = null;
});

describe("sjednocení kategorie", () => {
  it("převezme existující pravopis bez ohledu na velikost písmen", () => {
    const database = setup();
    assert.equal(canonicalCategory(database, "ai modely"), "AI modely");
    assert.equal(canonicalCategory(database, "AI MODELY"), "AI modely");
    assert.equal(canonicalCategory(database, "  Ai Modely  "), "AI modely");
  });

  it("ignoruje diakritiku při porovnání", () => {
    const database = setup();
    seedChannel(database, { channelId: "UCdiakritika0000000000", title: "Druhý", category: "Vývoj" });
    assert.equal(canonicalCategory(database, "vyvoj"), "Vývoj");
  });

  it("novou kategorii vrátí tak, jak ji uživatel napsal", () => {
    const database = setup();
    assert.equal(canonicalCategory(database, "Byznys a AI"), "Byznys a AI");
  });

  it("prázdnou hodnotu převede na null", () => {
    const database = setup();
    assert.equal(canonicalCategory(database, ""), null);
    assert.equal(canonicalCategory(database, "   "), null);
    assert.equal(canonicalCategory(database, null), null);
  });

  it("příliš dlouhou kategorii zkrátí na 60 znaků", () => {
    const database = setup();
    const long = "x".repeat(100);
    assert.equal(canonicalCategory(database, long)?.length, 60);
  });
});
describe("úprava kategorie u existujícího kanálu", () => {
  it("uloží kategorii a sjednotí pravopis", () => {
    const database = setup();
    const result = setChannelCategory(database, CHANNEL_ID, "ai modely");
    assert.equal(result.ok, true);
    assert.equal(result.category, "AI modely");

    const row = database.prepare(`SELECT category FROM channels WHERE channel_id = ?`).get(CHANNEL_ID) as {
      category: string;
    };
    assert.equal(row.category, "AI modely");
  });

  it("prázdná hodnota kategorii odebere", () => {
    const database = setup();
    const result = setChannelCategory(database, CHANNEL_ID, "");
    assert.equal(result.ok, true);
    assert.equal(result.category, null);
  });

  it("neexistující kanál vrátí ok: false", () => {
    const database = setup();
    assert.equal(setChannelCategory(database, "UCnicnicnicnicnicnicnic", "AI").ok, false);
  });
});