import { useState } from "react";
import { Button } from "@/components/ui/button";
import { HardDrive, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

interface Props {
  onFilesPicked: (files: DriveFile[]) => void;
  disabled?: boolean;
  defaultFolderId?: string;
}

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

// Default to DandD_Materials folder
const DEFAULT_FOLDER_ID = "1t_mKKlP7aynS2ijfiXaz9KWlYONZ9PFV";

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

export function DriveFilePicker({ onFilesPicked, disabled, defaultFolderId = DEFAULT_FOLDER_ID }: Props) {
  const [loading, setLoading] = useState(false);
  const { data: tokenData } = trpc.google.getAccessToken.useQuery(undefined, {
    staleTime: 55 * 60 * 1000,
  });

  const runtimeConfig = (window as any).__RUNTIME_CONFIG__ ?? {};
  const apiKey = runtimeConfig.GOOGLE_API_KEY;

  const openPicker = async () => {
    if (!apiKey) {
      alert("Google API key not configured.");
      return;
    }
    if (!tokenData?.accessToken) {
      alert("Google Drive not connected. Connect it first above.");
      return;
    }
    setLoading(true);
    try {
      await loadGapiScript();
      await loadPickerLib();

      const { google } = window;

      // Folder-scoped view starting at DandD_Materials
      const folderView = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
        .setParent(defaultFolderId)
        .setSelectFolderEnabled(true);

      // File view also scoped to the default folder, PDFs + images only
      const fileView = new google.picker.DocsView(google.picker.ViewId.DOCS)
        .setParent(defaultFolderId)
        .setMimeTypes("application/pdf,image/png,image/jpeg,image/webp,image/tiff")
        .setMode(google.picker.DocsViewMode.LIST);

      const picker = new google.picker.PickerBuilder()
        .addView(fileView)
        .addView(folderView)
        .setOAuthToken(tokenData.accessToken)
        .setDeveloperKey(apiKey)
        .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
        .setTitle("Select files or folders (DandD_Materials)")
        .setCallback((data: any) => {
          if (data.action === google.picker.Action.PICKED && data.docs?.length) {
            const files: DriveFile[] = data.docs
              .map((doc: any) => ({ id: doc.id, name: doc.name, mimeType: doc.mimeType }))
              .sort((a: DriveFile, b: DriveFile) => a.name.localeCompare(b.name));
            onFilesPicked(files);
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
