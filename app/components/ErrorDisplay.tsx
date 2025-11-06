"use client";

import React from "react";

export function ErrorDisplay(props: { error: string | null }) {
  if (!props.error) return null;
  return (
    <div className="p-4 bg-red-900/20 border border-red-700 rounded-lg">
      <p className="text-red-400 text-sm">{props.error}</p>
    </div>
  );
}


