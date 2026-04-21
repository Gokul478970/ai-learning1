import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/api", () => {
  return {
    exportBacklogCsv: vi.fn(),
  };
});

import { downloadBacklogCsv } from "../utils/exportBacklog";
import { exportBacklogCsv } from "@/lib/api";

describe("downloadBacklogCsv", () => {
  beforeEach(() => {
    (globalThis as any).URL.createObjectURL = vi.fn(() => "blob:fake");
    (globalThis as any).URL.revokeObjectURL = vi.fn();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("triggers a download with the default filename", async () => {
    const blob = new Blob(["key\n"], { type: "text/csv" });
    (exportBacklogCsv as any).mockResolvedValue(blob);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await downloadBacklogCsv("PMT", { status: "To Do" });
    expect(exportBacklogCsv).toHaveBeenCalledWith("PMT", { status: "To Do" });
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect((globalThis as any).URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect((globalThis as any).URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });

  it("supports a custom filename", async () => {
    const blob = new Blob(["key\n"], { type: "text/csv" });
    (exportBacklogCsv as any).mockResolvedValue(blob);
    let capturedName = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      capturedName = this.download;
    });
    await downloadBacklogCsv("PMT", undefined, "custom.csv");
    expect(capturedName).toBe("custom.csv");
  });

  it("propagates errors from the API layer", async () => {
    (exportBacklogCsv as any).mockRejectedValue(new Error("HTTP 500"));
    await expect(downloadBacklogCsv("PMT")).rejects.toThrow("HTTP 500");
  });

  it("revokes the object URL even when click throws", async () => {
    const blob = new Blob(["key\n"], { type: "text/csv" });
    (exportBacklogCsv as any).mockResolvedValue(blob);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("boom");
    });
    await expect(downloadBacklogCsv("PMT")).rejects.toThrow("boom");
    expect((globalThis as any).URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });
});
