import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/utils/exportBacklog", () => ({
  downloadBacklogCsv: vi.fn(),
}));

import Backlog from "../pages/Backlog";
import { downloadBacklogCsv } from "@/utils/exportBacklog";

describe("Backlog page", () => {
  beforeEach(() => {
    vi.spyOn(window, "alert").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    (downloadBacklogCsv as any).mockReset();
  });

  it("renders Import CSV and Export CSV buttons", () => {
    render(<Backlog projectKey="PMT" />);
    expect(screen.getByRole("button", { name: /import csv/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /export csv/i })).toBeTruthy();
  });

  it("disables the Export button while a request is in flight", async () => {
    let resolve: (v?: unknown) => void = () => {};
    (downloadBacklogCsv as any).mockImplementation(
      () => new Promise((r) => { resolve = r; }),
    );
    render(<Backlog projectKey="PMT" filters={{ status: "To Do" }} />);
    const btn = screen.getByRole("button", { name: /export csv/i }) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => expect(btn.disabled).toBe(true));
    resolve();
    await waitFor(() => expect(btn.disabled).toBe(false));
    expect(downloadBacklogCsv).toHaveBeenCalledWith("PMT", { status: "To Do" });
  });

  it("surfaces an error to the user when export fails", async () => {
    (downloadBacklogCsv as any).mockRejectedValue(new Error("HTTP 500"));
    render(<Backlog projectKey="PMT" />);
    fireEvent.click(screen.getByRole("button", { name: /export csv/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/HTTP 500/);
    });
    expect(window.alert).toHaveBeenCalled();
  });

  it("suppresses duplicate clicks while request is pending", async () => {
    let resolve: (v?: unknown) => void = () => {};
    (downloadBacklogCsv as any).mockImplementation(
      () => new Promise((r) => { resolve = r; }),
    );
    render(<Backlog projectKey="PMT" />);
    const btn = screen.getByRole("button", { name: /export csv/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(downloadBacklogCsv).toHaveBeenCalledTimes(1);
    resolve();
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
  });
});
