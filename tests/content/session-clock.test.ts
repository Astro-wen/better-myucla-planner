// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://be.my.ucla.edu/ClassPlanner/ClassPlan.aspx"}

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  countdownLevel,
  remainingMinutes,
  watchSessionCountdown
} from "../../src/content/session-clock";
import { publishSessionSettings } from "../../src/content/session-keep";

const CHANNEL = "better-myucla/session-timeout/v1";

function post(data: unknown, overrides: Partial<MessageEventInit> = {}): void {
  window.dispatchEvent(
    new MessageEvent("message", {
      data,
      origin: "https://be.my.ucla.edu",
      source: window,
      ...overrides
    })
  );
}

describe("session countdown bridge", () => {
  let stop: (() => void) | null = null;

  afterEach(() => {
    stop?.();
    stop = null;
  });

  it("accepts only same-window, same-origin messages on its own channel", () => {
    const listener = vi.fn();
    stop = watchSessionCountdown(listener);

    post({ channel: CHANNEL, feature: 12, max: 200 });
    expect(listener).toHaveBeenCalledWith({ feature: 12, max: 200 });
    listener.mockClear();

    post({ channel: CHANNEL, feature: 5, max: 100 }, { origin: "https://evil.example" });
    post({ channel: CHANNEL, feature: 5, max: 100 }, { source: null });
    post({ channel: "some-other-channel", feature: 5, max: 100 });
    post({ channel: CHANNEL, feature: "20", max: null });
    post({ channel: CHANNEL, feature: -3, max: 99_999 });
    post(null);
    expect(listener).not.toHaveBeenCalled();
  });

  it("reports the soonest expiry and escalates as it approaches", () => {
    expect(remainingMinutes({ feature: 12, max: 200 })).toBe(12);
    expect(remainingMinutes({ feature: null, max: 40 })).toBe(40);
    expect(remainingMinutes({ feature: null, max: null })).toBeNull();

    expect(countdownLevel(45)).toBe("calm");
    expect(countdownLevel(10)).toBe("soon");
    expect(countdownLevel(3)).toBe("urgent");
  });

  it("stops listening after unsubscribing", () => {
    const listener = vi.fn();
    const unsubscribe = watchSessionCountdown(listener);
    unsubscribe();
    post({ channel: CHANNEL, feature: 9, max: 90 });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("session settings bridge", () => {
  it("only answers same-window, same-origin requests on its own channel", async () => {
    const stored: Record<string, unknown> = {};
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: stored[key] })),
          set: vi.fn(async (value: Record<string, unknown>) => Object.assign(stored, value))
        },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() }
      }
    });
    const posted: unknown[] = [];
    const realPost = window.postMessage;
    vi.spyOn(window, "postMessage").mockImplementation(((message: unknown) => {
      posted.push(message);
    }) as typeof realPost);

    const stop = publishSessionSettings();
    await Promise.resolve();
    await Promise.resolve();
    // Defaults are pushed without being asked.
    expect(posted).toContainEqual({
      channel: "better-myucla/session-keep/v1",
      keepAlive: true,
      capMinutes: 60
    });

    posted.length = 0;
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { channel: "better-myucla/session-keep/v1", request: true },
        origin: "https://evil.example",
        source: window
      })
    );
    await Promise.resolve();
    expect(posted).toHaveLength(0);

    stop();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});
