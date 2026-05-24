import { useState } from "react";
import { Button } from "@/components/ui/button";
import { HardDrive, Loader2, AlertTriangle } from "lucide-react";
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
  // staleTime 0 so a fresh fetch always runs on mount — this ensures that after
  // the user completes the Google OAuth flow and navigates back, the component
  // re-fetches rather than serving a cached null from the previous failed attempt.
  const { data: tokenData } = trpc.google.getAccessToken.useQuery(undefined, {
    staleTime: 0,
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

      // Single DOCS view: shows both files and subfolders, allows navigation into them.
      // Scoped to DandD_Materials by default. LIST mode sorts alphabetically.
      const fileView = new google.picker.DocsView(google.picker.ViewId.DOCS)
        .setParent(defaultFolderId)
        .setIncludeFolders(true)
        .setMimeTypes("application/pdf,image/png,image/jpeg,image/webp,image/tiff,application/vnd.google-apps.folder")
        .setMode(google.picker.DocsViewMode.LIST);

      const picker = new google.picker.PickerBuilder()
        .addView(fileView)
        .setOAuthToken(tokenData.accessToken)
        .setDeveloperKey(apiKey)
        .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
        .setTitle("Select files (DandD_Materials)")
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

  // Drive is "connected" (refresh token in DB) but we can't retrieve an access
  // token — most likely the token was revoked or the app was redeployed with a
  // different encryption key.  Show a reconnect prompt instead of a silent
  // disabled button.
  const tokenUnavailable = !disabled && !loading && tokenData !== undefined && !tokenData.accessToken;

  if (tokenUnavailable) {
    return (
      <a href="/api/auth/google" className="inline-flex">
        <Button type="button" variant="outline" className="gap-2 border-amber-500/50 text-amber-400 hover:text-amber-300">
          <AlertTriangle className="w-4 h-4" />
          Reconnect Google Drive
        </Button>
      </a>
    );
  }

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
