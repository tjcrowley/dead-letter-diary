"use client";

import React, { useEffect, useState } from "react";
import { getStorageInfo } from "@/lib/storage";

interface StorageInfoData {
  usedMb: number;
  quotaMb: number;
  percentUsed: number;
}

export default function StorageInfo() {
  const [info, setInfo] = useState<StorageInfoData | null | undefined>(
    undefined
  );

  useEffect(() => {
    getStorageInfo().then((result) => {
      setInfo(result);
    });
  }, []);

  // Loading: undefined means not yet resolved
  if (info === undefined) return null;
  // API unavailable
  if (info === null) return null;

  return (
    <div>
      <div>
        {info.usedMb} MB used of {info.quotaMb} MB ({info.percentUsed}%)
      </div>
      <div
        role="progressbar"
        aria-valuenow={info.percentUsed}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{ width: "100%", height: "4px", background: "#222" }}
      >
        <div
          style={{
            width: `${info.percentUsed}%`,
            height: "100%",
            background: "#4a9eff",
          }}
        />
      </div>
    </div>
  );
}
