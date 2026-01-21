/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

declare global {
  var __REACT_SINGLETON__: typeof React | undefined;
  var __HAS_WOUTER_ROUTER__: boolean | undefined;
}

if (!globalThis.__REACT_SINGLETON__) {
  globalThis.__REACT_SINGLETON__ = React;
  console.log(`[RUNTIME] React singleton initialized: v${React.version}, marker newly set`);
} else {
  console.log(`[RUNTIME] React singleton already exists: v${React.version}, marker was pre-existing`);
}

createRoot(document.getElementById("root")!).render(<App />);
