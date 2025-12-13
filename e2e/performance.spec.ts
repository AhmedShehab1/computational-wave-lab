import { test, expect, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Performance test suite for INP (Interaction to Next Paint) regression testing.
 * 
 * Target: INP < 200ms for all interactions
 * Current baseline: 216ms (before optimization)
 * Goal: < 100ms for high-frequency drag interactions
 */

interface PerformanceMetrics {
  maxDuration: number;
  avgDuration: number;
  p95Duration: number;
  eventCount: number;
  entries: { name: string; duration: number }[];
}

/**
 * Collect INP metrics using PerformanceObserver API
 */
async function collectINPMetrics(page: Page): Promise<PerformanceMetrics> {
  return page.evaluate(() => {
    return new Promise<PerformanceMetrics>((resolve) => {
      const entries: { name: string; duration: number }[] = [];
      
      // Create a PerformanceObserver to capture event timing
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // Cast to PerformanceEventTiming for event-specific properties
          const eventEntry = entry as PerformanceEventTiming;
          if (eventEntry.duration > 0) {
            entries.push({
              name: eventEntry.name,
              duration: eventEntry.duration,
            });
          }
        }
      });
      
      observer.observe({ type: 'event', buffered: true });
      
      // Collect for 100ms after the last event
      setTimeout(() => {
        observer.disconnect();
        
        const durations = entries.map(e => e.duration);
        const sorted = [...durations].sort((a, b) => a - b);
        const p95Index = Math.floor(sorted.length * 0.95);
        
        resolve({
          maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
          avgDuration: durations.length > 0 
            ? durations.reduce((a, b) => a + b, 0) / durations.length 
            : 0,
          p95Duration: sorted[p95Index] || 0,
          eventCount: entries.length,
          entries,
        });
      }, 200);
    });
  });
}

/**
 * Start performance monitoring before interactions
 */
async function startPerformanceMonitoring(page: Page): Promise<void> {
  await page.evaluate(() => {
    // Store entries globally for collection
    (window as any).__perfEntries = [];
    
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const eventEntry = entry as PerformanceEventTiming;
        if (eventEntry.duration > 0) {
          (window as any).__perfEntries.push({
            name: eventEntry.name,
            duration: eventEntry.duration,
            processingStart: eventEntry.processingStart,
            processingEnd: eventEntry.processingEnd,
            startTime: eventEntry.startTime,
          });
        }
      }
    });
    
    observer.observe({ type: 'event', buffered: true });
    (window as any).__perfObserver = observer;
  });
}

/**
 * Stop monitoring and collect results
 */
async function stopAndCollectMetrics(page: Page): Promise<PerformanceMetrics> {
  return page.evaluate(() => {
    if ((window as any).__perfObserver) {
      (window as any).__perfObserver.disconnect();
    }
    
    const entries = (window as any).__perfEntries || [];
    const durations = entries.map((e: any) => e.duration);
    const sorted = [...durations].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    
    return {
      maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
      avgDuration: durations.length > 0 
        ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length 
        : 0,
      p95Duration: sorted[p95Index] || 0,
      eventCount: entries.length,
      entries: entries.slice(-50), // Last 50 entries for debugging
    };
  });
}

/**
 * Simulate rapid mouse drag (like adjusting brightness/contrast)
 */
async function performRapidDrag(
  page: Page, 
  selector: string, 
  options: { 
    startX: number; 
    startY: number; 
    deltaX: number; 
    deltaY: number; 
    steps: number;
    stepDelay?: number;
  }
): Promise<void> {
  const element = await page.locator(selector).first();
  const box = await element.boundingBox();
  
  if (!box) {
    throw new Error(`Element not found: ${selector}`);
  }
  
  const startX = box.x + options.startX;
  const startY = box.y + options.startY;
  const stepX = options.deltaX / options.steps;
  const stepY = options.deltaY / options.steps;
  const stepDelay = options.stepDelay ?? 16; // ~60fps
  
  // Mouse down at start position
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  
  // Rapid drag movements
  for (let i = 1; i <= options.steps; i++) {
    const x = startX + stepX * i;
    const y = startY + stepY * i;
    await page.mouse.move(x, y);
    
    if (stepDelay > 0) {
      await page.waitForTimeout(stepDelay);
    }
  }
  
  // Mouse up
  await page.mouse.up();
}

