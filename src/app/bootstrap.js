import { ApiClient } from "../services/ApiClient.js";
import { SessionStore } from "../services/SessionStore.js";
import { AuthRepository } from "../models/repositories/AuthRepository.js";
import { ProfileRepository } from "../models/repositories/ProfileRepository.js";
import { ConversationRepository } from "../models/repositories/ConversationRepository.js";
import { MessageRepository } from "../models/repositories/MessageRepository.js";
import { GroupRepository } from "../models/repositories/GroupRepository.js";
import { PresenceRepository } from "../models/repositories/PresenceRepository.js";
import { FileRepository } from "../models/repositories/FileRepository.js";
import { NotificationRepository } from "../models/repositories/NotificationRepository.js";
import { SettingsRepository } from "../models/repositories/SettingsRepository.js";
import { SearchRepository } from "../models/repositories/SearchRepository.js";
import { ContactRepository } from "../models/repositories/ContactRepository.js";
import { AppModel } from "../models/AppModel.js";
import { AppView } from "../views/AppView.js";
import { AuthController } from "../controllers/AuthController.js";
import { ContactController } from "../controllers/ContactController.js";
import { ProfileController } from "../controllers/ProfileController.js";
import { MessageController } from "../controllers/MessageController.js";
import { GroupController } from "../controllers/GroupController.js";
import { AppController } from "../controllers/AppController.js";
import { RealtimeSyncController } from "../controllers/RealtimeSyncController.js";
import { AttachmentController } from "../controllers/AttachmentController.js";
import { NotificationController } from "../controllers/NotificationController.js";
import { SettingsController } from "../controllers/SettingsController.js";
import { SearchController } from "../controllers/SearchController.js";
import { Router } from "./Router.js";

const root = document.querySelector("#app");
const sessions = new SessionStore();
const api = new ApiClient(sessions);
const model = new AppModel({
  authRepository: new AuthRepository(api, sessions),
  profileRepository: new ProfileRepository(api),
  conversationRepository: new ConversationRepository(api),
  messageRepository: new MessageRepository(api),
  contactRepository: new ContactRepository(api),
  groupRepository: new GroupRepository(api),
  presenceRepository: new PresenceRepository(api),
  fileRepository: new FileRepository(api),
  notificationRepository: new NotificationRepository(api),
  settingsRepository: new SettingsRepository(api),
  searchRepository: new SearchRepository(api),
});
const view = new AppView(root);
const authController = new AuthController(model, view);
const contactController = new ContactController(model, view);
const profileController = new ProfileController(model, view);
const messageController = new MessageController(model, view);
const groupController = new GroupController(model, view);
const realtimeSyncController = new RealtimeSyncController(model, view);
const attachmentController = new AttachmentController(model, view);
const notificationController = new NotificationController(model, view);
const settingsController = new SettingsController(model, view);
const searchController = new SearchController(model, view);
const controller = new AppController(model, view, {
  authController, contactController, profileController, messageController, groupController,
  realtimeSyncController, attachmentController, notificationController, settingsController, searchController,
});

model.subscribe((state) => view.render(state));
controller.mount();
new Router(model, authController).start();
view.render(model.state);
await model.restoreSession();
