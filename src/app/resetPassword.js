import { ApiClient } from "../services/ApiClient.js";
import { SessionStore } from "../services/SessionStore.js";
import { AuthRepository } from "../models/repositories/AuthRepository.js";
import { ResetPasswordModel } from "../models/ResetPasswordModel.js";
import { ResetPasswordView } from "../views/ResetPasswordView.js";
import { ResetPasswordController } from "../controllers/ResetPasswordController.js";

const root = document.querySelector("#reset-app");
const sessions = new SessionStore();
const api = new ApiClient(sessions);
const authRepository = new AuthRepository(api, sessions);
const model = new ResetPasswordModel(authRepository);
const view = new ResetPasswordView(root);
new ResetPasswordController(model, view).mount();
