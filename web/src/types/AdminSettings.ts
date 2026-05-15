/**
 * Settings draft state — the entire admin Settings page reads/writes through
 * a single string-keyed map. Values are always strings (matching backend
 * storage) so the page doesn't have to model per-key types; per-tab form
 * components parse/format for the field type they expose.
 */
export type SettingsDraft = Record<string, string>;

export interface SettingsResponse {
  values: Record<string, string | null>;
}

export interface UpdateSettingsRequest {
  values: Record<string, string>;
}

export interface SettingsValidationError {
  key: string;
  error: string;
}

export interface SettingsErrorResponse {
  errors?: SettingsValidationError[];
  error?: string;
}

export interface HardwareTestResponse {
  success: boolean;
  latencyMs: number;
  error: string | null;
  details: Record<string, string> | null;
}

export interface ClientInfo {
  mode: string;
  enabled: boolean | null;
}

export interface HardwareInfoResponse {
  hpwc: ClientInfo;
  shelly: ClientInfo;
}
