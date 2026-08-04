import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/components/IpsMap";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

export function AddressInput({
  value,
  onChange,
  onResolved,
  city,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onResolved: (loc: { lat: number; lng: number }, formatted: string) => void;
  city?: string;
  placeholder?: string;
}) {
  const [suggestions, setSuggestions] = useState<Array<{ text: string; placeId: string }>>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const tokenRef = useRef<any>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []);

  const search = (input: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (input.trim().length < 4) { setSuggestions([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      try {
        setLoading(true);
        await loadGoogleMaps();
        const { AutocompleteSuggestion, AutocompleteSessionToken } =
          (await window.google.maps.importLibrary("places")) as any;
        tokenRef.current = tokenRef.current ?? new AutocompleteSessionToken();
        const { suggestions: res } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: city ? `${input}, ${city}, Colombia` : `${input}, Colombia`,
          sessionToken: tokenRef.current,
          region: "co",
        });
        const list = (res ?? []).slice(0, 5).map((s: any) => ({
          text: s.placePrediction?.text?.toString() ?? "",
          placeId: s.placePrediction?.placeId ?? "",
        })).filter((s: any) => s.placeId);
        setSuggestions(list);
        setOpen(list.length > 0);
      } catch {
        setSuggestions([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 400);
  };

  const pick = async (s: { text: string; placeId: string }) => {
    setOpen(false);
    onChange(s.text);
    try {
      await loadGoogleMaps();
      const { Place } = (await window.google.maps.importLibrary("places")) as any;
      const place = new Place({ id: s.placeId });
      await place.fetchFields({ fields: ["location", "formattedAddress"] });
      const loc = place.location;
      if (loc) {
        onResolved({ lat: loc.lat(), lng: loc.lng() }, place.formattedAddress ?? s.text);
        tokenRef.current = null;
      }
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="relative">
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); search(e.target.value); }}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {loading && <Loader2 className="w-4 h-4 animate-spin absolute right-2 top-2.5 text-muted-foreground" />}
      {open && (
        <ul className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md overflow-hidden">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
              >
                {s.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
