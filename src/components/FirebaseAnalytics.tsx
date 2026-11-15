"use client";

import { useEffect } from "react";
import { initFirebaseAnalytics } from "@/lib/firebase";

/**
 * Connects Firebase Analytics once on the client without interfering with SSR.
 */
export function FirebaseAnalytics() {
  useEffect(() => {
    void initFirebaseAnalytics();
  }, []);

  return null;
}

