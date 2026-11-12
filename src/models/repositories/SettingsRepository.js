export class SettingsRepository {
  constructor(apiClient) { this.api = apiClient; }
  get() { return this.api.request("settings.get"); }
  update(values) { return this.api.request("settings.update", values); }
}
