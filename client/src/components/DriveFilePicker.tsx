import { useState } from "react";
import { Button } from "@/components/ui/button";
import { HardDrive, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

interface Props {
  onFilePicked: (file: DriveFile) => void;
  disabled?: boolean;
}

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

let gapiLoaded = false;
let pickerLoaded = false;

function loadGapiScript(): Promise<void> {
  if (gapiLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.onload = () => { gapiLoaded = true; resolve(); };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function loadPickerLib(): Promise<void> {
  if (pickerLoaded) return Promise.resolve();
  return new Promise((resolve) => {
    window.gapi.load("picker", () => { pickerLoaded = true; resolve(); });
  });
}

export function DriveFilePicker({ onFilePicked, disabled }: Props) {
  const [loading, setLoading] = useState(false);
  const { data: tokenData } = trpc.google.getAccessToken.useQuery(undefined, {
    staleTime: 55 * 60 * 1000, // re-fetch before 60-min expiry
  });

  const runtimeConfig = (window as any).__RUNTIME_CONFIG__ ?? {};
  const apiKey = runtimeConfig.GOOGLE_API_KEY;

  const openPicker = async () => {
    if (!apiKey) {
      alert("Google API key not configured.");
      return;
    }
    if (!tokenData?.accessToken) {
      alert("Google Drive not connected. Connect it first in Settings.");
      return;
    }
    setLoading(true);
    try {
      await loadGapiScript();
      await loadPickerLib();

      const { google } = window;
      const view = new google.picker.View(google.picker.ViewId.DOCS);
      view.setMimeTypes("application/pdf,image/png,image/jpeg,image/webp,image/tiff");

      const picker = new google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(tokenData.accessToken)
        .setDeveloperKey(apiKey)
        .setCallback((data: any) => {
          if (data.action === google.picker.Action.PICKED && data.docs?.length) {
            const doc = data.docs[0];
            onFilePicked({ id: doc.id, name: doc.name, mimeType: doc.mimeType });
          }
        })
        .build();
      picker.setVisible(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      className="gap-2"
      onClick={openPicker}
      disabled={disabled || loading || !tokenData?.accessToken}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4" />}
      Browse Google Drive
    </Button>
  );
}
