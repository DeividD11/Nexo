export class ResetPasswordModel {
  constructor(authRepository) { this.auth = authRepository; }
  reset(token, password) { return this.auth.resetPassword(token, password); }
}
