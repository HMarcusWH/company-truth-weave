import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Props = { onCreated?: () => void };

export default function CreateCompanyForm({ onCreated }: Props) {
  const { toast } = useToast();
  const [legalName, setLegalName] = React.useState("");
  const [entityType, setEntityType] = React.useState<"company"|"person"|"product"|"location"|"event">("company");
  const [website, setWebsite] = React.useState("");
  const [countryCode, setCountryCode] = React.useState("");
  const [orgNr, setOrgNr] = React.useState("");
  const [lei, setLei] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!legalName.trim()) {
      toast({ title: "Missing name", description: "Please enter a legal name.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      // Prevent near-duplicates (case-insensitive check)
      const { data: dup, error: dupErr } = await supabase
        .from("entities")
        .select("id")
        .ilike("legal_name", legalName.trim())
        .limit(1);
      if (dupErr) throw dupErr;
      if (dup && dup.length) {
        toast({ title: "Already exists", description: `An entity named "${legalName}" already exists.` });
        setLoading(false);
        return;
      }

      const identifiers: any = {};
      if (lei) identifiers.LEI = lei.trim();
      if (orgNr) identifiers.org_nr = orgNr.trim();
      
      const { error } = await supabase.from("entities").insert([{
        legal_name: legalName.trim(),
        entity_type: entityType,
        website: website || null,
        country_code: countryCode || null,
        identifiers,
      }]);
      if (error) throw error;

      toast({ title: "Company created", description: legalName });
      onCreated?.();
      setLegalName(""); setWebsite(""); setCountryCode(""); setOrgNr(""); setLei("");
      setEntityType("company");
    } catch (err: any) {
      toast({ title: "Create failed", description: err.message ?? String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div>
        <Label htmlFor="legal_name">Legal name</Label>
        <Input id="legal_name" value={legalName} onChange={(e)=>setLegalName(e.target.value)} placeholder="Acme Corporation" />
      </div>
      <div>
        <Label>Entity type</Label>
        <Select value={entityType} onValueChange={(v)=>setEntityType(v as any)}>
          <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="company">company</SelectItem>
            <SelectItem value="person">person</SelectItem>
            <SelectItem value="product">product</SelectItem>
            <SelectItem value="location">location</SelectItem>
            <SelectItem value="event">event</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="website">Website (optional)</Label>
        <Input id="website" value={website} onChange={(e)=>setWebsite(e.target.value)} placeholder="https://example.com" />
      </div>
      <div>
        <Label htmlFor="country">Country</Label>
        <Select value={countryCode} onValueChange={setCountryCode}>
          <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="SE">🇸🇪 Sweden</SelectItem>
            <SelectItem value="US">🇺🇸 United States</SelectItem>
            <SelectItem value="GB">🇬🇧 United Kingdom</SelectItem>
            <SelectItem value="DE">🇩🇪 Germany</SelectItem>
            <SelectItem value="FR">🇫🇷 France</SelectItem>
            <SelectItem value="NO">🇳🇴 Norway</SelectItem>
            <SelectItem value="DK">🇩🇰 Denmark</SelectItem>
            <SelectItem value="FI">🇫🇮 Finland</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {countryCode === "SE" && (
        <div>
          <Label htmlFor="org_nr">Swedish Org. Number</Label>
          <Input id="org_nr" value={orgNr} onChange={(e)=>setOrgNr(e.target.value)} placeholder="556000-0000" />
        </div>
      )}
      <div>
        <Label htmlFor="lei">LEI (optional)</Label>
        <Input id="lei" value={lei} onChange={(e)=>setLei(e.target.value)} placeholder="HWUPKR0MPOU8FGXBT394" />
      </div>
      <Button type="submit" disabled={loading}>{loading ? "Creating..." : "Create company"}</Button>
    </form>
  );
}
