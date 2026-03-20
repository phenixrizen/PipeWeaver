export type FieldBrowserTargetStatus = "mapped" | "suggested" | "unmatched";

export interface FieldBrowserTargetRow {
  path: string;
  type: string;
  mappedSource?: string;
  suggestedSource?: string;
  status: FieldBrowserTargetStatus;
}
