/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 *
 * useInstallPrompt — handles the "Add to Home Screen" install prompt
 * for Android/Chrome and provides iOS detection for manual install guidance.
 */

import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface UseInstallPromptResult {
  canInstall: boolean;
  isIOS: boolean;
  isInstalled: boolean;
  triggerInstall: () => Promise<void>;
  dismissInstall: () => void;
  isDismissed: boolean;
}

const DISMISS_KEY = "jie_pwa_install_dismissed";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function useInstallPrompt(): UseInstallPromptResult {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isDismissed, setIsDismissed] = useState(() => {
    try {
      const stored = sessionStorage.getItem(DISMISS_KEY);
      if (!stored) return false;
      const { dismissedAt } = JSON.parse(stored);
      return Date.now() - dismissedAt < DISMISS_DURATION_MS;
    } catch {
      return false;
    }
  });

  const isIOS =
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as any).MSStream;

  const isInstalled =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const triggerInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  const dismissInstall = () => {
    setIsDismissed(true);
    try {
      sessionStorage.setItem(
        DISMISS_KEY,
        JSON.stringify({ dismissedAt: Date.now() })
      );
    } catch {
      // sessionStorage unavailable — just hide for this session
    }
  };

  return {
    canInstall: !!deferredPrompt && !isInstalled,
    isIOS: isIOS && !isInstalled,
    isInstalled,
    triggerInstall,
    dismissInstall,
    isDismissed,
  };
}
