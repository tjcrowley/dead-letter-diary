import { describe, it, expect } from "vitest";
import { countWords } from "../word-count";

describe("countWords", () => {
  it("returns 0 for empty string", () => {
    expect(countWords("")).toBe(0);
  });

  it("returns 0 for whitespace-only input", () => {
    expect(countWords("   ")).toBe(0);
    expect(countWords("\t\n")).toBe(0);
  });

  it("counts simple English words", () => {
    expect(countWords("hello world")).toBe(2);
  });

  it("counts a sentence correctly (punctuation not counted)", () => {
    // "This is a test sentence with eight words" = 8 word-like segments
    expect(countWords("This is a test sentence with eight words.")).toBe(8);
  });

  it("counts CJK characters as word-like segments", () => {
    // Each CJK character is a word-like segment per UAX #29
    const cjk = "你好世界"; // 你好世界 (4 characters)
    const count = countWords(cjk);
    expect(count).toBeGreaterThanOrEqual(2); // At minimum treats as word-like segments
  });

  it("counts mixed English and CJK correctly", () => {
    const mixed = "Hello 世界 world"; // Hello 世界 world
    const count = countWords(mixed);
    // "Hello" (1) + 世界 segments (>=1) + "world" (1) = at least 3
    expect(count).toBeGreaterThanOrEqual(3);
  });
});
