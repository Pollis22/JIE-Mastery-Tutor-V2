/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 *
 * InstallBanner — "Add to Home Screen" prompt component.
 * Shows on Android/Chrome (native prompt) and iOS Safari (manual instructions).
 * Renders as a dismissable bottom sheet on mobile.
 */

import { useState } from "react";
import { useInstallPrompt } from "@/hooks/use-install-prompt";
import { X, Share, PlusSquare, Download } from "lucide-react";

export function InstallBanner() {
  const { canInstall, isIOS, isInstalled, triggerInstall, dismissInstall, isDismissed } =
    useInstallPrompt();
  const [showIOSSteps, setShowIOSSteps] = useState(false);

  // Don't render if already installed, dismissed, or no install path available
  if (isInstalled || isDismissed || (!canInstall && !isIOS)) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-safe-bottom"
      style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
      role="dialog"
      aria-label="Install JIE Mastery app"
    >
      <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl mx-auto max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-3">
            <img
              src="/icons/icon-72x72.png"
              alt="JIE Mastery"
              className="w-12 h-12 rounded-xl shadow-sm"
            />
            <div>
              <p className="font-semibold text-gray-900 text-sm leading-tight">
                Install JIE Mastery
              </p>
              <p className="text-gray-500 text-xs">Add to your home screen</p>
            </div>
          </div>
          <button
            onClick={dismissInstall}
            className="p-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Dismiss"
          >
            <X size={18} />
          </button>
        </div>

        {/* iOS: Show steps button */}
        {isIOS && !showIOSSteps && (
          <div className="px-4 pb-4">
            <p className="text-gray-600 text-sm mb-3">
              Get the full app experience — works offline, launches instantly.
            </p>
            <div className="flex gap-2">
              <button
                onClick={dismissInstall}
                className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-3 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Not Now
              </button>
              <button
                onClick={() => setShowIOSSteps(true)}
                className="flex-1 bg-[#C81C1C] text-white rounded-xl py-3 text-sm font-semibold hover:bg-[#a51717] transition-colors flex items-center justify-center gap-2"
              >
                <Download size={15} />
                Show Me How
              </button>
            </div>
          </div>
        )}

        {/* iOS: Step-by-step guide */}
        {isIOS && showIOSSteps && (
          <div className="px-4 pb-4">
            <ol className="space-y-3">
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-[#C81C1C] text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
                <span className="text-sm text-gray-700 pt-0.5">
                  Tap <Share size={14} className="inline text-blue-500 mx-0.5" /> <strong>Share</strong> at the bottom of Safari
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-[#C81C1C] text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                <span className="text-sm text-gray-700 pt-0.5">
                  Scroll down and tap <PlusSquare size={14} className="inline text-gray-600 mx-0.5" /> <strong>Add to Home Screen</strong>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-[#C81C1C] text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
                <span className="text-sm text-gray-700 pt-0.5">
                  Tap <strong>Add</strong> — open from your home screen anytime.
                </span>
              </li>
            </ol>
          </div>
        )}

        {/* Android/Chrome: Native install */}
        {canInstall && !isIOS && (
          <div className="px-4 pb-4">
            <p className="text-gray-600 text-sm mb-3">
              Install JIE Mastery for faster sessions and home screen access.
            </p>
            <div className="flex gap-2">
              <button
                onClick={dismissInstall}
                className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-3 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Not Now
              </button>
              <button
                onClick={triggerInstall}
                className="flex-1 bg-[#C81C1C] text-white rounded-xl py-3 text-sm font-semibold hover:bg-[#a51717] transition-colors flex items-center justify-center gap-2"
              >
                <Download size={15} />
                Install
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
