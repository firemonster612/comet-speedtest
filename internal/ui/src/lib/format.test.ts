import { describe, expect, it } from "vitest";

import { latency, speed, speedParts, speedValue } from "./format";

describe("throughput formatting", () => {
  it("renders megabit speeds to three significant digits below gigabit scale", () => {
    expect(speed(742_400_000)).toBe("742 Mbps");
    expect(speedValue(38_100_000)).toBe("38.1");
    expect(speedParts(999_400_000)).toEqual({ value: "999", unit: "Mbps" });
  });

  it("promotes gigabit-scale speeds to three-significant-digit Gbps", () => {
    expect(speed(1_637_000_000)).toBe("1.64 Gbps");
    expect(speedParts(3_200_000_000)).toEqual({ value: "3.20", unit: "Gbps" });
  });

  it("always shows three significant digits, padding with trailing zeros", () => {
    expect(speedValue(368_000_000)).toBe("368");
    expect(speedValue(36_000_000)).toBe("36.0");
    expect(speedValue(8_000_000)).toBe("8.00");
    expect(latency(85)).toBe("85.0 ms");
    expect(latency(6)).toBe("6.00 ms");
    expect(latency(109)).toBe("109 ms");
  });
});