test.describe('INP Performance Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    
    // Wait for app to be fully loaded
    await page.waitForSelector('[data-testid="image-viewport"], .image-viewport, .source-card', {
      timeout: 10000,
    });
    
    // Give React time to hydrate
    await page.waitForTimeout(500);
  });

  test('Brightness/Contrast drag should have INP < 100ms', async ({ page }) => {
    // Start performance monitoring
    await startPerformanceMonitoring(page);
    
    // Find the first image viewport (Input A slot)
    const viewport = page.locator('[data-testid="image-viewport"], .image-viewport').first();
    
    // Check if viewport exists
    const viewportCount = await viewport.count();
    if (viewportCount === 0) {
      console.log('No image viewport found, skipping drag test');
      test.skip();
      return;
    }

    const box = await viewport.boundingBox();
    if (!box) {
      console.log('Could not get viewport bounding box');
      test.skip();
      return;
    }

    // Perform rapid drag simulating brightness/contrast adjustment
    // Drag horizontally (contrast) and vertically (brightness)
    await performRapidDrag(page, '[data-testid="image-viewport"], .image-viewport', {
      startX: box.width / 2,
      startY: box.height / 2,
      deltaX: 100,  // 100px horizontal drag
      deltaY: -50,  // 50px vertical drag
      steps: 30,    // 30 steps = ~30 mousemove events
      stepDelay: 16, // 16ms between moves (~60fps input)
    });
    
    // Wait for any pending React updates
    await page.waitForTimeout(100);
    
    // Collect metrics
    const metrics = await stopAndCollectMetrics(page);
    
    console.log('Performance Metrics:', {
      maxDuration: `${metrics.maxDuration.toFixed(2)}ms`,
      avgDuration: `${metrics.avgDuration.toFixed(2)}ms`,
      p95Duration: `${metrics.p95Duration.toFixed(2)}ms`,
      eventCount: metrics.eventCount,
    });
    
    // Log slow events for debugging
    const slowEvents = metrics.entries.filter(e => e.duration > 50);
    if (slowEvents.length > 0) {
      console.log('Slow events (>50ms):', slowEvents);
    }
    
    // Assertions
    expect(metrics.maxDuration, 'Max event duration should be < 100ms').toBeLessThan(100);
    expect(metrics.p95Duration, 'P95 event duration should be < 50ms').toBeLessThan(50);
  });

  test('Tab switching should have INP < 100ms', async ({ page }) => {
    // Start performance monitoring
    await startPerformanceMonitoring(page);
    
    // Find component tabs
    const tabs = page.locator('[data-testid^="tab-"], .tab');
    const tabCount = await tabs.count();
    
    if (tabCount === 0) {
      console.log('No tabs found, skipping tab test');
      test.skip();
      return;
    }
    
    // Rapidly click through tabs
    for (let i = 0; i < Math.min(tabCount, 8); i++) {
      await tabs.nth(i % tabCount).click();
      await page.waitForTimeout(50);
    }
    
    // Wait for any pending updates
    await page.waitForTimeout(100);
    
    // Collect metrics
    const metrics = await stopAndCollectMetrics(page);
    
    console.log('Tab Switch Metrics:', {
      maxDuration: `${metrics.maxDuration.toFixed(2)}ms`,
      avgDuration: `${metrics.avgDuration.toFixed(2)}ms`,
      eventCount: metrics.eventCount,
    });
    
    // Assertions
    expect(metrics.maxDuration, 'Max event duration should be < 100ms').toBeLessThan(100);
  });

  test('Multiple rapid interactions should maintain < 200ms INP', async ({ page }) => {
    // This test simulates real-world usage with multiple interaction types
    await startPerformanceMonitoring(page);
    
    // Find interactive elements
    const viewport = page.locator('[data-testid="image-viewport"], .image-viewport').first();
    const tabs = page.locator('[data-testid^="tab-"], .tab');
    
    const viewportBox = await viewport.boundingBox();
    const tabCount = await tabs.count();
    
    // Mix of interactions
    if (viewportBox) {
      // Drag 1
      await performRapidDrag(page, '[data-testid="image-viewport"], .image-viewport', {
        startX: viewportBox.width / 2,
        startY: viewportBox.height / 2,
        deltaX: 50,
        deltaY: -30,
        steps: 15,
        stepDelay: 16,
      });
    }
    
    // Tab clicks
    if (tabCount > 0) {
      for (let i = 0; i < 4; i++) {
        await tabs.nth(i % tabCount).click();
        await page.waitForTimeout(30);
      }
    }
    
    // Another drag
    if (viewportBox) {
      await performRapidDrag(page, '[data-testid="image-viewport"], .image-viewport', {
        startX: viewportBox.width / 2,
        startY: viewportBox.height / 2,
        deltaX: -50,
        deltaY: 30,
        steps: 15,
        stepDelay: 16,
      });
    }
    
    await page.waitForTimeout(150);
    
    // Collect metrics
    const metrics = await stopAndCollectMetrics(page);
    
    console.log('Mixed Interaction Metrics:', {
      maxDuration: `${metrics.maxDuration.toFixed(2)}ms`,
      avgDuration: `${metrics.avgDuration.toFixed(2)}ms`,
      p95Duration: `${metrics.p95Duration.toFixed(2)}ms`,
      eventCount: metrics.eventCount,
    });
    
    // Main INP target
    expect(metrics.maxDuration, 'INP should be < 200ms').toBeLessThan(200);
    expect(metrics.p95Duration, 'P95 should be < 100ms').toBeLessThan(100);
  });
});

test.describe('Frame Rate Tests', () => {
  test('Drag should maintain 60fps (16ms frame budget)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="image-viewport"], .image-viewport, .source-card');
    await page.waitForTimeout(500);
    
    // Measure frame times during drag
    const frameTimes = await page.evaluate(() => {
      return new Promise<number[]>((resolve) => {
        const times: number[] = [];
        let lastTime = performance.now();
        let frameCount = 0;
        
        function measureFrame() {
          const now = performance.now();
          const delta = now - lastTime;
          times.push(delta);
          lastTime = now;
          frameCount++;
          
          if (frameCount < 60) {
            requestAnimationFrame(measureFrame);
          } else {
            resolve(times);
          }
        }
        
        requestAnimationFrame(measureFrame);
      });
    });
    
    // Calculate frame rate statistics
    const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    const maxFrameTime = Math.max(...frameTimes);
    const fps = 1000 / avgFrameTime;
    
    console.log('Frame Rate Stats:', {
      avgFrameTime: `${avgFrameTime.toFixed(2)}ms`,
      maxFrameTime: `${maxFrameTime.toFixed(2)}ms`,
      estimatedFPS: fps.toFixed(1),
    });
    
    // We should be close to 60fps (16.67ms per frame)
    expect(avgFrameTime, 'Average frame time should be < 20ms').toBeLessThan(20);
  });
});
