/**
 * Executor - Replays a saved AutomationWorkflow using Playwright.
 * Steps are a predefined, safe script — no AI guessing, no exploratory clicks.
 */

import { chromium, Browser, Page } from "playwright";

export type StepType =
  | "navigate"
  | "click"
  | "type"
  | "waitForSelector"
  | "screenshot"
  | "select"
  | "pressKey";

export interface WorkflowStep {
  id: string;
  type: StepType;
  selector?: string;       // CSS selector for the target element
  value?: string;          // Value to type / option to select
  url?: string;            // For navigate steps
  description: string;     // Human readable label shown in the UI
  isVariable?: boolean;    // Whether this value is a runtime variable
  variableName?: string;   // e.g. "reviewId" — filled in at runtime
}

export interface WorkflowVariables {
  [key: string]: string;
}

export interface ExecutionResult {
  success: boolean;
  steps: Array<{ step: WorkflowStep; status: "ok" | "error"; error?: string; screenshot?: string }>;
  error?: string;
}

let globalBrowser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!globalBrowser || !globalBrowser.isConnected()) {
    globalBrowser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
  }
  return globalBrowser;
}

function resolveValue(value: string | undefined, variables: WorkflowVariables): string {
  if (!value) return "";
  return value.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
}

export async function executeWorkflow(
  steps: WorkflowStep[],
  variables: WorkflowVariables = {},
  dryRun = false
): Promise<ExecutionResult> {
  const results: ExecutionResult["steps"] = [];
  
  if (dryRun) {
    // In dry-run mode, just validate steps and return what would happen
    return {
      success: true,
      steps: steps.map(step => ({
        step,
        status: "ok",
      }))
    };
  }

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    browser = await getBrowser();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    });
    page = await context.newPage();

    for (const step of steps) {
      try {
        const resolvedValue = resolveValue(step.value, variables);
        const resolvedUrl = resolveValue(step.url, variables);

        switch (step.type) {
          case "navigate":
            await page.goto(resolvedUrl, { waitUntil: "networkidle", timeout: 15000 });
            break;

          case "click":
            await page.waitForSelector(step.selector!, { timeout: 10000 });
            await page.click(step.selector!);
            break;

          case "type":
            await page.waitForSelector(step.selector!, { timeout: 10000 });
            await page.fill(step.selector!, resolvedValue);
            break;

          case "select":
            await page.waitForSelector(step.selector!, { timeout: 10000 });
            await page.selectOption(step.selector!, resolvedValue);
            break;

          case "waitForSelector":
            await page.waitForSelector(step.selector!, { timeout: 15000 });
            break;

          case "pressKey":
            await page.keyboard.press(resolvedValue || "Enter");
            break;

          case "screenshot":
            // Screenshot only - safe, no mutations
            break;

          default:
            throw new Error(`Unknown step type: ${step.type}`);
        }

        // Take a screenshot after each step for audit trail
        const screenshot = await page.screenshot({ type: "png" });
        const b64 = Buffer.from(screenshot).toString("base64");

        results.push({ step, status: "ok", screenshot: `data:image/png;base64,${b64}` });
      } catch (err: any) {
        results.push({ step, status: "error", error: err.message });
        // Stop on first error — don't continue clicking randomly
        break;
      }
    }

    await context.close();
    return { success: results.every(r => r.status === "ok"), steps: results };
  } catch (err: any) {
    return { success: false, steps: results, error: err.message };
  }
}

/**
 * Scrape helper: after navigating via a workflow, extract text content from selectors.
 * Used for read-only data extraction (review content, IDs).
 */
export async function scrapeAfterWorkflow(
  steps: WorkflowStep[],
  variables: WorkflowVariables,
  scrapeSelectors: Record<string, string>
): Promise<{ data: Record<string, string>; screenshots: string[] }> {
  const data: Record<string, string> = {};
  const screenshots: string[] = [];

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    browser = await getBrowser();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    page = await context.newPage();

    // Execute all navigation/login steps
    for (const step of steps) {
      const resolvedValue = resolveValue(step.value, variables);
      const resolvedUrl = resolveValue(step.url, variables);

      try {
        switch (step.type) {
          case "navigate": await page.goto(resolvedUrl, { waitUntil: "networkidle", timeout: 15000 }); break;
          case "click": await page.click(step.selector!); break;
          case "type": await page.fill(step.selector!, resolvedValue); break;
          case "pressKey": await page.keyboard.press(resolvedValue || "Enter"); break;
          case "waitForSelector": await page.waitForSelector(step.selector!, { timeout: 15000 }); break;
        }
      } catch {
        // best effort
      }
    }

    // Extract requested data
    for (const [key, selector] of Object.entries(scrapeSelectors)) {
      try {
        const el = await page.$(selector);
        data[key] = el ? (await el.textContent()) ?? "" : "";
      } catch {
        data[key] = "";
      }
    }

    const screenshot = await page.screenshot({ type: "png" });
    screenshots.push(`data:image/png;base64,${Buffer.from(screenshot).toString("base64")}`);

    await context.close();
  } catch {
    // Return whatever we have
  }

  return { data, screenshots };
}
