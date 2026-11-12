export class ProfileRepository {
  constructor(apiClient) { this.api = apiClient; }

  get() { return this.api.request("profile.get"); }
  update(profile) { return this.api.request("profile.update", profile); }

  uploadAvatar(file) {
    const form = new FormData();
    form.set("action", "profile.avatar.upload");
    form.set("file", file, file.name || "avatar");
    return this.api.requestMultipart(form);
  }

  deleteAvatar() { return this.api.request("profile.avatar.delete"); }
}
